import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { logToFile } from './logger';
import { buildFtsQuery, escapeLike } from './fts';
import { isPathInside, normalizePathKey } from './path-policy';
import type { LibraryCache, Track } from '../types/electron';

/**
 * Local SQLite store: single source of truth for the library, download history
 * and (later) playlists. better-sqlite3 11.x is built for Electron's ABI via
 * electron-rebuild, so the same package works on Windows and macOS.
 */

const SCHEMA_VERSION = 2;
const MISSING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Shared with the renderer through electron.d.ts.
import type { LibraryQuery, LibraryQueryResult, LibrarySort, LibraryStats } from '../types/electron';
export type { LibraryQuery, LibraryQueryResult, LibrarySort, LibraryStats };

let db: Database.Database | null = null;

function getDbPath(): string {
  try {
    return path.join(app.getPath('userData'), 'audit.db');
  } catch {
    return path.join(process.cwd(), 'audit.db');
  }
}

function ensure(): Database.Database {
  if (!db) initDb();
  return db as Database.Database;
}

function backupBeforeMigration(file: string, version: number): void {
  const destination = `${file}.v${version}.bak`;
  if (fs.existsSync(destination)) return;
  try {
    fs.copyFileSync(file, destination);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, destination + suffix);
    }
    logToFile(`[DB] backup created: ${destination}`);
  } catch (err) {
    logToFile(`[DB] backup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function initDb(filePath?: string): void {
  if (db) return;
  const file = filePath ?? getDbPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {
    // best effort
  }
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  const version = Number(db.pragma('user_version', { simple: true }) || 0);
  if (version > 0 && version < SCHEMA_VERSION && file !== ':memory:') {
    backupBeforeMigration(file, version);
  }
  migrate(db);
  logToFile(`[DB] ready: ${file} (schema v${SCHEMA_VERSION})`);
}

export function closeDb(): void {
  if (!db) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Checkpoint is best effort.
  }
  try {
    db.close();
  } catch {
    // The process may already be exiting.
  }
  db = null;
}

function migrate(database: Database.Database): void {
  const version = Number(database.pragma('user_version', { simple: true }) || 0);
  if (version >= SCHEMA_VERSION) return;

  const run = database.transaction(() => {
    if (version < 1) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS tracks (
          path TEXT PRIMARY KEY,
          filename TEXT NOT NULL DEFAULT '',
          size INTEGER NOT NULL DEFAULT 0,
          mtime INTEGER NOT NULL DEFAULT 0,
          ext TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          artist TEXT NOT NULL DEFAULT '',
          album TEXT NOT NULL DEFAULT '',
          genre TEXT NOT NULL DEFAULT '',
          duration REAL NOT NULL DEFAULT 0,
          has_art INTEGER NOT NULL DEFAULT 0,
          lrc INTEGER NOT NULL DEFAULT 0,
          genre_guess TEXT NOT NULL DEFAULT '',
          genre_confidence REAL NOT NULL DEFAULT 0,
          genre_source TEXT NOT NULL DEFAULT '',
          genre_rule TEXT NOT NULL DEFAULT '',
          added_at INTEGER,
          downloaded_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_tracks_downloaded ON tracks(downloaded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tracks_added ON tracks(added_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre_guess);

        CREATE TABLE IF NOT EXISTS roots (path TEXT PRIMARY KEY);

        CREATE TABLE IF NOT EXISTS downloads (
          path TEXT PRIMARY KEY,
          downloaded_at INTEGER NOT NULL,
          source_url TEXT
        );

        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
          playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, path)
        );

        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
          path UNINDEXED,
          title,
          artist,
          album,
          genre
        );

        CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
          INSERT INTO tracks_fts(rowid, path, title, artist, album, genre)
          VALUES (new.rowid, new.path, new.title, new.artist, new.album,
                  CASE WHEN new.genre_guess <> '' THEN new.genre_guess ELSE new.genre END);
        END;
        CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
          DELETE FROM tracks_fts WHERE rowid = old.rowid;
        END;
        CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
          DELETE FROM tracks_fts WHERE rowid = old.rowid;
          INSERT INTO tracks_fts(rowid, path, title, artist, album, genre)
          VALUES (new.rowid, new.path, new.title, new.artist, new.album,
                  CASE WHEN new.genre_guess <> '' THEN new.genre_guess ELSE new.genre END);
        END;
      `);
    }

    if (version < 2) {
      database.exec(`
        ALTER TABLE tracks ADD COLUMN path_key TEXT;
        ALTER TABLE tracks ADD COLUMN missing_since INTEGER;
        ALTER TABLE downloads ADD COLUMN path_key TEXT;
      `);

      const updateTracks = database.prepare('UPDATE tracks SET path_key = ? WHERE path = ?');
      for (const row of database.prepare('SELECT path FROM tracks').all() as { path: string }[]) {
        updateTracks.run(normalizePathKey(row.path), row.path);
      }
      const updateDownloads = database.prepare('UPDATE downloads SET path_key = ? WHERE path = ?');
      for (const row of database.prepare('SELECT path FROM downloads').all() as { path: string }[]) {
        updateDownloads.run(normalizePathKey(row.path), row.path);
      }

      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_tracks_path_key ON tracks(path_key);
        CREATE INDEX IF NOT EXISTS idx_tracks_missing ON tracks(missing_since);
        CREATE INDEX IF NOT EXISTS idx_tracks_effective_sort
          ON tracks(COALESCE(downloaded_at, mtime) DESC);
        CREATE INDEX IF NOT EXISTS idx_downloads_path_key ON downloads(path_key);
        DROP TRIGGER IF EXISTS tracks_au;
        CREATE TRIGGER tracks_au AFTER UPDATE OF title, artist, album, genre, genre_guess ON tracks BEGIN
          DELETE FROM tracks_fts WHERE rowid = old.rowid;
          INSERT INTO tracks_fts(rowid, path, title, artist, album, genre)
          VALUES (new.rowid, new.path, new.title, new.artist, new.album,
                  CASE WHEN new.genre_guess <> '' THEN new.genre_guess ELSE new.genre END);
        END;
      `);
    }

    database.pragma(`user_version = ${SCHEMA_VERSION}`);
  });

  run();
}

function rowToTrack(row: Record<string, unknown>): Track {
  return {
    path: String(row.path),
    filename: String(row.filename || ''),
    size: Number(row.size || 0),
    mtime: Number(row.mtime || 0),
    ext: String(row.ext || ''),
    title: String(row.title || ''),
    artist: String(row.artist || ''),
    album: String(row.album || ''),
    genre: String(row.genre || ''),
    duration: Number(row.duration || 0),
    has_art: Boolean(row.has_art),
    lrc: Boolean(row.lrc),
    genre_guess: String(row.genre_guess || ''),
    genre_confidence: Number(row.genre_confidence || 0),
    genre_source: (row.genre_source as Track['genre_source']) || '',
    genre_rule: String(row.genre_rule || ''),
    ...(row.added_at != null ? { added_at: Number(row.added_at) } : {}),
    ...(row.downloaded_at != null ? { downloaded_at: Number(row.downloaded_at) } : {}),
  } as Track;
}

const UPSERT_TRACK = `
  INSERT INTO tracks (
    path, path_key, filename, size, mtime, ext, title, artist, album, genre, duration,
    has_art, lrc, genre_guess, genre_confidence, genre_source, genre_rule,
    added_at, downloaded_at
  ) VALUES (
    @path, @path_key, @filename, @size, @mtime, @ext, @title, @artist, @album, @genre, @duration,
    @has_art, @lrc, @genre_guess, @genre_confidence, @genre_source, @genre_rule,
    @added_at, @downloaded_at
  )
  ON CONFLICT(path) DO UPDATE SET
    path_key = excluded.path_key,
    filename = excluded.filename,
    size = excluded.size,
    mtime = excluded.mtime,
    ext = excluded.ext,
    title = excluded.title,
    artist = excluded.artist,
    album = excluded.album,
    genre = excluded.genre,
    duration = excluded.duration,
    has_art = excluded.has_art,
    lrc = excluded.lrc,
    genre_guess = excluded.genre_guess,
    genre_confidence = excluded.genre_confidence,
    genre_source = excluded.genre_source,
    genre_rule = excluded.genre_rule,
    missing_since = NULL,
    added_at = COALESCE(tracks.added_at, excluded.added_at),
    downloaded_at = COALESCE(excluded.downloaded_at, tracks.downloaded_at)
`;

export function upsertTracks(tracks: Track[]): void {
  if (tracks.length === 0) return;
  const database = ensure();
  const stmt = database.prepare(UPSERT_TRACK);
  const insertMany = database.transaction((items: Track[]) => {
    for (const t of items) {
      stmt.run({
        path: t.path,
        path_key: normalizePathKey(t.path),
        filename: t.filename || '',
        size: t.size || 0,
        mtime: t.mtime || 0,
        ext: t.ext || '',
        title: t.title || '',
        artist: t.artist || '',
        album: t.album || '',
        genre: t.genre || '',
        duration: t.duration || 0,
        has_art: t.has_art ? 1 : 0,
        lrc: t.lrc ? 1 : 0,
        genre_guess: t.genre_guess || '',
        genre_confidence: t.genre_confidence ?? 0,
        genre_source: t.genre_source || '',
        genre_rule: t.genre_rule || '',
        added_at: t.added_at ?? null,
        downloaded_at: t.downloaded_at ?? null,
      });
    }
  });
  insertMany(tracks);
}

export function listTracks(): Track[] {
  const rows = ensure().prepare(
    'SELECT * FROM tracks WHERE missing_since IS NULL ORDER BY title COLLATE NOCASE'
  ).all() as Record<string, unknown>[];
  return rows.map(rowToTrack);
}

export function listAllTracks(): Track[] {
  const rows = ensure().prepare('SELECT * FROM tracks ORDER BY title COLLATE NOCASE').all() as Record<string, unknown>[];
  return rows.map(rowToTrack);
}

export function countTracks(): number {
  const row = ensure().prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n?: number } | undefined;
  return Number(row?.n || 0);
}

export function replaceRoots(roots: string[]): void {
  const database = ensure();
  const tx = database.transaction((items: string[]) => {
    database.prepare('DELETE FROM roots').run();
    const stmt = database.prepare('INSERT OR REPLACE INTO roots(path) VALUES (?)');
    for (const root of items) stmt.run(root);
  });
  tx(roots);
}

export function getRoots(): string[] {
  const rows = ensure().prepare('SELECT path FROM roots ORDER BY path').all() as { path: string }[];
  return rows.map((r) => r.path);
}

export function setMeta(key: string, value: string): void {
  ensure().prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getMeta(key: string): string | null {
  const row = ensure().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function recordDownload(filePath: string, sourceUrl?: string): void {
  const database = ensure();
  const now = Date.now();
  const key = normalizePathKey(filePath);
  const tx = database.transaction(() => {
    database.prepare(
      'INSERT INTO downloads(path, path_key, downloaded_at, source_url) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(path) DO UPDATE SET path_key = excluded.path_key, downloaded_at = excluded.downloaded_at, source_url = COALESCE(excluded.source_url, downloads.source_url)'
    ).run(filePath, key, now, sourceUrl ?? null);
    database.prepare('UPDATE tracks SET downloaded_at = ? WHERE path_key = ?').run(now, key);
  });
  tx();
}

export function getDownloadedAt(filePath: string): number | null {
  const row = ensure().prepare('SELECT downloaded_at FROM downloads WHERE path_key = ?').get(normalizePathKey(filePath)) as { downloaded_at: number } | undefined;
  return row ? Number(row.downloaded_at) : null;
}

const ORDER_BY: Record<LibrarySort, string> = {
  downloaded: 'COALESCE(t.downloaded_at, t.mtime) DESC, t.title COLLATE NOCASE ASC',
  added: 'COALESCE(t.added_at, t.mtime) DESC, t.title COLLATE NOCASE ASC',
  title: 't.title COLLATE NOCASE ASC',
  artist: "CASE WHEN t.artist = '' THEN 1 ELSE 0 END, t.artist COLLATE NOCASE ASC, t.title COLLATE NOCASE ASC",
  album: "CASE WHEN t.album = '' THEN 1 ELSE 0 END, t.album COLLATE NOCASE ASC, t.title COLLATE NOCASE ASC",
  duration: 't.duration DESC',
};

function likeClause(): string {
  return `(t.title LIKE @like ESCAPE '\\' OR t.artist LIKE @like ESCAPE '\\' OR t.album LIKE @like ESCAPE '\\' OR t.genre LIKE @like ESCAPE '\\' OR t.genre_guess LIKE @like ESCAPE '\\' OR t.filename LIKE @like ESCAPE '\\')`;
}

export function queryTracks(options: LibraryQuery = {}): LibraryQueryResult {
  const database = ensure();
  const sort: LibrarySort = options.sort && ORDER_BY[options.sort] ? options.sort : 'title';
  const limit = Math.max(1, Math.min(5000, options.limit ?? 200));
  const offset = Math.max(0, options.offset ?? 0);
  const filter = options.filter?.trim() ?? '';
  const fts = filter.length >= 2 ? buildFtsQuery(filter) : null;

  const base: string[] = ['t.missing_since IS NULL'];
  const baseParams: Record<string, unknown> = {};
  if (options.downloadedOnly) {
    base.push('t.downloaded_at IS NOT NULL');
  }
  if (options.genre) {
    base.push('(t.genre_guess = @genre OR t.genre = @genre)');
    baseParams.genre = options.genre;
  }

  const withFilter = [...base];
  const params = { ...baseParams };
  if (filter.length >= 2) {
    if (fts) {
      withFilter.push('t.path IN (SELECT path FROM tracks_fts WHERE tracks_fts MATCH @fts)');
      params.fts = fts;
    } else {
      withFilter.push(likeClause());
      params.like = `%${escapeLike(filter)}%`;
    }
  }

  const execute = (where: string[], queryParams: Record<string, unknown>): LibraryQueryResult => {
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = database
      .prepare(`SELECT COUNT(*) AS n FROM tracks t ${whereSql}`)
      .get(queryParams) as { n?: number } | undefined;
    const rows = database
      .prepare(
        `SELECT t.*
         FROM tracks t
         ${whereSql}
         ORDER BY ${ORDER_BY[sort]}
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...queryParams, limit, offset }) as Record<string, unknown>[];
    return { total: Number(totalRow?.n || 0), items: rows.map(rowToTrack) };
  };

  try {
    return execute(withFilter, params);
  } catch (err) {
    if (!fts) throw err;
    logToFile(`[DB] FTS query failed, falling back to LIKE: ${err instanceof Error ? err.message : String(err)}`);
    const fallback = [...base, likeClause()];
    return execute(fallback, { ...baseParams, like: `%${escapeLike(filter)}%` });
  }
}

