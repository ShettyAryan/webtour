import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import sharp from "sharp";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { MEDIA_DIR, PANO_DIR } from "@/lib/server/storage";
import { PANO_EXTENSIONS } from "@/lib/types";

/**
 * Raw-body upload (not multipart) so multi-hundred-MB TIFF renders stream
 * straight to disk instead of being buffered in memory.
 *   POST /api/admin/upload?kind=pano|floorplan|video|brochure&name=<original file name>
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = {
  pano: { dir: PANO_DIR, ext: PANO_EXTENSIONS, maxMB: 1024 },
  floorplan: { dir: MEDIA_DIR, ext: [".svg", ".png", ".jpg", ".jpeg", ".webp"], maxMB: 50 },
  video: { dir: MEDIA_DIR, ext: [".mp4", ".webm", ".mov"], maxMB: 2048 },
  brochure: { dir: MEDIA_DIR, ext: [".pdf"], maxMB: 200 },
} as const;

type Kind = keyof typeof KINDS;

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as Kind;
  const spec = KINDS[kind];
  if (!spec) return Response.json({ error: "Unknown upload type" }, { status: 400 });

  const original = url.searchParams.get("name") ?? "";
  const ext = path.extname(original).toLowerCase();
  if (!(spec.ext as readonly string[]).includes(ext)) {
    return Response.json({ error: `Unsupported file type. Use ${spec.ext.join(", ")}` }, { status: 415 });
  }
  if (!req.body) return Response.json({ error: "Empty upload" }, { status: 400 });

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > spec.maxMB * 1024 * 1024) {
    return Response.json({ error: `File is larger than ${spec.maxMB} MB` }, { status: 413 });
  }

  const base =
    path
      .basename(original, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || kind;
  const fileName = `${base}-${Date.now().toString(36)}${ext === ".jpeg" ? ".jpg" : ext}`;
  const dest = path.join(spec.dir, fileName);

  await fs.mkdir(spec.dir, { recursive: true });
  try {
    await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), createWriteStream(dest));
  } catch (err) {
    await fs.rm(dest, { force: true });
    console.error("[upload] failed", err);
    return Response.json({ error: "Upload interrupted" }, { status: 500 });
  }

  // Images: make sure the file actually decodes, and report its size.
  if (kind === "pano" || kind === "floorplan") {
    try {
      const meta = await sharp(dest, { limitInputPixels: false, page: 0 }).metadata();
      const width = meta.autoOrient?.width ?? meta.width ?? 0;
      const height = meta.autoOrient?.height ?? meta.height ?? 0;
      if (!width || !height) throw new Error("no dimensions");
      const ratio = width / height;
      const warning =
        kind === "pano" && Math.abs(ratio - 2) > 0.05
          ? `This image is ${width}×${height} (ratio ${ratio.toFixed(2)}:1). 360 renders should be 2:1 – it will be stretched to fit.`
          : undefined;
      return Response.json({ file: fileName, width, height, warning });
    } catch {
      await fs.rm(dest, { force: true });
      return Response.json({ error: "That file could not be read as an image." }, { status: 422 });
    }
  }

  return Response.json({ file: fileName });
}
