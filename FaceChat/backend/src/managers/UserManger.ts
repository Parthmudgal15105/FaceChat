// UserManager.ts
// Manages user connections, profiles, matchmaking queue, and interactions with RoomManager.
import { Socket } from "socket.io";
import { RoomManager } from "./RoomManager";
// Note: In a production environment, consider persisting user profiles and using a more robust matchmaking algorithm.
// signal description represents the WebRTC offer/answer payload structure, which can be extended as needed.
type SignalDescription = {
    type: string;
    //sdp can be optional in some cases, such as when sending an offer/answer without the full SDP (e.g., for renegotiation or trickle ICE)
    sdp?: string;
};
// ice candidate payload can include various properties depending on the WebRTC implementation and requirements. 
// Here we use a generic record type to allow flexibility.
type IceCandidatePayload = Record<string, unknown>;
//user state can be expanded to include more granular states if needed, such as "searching", "in-room", etc.
type UserState = "idle" | "queued" | "matched";

interface UserProfile {
    name: string;
    interests: string[];
}

export interface User {
    socket: Socket;
    profile: UserProfile;
    state: UserState;
    roomId: string | null;
    queuedAt: number | null;
}

const DEFAULT_PROFILE: UserProfile = {
    name: "Stranger",
    interests: [],
};
// The UserManager is responsible for tracking all connected users, their profiles, and matchmaking state.
export class UserManager {
    // We use a Map to store users for O(1) access by socket ID, and an array to manage the matchmaking queue.
    private users: Map<string, User>;
    private queue: string[];
    private roomManager: RoomManager;

    constructor() {
        this.users = new Map<string, User>();
        this.queue = [];
        this.roomManager = new RoomManager();
    }
// When a user connects, we create a new User object and set up event handlers for their socket.
    addUser(socket: Socket) {
        this.users.set(socket.id, {
            socket,
            profile: DEFAULT_PROFILE,
            state: "idle",
            roomId: null,
            queuedAt: null,
        });

        this.initHandlers(socket);

        socket.emit("session-ready", {
            socketId: socket.id,
        });
    }
// When a user disconnects, we need to clean up their state, remove them from the matchmaking queue, 
// and notify any connected peer if they were in a room.
    removeUser(socketId: string) {
        this.removeFromQueue(socketId);
        const detached = this.detachFromRoom(socketId, "disconnected");

        if (detached?.peerId) {
            const peer = this.users.get(detached.peerId);
            if (peer) {
                peer.state = "idle";
                peer.roomId = null;
                peer.queuedAt = null;
            }
        }

        this.users.delete(socketId);
    }
// Initializes all the event handlers for a user's socket connection,
//  including matchmaking actions and WebRTC signaling.
    private initHandlers(socket: Socket) {
        // The "join-queue" event is triggered when a user wants to start searching for a match.
        socket.on("join-queue", (payload?: { name?: string; interests?: string[] }) => {
            this.updateProfile(socket.id, payload);
            this.joinQueue(socket.id);
        });
        // The "next-stranger" event allows a user to skip their current match and look for a new one, which involves updating their profile if needed and rejoining the queue.
        socket.on("next-stranger", (payload?: { name?: string; interests?: string[] }) => {
            this.updateProfile(socket.id, payload);
            this.detachFromRoom(socket.id, "skipped");
            this.joinQueue(socket.id);
        });
        // The "stop-search" event is triggered when a user wants to stop searching for matches, which involves cleaning up their state and notifying any connected peer if they were in a room.
        socket.on("stop-search", () => {
            this.stopSearching(socket.id, "stopped");
        });
        // The following events are related to WebRTC signaling and in-room interactions, which are relayed through the RoomManager to the connected peer.
        socket.on("offer", ({ roomId, sdp }: { roomId: string; sdp: SignalDescription }) => {
            this.roomManager.relayOffer(roomId, socket.id, sdp);
        });
        // The "answer" event is triggered when a user responds to a WebRTC offer, and it is relayed to the peer in the same room.
        socket.on("answer", ({ roomId, sdp }: { roomId: string; sdp: SignalDescription }) => {
            this.roomManager.relayAnswer(roomId, socket.id, sdp);
        });
        // The "ice-candidate" event is triggered when a user gathers a new ICE candidate during the WebRTC connection process,
        //  and it is relayed to the peer in the same room to facilitate connectivity.
        socket.on("ice-candidate", ({ roomId, candidate }: { roomId: string; candidate: IceCandidatePayload }) => {
            this.roomManager.relayIceCandidate(roomId, socket.id, candidate);
        });
        // The "chat-message" event is triggered when a user sends a message in the chat, and it is relayed to the peer in the same room to enable real-time communication.
        socket.on("chat-message", ({ roomId, text }: { roomId: string; text: string }) => {
            const message = text.trim();
            if (!message) {
                return;
            }

            this.roomManager.relayChatMessage(roomId, socket.id, message.slice(0, 500));
        });
        // The "typing-state" event is triggered when a user starts or stops typing in the chat
        // , and it is relayed to the peer in the same room to provide real-time feedback on their activity.
        socket.on("typing-state", ({ roomId, isTyping }: { roomId: string; isTyping: boolean }) => {
            this.roomManager.relayTypingState(roomId, socket.id, Boolean(isTyping));
        });
        // The "media-state" event is triggered when a user changes their media state (e.g., toggling audio/video),
        // and it is relayed to the peer in the same room to update their view of the user's media status.
        socket.on(
            "media-state",
            ({
                roomId,
                audioEnabled,
                videoEnabled,
            }: {
                roomId: string;
                audioEnabled: boolean;
                videoEnabled: boolean;
            }) => {
                this.roomManager.relayMediaState(roomId, socket.id, {
                    audioEnabled: Boolean(audioEnabled),
                    videoEnabled: Boolean(videoEnabled),
                });
            },
        );
    }

