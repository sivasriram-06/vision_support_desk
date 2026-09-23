const sanitizeHtml = require("sanitize-html");

/**
 * Sanitizes sender-supplied HTML email bodies before they're persisted.
 * This is defense-in-depth, not a substitute for the frontend also treating
 * this as untrusted content (React's dangerouslySetInnerHTML, or any other
 * renderer, must still be paired with its own sanitization/CSP - never trust
 * a single layer). Allows the formatting/structure/images real signatures
 * need (including remote <img src>, which is exactly how most signature
 * logos - e.g. Gmail's own signature feature - are delivered) while
 * stripping anything that can execute: <script>, event handler attributes,
 * javascript: URLs, <iframe>/<object>/<embed>, forms.
 */
const sanitizeEmailHtml = (html) => {
    if (!html) {
        return null;
    }
    return sanitizeHtml(html, {
        allowedTags: [
            "div", "span", "p", "br", "hr", "b", "strong", "i", "em", "u", "s",
            "ul", "ol", "li", "blockquote", "pre", "code",
            "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
            "a", "img", "font", "h1", "h2", "h3", "h4", "h5", "h6"
        ],
        allowedAttributes: {
            a: ["href", "name", "target", "rel"],
            img: ["src", "alt", "width", "height", "style"],
            table: ["width", "cellpadding", "cellspacing", "border", "bgcolor", "align", "style"],
            td: ["width", "height", "colspan", "rowspan", "valign", "align", "bgcolor", "style"],
            th: ["width", "height", "colspan", "rowspan", "valign", "align", "bgcolor", "style"],
            font: ["color", "face", "size"],
            "*": ["style", "align", "dir", "bgcolor"]
        },
        allowedSchemes: ["http", "https", "mailto", "cid"],
        // "data" is img-only (never allowed on <a href>, where a data:
        // URI is navigable/clickable and a real risk) - inline images are
        // embedded as data:image/...;base64 after this sanitizer runs (see
        // ingestion.engine.js), so a defensive re-sanitize of already-
        // stored HTML needs to keep that scheme rather than strip it.
        allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
        allowProtocolRelative: false,
        transformTags: {
            a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
        },
        // Broad enough to preserve how a real HTML email (table-based
        // layouts, branded colors/spacing, signature boxes) actually looks
        // in Gmail - narrowly matching sanitize-html's original 4-property
        // list flattened almost everything to browser defaults. Still a
        // strict per-property allowlist, not "pass the style attribute
        // through": nothing here admits expression()/behavior/url(), and
        // position/z-index (the classic fixed-overlay phishing vector)
        // stay excluded.
        allowedStyles: {
            "*": {
                color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
                "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
                background: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
                "text-align": [/^left$|^right$|^center$|^justify$/],
                "vertical-align": [/^top$|^middle$|^bottom$|^baseline$/],
                "font-weight": [/^bold$|^normal$|^[1-9]00$/],
                "font-style": [/^italic$|^normal$/],
                "font-size": [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
                "font-family": [/^[-a-zA-Z0-9\s,'".]+$/],
                "line-height": [/^\d+(\.\d+)?(px|pt|em|%)?$/],
                "letter-spacing": [/^-?\d+(\.\d+)?(px|em)$/],
                "text-decoration": [/^underline$|^none$|^line-through$/],
                "text-transform": [/^uppercase$|^lowercase$|^capitalize$|^none$/],
                "white-space": [/^normal$|^nowrap$|^pre$/],
                display: [/^block$|^inline$|^inline-block$|^table$|^table-cell$|^table-row$|^none$/],
                width: [/^\d+(\.\d+)?(px|%)$|^auto$/],
                height: [/^\d+(\.\d+)?(px|%)$|^auto$/],
                "max-width": [/^\d+(\.\d+)?(px|%)$/],
                "min-width": [/^\d+(\.\d+)?(px|%)$/],
                padding: [/^-?\d+(\.\d+)?(px|em|%)(\s-?\d+(\.\d+)?(px|em|%)){0,3}$/],
                "padding-top": [/^\d+(\.\d+)?(px|em|%)$/],
                "padding-right": [/^\d+(\.\d+)?(px|em|%)$/],
                "padding-bottom": [/^\d+(\.\d+)?(px|em|%)$/],
                "padding-left": [/^\d+(\.\d+)?(px|em|%)$/],
                margin: [/^-?\d+(\.\d+)?(px|em|%)(\s-?\d+(\.\d+)?(px|em|%)){0,3}$|^auto(\s-?\d+(\.\d+)?(px|em|%))?$|^0\sauto$/],
                "margin-top": [/^-?\d+(\.\d+)?(px|em|%)$/],
                "margin-right": [/^-?\d+(\.\d+)?(px|em|%)$|^auto$/],
                "margin-bottom": [/^-?\d+(\.\d+)?(px|em|%)$/],
                "margin-left": [/^-?\d+(\.\d+)?(px|em|%)$|^auto$/],
                border: [/^\d+(px)?\s(solid|dashed|dotted|none)\s(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|[a-zA-Z]+)$|^none$/],
                "border-radius": [/^\d+(\.\d+)?(px|%)(\s\d+(\.\d+)?(px|%)){0,3}$/],
                "border-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^[a-zA-Z]+$/],
                "border-width": [/^\d+(px)?$/],
                "border-style": [/^solid$|^dashed$|^dotted$|^none$/],
                "border-collapse": [/^collapse$|^separate$/],
                "border-spacing": [/^\d+(px)?(\s\d+(px)?)?$/]
            },
            img: {
                width: [/^\d+(px)?$/],
                height: [/^\d+(px)?$/],
                "margin-right": [/^\d+(px)?$/]
            }
        }
    });
};

module.exports = sanitizeEmailHtml;
