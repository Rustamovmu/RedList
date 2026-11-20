import { createHash } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';

/**
 * Upload processing (PLAN §3 "Images", §9 "Uploads"):
 * 1. size limit, then a magic-byte check: JPEG, PNG or WebP only (never SVG, HTML or anything else);
 * 2. the decoder must agree with the sniffed type, and the pixel count is capped (decompression bombs);
 * 3. the image is auto-rotated and re-encoded to WebP at fixed widths. Re-encoding drops EXIF, XMP, IPTC
 *    and any GPS position, because sharp writes no metadata unless asked to. The original is not kept.
 */

export const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920] as const;
export const MIN_WIDTH = 200;
export const MAX_INPUT_PIXELS = 40_000_000;
export const PIPELINE_MODIFICATION = 'Resized and re-encoded as WebP; embedded metadata removed.';

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp';

export class ImageRejected extends Error {
  constructor(
    readonly code: 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'UNREADABLE' | 'TOO_SMALL' | 'TOO_MANY_PIXELS',
    message: string,
  ) {
    super(message);
  }
}

/** Identifies the file from its first bytes. The file name and declared content type are ignored. */
export function sniffImage(buf: Buffer): SniffedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const SHARP_FORMAT: Record<SniffedType, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

export interface ProcessedImage {
  sha256: string;
  width: number;
  height: number;
  /** Width → WebP bytes, ascending. */
  variants: Array<{ width: number; height: number; bytes: Buffer }>;
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function processImage(input: Buffer, maxBytes: number): Promise<ProcessedImage> {
  if (input.length > maxBytes) throw new ImageRejected('TOO_LARGE', `The file is larger than ${Math.round(maxBytes / 1_000_000)} MB`);
  const type = sniffImage(input);
  if (!type) throw new ImageRejected('UNSUPPORTED_TYPE', 'Only JPEG, PNG and WebP images are accepted');

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata();
  } catch (e) {
    if (e instanceof Error && /pixel limit/i.test(e.message)) throw new ImageRejected('TOO_MANY_PIXELS', 'The image has too many pixels');
    throw new ImageRejected('UNREADABLE', 'The image could not be decoded');
  }
  if (meta.format !== SHARP_FORMAT[type]) throw new ImageRejected('UNSUPPORTED_TYPE', 'The file content does not match an accepted image type');
  if (!meta.width || !meta.height) throw new ImageRejected('UNREADABLE', 'The image has no dimensions');
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new ImageRejected('TOO_MANY_PIXELS', 'The image has too many pixels');

  // EXIF orientations 5–8 swap width and height.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  if (width < MIN_WIDTH) throw new ImageRejected('TOO_SMALL', `The image must be at least ${MIN_WIDTH} pixels wide`);

  // The standard widths below the image's own width, plus the image's own width (capped at the largest
  // standard width), so no resolution is lost and nothing is ever enlarged.
  const top = Math.min(width, VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]);
  const widths: number[] = [...VARIANT_WIDTHS.filter((w) => w < top), top];

  const variants: ProcessedImage['variants'] = [];
  try {
    for (const w of widths) {
      const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      variants.push({ width: info.width, height: info.height, bytes: data });
    }
  } catch {
    throw new ImageRejected('UNREADABLE', 'The image could not be re-encoded');
  }
  return { sha256: sha256Hex(input), width, height, variants };
}

/** The variant to serve for a requested width: the smallest one at least as wide, otherwise the largest. */
export function pickVariant(available: number[], requested: number): number | null {
  if (!available.length) return null;
  const sorted = [...available].sort((a, b) => a - b);
  return sorted.find((w) => w >= requested) ?? sorted[sorted.length - 1];
}
