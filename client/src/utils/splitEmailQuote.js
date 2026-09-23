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
