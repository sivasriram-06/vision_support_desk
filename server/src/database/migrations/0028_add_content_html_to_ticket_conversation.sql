-- Adds a sanitized HTML column alongside the existing plain-text Content,
-- so the frontend can render a message exactly as the sender formatted it
-- (signatures, images, tables) rather than only plain text. NULL when the
-- source message had no HTML part (e.g. an agent's plain-text reply).
-- The value here is already sanitized server-side (see
-- src/utils/sanitize-email-html.js) before storage, but any renderer must
-- still treat it as untrusted content and sanitize/CSP on its own end too.
ALTER TABLE HD_TICKET_CONVERSATION ADD COLUMN Content_Html TEXT;
