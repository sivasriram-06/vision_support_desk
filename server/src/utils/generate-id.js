const crypto = require("crypto");

const BASE36_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

const randomBase36 = (length) => {
    let out = "";
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i += 1) {
        out += BASE36_ALPHABET[bytes[i] % BASE36_ALPHABET.length];
    }
    return out;
};

/**
 * Generates a short, sortable, unique-enough identifier that fits every
 * HD_* primary key column (VARCHAR2(15)): 8 base36 timestamp chars +
 * 6 random base36 chars = 14 chars, always <= 15.
 */
const generateId = () => {
    const timePart = Date.now().toString(36).padStart(8, "0");
    const randomPart = randomBase36(6);
    return `${timePart}${randomPart}`;
};

module.exports = generateId;
