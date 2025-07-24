import { useEffect, useRef, useState } from "react"
import { Room } from "./Room";

export const Landing = () => {
    const [name, setName] = useState("");
    const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null);
    const [localVideoTrack, setlocalVideoTrack] = useState<MediaStreamTrack | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [joined, setJoined] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);

    const getCam = async () => {
        try {
            const stream = await window.navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            })
            const audioTrack = stream.getAudioTracks()[0]
            const videoTrack = stream.getVideoTracks()[0]
            setLocalAudioTrack(audioTrack);
            setlocalVideoTrack(videoTrack);
            if (!videoRef.current) {
                return;
            }
            videoRef.current.srcObject = new MediaStream([videoTrack])
            videoRef.current.play();
            setCameraReady(true);
        } catch (error) {
            console.error("Error accessing camera:", error);
            alert("Could not access camera and microphone. Please grant permission and refresh.");
        }
    }

    useEffect(() => {
        if (videoRef && videoRef.current) {
            getCam()
        }
    }, [videoRef]);

    if (!joined) {
        return (
            <div className="landing-container">
                <h1 className="landing-title">FaceChat</h1>
                <p className="landing-subtitle">Connect instantly with people around the world</p>
                
                <video 
                    autoPlay 
                    muted 
                    ref={videoRef} 
                    className="video-preview"
                    style={{ 
                        display: cameraReady ? 'block' : 'none' 
                    }}
                />
                
                {!cameraReady && (
                    <div className="video-preview" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '1rem'
                    }}>
                        Setting up camera...
                    </div>
                )}
                
                <div className="input-group">
                    <input 
                        type="text" 
                        placeholder="Enter your name" 
                        className="name-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && name.trim() && cameraReady) {
                                setJoined(true);
                            }
                        }}
                    />
                    <button 
                        className="join-button"
                        disabled={!name.trim() || !cameraReady}
                        onClick={() => setJoined(true)}
                    >
                        Start Video Chat
                    </button>
                </div>
                
                {!cameraReady && (
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                        Please allow camera and microphone access to continue
                    </p>
                )}
            </div>
        )
    }

    return <Room name={name} localAudioTrack={localAudioTrack} localVideoTrack={localVideoTrack} />
}