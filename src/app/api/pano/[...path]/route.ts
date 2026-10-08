import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PANO_DIR } from "@/lib/server/storage";
import { TRIM, clampWidth, normalizePano } from "@/lib/server/pano-image";

/**
 * Serves any panorama in data/panos as a browser-safe equirectangular JPEG.
 * Results are cached on disk in .cache/panos, keyed by file mtime + size.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_DIR = path.join(process.cwd(), ".cache", "panos");
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);

const inflight = new Map<string, Promise<Buffer>>();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const abs = path.resolve(PANO_DIR, ...parts);

  if (!abs.startsWith(PANO_DIR + path.sep) || !ALLOWED_EXT.has(path.extname(abs).toLowerCase())) {
    return new Response("Bad request", { status: 400 });
  }

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const width = clampWidth(Number(new URL(req.url).searchParams.get("w")));

  const key = createHash("sha1")
    .update(`${abs}|${stat.mtimeMs}|${stat.size}|${width}|${TRIM}`)
    .digest("hex");
  const etag = `"${key}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  try {
    let job = inflight.get(key);
    if (!job) {
      job = getOrBuild(abs, key, width).finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    const body = await job;

    return jpeg(body, etag);
  } catch (err) {
    console.error(`[pano] failed to process ${abs}`, err);
    return new Response("Could not process image", { status: 500 });
  }
}

async function getOrBuild(abs: string, key: string, width: number): Promise<Buffer> {
  const cacheFile = path.join(CACHE_DIR, `${key}.jpg`);
  try {
    return await fs.readFile(cacheFile);
  } catch {
    // not cached yet
  }

  const buf = await normalizePano(abs, width);

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, buf);
  } catch {
    // read-only filesystem (e.g. serverless) – serve without disk cache
  }
  return buf;
}

function jpeg(body: Buffer, etag: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=3600, must-revalidate",
      ETag: etag,
    },
  });
}
