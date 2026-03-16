import { Socket } from "socket.io";
import { RoomManager } from "./RoomManager";

type SignalDescription = {
    type: string;
    sdp?: string;
};

type IceCandidatePayload = Record<string, unknown>;

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

export class UserManager {
    private users: Map<string, User>;
    private queue: string[];
    private roomManager: RoomManager;

    constructor() {
        this.users = new Map<string, User>();
        this.queue = [];
        this.roomManager = new RoomManager();
    }

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

    private initHandlers(socket: Socket) {
        socket.on("join-queue", (payload?: { name?: string; interests?: string[] }) => {
            this.updateProfile(socket.id, payload);
            this.joinQueue(socket.id);
        });

        socket.on("next-stranger", (payload?: { name?: string; interests?: string[] }) => {
            this.updateProfile(socket.id, payload);
            this.detachFromRoom(socket.id, "skipped");
            this.joinQueue(socket.id);
        });

        socket.on("stop-search", () => {
            this.stopSearching(socket.id, "stopped");
        });

        socket.on("offer", ({ roomId, sdp }: { roomId: string; sdp: SignalDescription }) => {
            this.roomManager.relayOffer(roomId, socket.id, sdp);
        });

        socket.on("answer", ({ roomId, sdp }: { roomId: string; sdp: SignalDescription }) => {
            this.roomManager.relayAnswer(roomId, socket.id, sdp);
        });

        socket.on("ice-candidate", ({ roomId, candidate }: { roomId: string; candidate: IceCandidatePayload }) => {
            this.roomManager.relayIceCandidate(roomId, socket.id, candidate);
        });

        socket.on("chat-message", ({ roomId, text }: { roomId: string; text: string }) => {
            const message = text.trim();
            if (!message) {
                return;
            }

            this.roomManager.relayChatMessage(roomId, socket.id, message.slice(0, 500));
        });

        socket.on("typing-state", ({ roomId, isTyping }: { roomId: string; isTyping: boolean }) => {
            this.roomManager.relayTypingState(roomId, socket.id, Boolean(isTyping));
        });

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
        while (this.queue.length > 1) {
            const nextMatch = this.findBestMatch();
            if (!nextMatch) {
                return;
            }

            const [firstId, secondId, sharedInterests] = nextMatch;
            const firstUser = this.users.get(firstId);
            const secondUser = this.users.get(secondId);

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
