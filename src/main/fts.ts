/**
 * Build a safe FTS5 prefix query from free text.
 *
 * FTS5 treats punctuation and operators specially. We keep only letters and
 * numbers, quote every token, and cap the number of terms. A text with no
 * usable tokens returns null so callers can skip MATCH entirely.
 */
export function buildFtsQuery(text: string): string | null {
  const tokens = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 8)
    .filter((token, index, all) => all.indexOf(token) === index);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(' ');
}

export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
