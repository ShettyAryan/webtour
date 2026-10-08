import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { MEDIA_DIR, resolveInside } from "@/lib/server/storage";

/** Serves uploaded floor plans, videos and brochures from data/media, with Range support for video seeking. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
};

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const abs = resolveInside(MEDIA_DIR, file);
  const type = abs && TYPES[path.extname(abs).toLowerCase()];
  if (!abs || !type) return new Response("Not found", { status: 404 });

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600, must-revalidate",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
  // Uploaded SVGs can't run scripts when opened directly.
  if (type === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";

  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(stat.size - 1, end);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    return new Response(stream(abs, start, end), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) },
    });
  }

  return new Response(stream(abs, 0, stat.size - 1), {
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}

function stream(file: string, start: number, end: number) {
  return Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
}
