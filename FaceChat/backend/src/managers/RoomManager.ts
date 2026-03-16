import { User } from "./UserManger";

type SignalDescription = {
    type: string;
    sdp?: string;
};

type IceCandidatePayload = Record<string, unknown>;

type LeaveReason = "skipped" | "disconnected" | "stopped";

interface Room {
    id: string;
    initiatorId: string;
    responderId: string;
    sharedInterests: string[];
    createdAt: number;
    initiator: User;
    responder: User;
}

let GLOBAL_ROOM_ID = 1;

export class RoomManager {
    private rooms: Map<string, Room>;

    constructor() {
        this.rooms = new Map<string, Room>();
    }

    createRoom(initiator: User, responder: User, sharedInterests: string[]) {
        const roomId = this.generateRoomId();
        const room: Room = {
            id: roomId,
            initiatorId: initiator.socket.id,
            responderId: responder.socket.id,
            sharedInterests,
            createdAt: Date.now(),
            initiator,
            responder,
        };

        this.rooms.set(roomId, room);

        return room;
    }

    relayOffer(roomId: string, senderSocketId: string, sdp: SignalDescription) {
        const peer = this.getPeerForRoom(roomId, senderSocketId);
        peer?.socket.emit("offer", { roomId, sdp });
    }

    relayAnswer(roomId: string, senderSocketId: string, sdp: SignalDescription) {
        const peer = this.getPeerForRoom(roomId, senderSocketId);
        peer?.socket.emit("answer", { roomId, sdp });
    }

    relayIceCandidate(roomId: string, senderSocketId: string, candidate: IceCandidatePayload) {
        const peer = this.getPeerForRoom(roomId, senderSocketId);
        peer?.socket.emit("ice-candidate", { roomId, candidate });
    }

    relayChatMessage(roomId: string, senderSocketId: string, text: string) {
        const peer = this.getPeerForRoom(roomId, senderSocketId);
        if (!peer) {
            return;
        }

        peer.socket.emit("chat-message", {
            text,
            timestamp: new Date().toISOString(),
        });
    }

    relayTypingState(roomId: string, senderSocketId: string, isTyping: boolean) {
        const peer = this.getPeerForRoom(roomId, senderSocketId);
        peer?.socket.emit("typing-state", { isTyping });
    }

    relayMediaState(
        roomId: string,
        senderSocketId: string,
        mediaState: { audioEnabled: boolean; videoEnabled: boolean },
    ) {
        const peer = this.getPeerForRoom(roomId, senderSocketId);
        peer?.socket.emit("media-state", mediaState);
    }

    closeRoomForUser(socketId: string, reason: LeaveReason) {
        const entry = this.findRoomEntryByUser(socketId);
        if (!entry) {
            return null;
        }

        const [roomId, room] = entry;
        this.rooms.delete(roomId);

        const peer = this.getPeer(room, socketId);
        if (peer) {
            peer.socket.emit("partner-left", {
                reason,
                roomId,
            });
        }

        return {
            peerId: peer?.socket.id ?? null,
            roomId,
        };
    }

    getSharedInterests(roomId: string) {
        return this.rooms.get(roomId)?.sharedInterests ?? [];
    }

    getRoomIdForUser(socketId: string) {
        return this.findRoomEntryByUser(socketId)?.[0] ?? null;
    }

    private getPeerForRoom(roomId: string, senderSocketId: string) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return null;
        }

        return this.getPeer(room, senderSocketId);
    }

    private getPeer(room: Room, senderSocketId: string) {
        if (room.initiator.socket.id === senderSocketId) {
            return room.responder;
        }

        if (room.responder.socket.id === senderSocketId) {
            return room.initiator;
        }

        return null;
    }

    private findRoomEntryByUser(socketId: string) {
        for (const entry of this.rooms.entries()) {
            const [, room] = entry;
            if (room.initiator.socket.id === socketId || room.responder.socket.id === socketId) {
                return entry;
            }
        }

        return null;
    }

    private generateRoomId() {
        const nextId = GLOBAL_ROOM_ID++;
        return `room-${nextId}`;
    }
}
