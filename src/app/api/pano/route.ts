import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hostedPanoUrl } from "@/lib/pano";
import { TRIM, clampWidth, normalizePano } from "@/lib/server/pano-image";

/**
 * Same JPEG normalisation as /api/pano/<file>, for a hosted panorama URL.
 * Only direct images on i.yourimageshare.com are fetched.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_DIR = path.join(process.cwd(), ".cache", "panos");
const MAX_BYTES = 40 * 1024 * 1024;

const inflight = new Map<string, Promise<Buffer>>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const src = hostedPanoUrl(url.searchParams.get("src") || "");
  if (!src) return new Response("Bad request", { status: 400 });

  const width = clampWidth(Number(url.searchParams.get("w")));
  const key = createHash("sha1").update(`${src}|${width}|${TRIM}`).digest("hex");
  const etag = `"${key}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  try {
    let job = inflight.get(key);
    if (!job) {
      job = getOrBuild(src, key, width).finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    const body = await job;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=3600, must-revalidate",
        ETag: etag,
      },
    });
  } catch (err) {
    console.error(`[pano] failed to fetch ${src}`, err);
    return new Response("Could not process image", { status: 502 });
  }
}

async function getOrBuild(src: string, key: string, width: number): Promise<Buffer> {
  const cacheFile = path.join(CACHE_DIR, `${key}.jpg`);
  try {
    return await fs.readFile(cacheFile);
  } catch {
    // not cached yet
  }

  const buf = await normalizePano(await fetchImage(src), width);

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, buf);
  } catch {
    // read-only filesystem – serve without disk cache
  }
  return buf;
}

async function fetchImage(src: string): Promise<Buffer> {
  const res = await fetch(src, {
    redirect: "error",
    headers: { Accept: "image/*" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error(`not an image (${type})`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("image too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("image too large");
  return buf;
}
