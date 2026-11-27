/** Hands a text file to the browser's download flow. */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  // The BOM makes Excel read UTF-8 (₹, names) correctly.
  const blob = new Blob(['\uFEFF', text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
