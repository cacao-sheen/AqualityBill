// Strips a leading "meter", "meter no.", "#" etc. so "Meter #56", "#56"
// and "56" all search for meter number 56. `explicit` is true when the user
// clearly typed a meter number ("#56", "Meter 56"), in which case callers
// should search meter numbers only.
export function extractMeterQuery(query: string) {
  const trimmed = query.trim()
  const match = trimmed.match(/^(?:meter(?![a-z])\s*(?:no\.?|number)?\s*)?#?\s*(\S+)$/i)
  if (!match) return null
  const explicit = /^(meter(?![a-z])|#)/i.test(trimmed)
  return { value: match[1].toLowerCase(), explicit }
}
