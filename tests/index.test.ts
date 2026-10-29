import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  isAudioPath,
  isPathInside,
  isVideoPath,
  normalizePathKey,
} from '../src/main/path-policy';
import { JsonLineDecoder } from '../src/main/json-lines';
import { buildFtsQuery, escapeLike } from '../src/main/fts';
import { isAllowedDownloadQuery } from '../src/main/download-policy';

test('path policy: containment handles nested, sibling and case', () => {
  const root = path.resolve('C:\\Music');
  const nested = path.join(root, 'Artist', 'song.mp3');
  const sibling = path.resolve('C:\\Music2\\song.mp3');

  assert.equal(isPathInside(root, nested), true);
  assert.equal(isPathInside(root, root), true);
  assert.equal(isPathInside(root, sibling), false);

  if (process.platform === 'win32') {
    assert.equal(isPathInside(root, nested.toUpperCase()), true);
    assert.equal(normalizePathKey('C:\\Music\\Song.MP3'), 'c:\\music\\song.mp3');
  }
});

test('path policy: audio extension allowlist is case-insensitive', () => {
  assert.equal(isAudioPath('song.MP3'), true);
  assert.equal(isAudioPath('video.MP4'), true);
  assert.equal(isAudioPath('cover.JPG'), false);
  assert.equal(isAudioPath('no-extension'), false);
});

test('path policy: video detection is separate from audio', () => {
  assert.equal(isVideoPath('clip.MP4'), true);
  assert.equal(isVideoPath('clip.mp3'), false);
  assert.equal(isVideoPath('clip.m4a'), false);
});

test('json lines: partial chunks are reassembled and CRLF is stripped', () => {
  const decoder = new JsonLineDecoder();
  assert.deepEqual(decoder.push('{"type":"a"}\n{"ty'), ['{"type":"a"}']);
  assert.deepEqual(decoder.push('pe":"b"}\r\n'), ['{"type":"b"}']);
  assert.deepEqual(decoder.flush(), []);
});

test('json lines: flush returns a final unterminated line', () => {
  const decoder = new JsonLineDecoder();
  assert.deepEqual(decoder.push('{"type":"scan"'), []);
  assert.deepEqual(decoder.flush(), ['{"type":"scan"']);
});

test('json lines: oversized line is rejected', () => {
  const decoder = new JsonLineDecoder(8);
  decoder.push('12345678');
  assert.throws(() => decoder.push('9'), /maximum length/);
});

test('fts: punctuation and quotes cannot produce invalid MATCH input', () => {
  assert.equal(buildFtsQuery('   ***   '), null);
  assert.equal(buildFtsQuery('""'), null);
  assert.equal(buildFtsQuery('Pink Floyd'), '"pink"* "floyd"*');
  assert.equal(
    buildFtsQuery('a" OR b --c'),
    '"a"* "or"* "b"* "c"*'
  );
});

test('fts: LIKE escaping covers wildcard and escape characters', () => {
  assert.equal(escapeLike('100%_off\\'), '100\\%\\_off\\\\');
});

test('download policy: only YouTube and ytsearch queries are accepted', () => {
  assert.equal(isAllowedDownloadQuery('https://www.youtube.com/watch?v=abc'), true);
  assert.equal(isAllowedDownloadQuery('youtu.be/abc'), true);
  assert.equal(isAllowedDownloadQuery('ytsearch1:daft punk'), true);
  assert.equal(isAllowedDownloadQuery('--help'), false);
  assert.equal(isAllowedDownloadQuery('https://example.com/file.mp4'), false);
  assert.equal(isAllowedDownloadQuery('file:///C:/secret.mp3'), false);
});
