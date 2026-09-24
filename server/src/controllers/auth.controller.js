const authService = require("../services/auth.service");
const authConfig = require("../config/auth");
const env = require("../config/env");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const requestMeta = (req) => ({ ipAddress: req.ip, userAgent: req.headers["user-agent"] || null });

// Mirrors the JWT into an httpOnly cookie so attachment download links
// (<a href>, no Authorization header) are authenticated too. The cookie is
// only honoured on GET/HEAD - see auth.middleware.js.
const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/"
};

const login = (req, res, next) => {
    try {
        const result = authService.login(req.body, requestMeta(req));
        res.cookie(authConfig.sessionCookieName, result.token, cookieOptions);
        ok(res, HTTP_STATUS.OK, result);
    } catch (error) {
        next(error);
    }
};

const me = (req, res, next) => {
    try {
        ok(res, HTTP_STATUS.OK, authService.toMeDto(req.agent));
    } catch (error) {
        next(error);
    }
};

const changePassword = (req, res, next) => {
    try {
        const agent = authService.changePassword(req.agent, req.body);
        ok(res, HTTP_STATUS.OK, agent);
    } catch (error) {
        next(error);
    }
};

const logout = (req, res, next) => {
    try {
        authService.logout(req.agent, requestMeta(req));
        res.clearCookie(authConfig.sessionCookieName, cookieOptions);
        ok(res, HTTP_STATUS.OK, { loggedOut: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { login, me, changePassword, logout };
