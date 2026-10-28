import { protocol } from 'electron';
import * as fs from 'fs';
import path from 'path';
import { isApprovedFile } from './approved-paths';

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.opus': 'audio/opus',
  '.ogg': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.aac': 'audio/aac',
};

/** Must run before app is ready (registers the privileged scheme). */
export function registerMediaProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'media',
      privileges: { secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

/**
 * Serves local audio files to the sandboxed renderer as
 * `media://audio?path=<url-encoded absolute path>`.
 * Only files with a known audio extension are served; paths are
 * normalized and directory traversal is rejected. Supports HTTP
 * Range requests so the <audio> element can seek.
 */
export function handleMediaProtocol(): void {
  protocol.handle('media', (req) => {
    try {
      const url = new URL(req.url);
      if (url.host !== 'audio') {
        return new Response('unknown media host', { status: 404 });
      }
      const raw = url.searchParams.get('path');
      if (!raw) return new Response('missing path', { status: 400 });

      const abs = path.normalize(raw);
      if (!path.isAbsolute(abs)) return new Response('bad path', { status: 400 });
      const ext = path.extname(abs).toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (!mime) return new Response('unsupported type', { status: 415 });
      if (!isApprovedFile(abs)) return new Response('forbidden', { status: 403 });

      const stat = fs.statSync(abs);
      if (!stat.isFile()) return new Response('not found', { status: 404 });
      const total = stat.size;

      const range = req.headers.get('range');
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : total - 1;
        const s = Math.max(0, Math.min(start, total - 1));
        const e = Math.max(s, Math.min(end, total - 1));
        const stream = fs.createReadStream(abs, { start: s, end: e });
        const body = new ReadableStream({
          start(controller) {
            stream.on('data', (chunk) => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', (err) => controller.error(err));
          },
          cancel() {
            stream.destroy();
          },
        });
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(e - s + 1),
            'Content-Range': `bytes ${s}-${e}/${total}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      const stream = fs.createReadStream(abs);
      const body = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk) => controller.enqueue(chunk));
          stream.on('end', () => controller.close());
          stream.on('error', (err) => controller.error(err));
        },
        cancel() {
          stream.destroy();
        },
      });
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch {
      return new Response('media error', { status: 500 });
    }
  });
}

/** Renderer-side helper: build a playable URL for an absolute audio path. */
export function mediaUrlFor(absPath: string): string {
  return `media://audio?path=${encodeURIComponent(absPath)}`;
}
