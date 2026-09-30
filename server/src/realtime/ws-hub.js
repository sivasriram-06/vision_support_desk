const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth");
const authService = require("../services/auth.service");
const { bus, REALTIME_EVENT } = require("./bus");
const logger = require("../utils/logger");

/**
 * WebSocket hub on the API's own HTTP server, path /ws.
 *
 * Auth: a browser WebSocket can't send an Authorization header and a token
 * in the URL lands in logs, so the first message must be
 * { type: "auth", token } - checked like a REST request (valid JWT, active
 * account with a credential, no forced password change). No valid auth
 * within AUTH_TIMEOUT_MS -> the socket is closed.
 *
 * Heartbeat: ping every HEARTBEAT_MS; a socket that missed the last pong is
 * dropped. Server -> client messages are bus events (see bus.js) plus
 * { type: "ready" } after auth.
 */
const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 30000;
const CLOSE = { AUTH_FAILED: 4001, AUTH_TIMEOUT: 4002, REVOKED: 4003 };

const clients = new Set(); // { ws, agentId }

const send = (ws, message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
};

const authenticate = (token) => {
    const decoded = jwt.verify(token, authConfig.jwtSecret);
    const principal = authService.buildPrincipal(decoded.sub);
    if (!principal || !principal.hasCredential || principal.status !== "Active" || principal.mustChangePassword) return null;
    return principal;
};

const attachWebSocketHub = (httpServer) => {
    const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 16 * 1024 });

    wss.on("connection", (ws) => {
        const client = { ws, agentId: null };
        ws.isAlive = true;
        ws.on("pong", () => { ws.isAlive = true; });

        const authTimer = setTimeout(() => {
            if (!client.agentId) ws.close(CLOSE.AUTH_TIMEOUT, "auth timeout");
        }, AUTH_TIMEOUT_MS);

        ws.on("message", (raw) => {
            let message;
            try {
                message = JSON.parse(raw.toString());
            } catch {
                return;
            }
            if (message.type !== "auth" || client.agentId) return;
            try {
                const principal = authenticate(message.token);
                if (!principal) throw new Error("not allowed");
                client.agentId = principal.agentId;
                clients.add(client);
                clearTimeout(authTimer);
                send(ws, { type: "ready" });
            } catch {
                ws.close(CLOSE.AUTH_FAILED, "auth failed");
            }
        });

        ws.on("close", () => {
            clearTimeout(authTimer);
            clients.delete(client);
        });
        ws.on("error", () => clients.delete(client));
    });

    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (!ws.isAlive) {
                ws.terminate();
                continue;
            }
            ws.isAlive = false;
            ws.ping();
        }
    }, HEARTBEAT_MS);
    wss.on("close", () => clearInterval(heartbeat));

    bus.on("event", (event, targets) => {
        if (event.type === REALTIME_EVENT.SESSION_REVOKED) {
            (targets || []).forEach(disconnectAgent);
            return;
        }
        const only = targets ? new Set(targets) : null;
        for (const client of clients) {
            if (!only || only.has(client.agentId)) send(client.ws, event);
        }
    });

    logger.info("Realtime WebSocket hub listening on /ws");
    return wss;
};

/** Closes every socket of an agent (deactivated, password reset, signed out). */
const disconnectAgent = (agentId) => {
    for (const client of clients) {
        if (client.agentId === agentId) client.ws.close(CLOSE.REVOKED, "session revoked");
    }
};

module.exports = { attachWebSocketHub, disconnectAgent };