// NOTE: LibraryStats is defined in ../types/electron (shared with the renderer)
// and re-exported at the top of this file.

export function libraryStats(): LibraryStats {
  const database = ensure();
  const one = (sql: string): number => {
    const row = database.prepare(sql).get() as { n?: number } | undefined;
    return Number(row?.n || 0);
  };
  const genres = database
    .prepare(
      `SELECT g AS genre, COUNT(*) AS n FROM (
         SELECT COALESCE(NULLIF(genre_guess, ''), genre) AS g
         FROM tracks WHERE missing_since IS NULL
       ) WHERE g <> '' GROUP BY g ORDER BY n DESC`
    )
    .all() as { genre: string; n: number }[];
  return {
    total: one('SELECT COUNT(*) AS n FROM tracks WHERE missing_since IS NULL'),
    withGenre: one("SELECT COUNT(*) AS n FROM tracks WHERE missing_since IS NULL AND genre_guess <> ''"),
    downloaded: one('SELECT COUNT(*) AS n FROM tracks WHERE missing_since IS NULL AND downloaded_at IS NOT NULL'),
    artists: one("SELECT COUNT(DISTINCT LOWER(artist)) AS n FROM tracks WHERE missing_since IS NULL AND artist <> ''"),
    albums: one("SELECT COUNT(DISTINCT LOWER(album)) AS n FROM tracks WHERE missing_since IS NULL AND album <> ''"),
    genres: genres.map((g) => ({ genre: g.genre, count: Number(g.n) })),
  };
}

