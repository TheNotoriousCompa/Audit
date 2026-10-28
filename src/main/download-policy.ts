const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'music.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

/**
 * Downloads are limited to YouTube queries and yt-dlp search queries.
 * Values starting with "-" must never reach argparse as an option.
 */
export function isAllowedDownloadQuery(raw: string): boolean {
  const query = raw.trim();
  if (!query || query.startsWith('-')) return false;
  if (/^ytsearch\d*:/i.test(query)) return true;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(query)
    ? query
    : `https://${query}`;

  try {
    const url = new URL(candidate);
    return YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
