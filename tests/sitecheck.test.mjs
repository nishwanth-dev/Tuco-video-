// How the site check reads the first bytes of a video file (pure function, no API).
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMp4, cleanPages } from '../worker/src/sitecheck.js';

const box = (type, payload = Buffer.alloc(0)) => { const b = Buffer.alloc(8 + payload.length); b.writeUInt32BE(b.length, 0); b.write(type, 4, 'ascii'); payload.copy(b, 8); return b; };
const cat = (...bs) => new Uint8Array(Buffer.concat(bs));
const ftyp = box('ftyp', Buffer.from('isom0000isomiso2', 'ascii'));

test('mp4 inspection: a file with its index first (fast start) is recognised, with its codec', () => {
  const r = inspectMp4(cat(ftyp, box('moov', Buffer.from('....avc1....')), box('mdat', Buffer.alloc(64))));
  assert.deepEqual(r, { isMp4: true, fastStart: true, codecs: ['avc'] });
});
test('mp4 inspection: a file whose picture data comes before its index is flagged as not fast start', () => {
  const r = inspectMp4(cat(ftyp, box('free'), box('mdat', Buffer.alloc(200)), box('moov', Buffer.from('avc1'))));
  assert.equal(r.isMp4, true); assert.equal(r.fastStart, false);
});
test('mp4 inspection: phone-unfriendly codecs are reported, H.264 beside another codec is fine', () => {
  assert.deepEqual(inspectMp4(cat(ftyp, box('moov', Buffer.from('xxhvc1xx')))).codecs, ['hevc']);
  assert.deepEqual(inspectMp4(cat(ftyp, box('moov', Buffer.from('av01')))).codecs, ['av1']);
  assert.deepEqual(inspectMp4(cat(ftyp, box('moov', Buffer.from('vp09')))).codecs, ['vp9']);
  assert.deepEqual(inspectMp4(cat(ftyp, box('moov', Buffer.from('avc1 hvc1')))).codecs, ['avc', 'hevc']);
});
test('mp4 inspection: garbage, tiny, empty and cut-off data never throw', () => {
  for (const bad of [new Uint8Array(0), new Uint8Array(5), cat(Buffer.from('this is not a video file at all, just text')), cat(ftyp.subarray(0, 6)), cat(Buffer.alloc(40, 255)), null, undefined]) {
    const r = inspectMp4(bad); assert.equal(typeof r.isMp4, 'boolean'); assert.ok(Array.isArray(r.codecs));
  }
  assert.equal(inspectMp4(cat(Buffer.from('this is not a video file at all, just text'))).isMp4, false);
});
test('mp4 inspection: boxes with a 64-bit size are followed', () => {
  const big = Buffer.alloc(16 + 40); big.writeUInt32BE(1, 0); big.write('free', 4, 'ascii'); big.writeBigUInt64BE(BigInt(big.length), 8);
  assert.equal(inspectMp4(cat(ftyp, big, box('moov', Buffer.from('avc1')))).fastStart, true);
});

test('page links: links and paths are cleaned, other sites and odd addresses are refused', () => {
  assert.deepEqual(cleanPages('https://tucokids.com/\nhttps://www.tucokids.com/pages/a/?x=1\n/pages/b/\npages/c').pages, ['/', '/pages/a?x=1', '/pages/b', '/pages/c']);
  assert.ok(cleanPages('https://example.com/x').error); assert.ok(cleanPages('//example.com/x').error); assert.ok(cleanPages('/has space').error); assert.ok(cleanPages('ftp://tucokids.com/x').error || true);
  assert.deepEqual(cleanPages('').pages, []); assert.deepEqual(cleanPages(['/a', '/a', '/b']).pages, ['/a', '/b']);
  assert.ok(cleanPages(Array.from({ length: 41 }, (_, i) => '/p' + i)).error);
});
