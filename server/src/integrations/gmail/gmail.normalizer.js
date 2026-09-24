const sanitizeEmailHtml = require("../../utils/sanitize-email-html");

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

/**
 * Walks the (possibly multipart/nested) Gmail payload and returns BOTH the
 * text/plain and text/html bodies when present - NOT just whichever comes
 * first. A real-world email's plain-text alternative is often a stripped-
 * down summary that drops things only present in the HTML version (a
 * signature image, formatting, etc.) - see the "testing attachment" email
 * from Prabhash, where the signature only exists in text/html.
 */
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

/**
 * Recursively collects every part that carries a filename (real
 * attachments AND inline/cid: images alike - both matter for showing the
 * "exact email"). For a large attachment, Gmail only gives back
 * body.attachmentId here and expects a separate attachments.get call for
 * the bytes; for small ones body.data may already be inline.
 *
 * contentId is that part's RFC 2045 Content-ID header (angle brackets
 * stripped), when present - this is how the HTML body's <img src="cid:...">
 * tags reference a specific part. The ingestion engine uses it to tell an
 * inline body image apart from a genuine attachment: a cid: match means the
 * image IS the message content, not something separate to download.
 */
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

/**
 * Converts a raw Gmail API message (format=full) into the shape the
 * ingestion engine needs. messageIdHeader falls back to the Gmail API's own
 * message id when the RFC 5322 Message-ID header is missing, since that
 * field is what HD_TICKET_THREAD uses to guarantee idempotent ingestion.
 */
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
        sentTime: new Date(Number(rawMessage.internalDate)).toISOString(),
        // Plain text for search/preview/plain display. Falls back to a
        // stripped version of the HTML when no text/plain part exists at
        // all (rare, but some clients only send HTML).
        bodyText: (text ?? (html ? stripHtml(html) : "")).trim(),
        // Full-fidelity, sanitized HTML for rendering in the UI exactly as
        // the sender formatted it (signatures, images, tables, etc.) - null
        // when the message had no HTML part.
        bodyHtml: html ? sanitizeEmailHtml(html) : null,
        attachments: collectAttachmentParts(rawMessage.payload)
    };
};

module.exports = { normalizeMessage, getHeader, parseAddressHeader };
