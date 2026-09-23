import DOMPurify from 'dompurify'

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'href' && /^data:/i.test(data.attrValue)) {
    data.keepAttr = false
  }
})

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
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  })
}
