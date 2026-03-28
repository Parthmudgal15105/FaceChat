import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SIGNALING_SERVER_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const RTC_CONFIGURATION: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

type Phase = "searching" | "connecting" | "connected";

type ChatAuthor = "self" | "partner" | "system";

type ChatMessage = {
    id: string;
    author: ChatAuthor;
    text: string;
    timestamp: string;
};

type PartnerMediaState = {
    audioEnabled: boolean;
    videoEnabled: boolean;
};

type MatchFoundPayload = {
    roomId: string;
    initiator: boolean;
    sharedInterests: string[];
    partnerLabel: string;
};

type RoomMode = "stranger" | "ai";

type EvaluationResult = {
    technicalAccuracyScore: number;
    timeComplexityAnalysis: string;
    spaceComplexityAnalysis: string;
    actionableFeedback: string;
};

type RoomProps = {
    name: string;
    interests: string[];
    localStream: MediaStream;
    onExit: () => void;
    mode: RoomMode;
};

const createMessage = (author: ChatAuthor, text: string): ChatMessage => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    author,
    text,
    timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    }),
});

const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
};

export const Room = ({ name, interests, localStream, onExit, mode }: RoomProps) => {
    const displayName = name.trim() || "Anonymous";

    // In AI mode we skip the queue entirely, so the initial phase is already "connected".
    const initialPhase: Phase = mode === "ai" ? "connected" : "searching";
    const initialStatus = mode === "ai" ? "Ready for your AI interview." : "Looking for a stranger...";
    const initialPartnerLabel = mode === "ai" ? "AI Interviewer" : "Stranger";
    const initialMessages: ChatMessage[] = mode === "ai"
        ? [createMessage("system", "Your AI interviewer is ready. Start speaking when you are set.")]
        : [createMessage("system", "Joining the queue and warming up your connection.")];

    const [phase, setPhase] = useState<Phase>(initialPhase);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [partnerLabel, setPartnerLabel] = useState(initialPartnerLabel);
    const [sharedInterests, setSharedInterests] = useState<string[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [chatInput, setChatInput] = useState("");
    const [partnerTyping, setPartnerTyping] = useState(false);
    const [partnerMedia, setPartnerMedia] = useState<PartnerMediaState>({
        audioEnabled: true,
        videoEnabled: true,
    });
    const [audioEnabled, setAudioEnabled] = useState(localStream.getAudioTracks()[0]?.enabled ?? true);
    const [videoEnabled, setVideoEnabled] = useState(localStream.getVideoTracks()[0]?.enabled ?? true);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [remoteVideoReady, setRemoteVideoReady] = useState(false);
    const [statusMessage, setStatusMessage] = useState(initialStatus);
    const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [queueSize, setQueueSize] = useState(0);

    // AI interview recording state
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

    // Holds audio blobs as they stream in from the MediaRecorder.
    const audioChunksRef = useRef<Blob[]>([]);

    const socketRef = useRef<Socket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const roomIdRef = useRef<string | null>(null);
    const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const typingTimeoutRef = useRef<number | null>(null);
    const nextSearchTimeoutRef = useRef<number | null>(null);
    const leavingRef = useRef(false);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const chatLogRef = useRef<HTMLDivElement>(null);

    const clearPeerState = () => {
        pendingIceCandidatesRef.current = [];

        const currentConnection = peerConnectionRef.current;
        if (currentConnection) {
            currentConnection.onicecandidate = null;
            currentConnection.ontrack = null;
            currentConnection.onconnectionstatechange = null;
            currentConnection.close();
            peerConnectionRef.current = null;
        }

        roomIdRef.current = null;
        setRoomId(null);
        setRemoteStream(null);
        setRemoteVideoReady(false);
        setPartnerTyping(false);
        setPartnerMedia({
            audioEnabled: true,
            videoEnabled: true,
        });
        setCallStartedAt(null);
        setElapsedSeconds(0);
    };

    useEffect(() => {
        if (!localVideoRef.current) {
            return;
        }

        localVideoRef.current.srcObject = localStream;
        void localVideoRef.current.play().catch(() => undefined);
    }, [localStream]);

    useEffect(() => {
        if (!remoteVideoRef.current) {
            return;
        }

        remoteVideoRef.current.srcObject = remoteStream;
        void remoteVideoRef.current.play().catch(() => undefined);
    }, [remoteStream]);

    useEffect(() => {
        if (!chatLogRef.current) {
            return;
        }

        chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }, [messages, partnerTyping]);

    useEffect(() => {
        if (!callStartedAt) {
            setElapsedSeconds(0);
            return;
        }

        const intervalId = window.setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000));
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [callStartedAt]);

    // AI mode: no socket or WebRTC needed. The initial state already reflects
    // "connected" status. This effect is a no-op placeholder in case we need
    // to kick off an AI session in a future phase.
    useEffect(() => {
        if (mode !== "ai") {
            return;
        }

        // Nothing to set up — phase and partnerLabel were already initialised
        // correctly from the initial state derived from `mode` above.
        setCallStartedAt(Date.now());
    }, [mode]);

    useEffect(() => {
        if (mode !== "stranger") {
            return;
        }

        const socket = io(SIGNALING_SERVER_URL, {
            withCredentials: true,
            transports: ["websocket", "polling"],
        });

        socketRef.current = socket;

        const queuePayload = {
            name: displayName,
            interests,
        };

        const clearPendingTimers = () => {
            if (typingTimeoutRef.current) {
                window.clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = null;
            }

            if (nextSearchTimeoutRef.current) {
                window.clearTimeout(nextSearchTimeoutRef.current);
                nextSearchTimeoutRef.current = null;
            }
        };

        const addSystemMessage = (text: string) => {
            setMessages((currentMessages) => [...currentMessages, createMessage("system", text)]);
        };

        const resetConversation = (message: string) => {
            clearPeerState();
            setPhase("searching");
            setPartnerLabel("Stranger");
            setSharedInterests([]);
            setMessages([createMessage("system", message)]);
            setStatusMessage(message);
        };

        const emitJoinQueue = () => {
            if (!socket.connected) {
                return;
            }

            resetConversation("Looking for a stranger...");
            socket.emit("join-queue", queuePayload);
        };

        const emitMediaState = (activeRoomId: string) => {
            socket.emit("media-state", {
                roomId: activeRoomId,
                audioEnabled: localStream.getAudioTracks()[0]?.enabled ?? false,
                videoEnabled: localStream.getVideoTracks()[0]?.enabled ?? false,
            });
        };

        const flushPendingIceCandidates = async (connection: RTCPeerConnection) => {
            const queuedCandidates = [...pendingIceCandidatesRef.current];
            pendingIceCandidatesRef.current = [];

            for (const candidate of queuedCandidates) {
                await connection.addIceCandidate(candidate).catch(() => undefined);
            }
        };

        const createPeerConnection = (activeRoomId: string) => {
            clearPeerState();

            const connection = new RTCPeerConnection(RTC_CONFIGURATION);
            const incomingStream = new MediaStream();

            peerConnectionRef.current = connection;
            roomIdRef.current = activeRoomId;
            setRoomId(activeRoomId);
            setRemoteStream(incomingStream);

            localStream.getTracks().forEach((track) => {
                connection.addTrack(track, localStream);
            });

            connection.ontrack = (event) => {
                const eventStream = event.streams[0];

                if (eventStream) {
                    eventStream.getTracks().forEach((track) => {
                        if (!incomingStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
                            incomingStream.addTrack(track);
                        }
                    });
                } else if (!incomingStream.getTracks().some((track) => track.id === event.track.id)) {
                    incomingStream.addTrack(event.track);
                }

                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = incomingStream;
                    void remoteVideoRef.current.play().catch(() => undefined);
                }

                if (event.track.kind === "video" || incomingStream.getVideoTracks().length > 0) {
                    setRemoteVideoReady(true);
                }
            };

            connection.onicecandidate = (event) => {
                if (!event.candidate) {
                    return;
                }

                socket.emit("ice-candidate", {
                    roomId: activeRoomId,
                    candidate: event.candidate.toJSON(),
                });
            };

            connection.onconnectionstatechange = () => {
                if (connection.connectionState === "connected") {
                    setPhase("connected");
                    setStatusMessage("You are live with a stranger.");
                    return;
                }

                if (connection.connectionState === "connecting") {
                    setPhase("connecting");
                    setStatusMessage("Connecting your call...");
                    return;
                }

                if (
                    (connection.connectionState === "disconnected" ||
                        connection.connectionState === "failed" ||
                        connection.connectionState === "closed") &&
                    !leavingRef.current &&
                    roomIdRef.current === activeRoomId
                ) {
                    setStatusMessage("Connection dropped. Searching for someone new...");
                    addSystemMessage("Connection dropped. We are moving you to the next stranger.");
                    clearPeerState();
                    nextSearchTimeoutRef.current = window.setTimeout(() => {
                        if (socket.connected && !leavingRef.current) {
                            socket.emit("join-queue", queuePayload);
                        }
                    }, 700);
                }
            };

            return connection;
        };

        socket.on("connect", () => {
            leavingRef.current = false;
            setStatusMessage("Connected to the signaling server.");
            emitJoinQueue();
        });

        socket.on("disconnect", () => {
            if (leavingRef.current) {
                return;
            }

            clearPendingTimers();
            clearPeerState();
            setPhase("searching");
            setStatusMessage("Reconnecting to the server...");
            addSystemMessage("Server connection lost. Trying to reconnect.");
        });

        socket.on("searching", ({ queueSize: nextQueueSize }: { queueSize: number }) => {
            setQueueSize(nextQueueSize);
            setPhase("searching");
            setStatusMessage("Looking for a stranger...");
        });

        socket.on("match-found", async (payload: MatchFoundPayload) => {
            clearPendingTimers();
            setPhase("connecting");
            setPartnerLabel(payload.partnerLabel || "Stranger");
            setSharedInterests(payload.sharedInterests);
            setQueueSize(0);
            setCallStartedAt(Date.now());
            setMessages([
                createMessage(
                    "system",
                    payload.sharedInterests.length
                        ? `Matched through shared interests: ${payload.sharedInterests.join(", ")}.`
                        : "Matched with a random stranger.",
                ),
            ]);

            const connection = createPeerConnection(payload.roomId);
            emitMediaState(payload.roomId);

            if (!payload.initiator) {
                setStatusMessage("A stranger is joining your call...");
                return;
            }

            setStatusMessage("Starting the call...");

            const offer = await connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            });
            await connection.setLocalDescription(offer);

            socket.emit("offer", {
                roomId: payload.roomId,
                sdp: offer,
            });
        });

        socket.on("offer", async ({ roomId: activeRoomId, sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
            let connection = peerConnectionRef.current;

            if (!connection || roomIdRef.current !== activeRoomId) {
                connection = createPeerConnection(activeRoomId);
            }

            await connection.setRemoteDescription(sdp);
            await flushPendingIceCandidates(connection);

            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);

            socket.emit("answer", {
                roomId: activeRoomId,
                sdp: answer,
            });

            emitMediaState(activeRoomId);
        });

        socket.on("answer", async ({ sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
            const connection = peerConnectionRef.current;
            if (!connection) {
                return;
            }

            await connection.setRemoteDescription(sdp);
            await flushPendingIceCandidates(connection);
        });

        socket.on("ice-candidate", async ({ candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
            const connection = peerConnectionRef.current;
            if (!connection) {
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }

            if (!connection.remoteDescription) {
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }

            await connection.addIceCandidate(candidate).catch(() => undefined);
        });

        socket.on("chat-message", ({ text }: { text: string }) => {
            setMessages((currentMessages) => [...currentMessages, createMessage("partner", text)]);
        });

        socket.on("typing-state", ({ isTyping }: { isTyping: boolean }) => {
            setPartnerTyping(Boolean(isTyping));
        });

        socket.on("media-state", (mediaState: PartnerMediaState) => {
            setPartnerMedia(mediaState);
        });

        socket.on("partner-left", ({ reason }: { reason: "skipped" | "disconnected" | "stopped" }) => {
            if (leavingRef.current) {
                return;
            }

            const reasonMessage =
                reason === "disconnected"
                    ? "The stranger disconnected. Searching for someone new..."
                    : "The stranger skipped. Searching for someone new...";

            clearPendingTimers();
            clearPeerState();
            setMessages([createMessage("system", reasonMessage)]);
            setPhase("searching");
            setStatusMessage(reasonMessage);

            nextSearchTimeoutRef.current = window.setTimeout(() => {
                if (socket.connected && !leavingRef.current) {
                    socket.emit("join-queue", queuePayload);
                }
            }, 700);
        });

        return () => {
            leavingRef.current = true;
            clearPendingTimers();
            clearPeerState();
            socket.emit("stop-search");
            socket.disconnect();
            socketRef.current = null;
        };
    }, [displayName, interests, localStream, mode]);

    const sendTypingSignal = (isTyping: boolean) => {
        const activeSocket = socketRef.current;
        if (!activeSocket || !roomIdRef.current) {
            return;
        }

        activeSocket.emit("typing-state", {
            roomId: roomIdRef.current,
            isTyping,
        });
    };

    const handleInputChange = (value: string) => {
        setChatInput(value);
        sendTypingSignal(value.trim().length > 0);

        if (typingTimeoutRef.current) {
            window.clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = window.setTimeout(() => {
            sendTypingSignal(false);
            typingTimeoutRef.current = null;
        }, 1200);
    };

    const handleSendMessage = () => {
        const activeSocket = socketRef.current;
        const activeRoomId = roomIdRef.current;
        const message = chatInput.trim();

        if (!activeSocket || !activeRoomId || !message) {
            return;
        }

        activeSocket.emit("chat-message", {
            roomId: activeRoomId,
            text: message,
        });

        setMessages((currentMessages) => [...currentMessages, createMessage("self", message)]);
        setChatInput("");
        sendTypingSignal(false);
    };

    const toggleLocalTrack = (kind: "audio" | "video") => {
        const track = kind === "audio" ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
        if (!track) {
            return;
        }

        track.enabled = !track.enabled;

        if (kind === "audio") {
            setAudioEnabled(track.enabled);
        } else {
            setVideoEnabled(track.enabled);
        }

        const activeSocket = socketRef.current;
        const activeRoomId = roomIdRef.current;

        if (activeSocket && activeRoomId) {
            activeSocket.emit("media-state", {
                roomId: activeRoomId,
                audioEnabled: localStream.getAudioTracks()[0]?.enabled ?? false,
                videoEnabled: localStream.getVideoTracks()[0]?.enabled ?? false,
            });
        }
    };

    const handleNextStranger = () => {
        const activeSocket = socketRef.current;
        if (!activeSocket) {
            return;
        }

        if (typingTimeoutRef.current) {
            window.clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        if (nextSearchTimeoutRef.current) {
            window.clearTimeout(nextSearchTimeoutRef.current);
            nextSearchTimeoutRef.current = null;
        }

        sendTypingSignal(false);
        clearPeerState();
        setPartnerLabel("Stranger");
        setSharedInterests([]);
        setStatusMessage("Switching you to the next stranger...");
        setPhase("searching");
        setMessages([createMessage("system", "Skipping to the next stranger...")]);
        setChatInput("");
        activeSocket.emit("next-stranger", {
            name: displayName,
            interests,
        });
    };

    // Start recording the user's microphone for the AI interview.
    const startInterview = () => {
        const audioTrack = localStream.getAudioTracks()[0];

        if (!audioTrack) {
            console.error("No audio track found on localStream.");
            return;
        }

        const audioOnlyStream = new MediaStream([audioTrack]);
        const newRecorder = new MediaRecorder(audioOnlyStream);

        audioChunksRef.current = [];

        newRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        newRecorder.start(1000); // collect a chunk every 1 second
        setRecorder(newRecorder);
        setIsRecording(true);
        setEvaluation(null);

        setMessages((current) => [
            ...current,
            createMessage("system", "Recording started. Speak your answer now."),
        ]);
    };

    // Stop recording, combine blobs, POST to /api/evaluate, and save the result.
    const stopInterview = () => {
        if (!recorder) {
            return;
        }

        recorder.onstop = async () => {
            setIsRecording(false);
            setIsEvaluating(true);

            setMessages((current) => [
                ...current,
                createMessage("system", "Recording stopped. Sending to AI for evaluation..."),
            ]);

            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            const formData = new FormData();
            formData.append("audio", audioBlob, "interview.webm");

            const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

            try {
                const response = await fetch(`${backendUrl}/api/evaluate`, {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`Server returned status ${response.status}`);
                }

                const data = await response.json() as EvaluationResult;
                setEvaluation(data);

                setMessages((current) => [
                    ...current,
                    createMessage("system", "Evaluation complete. See the results in the sidebar."),
                ]);
            } catch (err) {
                console.error("Error fetching evaluation:", err);

                setMessages((current) => [
                    ...current,
                    createMessage("system", "Evaluation failed. Please try again."),
                ]);
            } finally {
                setIsEvaluating(false);
                audioChunksRef.current = [];
            }
        };

        recorder.stop();
        setRecorder(null);
    };

    const handleLeave = () => {
        leavingRef.current = true;
        const activeSocket = socketRef.current;

        if (typingTimeoutRef.current) {
            window.clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        if (nextSearchTimeoutRef.current) {
            window.clearTimeout(nextSearchTimeoutRef.current);
            nextSearchTimeoutRef.current = null;
        }

        activeSocket?.emit("stop-search");
        activeSocket?.disconnect();
        socketRef.current = null;

        clearPeerState();

        onExit();
    };

    return (
        <main className="room-shell">
            <section className="video-panel">
                <header className="room-topbar">
                    <div>
                        <span className="eyebrow">Live stranger chat</span>
                        <h1 className="room-heading">You are chatting as {displayName}</h1>
                    </div>
                    <div className={`status-pill status-pill-${phase}`}>
                        <span>{phase === "connected" ? "Live" : phase === "connecting" ? "Connecting" : "Searching"}</span>
                        <strong>{statusMessage}</strong>
                    </div>
                </header>

                <div className="video-stage">
                    <div className="remote-stage">
                        <video autoPlay className="remote-video" playsInline ref={remoteVideoRef} />
                        {!remoteVideoReady || !partnerMedia.videoEnabled ? (
                            <div className="video-fallback">
                                <strong>{phase === "searching" ? "Waiting for a stranger" : partnerLabel}</strong>
                                <span>
                                    {phase === "searching"
                                        ? `Queue size: ${queueSize || 1}`
                                        : partnerMedia.videoEnabled
                                            ? "Connecting their camera feed."
                                            : "Their camera is currently off."}
                                </span>
                            </div>
                        ) : null}
                        <div className="video-caption">
                            <span>{partnerLabel}</span>
                            <span>{partnerMedia.audioEnabled ? "Mic on" : "Mic muted"}</span>
                        </div>
                    </div>

                    <div className="local-stage">
                        <video autoPlay className="local-video" muted playsInline ref={localVideoRef} />
                        {!videoEnabled ? (
                            <div className="local-video-mask">
                                <span>Camera off</span>
                            </div>
                        ) : null}
                        <div className="video-caption">
                            <span>You</span>
                            <span>{audioEnabled ? "Mic on" : "Mic muted"}</span>
                        </div>
                    </div>
                </div>

                <div className="control-row">
                    <button className="secondary-button" onClick={() => toggleLocalTrack("audio")} type="button">
                        {audioEnabled ? "Mute" : "Unmute"}
                    </button>
                    <button className="secondary-button" onClick={() => toggleLocalTrack("video")} type="button">
                        {videoEnabled ? "Hide camera" : "Show camera"}
                    </button>

                    {mode === "ai" && !isRecording && (
                        <button
                            className="primary-button"
                            disabled={isEvaluating}
                            id="start-interview-btn"
                            onClick={startInterview}
                            type="button"
                        >
                            {isEvaluating ? "Evaluating..." : "Start interview"}
                        </button>
                    )}

                    {mode === "ai" && isRecording && (
                        <button
                            className="danger-button"
                            id="stop-interview-btn"
                            onClick={stopInterview}
                            type="button"
                        >
                            Stop &amp; evaluate
                        </button>
                    )}

                    {mode === "stranger" && (
                        <button className="primary-button" onClick={handleNextStranger} type="button">
                            Next stranger
                        </button>
                    )}

                    <button className="danger-button" onClick={handleLeave} type="button">
                        Leave
                    </button>
                </div>
            </section>

            <aside className="sidebar-panel">
                <section className="sidebar-card">
                    <div className="sidebar-card-header">
                        <h2>Session</h2>
                        <span>{roomId ? roomId : "Queueing"}</span>
                    </div>
                    <div className="stat-grid">
                        <div className="stat-card">
                            <span className="stat-label">Call timer</span>
                            <strong>{formatDuration(elapsedSeconds)}</strong>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">Match type</span>
                            <strong>{sharedInterests.length ? "Shared interests" : "Random"}</strong>
                        </div>
                    </div>
                    <div className="interest-list">
                        {sharedInterests.length ? (
                            sharedInterests.map((interest) => (
                                <span className="interest-chip" key={interest}>
                                    {interest}
                                </span>
                            ))
                        ) : (
                            <span className="empty-interests">No overlap this round. Keep chatting anyway.</span>
                        )}
                    </div>
                </section>

                <section className="sidebar-card sidebar-card-chat">
                    <div className="sidebar-card-header">
                        <h2>Chat</h2>
                        <span>{partnerTyping ? "Typing..." : "Live messages"}</span>
                    </div>
                    <div className="chat-log" ref={chatLogRef}>
                        {messages.map((message) => (
                            <article className={`chat-bubble chat-bubble-${message.author}`} key={message.id}>
                                <span className="chat-author">
                                    {message.author === "self"
                                        ? "You"
                                        : message.author === "partner"
                                            ? partnerLabel
                                            : "System"}
                                </span>
                                <p>{message.text}</p>
                                <time>{message.timestamp}</time>
                            </article>
                        ))}
                        {partnerTyping ? <div className="typing-indicator">{partnerLabel} is typing...</div> : null}
                    </div>

                    <div className="chat-composer">
                        <textarea
                            className="chat-input"
                            onChange={(event) => handleInputChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder={roomId ? "Send a quick message..." : "Chat opens when the call is matched."}
                            rows={3}
                            value={chatInput}
                        />
                        <button className="primary-button" onClick={handleSendMessage} type="button">
                            Send
                        </button>
                    </div>
                </section>

                {mode === "stranger" && (
                    <section className="sidebar-card">
                        <div className="sidebar-card-header">
                            <h2>Quick tips</h2>
                            <span>Stay in control</span>
                        </div>
                        <ul className="tips-list">
                            <li>Use interests to get closer matches before you hit the queue.</li>
                            <li>Hit Next anytime to swap conversations without refreshing the app.</li>
                            <li>Mute or hide your camera instantly if you need a quick reset.</li>
                        </ul>
                    </section>
                )}

                {mode === "ai" && (
                    <section className="sidebar-card" id="evaluation-panel">
                        <div className="sidebar-card-header">
                            <h2>Evaluation</h2>
                            <span>{isEvaluating ? "Analysing..." : isRecording ? "Recording" : "AI feedback"}</span>
                        </div>

                        {!evaluation && !isEvaluating && !isRecording && (
                            <p className="eval-placeholder">
                                Press <strong>Start interview</strong>, speak your answer, then press <strong>Stop &amp; evaluate</strong> to get feedback.
                            </p>
                        )}

                        {isRecording && (
                            <div className="eval-recording-indicator">
                                <span className="eval-recording-dot" />
                                Recording in progress
                            </div>
                        )}

                        {isEvaluating && (
                            <p className="eval-placeholder">Sending audio to Gemini for evaluation...</p>
                        )}

                        {evaluation && (
                            <div className="eval-results">
                                <div className="eval-score-block">
                                    <span className="eval-score-label">Technical accuracy</span>
                                    <div className="eval-score-bar-track">
                                        <div
                                            className="eval-score-bar-fill"
                                            style={{ width: `${evaluation.technicalAccuracyScore}%` }}
                                        />
                                    </div>
                                    <strong className="eval-score-number">
                                        {evaluation.technicalAccuracyScore} / 100
                                    </strong>
                                </div>

                                <div className="eval-field">
                                    <span className="eval-field-label">Time complexity</span>
                                    <p className="eval-field-value">{evaluation.timeComplexityAnalysis}</p>
                                </div>

                                <div className="eval-field">
                                    <span className="eval-field-label">Space complexity</span>
                                    <p className="eval-field-value">{evaluation.spaceComplexityAnalysis}</p>
                                </div>

                                <div className="eval-field eval-feedback">
                                    <span className="eval-field-label">Actionable feedback</span>
                                    <p className="eval-field-value">{evaluation.actionableFeedback}</p>
                                </div>
                            </div>
                        )}
                    </section>
                )}
            </aside>
        </main>
    );
};
