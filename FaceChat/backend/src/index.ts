import http from "http";
import express from "express";
import { Server } from "socket.io";
import { UserManager } from "./managers/UserManger";

const DEFAULT_FRONTEND_URLS = ["http://localhost:5173", "http://localhost:5174"];

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.FRONTEND_URLS
    ? process.env.FRONTEND_URLS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_FRONTEND_URLS;

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

const userManager = new UserManager();

app.get("/", (_req, res) => {
    res.json({
        name: "FaceChat signaling server",
        status: "ok",
        allowedOrigins,
    });
});

app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});

io.on("connection", (socket) => {
    userManager.addUser(socket);

    socket.on("disconnect", () => {
        userManager.removeUser(socket.id);
    });
});

const PORT = Number(process.env.PORT || 3000);

server.listen(PORT, () => {
    console.log(`FaceChat signaling server listening on port ${PORT}`);
});

export default server;
