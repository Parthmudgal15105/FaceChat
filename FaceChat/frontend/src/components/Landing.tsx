import { useEffect, useRef, useState } from "react";
import { Room } from "./Room";

const MAX_INTERESTS = 8;

const featureCards = [
    {
        title: "Interest-based matching",
        description: "Get paired with people who share the topics you actually want to talk about.",
    },
    {
        title: "Video plus chat",
        description: "Talk face-to-face, keep typing on the side, and stay connected even if audio gets noisy.",
    },
    {
        title: "Fast skip controls",
        description: "Jump to the next stranger instantly without reloading the page or losing your camera setup.",
    },
];

export const Landing = () => {
    const [name, setName] = useState("");
    const [interestInput, setInterestInput] = useState("");
    const [interests, setInterests] = useState<string[]>([]);
    const [joined, setJoined] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isPreparingMedia, setIsPreparingMedia] = useState(true);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);

    const previewRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        streamRef.current = localStream;
    }, [localStream]);

    useEffect(() => {
        void requestMedia();

        return () => {
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    useEffect(() => {
        if (!previewRef.current) {
            return;
        }

        previewRef.current.srcObject = localStream;
        void previewRef.current.play().catch(() => undefined);
    }, [localStream]);

    const requestMedia = async () => {
        setIsPreparingMedia(true);
        setPermissionError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user",
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            setLocalStream((currentStream) => {
                currentStream?.getTracks().forEach((track) => track.stop());
                return stream;
            });

            const nextAudioEnabled = stream.getAudioTracks()[0]?.enabled ?? false;
            const nextVideoEnabled = stream.getVideoTracks()[0]?.enabled ?? false;

            setAudioEnabled(nextAudioEnabled);
            setVideoEnabled(nextVideoEnabled);
        } catch (error) {
            console.error("Unable to access user media", error);
            setPermissionError("Camera and microphone access are required before you can start.");
            setLocalStream((currentStream) => {
                currentStream?.getTracks().forEach((track) => track.stop());
                return null;
            });
        } finally {
            setIsPreparingMedia(false);
        }
    };

    const toggleTrack = (kind: "audio" | "video") => {
        if (!localStream) {
            return;
        }

        const track = kind === "audio" ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
        if (!track) {
            return;
        }

        track.enabled = !track.enabled;

        if (kind === "audio") {
            setAudioEnabled(track.enabled);
            return;
        }

        setVideoEnabled(track.enabled);
    };

    const addInterest = (rawValue: string) => {
        const cleanedValue = rawValue.trim().replace(/\s+/g, " ");
        if (!cleanedValue || interests.length >= MAX_INTERESTS) {
            return;
        }

        const hasInterest = interests.some(
            (interest) => interest.toLowerCase() === cleanedValue.toLowerCase(),
        );

        if (hasInterest) {
            return;
        }

        setInterests((currentInterests) => [...currentInterests, cleanedValue]);
        setInterestInput("");
    };

    const removeInterest = (interestToRemove: string) => {
        setInterests((currentInterests) =>
            currentInterests.filter((interest) => interest !== interestToRemove),
        );
    };

    const startChat = () => {
        if (!localStream) {
            return;
        }

        setJoined(true);
    };

    if (joined && localStream) {
        return (
            <Room
                interests={interests}
                localStream={localStream}
                name={name.trim()}
                onExit={() => setJoined(false)}
            />
        );
    }

    return (
        <main className="landing-shell">
            <section className="landing-hero">
                <div className="hero-copy">
                    <span className="eyebrow">FaceChat live</span>
                    <h1 className="hero-title">Meet strangers, not loading screens.</h1>
                    <p className="hero-description">
                        A faster Omegle-style experience with stable WebRTC matching, interest tags,
                        real chat controls, and a modern video layout that feels intentional.
                    </p>
                    <div className="hero-metrics">
                        <div className="metric-card">
                            <span className="metric-value">1 click</span>
                            <span className="metric-label">to jump into the queue</span>
                        </div>
                        <div className="metric-card">
                            <span className="metric-value">Live chat</span>
                            <span className="metric-label">video plus text side-by-side</span>
                        </div>
                        <div className="metric-card">
                            <span className="metric-value">Next</span>
                            <span className="metric-label">skip to a new stranger instantly</span>
                        </div>
                    </div>
                </div>

                <div className="join-card">
                    <div className={`preview-stage ${videoEnabled ? "" : "preview-stage-muted"}`}>
                        <video
                            autoPlay
                            className="preview-video"
                            muted
                            playsInline
                            ref={previewRef}
                        />
                        <div className="preview-overlay">
                            <span className="preview-badge">
                                {isPreparingMedia ? "Preparing devices" : "Ready to go live"}
                            </span>
                            <div className="preview-meta">
                                <span>{audioEnabled ? "Mic on" : "Mic off"}</span>
                                <span>{videoEnabled ? "Camera on" : "Camera off"}</span>
                            </div>
                        </div>
                        {!localStream && !isPreparingMedia ? (
                            <div className="empty-preview">
                                <strong>Camera preview unavailable</strong>
                                <span>Allow access and try again to enter the video queue.</span>
                            </div>
                        ) : null}
                    </div>

                    <div className="preflight-controls">
                        <button
                            className={`secondary-button ${audioEnabled ? "" : "button-muted"}`}
                            onClick={() => toggleTrack("audio")}
                            type="button"
                        >
                            {audioEnabled ? "Mute mic" : "Unmute mic"}
                        </button>
                        <button
                            className={`secondary-button ${videoEnabled ? "" : "button-muted"}`}
                            onClick={() => toggleTrack("video")}
                            type="button"
                        >
                            {videoEnabled ? "Hide camera" : "Show camera"}
                        </button>
                        <button className="secondary-button" onClick={() => void requestMedia()} type="button">
                            Retry devices
                        </button>
                    </div>

                    <div className="field-group">
                        <label className="field-label" htmlFor="name">
                            Nickname
                        </label>
                        <input
                            className="text-input"
                            id="name"
                            maxLength={30}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Optional. Stay anonymous if you want."
                            type="text"
                            value={name}
                        />
                    </div>

                    <div className="field-group">
                        <label className="field-label" htmlFor="interests">
                            Shared interests
                        </label>
                        <div className="interest-entry">
                            <input
                                className="text-input"
                                id="interests"
                                onChange={(event) => setInterestInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === ",") {
                                        event.preventDefault();
                                        addInterest(interestInput);
                                    }
                                }}
                                placeholder="music, coding, football..."
                                type="text"
                                value={interestInput}
                            />
                            <button
                                className="secondary-button"
                                onClick={() => addInterest(interestInput)}
                                type="button"
                            >
                                Add
                            </button>
                        </div>
                        <div className="interest-list">
                            {interests.length ? (
                                interests.map((interest) => (
                                    <button
                                        className="interest-chip"
                                        key={interest}
                                        onClick={() => removeInterest(interest)}
                                        type="button"
                                    >
                                        {interest}
                                    </button>
                                ))
                            ) : (
                                <span className="empty-interests">
                                    Add a few topics and we will prioritize better matches.
                                </span>
                            )}
                        </div>
                    </div>

                    {permissionError ? <p className="error-banner">{permissionError}</p> : null}

                    <button
                        className="primary-button"
                        disabled={!localStream || isPreparingMedia}
                        onClick={startChat}
                        type="button"
                    >
                        {isPreparingMedia ? "Preparing camera..." : "Start random video chat"}
                    </button>

                    <p className="support-copy">
                        We keep the setup lightweight: camera preview, smarter matching, and no page
                        refresh between strangers.
                    </p>
                </div>
            </section>

            <section className="feature-grid">
                {featureCards.map((card) => (
                    <article className="feature-card" key={card.title}>
                        <h2>{card.title}</h2>
                        <p>{card.description}</p>
                    </article>
                ))}
            </section>
        </main>
    );
};
