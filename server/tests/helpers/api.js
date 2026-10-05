require("./env");
const app = require("../../src/app");

/**
 * Starts the real Express app (routes, auth, permissions, validation,
 * error handler) on a free port for HTTP tests. No Gmail job, no WebSocket.
 *
 *   const api = await startApi();
 *   const res = await api.get("/api/v1/tickets", token);   // { status, body }
 *   await api.close();
 */
const startApi = () => new Promise((resolve) => {
    const server = app.listen(0, () => {
        const base = `http://127.0.0.1:${server.address().port}`;
        const call = async (method, path, token, body) => {
            const res = await fetch(base + path, {
                method,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(body !== undefined ? { "Content-Type": "application/json" } : {})
                },
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            const text = await res.text();
            let parsed = null;
            try {
                parsed = text ? JSON.parse(text) : null;
            } catch {
                parsed = text;
            }
            return { status: res.status, body: parsed };
        };
        resolve({
            base,
            get: (path, token) => call("GET", path, token),
            post: (path, token, body = {}) => call("POST", path, token, body),
            patch: (path, token, body = {}) => call("PATCH", path, token, body),
            put: (path, token, body = {}) => call("PUT", path, token, body),
            delete: (path, token) => call("DELETE", path, token),
            close: () => new Promise((done) => server.close(done))
        });
    });
});

module.exports = { startApi };
