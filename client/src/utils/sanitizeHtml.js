import DOMPurify from 'dompurify'

/**
 * The backend already sanitizes Content_Html before storing it
 * (server/src/utils/sanitize-email-html.js), but that's not a substitute
 * for sanitizing again here - a single trusted layer is one bug away from a
 * stored-XSS hole. Same allowlist spirit: formatting + images, no scripts/
 * event handlers/forms.
 */
export const sanitizeEmailHtml = (html) => {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'div', 'span', 'p', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'a', 'img', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'width', 'height', 'style', 'align', 'dir', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  })
}
