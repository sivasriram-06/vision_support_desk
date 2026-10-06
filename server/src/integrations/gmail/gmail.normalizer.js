const sanitizeEmailHtml = require("../../utils/sanitize-email-html");
const { toIst } = require("../../utils/time");

const getHeader = (headers, name) => {
    const header = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : null;
};

/** Parses "Name <email>, other@x.com" into [{ name, email }]. */
const parseAddressHeader = (headerValue) => {
    if (!headerValue) {
        return [];
    }
    return headerValue.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const match = entry.match(/^(.*?)<(.+)>$/);
            if (match) {
                return { name: match[1].trim().replace(/"/g, "") || null, email: match[2].trim().toLowerCase() };
            }
            return { name: null, email: entry.toLowerCase() };
        });
};

const decodeBase64Url = (data) => {
    if (!data) {
        return "";
    }
    return Buffer.from(data, "base64").toString("utf8");
};

const stripHtml = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Returns BOTH text and html bodies: the plain-text alternative often drops things (e.g. signature images).
const extractBodyParts = (payload, acc = { text: null, html: null }) => {
    if (!payload) {
        return acc;
    }
    if (payload.mimeType === "text/plain" && payload.body?.data && !acc.text) {
        acc.text = decodeBase64Url(payload.body.data);
    }
    if (payload.mimeType === "text/html" && payload.body?.data && !acc.html) {
        acc.html = decodeBase64Url(payload.body.data);
    }
    if (payload.parts) {
        for (const part of payload.parts) {
            extractBodyParts(part, acc);
        }
    }
    return acc;
};

// Every part with a filename (attachments and cid: images); contentId lets ingestion tell inline images apart.
const collectAttachmentParts = (payload, acc = []) => {
    if (!payload) {
        return acc;
    }
    if (payload.filename && payload.filename.length > 0 && payload.body) {
        const contentIdHeader = getHeader(payload.headers, "Content-ID");
        acc.push({
            filename: payload.filename,
            mimeType: payload.mimeType || "application/octet-stream",
            attachmentId: payload.body.attachmentId || null,
            inlineData: payload.body.data || null,
            size: payload.body.size || 0,
            contentId: contentIdHeader ? contentIdHeader.replace(/^<|>$/g, "") : null
        });
    }
    if (payload.parts) {
        for (const part of payload.parts) {
            collectAttachmentParts(part, acc);
        }
    }
    return acc;
};

// messageIdHeader falls back to the Gmail id when Message-ID is missing: it keys idempotent ingestion.
const normalizeMessage = (rawMessage) => {
    const headers = rawMessage.payload?.headers || [];
    const [from] = parseAddressHeader(getHeader(headers, "From"));
    const { text, html } = extractBodyParts(rawMessage.payload);

    return {
        gmailMessageId: rawMessage.id,
        gmailThreadId: rawMessage.threadId,
        messageIdHeader: getHeader(headers, "Message-ID") || rawMessage.id,
        inReplyToHeader: getHeader(headers, "In-Reply-To"),
        referencesHeader: getHeader(headers, "References"),
        subject: getHeader(headers, "Subject") || "(no subject)",
        from: from || null,
        replyTo: parseAddressHeader(getHeader(headers, "Reply-To")),
        to: parseAddressHeader(getHeader(headers, "To")),
        cc: parseAddressHeader(getHeader(headers, "Cc")),
        sentTime: toIst(Number(rawMessage.internalDate)),
        // Plain text for search/preview; falls back to stripped HTML when there is no text/plain part.
        bodyText: (text ?? (html ? stripHtml(html) : "")).trim(),
        // Sanitized HTML to render the mail exactly as sent; null when there is no HTML part.
        bodyHtml: html ? sanitizeEmailHtml(html) : null,
        attachments: collectAttachmentParts(rawMessage.payload)
    };
};

module.exports = { normalizeMessage, getHeader, parseAddressHeader };
