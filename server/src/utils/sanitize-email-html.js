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
            "table", "thead", "tbody", "tr", "td", "th",
            "a", "img", "font", "h1", "h2", "h3", "h4", "h5", "h6"
        ],
        allowedAttributes: {
            a: ["href", "name", "target", "rel"],
            img: ["src", "alt", "width", "height", "style"],
            "*": ["style", "align", "dir"]
        },
        allowedSchemes: ["http", "https", "mailto", "cid"],
        allowedSchemesByTag: { img: ["http", "https", "cid"] },
        allowProtocolRelative: false,
        transformTags: {
            a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
        },
        // Strips risky CSS (expression(), url(javascript:), position:fixed
        // overlays, etc.) rather than allowing the whole style attribute
        // through unchecked.
        allowedStyles: {
            "*": {
                color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
                "text-align": [/^left$|^right$|^center$/],
                "font-weight": [/^bold$|^normal$|^[1-9]00$/],
                "font-style": [/^italic$|^normal$/]
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
