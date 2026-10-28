const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../dist/main/db.js');
const Database = require('better-sqlite3');

const root = path.join(os.tmpdir(), `audit-db-smoke-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });

function track(file, title) {
  return {
    path: file,
    filename: path.basename(file),
    size: 1,
    mtime: Date.now(),
    ext: 'mp3',
    title,
    artist: 'Artist',
    album: 'Album',
    genre: 'Rock',
    duration: 10,
    has_art: false,
    lrc: false,
    genre_guess: 'Rock',
    genre_confidence: 0.95,
    genre_source: 'tag',
    genre_rule: 'tag:Rock',
  };
}

try {
  const a = path.join(root, 'a.mp3');
  const b = path.join(root, 'b.mp3');
  fs.writeFileSync(a, 'a');
  fs.writeFileSync(b, 'b');

  db.initDb(path.join(root, 'fresh.db'));
  db.upsertTracks([track(a, 'A'), track(b, 'B')]);
  assert.equal(db.queryTracks({}).total, 2);
  db.recordDownload(a, 'https://youtu.be/x');
  assert.ok(db.getDownloadedAt(a));
  assert.equal(db.queryTracks({ sort: 'downloaded' }).items[0].path, a);
  assert.equal(db.queryTracks({ downloadedOnly: true }).total, 1);
  db.applyLibraryScan({ version: 1, roots: [root], tracks: [track(a, 'A')] });
  assert.equal(db.queryTracks({}).total, 1);
  assert.equal(db.queryTracks({ filter: '***' }).total, 0);
  db.closeDb();

  const legacyFile = path.join(root, 'legacy.db');
  const legacy = new Database(legacyFile);
  legacy.exec(`
    CREATE TABLE tracks (
      path TEXT PRIMARY KEY, filename TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0,
      mtime INTEGER NOT NULL DEFAULT 0, ext TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '', album TEXT NOT NULL DEFAULT '', genre TEXT NOT NULL DEFAULT '',
      duration REAL NOT NULL DEFAULT 0, has_art INTEGER NOT NULL DEFAULT 0, lrc INTEGER NOT NULL DEFAULT 0,
      genre_guess TEXT NOT NULL DEFAULT '', genre_confidence REAL NOT NULL DEFAULT 0,
      genre_source TEXT NOT NULL DEFAULT '', genre_rule TEXT NOT NULL DEFAULT '',
      added_at INTEGER, downloaded_at INTEGER
    );
    CREATE TABLE roots (path TEXT PRIMARY KEY);
    CREATE TABLE downloads (path TEXT PRIMARY KEY, downloaded_at INTEGER NOT NULL, source_url TEXT);
    CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE playlist_tracks (playlist_id TEXT NOT NULL, path TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (playlist_id, path));
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE VIRTUAL TABLE tracks_fts USING fts5(path UNINDEXED, title, artist, album, genre);
    CREATE TRIGGER tracks_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, path, title, artist, album, genre)
      VALUES (new.rowid, new.path, new.title, new.artist, new.album, new.genre);
    END;
    CREATE TRIGGER tracks_ad AFTER DELETE ON tracks BEGIN
      DELETE FROM tracks_fts WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER tracks_au AFTER UPDATE ON tracks BEGIN
      DELETE FROM tracks_fts WHERE rowid = old.rowid;
      INSERT INTO tracks_fts(rowid, path, title, artist, album, genre)
      VALUES (new.rowid, new.path, new.title, new.artist, new.album, new.genre);
    END;
    PRAGMA user_version = 1;
    INSERT INTO tracks(path, filename, title) VALUES ('C:/Music/Old.mp3', 'Old.mp3', 'Old');
  `);
  legacy.close();

  db.initDb(legacyFile);
  assert.equal(db.queryTracks({}).total, 1);
  assert.ok(fs.existsSync(`${legacyFile}.v1.bak`));
  db.closeDb();

  console.log('db smoke ok');
} finally {
  try { db.closeDb(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
