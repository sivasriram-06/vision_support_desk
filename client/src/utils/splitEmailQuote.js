/**
 * Splits a sanitized email HTML body into { main, quoted }: the actual
 * reply text, and the quoted "On ... wrote: <original message>" trailer
 * most mail clients (Gmail included) append to every reply. The raw HTML
 * always contains the full quote - Gmail's own "..." collapse is a
 * client-side rendering choice, not part of the stored message - so we
 * replicate the same behavior here instead of dumping the whole quoted
 * thread inline every time (which is redundant: we already show the
 * original message as its own card above).
 *
 * Detection relies on the universal <blockquote> element (every major
 * client wraps quoted content in one), not on class names - our sanitizer
 * strips `class` attributes, so a Gmail-specific selector wouldn't survive.
 */
export const splitEmailQuote = (html) => {
  if (!html) return { main: html, quoted: null }

  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return { main: html, quoted: null }
  }

  const blockquote = doc.body.querySelector('blockquote')
  if (!blockquote) return { main: html, quoted: null }

  const parts = []
  const attribution = blockquote.previousElementSibling
  if (attribution && /wrote:\s*$/i.test(attribution.textContent.trim())) {
    parts.push(attribution.outerHTML)
    attribution.remove()
  }
  parts.push(blockquote.outerHTML)
  blockquote.remove()

  const main = doc.body.innerHTML.trim()
  const quoted = parts.join('')

  // If stripping the quote left nothing (e.g. the whole message WAS just a
  // quote, no new text), don't hide the only content there is.
  if (!main) return { main: html, quoted: null }

  return { main, quoted }
}
