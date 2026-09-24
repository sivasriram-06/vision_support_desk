const bcrypt = require("bcryptjs");

// bcryptjs (pure JS) rather than native bcrypt - no node-gyp build on
// Windows/Linux servers, and hashes are interchangeable with native bcrypt.
const SALT_ROUNDS = 10;
const MIN_LENGTH = 8;
// bcrypt silently ignores everything past 72 bytes, so reject longer input
// instead of letting two different long passwords hash the same.
const MAX_BYTES = 72;

const hashPassword = (password) => bcrypt.hashSync(password, SALT_ROUNDS);

const verifyPassword = (password, stored) => {
    // bcryptjs throws on non-string input - treat that as a failed match.
    if (typeof password !== "string" || typeof stored !== "string") {
        return false;
    }
    return bcrypt.compareSync(password, stored);
};

/** Returns a human-readable reason the password is too weak, or null if it's acceptable. */
const getPasswordPolicyError = (password) => {
    if (typeof password !== "string" || password.length < MIN_LENGTH) {
        return `Password must be at least ${MIN_LENGTH} characters`;
    }
    if (Buffer.byteLength(password, "utf8") > MAX_BYTES) {
        return `Password must be at most ${MAX_BYTES} bytes`;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return "Password must contain at least one letter and one number";
    }
    return null;
};

module.exports = { hashPassword, verifyPassword, getPasswordPolicyError };
