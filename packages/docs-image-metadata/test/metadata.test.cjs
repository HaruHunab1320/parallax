'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile, truncate } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const sharp = require('sharp');
const { imageSizeFromFile } = require('../from-file.cjs');

async function withFile(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'parallax-image-metadata-'));
  try { await fn(join(dir, 'image')); } finally { await rm(dir, { recursive: true, force: true }); }
}
for (const format of ['png', 'jpeg', 'webp', 'gif', 'avif', 'tiff']) {
  test(`reads ${format} dimensions without changing the image`, () => withFile(async path => {
    const data = await sharp({ create: { width: 23, height: 17, channels: 3, background: 'red' } })
      .toFormat(format).toBuffer();
    await writeFile(path, data);
    const size = await imageSizeFromFile(path);
    assert.equal(size.width, 23);
    assert.equal(size.height, 17);
  }));
}
test('reads SVG viewBox dimensions', () => withFile(async path => {
  await writeFile(path, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 31 19"><rect width="31" height="19"/></svg>');
  assert.deepEqual(await imageSizeFromFile(path), { width: 31, height: 19, type: 'svg' });
}));
for (const [name, data] of Object.entries({
  'zero-length ICNS entry': Buffer.from('69636e73000000106963303800000000', 'hex'),
  'zero-length JXL box': Buffer.from('0000000c4a584c200d0a870a0000000066747970', 'hex'),
  'truncated HEIF box': Buffer.from('0000001866747970686569630000000068656963', 'hex'),
  'unrecognized data': Buffer.from('not an image'),
})) {
  test(`rejects ${name} promptly`, { timeout: 3000 }, () => withFile(async path => {
    await writeFile(path, data);
    await assert.rejects(imageSizeFromFile(path));
  }));
}
test('rejects oversized files before parsing', () => withFile(async path => {
  await writeFile(path, 'x');
  await truncate(path, 33 * 1024 * 1024);
  await assert.rejects(imageSizeFromFile(path), /32 MiB/);
}));
test('rejects excessive dimensions', () => withFile(async path => {
  await writeFile(path, '<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>');
  await assert.rejects(imageSizeFromFile(path));
}));
test('rejects empty files', () => withFile(async path => {
  await writeFile(path, '');
  await assert.rejects(imageSizeFromFile(path), /nonempty/);
}));
