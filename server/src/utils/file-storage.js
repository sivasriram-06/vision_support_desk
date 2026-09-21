const fs = require("fs");
const path = require("path");
const env = require("../config/env");

const attachmentsRoot = path.resolve(process.cwd(), env.attachmentsDir);

/** Strips path separators/traversal so a hostile filename can't escape attachmentsRoot. */
const sanitizeFileName = (name) => {
    const cleaned = String(name || "").replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
    return cleaned || "file";
};

/**
 * Writes a file under <attachmentsRoot>/<ticketId>/<attachmentId>-<name>
 * and returns the path stored in HD_TICKET_ATTACHMENT.Storage_Path -
 * relative to attachmentsRoot, so the root can move between environments
 * (e.g. local disk in dev, a mounted volume in production) without
 * invalidating existing rows.
 */
const saveAttachmentBuffer = ({ ticketId, attachmentId, fileName, buffer }) => {
    const ticketDir = path.join(attachmentsRoot, ticketId);
    fs.mkdirSync(ticketDir, { recursive: true });

    const storedFileName = `${attachmentId}-${sanitizeFileName(fileName)}`;
    fs.writeFileSync(path.join(ticketDir, storedFileName), buffer);

    return path.join(ticketId, storedFileName);
};

const resolveAttachmentPath = (storagePath) => path.join(attachmentsRoot, storagePath);

module.exports = { saveAttachmentBuffer, resolveAttachmentPath, sanitizeFileName, attachmentsRoot };
