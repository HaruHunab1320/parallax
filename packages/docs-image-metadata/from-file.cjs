'use strict';

const { open } = require('node:fs/promises');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;

/**
 * Only the async API consumed by Docusaurus is provided. Metadata comes from
 * maintained libvips parsers; no image-size parser code is loaded or copied.
 */
async function imageSizeFromFile(path) {
  const file = await open(path, 'r');
  let input;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_BYTES) {
      throw new Error('Documentation image must be a nonempty file no larger than 32 MiB');
    }
    // Read from the checked descriptor, with a hard cap even if the file grows.
    input = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < input.length) {
      const { bytesRead } = await file.read(input, offset, input.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    input = input.subarray(0, offset);
  } finally {
    await file.close();
  }
  const metadata = await sharp(input, {
    failOn: 'warning',
    limitInputPixels: MAX_IMAGE_PIXELS,
    pages: 1,
  }).metadata();
  if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
      || metadata.width < 1 || metadata.height < 1
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw new Error('Documentation image dimensions are invalid or exceed 64 megapixels');
  }
  return { width: metadata.width, height: metadata.height, type: metadata.format };
}

module.exports = { imageSizeFromFile };
