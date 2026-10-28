/**
 * Incremental newline-delimited JSON decoder.
 *
 * Sidecars write one JSON object per line. Chunks can split a line anywhere,
 * so callers must keep the trailing partial line until the next chunk.
 */
export class JsonLineDecoder {
  private buffer = '';

  constructor(private readonly maxLineLength = 1024 * 1024) {}

  push(chunk: string | Buffer): string[] {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  private drain(flush: boolean): string[] {
    const parts = this.buffer.split('\n');
    this.buffer = flush ? '' : parts.pop() ?? '';

    if (this.buffer.length > this.maxLineLength) {
      this.buffer = '';
      throw new Error('Sidecar JSON line exceeded the maximum length');
    }

    return parts
      .map((line) => line.replace(/\r$/, '').trim())
      .filter((line) => line.length > 0);
  }
}
