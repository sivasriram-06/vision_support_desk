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

/** Walks the (possibly multipart/nested) Gmail payload for a text body. */
const extractBody = (payload) => {
    if (!payload) {
        return "";
    }
    if (payload.mimeType === "text/plain" && payload.body?.data) {
        return decodeBase64Url(payload.body.data);
    }
    if (payload.parts) {
        const plainPart = payload.parts.find((part) => part.mimeType === "text/plain");
        if (plainPart?.body?.data) {
            return decodeBase64Url(plainPart.body.data);
        }
        const htmlPart = payload.parts.find((part) => part.mimeType === "text/html");
        if (htmlPart?.body?.data) {
            return stripHtml(decodeBase64Url(htmlPart.body.data));
        }
        for (const part of payload.parts) {
            const nested = extractBody(part);
            if (nested) {
                return nested;
            }
        }
    }
    if (payload.body?.data) {
        return decodeBase64Url(payload.body.data);
    }
    return "";
};

/**
 * Recursively collects every part that carries a filename (real
 * attachments AND inline/cid: images alike - both matter for showing the
 * "exact email"). For a large attachment, Gmail only gives back
 * body.attachmentId here and expects a separate attachments.get call for
 * the bytes; for small ones body.data may already be inline.
 */
const collectAttachmentParts = (payload, acc = []) => {
    if (!payload) {
        return acc;
    }
    if (payload.filename && payload.filename.length > 0 && payload.body) {
        acc.push({
            filename: payload.filename,
            mimeType: payload.mimeType || "application/octet-stream",
            attachmentId: payload.body.attachmentId || null,
            inlineData: payload.body.data || null,
            size: payload.body.size || 0
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

    return {
        gmailMessageId: rawMessage.id,
        gmailThreadId: rawMessage.threadId,
        messageIdHeader: getHeader(headers, "Message-ID") || rawMessage.id,
        inReplyToHeader: getHeader(headers, "In-Reply-To"),
        referencesHeader: getHeader(headers, "References"),
        subject: getHeader(headers, "Subject") || "(no subject)",
        from: from || null,
        to: parseAddressHeader(getHeader(headers, "To")),
        cc: parseAddressHeader(getHeader(headers, "Cc")),
        sentTime: new Date(Number(rawMessage.internalDate)).toISOString(),
        bodyText: extractBody(rawMessage.payload).trim(),
        attachments: collectAttachmentParts(rawMessage.payload)
    };
};

module.exports = { normalizeMessage, getHeader, parseAddressHeader };
