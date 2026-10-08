import "server-only";
import sharp, { type Sharp } from "sharp";

/**
 * Turns a panorama (file path or bytes) into a browser-safe equirectangular JPEG.
 *
 *  - Decodes formats browsers can't show (TIF/TIFF incl. 16-bit, CMYK, LZW/ZIP,
 *    multi-page – first page is used), plus JPG/PNG/WebP/AVIF.
 *  - Applies EXIF orientation, converts to 8-bit sRGB, flattens transparency.
 *  - Trims pure-black letterbox borders (set PANO_TRIM=0 to disable).
 *  - Forces an exact 2:1 aspect ratio so the image wraps the whole sphere.
 *  - Downsizes to the width the client asks for (its GPU texture limit).
 */

export const MIN_WIDTH = 256;
export const MAX_WIDTH = 16384;
export const DEFAULT_WIDTH = 8192;
export const TRIM = process.env.PANO_TRIM !== "0";

export function clampWidth(requested: number): number {
  const n = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(n / 2) * 2));
}

export async function normalizePano(input: string | Buffer, maxWidth: number): Promise<Buffer> {
  const open = () =>
    sharp(input, { limitInputPixels: false, failOn: "none", page: 0, sequentialRead: true }).rotate();

  const meta = await open().metadata();
  const srcW = meta.autoOrient?.width ?? meta.width;
  const srcH = meta.autoOrient?.height ?? meta.height;
  if (!srcW || !srcH) throw new Error("Unreadable image dimensions");

  const box = TRIM ? await findContentBox(open, srcW, srcH) : null;
  const contentW = box?.width ?? srcW;
  const outW = Math.max(MIN_WIDTH, Math.min(maxWidth, Math.round(contentW / 2) * 2));

  let img = open();
  if (box) img = img.extract(box);
  return img
    .flatten({ background: "#ffffff" })
    .resize(outW, outW / 2, { fit: "fill", kernel: "lanczos3" })
    .toColourspace("srgb")
    .jpeg({ quality: 88, progressive: true, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/**
 * Finds the region inside pure-black letterbox/pillarbox borders. Works on a
 * small 8-bit preview (fast, and immune to sharp's fixed trim/resize order),
 * then maps the box back to full resolution. Returns null when nothing to trim.
 */
async function findContentBox(open: () => Sharp, srcW: number, srcH: number) {
  try {
    const previewW = Math.min(1024, srcW);
    const previewH = Math.max(1, Math.round((srcH * previewW) / srcW));
    const { data, info } = await open()
      .resize(previewW, previewH, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });

    const trimmed = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .trim({ background: "#000000", threshold: 10 })
      .toBuffer({ resolveWithObject: true });

    const left = -(trimmed.info.trimOffsetLeft ?? 0);
    const top = -(trimmed.info.trimOffsetTop ?? 0);
    const right = left + trimmed.info.width;
    const bottom = top + trimmed.info.height;
    if (left <= 0 && top <= 0 && right >= info.width && bottom >= info.height) return null;

    const sx = srcW / info.width;
    const sy = srcH / info.height;
    const x0 = left > 0 ? Math.ceil((left + 1) * sx) : 0;
    const y0 = top > 0 ? Math.ceil((top + 1) * sy) : 0;
    const x1 = right < info.width ? Math.floor((right - 1) * sx) : srcW;
    const y1 = bottom < info.height ? Math.floor((bottom - 1) * sy) : srcH;
    if (x1 - x0 < 64 || y1 - y0 < 32) return null;

    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  } catch {
    return null;
  }
}
