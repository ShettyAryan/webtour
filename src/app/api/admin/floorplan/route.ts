import path from "node:path";
import sharp from "sharp";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { MEDIA_DIR, resolveInside } from "@/lib/server/storage";

/**
 * Edits a floor plan image and saves the result as a NEW file (the original stays
 * until the tour is saved, so "Discard" still works).
 *   POST { file, op: "rotate", angle: 90 | -90 }
 *   POST { file, op: "crop", crop: { x, y, w, h } }   // fractions 0–1
 * SVG plans are rasterised at high resolution (~3000px) before editing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_SVG_WIDTH = 3000;

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await req.json().catch(() => null);
  const abs = body && typeof body.file === "string" ? resolveInside(MEDIA_DIR, body.file) : null;
  if (!abs) return Response.json({ error: "Unknown floor plan file" }, { status: 400 });

  try {
    const isSvg = path.extname(abs).toLowerCase() === ".svg";
    let density: number | undefined;
    if (isSvg) {
      const meta = await sharp(abs).metadata();
      density = Math.min(600, Math.max(72, (72 * TARGET_SVG_WIDTH) / (meta.width || 1000)));
    }
    // Flatten orientation / rasterise first so crop maths uses the image as displayed.
    const base = await sharp(abs, { density, limitInputPixels: false })
      .autoOrient()
      .png()
      .toBuffer({ resolveWithObject: true });

    let img = sharp(base.data);
    if (body.op === "rotate" && (body.angle === 90 || body.angle === -90)) {
      img = img.rotate(body.angle === 90 ? 90 : 270);
    } else if (body.op === "crop" && body.crop) {
      const W = base.info.width;
      const H = base.info.height;
      const c = body.crop;
      const left = Math.max(0, Math.round(Number(c.x) * W));
      const top = Math.max(0, Math.round(Number(c.y) * H));
      const width = Math.min(W - left, Math.round(Number(c.w) * W));
      const height = Math.min(H - top, Math.round(Number(c.h) * H));
      if (!(width >= 20 && height >= 20)) return Response.json({ error: "Crop area is too small" }, { status: 400 });
      img = img.extract({ left, top, width, height });
    } else {
      return Response.json({ error: "Unknown edit" }, { status: 400 });
    }

    const file = `floorplan-${Date.now().toString(36)}.png`;
    const info = await img.png({ compressionLevel: 9 }).toFile(path.join(MEDIA_DIR, file));
    return Response.json({ file, width: info.width, height: info.height });
  } catch (err) {
    console.error("[floorplan] edit failed", err);
    return Response.json({ error: "Could not edit the floor plan" }, { status: 500 });
  }
}
