require("./env");
const app = require("../../src/app");

// Real Express app on a free port for HTTP tests (no Gmail job, no WebSocket); api.get(path, token) -> { status, body }.
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
