import type { Track } from '@/types/electron';

/** MP4 files are video entries, not songs. */
export function isVideoTrack(track: Pick<Track, 'path' | 'ext'> | null | undefined): boolean {
  if (!track) return false;
  const ext = (track.ext || '').toLowerCase().replace(/^\./, '');
  return ext === 'mp4' || track.path.toLowerCase().endsWith('.mp4');
}
