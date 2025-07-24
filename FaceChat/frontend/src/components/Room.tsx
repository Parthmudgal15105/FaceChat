import { useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";

const URL = "http://localhost:3000";

export const Room = ({
    name,
    localAudioTrack,
    localVideoTrack
}: {
    name: string,
    localAudioTrack: MediaStreamTrack | null,
    localVideoTrack: MediaStreamTrack | null,
}) => {
    const [lobby, setLobby] = useState(true);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [sendingPc, setSendingPc] = useState<RTCPeerConnection | null>(null);
    const [receivingPc, setReceivingPc] = useState<RTCPeerConnection | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const socket = io(URL);
        setSocket(socket);
        
        socket.on('connect', () => {
            setConnectionStatus('connecting');
        });

        socket.on('send-offer', async ({roomId}) => {
            console.log("Sending offer for room:", roomId);
            setLobby(false);
            setConnectionStatus('connecting');
            
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            setSendingPc(pc);
            
            if (localVideoTrack) {
                pc.addTrack(localVideoTrack);
            }
            if (localAudioTrack) {
                pc.addTrack(localAudioTrack);
            }

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit("add-ice-candidate", {
                        candidate: e.candidate,
                        type: "sender",
                        roomId
                    });
                }
            };

            pc.onnegotiationneeded = async () => {
                console.log("Creating and sending offer");
                const sdp = await pc.createOffer();
                await pc.setLocalDescription(sdp);
                socket.emit("offer", { sdp, roomId });
            };

            pc.onconnectionstatechange = () => {
                console.log("Sending PC connection state:", pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setConnectionStatus('connected');
                }
            };
        });

        socket.on("offer", async ({roomId, sdp: remoteSdp}) => {
            console.log("Received offer for room:", roomId);
            setLobby(false);
            setConnectionStatus('connecting');
            
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });
            
            await pc.setRemoteDescription(remoteSdp);
            const sdp = await pc.createAnswer();
            await pc.setLocalDescription(sdp);
            
            const stream = new MediaStream();
            
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
            }

            setReceivingPc(pc);

            pc.ontrack = (e) => {
                console.log("Received track:", e.track.kind);
                const track = e.track;
                stream.addTrack(track);
                
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                    remoteVideoRef.current.play().catch(console.error);
                }
            };

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit("add-ice-candidate", {
                        candidate: e.candidate,
                        type: "receiver",
                        roomId
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                console.log("Receiving PC connection state:", pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setConnectionStatus('connected');
                } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                    setConnectionStatus('disconnected');
                }
            };

            socket.emit("answer", { roomId, sdp });
        });

        socket.on("answer", ({roomId, sdp: remoteSdp}) => {
            console.log("Received answer for room:", roomId);
            setSendingPc(pc => {
                if (pc) {
                    pc.setRemoteDescription(remoteSdp);
                }
                return pc;
            });
        });

        socket.on("lobby", () => {
            console.log("Back to lobby");
            setLobby(true);
            setConnectionStatus('connecting');
        });

        socket.on("add-ice-candidate", ({candidate, type}) => {
            console.log("Adding ICE candidate:", type);
            if (type === "sender") {
                setReceivingPc(pc => {
                    if (pc) {
                        pc.addIceCandidate(candidate).catch(console.error);
                    }
                    return pc;
                });
            } else {
                setSendingPc(pc => {
                    if (pc) {
                        pc.addIceCandidate(candidate).catch(console.error);
                    }
                    return pc;
                });
            }
        });

        socket.on("user-disconnected", () => {
            console.log("Other user disconnected");
            setLobby(true);
            setConnectionStatus('disconnected');
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
            }
        });

        return () => {
            socket.disconnect();
            if (sendingPc) sendingPc.close();
            if (receivingPc) receivingPc.close();
        };
    }, [name, localAudioTrack, localVideoTrack]);

    useEffect(() => {
        if (localVideoRef.current && localVideoTrack) {
            const stream = new MediaStream([localVideoTrack]);
            if (localAudioTrack) {
                stream.addTrack(localAudioTrack);
            }
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(console.error);
        }
    }, [localVideoTrack, localAudioTrack]);

    const toggleMute = () => {
        if (localAudioTrack) {
            localAudioTrack.enabled = !localAudioTrack.enabled;
            setIsMuted(!localAudioTrack.enabled);
        }
    };

    const toggleVideo = () => {
        if (localVideoTrack) {
            localVideoTrack.enabled = !localVideoTrack.enabled;
            setIsVideoOff(!localVideoTrack.enabled);
        }
    };

    const endCall = () => {
        if (socket) {
            socket.disconnect();
        }
        if (sendingPc) sendingPc.close();
        if (receivingPc) receivingPc.close();
        window.location.reload();
    };

    if (lobby) {
        return (
            <div className="lobby-container">
                <div className="connection-status connecting">
                    Connecting...
                </div>
                <h2 className="lobby-title">Welcome, {name}!</h2>
                <p className="lobby-message">Looking for someone to chat with...</p>
                <div className="loading-spinner"></div>
                <div className="video-container" style={{ width: '400px', marginTop: '2rem' }}>
                    <video 
                        autoPlay 
                        muted 
                        ref={localVideoRef} 
                        className="video-stream"
                    />
                    <div className="video-label">You</div>
                </div>
            </div>
        );
    }

    return (
        <div className="room-container">
            <div className={`connection-status ${connectionStatus}`}>
                {connectionStatus === 'connected' ? '🟢 Connected' : 
                 connectionStatus === 'connecting' ? '🟡 Connecting...' : 
                 '🔴 Disconnected'}
            </div>
            
            <div className="room-header">
                <h2 className="room-title">Video Chat with {name}</h2>
                <div className="room-status">
                    {connectionStatus === 'connected' ? 'In call' : 'Connecting...'}
                </div>
            </div>

            <div className="video-grid">
                <div className="video-container">
                    <video 
                        autoPlay 
                        muted 
                        ref={localVideoRef} 
                        className="video-stream"
                        style={{ 
                            filter: isVideoOff ? 'brightness(0.3)' : 'none' 
                        }}
                    />
                    <div className="video-label">You</div>
                </div>
                
                <div className="video-container">
                    <video 
                        autoPlay 
                        ref={remoteVideoRef} 
                        className="video-stream"
                    />
                    <div className="video-label">Other Person</div>
                </div>
            </div>

            <div className="controls">
                <button 
                    className={`control-button ${isMuted ? 'mute' : 'unmute'}`}
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? '🎤' : '🔇'}
                </button>
                
                <button 
                    className={`control-button ${isVideoOff ? 'video-off' : 'video-on'}`}
                    onClick={toggleVideo}
                    title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                >
                    {isVideoOff ? '📹' : '📴'}
                </button>
                
                <button 
                    className="control-button end-call"
                    onClick={endCall}
                    title="End call"
                >
                    📞
                </button>
            </div>
        </div>
    );
}