    private updateProfile(socketId: string, payload?: { name?: string; interests?: string[] }) {
        const user = this.users.get(socketId);
        if (!user) {
            return;
        }

        const nextProfile = this.normalizeProfile(payload);
        user.profile = nextProfile;
    }

    private normalizeProfile(payload?: { name?: string; interests?: string[] }): UserProfile {
        const name = payload?.name?.trim();
        const interests = (payload?.interests ?? [])
            .map((interest) => interest.trim().toLowerCase())
            .filter(Boolean)
            .filter((interest, index, values) => values.indexOf(interest) === index)
            .slice(0, 8);

        return {
            name: name || DEFAULT_PROFILE.name,
            interests,
        };
    }

    private joinQueue(socketId: string) {
        const user = this.users.get(socketId);
        if (!user) {
            return;
        }

        this.removeFromQueue(socketId);
        this.detachFromRoom(socketId, "skipped");

        user.state = "queued";
        user.roomId = null;
        user.queuedAt = Date.now();
        this.queue.push(socketId);

        user.socket.emit("searching", {
            queueSize: this.queue.length,
        });

        this.tryMatchQueuedUsers();
    }

    private stopSearching(socketId: string, reason: "stopped" | "skipped") {
        const user = this.users.get(socketId);
        if (!user) {
            return;
        }

        this.removeFromQueue(socketId);
        const detached = this.detachFromRoom(socketId, reason);

        user.state = "idle";
        user.roomId = null;
        user.queuedAt = null;

        if (detached?.peerId) {
            const peer = this.users.get(detached.peerId);
            if (peer) {
                peer.state = "idle";
                peer.roomId = null;
                peer.queuedAt = null;
            }
        }
    }

    private detachFromRoom(socketId: string, reason: "skipped" | "disconnected" | "stopped") {
        const user = this.users.get(socketId);
        if (!user?.roomId) {
            return null;
        }

        const roomId = user.roomId;
        const detached = this.roomManager.closeRoomForUser(socketId, reason);
        user.roomId = null;
        user.state = "idle";
        user.queuedAt = null;

        if (!detached?.peerId) {
            return detached;
        }

        const peer = this.users.get(detached.peerId);
        if (peer && peer.roomId === roomId) {
            peer.roomId = null;
            peer.state = "idle";
            peer.queuedAt = null;
        }

        return detached;
    }

    private removeFromQueue(socketId: string) {
        this.queue = this.queue.filter((id) => id !== socketId);
    }

    private tryMatchQueuedUsers() {
        // MATCHMAKING ARCHITECTURE:
        // We continuously loop while there are at least 2 people searching in the queue
        // We pick the person waiting the longest (index 0) and compare them with the rest of the queue
        // to assign a "score" based on shared interests + time waiting (Queue Queue Weight)
        while (this.queue.length > 1) {
            const nextMatch = this.findBestMatch();
            if (!nextMatch) {
                return; // Not enough compatible matches right now
            }

            // Destructuring array. At this point, they enter a room together.
            const [firstId, secondId, sharedInterests] = nextMatch;
            const firstUser = this.users.get(firstId);
            const secondUser = this.users.get(secondId);

            // They found each other, immediately take both out of the waiting queue.
            this.removeFromQueue(firstId);
            this.removeFromQueue(secondId);

            if (!firstUser || !secondUser) {
                continue;
            }

            const room = this.roomManager.createRoom(firstUser, secondUser, sharedInterests);

            firstUser.state = "matched";
            firstUser.roomId = room.id;
            firstUser.queuedAt = null;

            secondUser.state = "matched";
            secondUser.roomId = room.id;
            secondUser.queuedAt = null;

            firstUser.socket.emit("match-found", {
                roomId: room.id,
                initiator: true,
                sharedInterests,
                partnerLabel: this.getPartnerLabel(secondUser.profile.name),
            });

            secondUser.socket.emit("match-found", {
                roomId: room.id,
                initiator: false,
                sharedInterests,
                partnerLabel: this.getPartnerLabel(firstUser.profile.name),
            });
        }
    }

    private findBestMatch() {
        const seekerId = this.queue[0];
        const seeker = this.users.get(seekerId);

        if (!seeker) {
            this.removeFromQueue(seekerId);
            return null;
        }

        let bestCandidateId: string | null = null;
        let bestSharedInterests: string[] = [];
        let bestScore = Number.NEGATIVE_INFINITY;

        for (let index = 1; index < this.queue.length; index += 1) {
            const candidateId = this.queue[index];
            const candidate = this.users.get(candidateId);

            if (!candidate) {
                continue;
            }

            const sharedInterests = this.getSharedInterests(seeker.profile.interests, candidate.profile.interests);
            const queueWeight = this.queue.length - index;
            const score = sharedInterests.length * 100 + queueWeight;

            if (score > bestScore) {
                bestScore = score;
                bestCandidateId = candidateId;
                bestSharedInterests = sharedInterests;
            }
        }

        if (!bestCandidateId) {
            return null;
        }

        return [seekerId, bestCandidateId, bestSharedInterests] as const;
    }

    private getSharedInterests(left: string[], right: string[]) {
        const rightLookup = new Set(right);
        return left.filter((interest) => rightLookup.has(interest));
    }

    private getPartnerLabel(name: string) {
        return name.trim() || "Stranger";
    }
}