/** One-time import from the legacy JSON cache. */
export function importLibraryCache(cache: LibraryCache): boolean {
  if (countTracks() > 0) return false;
  if (!Array.isArray(cache.tracks) || cache.tracks.length === 0) return false;
  upsertTracks(cache.tracks);
  if (Array.isArray(cache.roots)) replaceRoots(cache.roots);
  if (cache.scannedAt) setMeta('scannedAt', String(cache.scannedAt));
  logToFile(`[DB] imported ${cache.tracks.length} tracks from legacy cache`);
  return true;
}

/**
 * Apply one complete scan: upsert seen rows, hide missing files, delete rows
 * outside the current roots, and prune the journal. Missing rows are kept for
 * a grace period so unplugged drives do not wipe the library.
 */
export function applyLibraryScan(cache: LibraryCache): void {
  const database = ensure();
  const now = Date.now();
  const roots = cache.roots;
  const seen = new Set(cache.tracks.map((track) => normalizePathKey(track.path)));
  const underRoots = (filePath: string): boolean =>
    roots.some((root) => isPathInside(root, filePath));

  const tx = database.transaction(() => {
    upsertTracks(cache.tracks);
    replaceRoots(roots);

    if (roots.length > 0) {
      const rows = database.prepare(
        'SELECT path, path_key, missing_since FROM tracks'
      ).all() as { path: string; path_key: string | null; missing_since: number | null }[];
      const markMissing = database.prepare(
        'UPDATE tracks SET missing_since = ? WHERE path = ? AND missing_since IS NULL'
      );
      const remove = database.prepare('DELETE FROM tracks WHERE path = ?');

      for (const row of rows) {
        if (!underRoots(row.path)) {
          remove.run(row.path);
          continue;
        }
        const key = row.path_key || normalizePathKey(row.path);
        if (seen.has(key)) continue;
        if (row.missing_since == null) {
          markMissing.run(now, row.path);
        } else if (now - Number(row.missing_since) >= MISSING_RETENTION_MS) {
          remove.run(row.path);
        }
      }
    }

    database.prepare(
      'DELETE FROM downloads WHERE path_key IS NOT NULL AND path_key NOT IN (SELECT path_key FROM tracks)'
    ).run();
    setMeta('scannedAt', String(now));
  });

  tx();
}
