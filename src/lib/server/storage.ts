import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { hostedPanoUrl } from "@/lib/pano";
import type { Hotspot, Room, TourConfig } from "@/lib/types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const PANO_DIR = path.join(DATA_DIR, "panos");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
const TOUR_FILE = path.join(DATA_DIR, "tour.json");

const SAFE_FILE = /^[\w][\w.-]{0,180}$/;

export function isSafeFileName(name: string) {
  return SAFE_FILE.test(name) && !name.includes("..");
}

/** Resolves a file inside `dir`, refusing anything that escapes it. */
export function resolveInside(dir: string, name: string): string | null {
  if (!isSafeFileName(name)) return null;
  const abs = path.resolve(dir, name);
  return abs.startsWith(dir + path.sep) ? abs : null;
}

export async function readTour(): Promise<TourConfig> {
  try {
    return sanitizeTour(JSON.parse(await fs.readFile(TOUR_FILE, "utf8")));
  } catch (err) {
    console.error("[tour] could not read data/tour.json – using an empty tour", err);
    return sanitizeTour({});
  }
}

export async function writeTour(config: TourConfig): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${TOUR_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + "\n");
  await fs.rename(tmp, TOUR_FILE); // atomic – the live site never sees a half-written file
}

/** Deletes uploads that the saved config no longer references. */
export async function removeOrphans(config: TourConfig) {
  const keepPanos = new Set(config.rooms.map((r) => r.pano).filter(Boolean));
  const keepMedia = new Set([config.floorPlan.file, config.video.file, config.brochure.file].filter(Boolean));
  for (const [dir, keep] of [
    [PANO_DIR, keepPanos],
    [MEDIA_DIR, keepMedia],
  ] as const) {
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      files.filter((f) => !keep.has(f) && !f.startsWith(".")).map((f) => fs.rm(path.join(dir, f), { force: true })),
    );
  }
}

// ── Validation ───────────────────────────────────────────────────────────

const str = (v: unknown, max = 120, fallback = "") =>
  typeof v === "string" ? v.trim().slice(0, max) : fallback;

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const file = (v: unknown) => {
  const s = str(v, 200);
  return s && isSafeFileName(s) ? s : "";
};

/** A local panorama file name, or a hosted yourimageshare image URL. */
const panoRef = (v: unknown) => {
  const s = str(v, 300);
  if (!s) return "";
  if (isSafeFileName(s)) return s;
  return hostedPanoUrl(s);
};

const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Coerces untrusted input (request body / JSON on disk) into a valid TourConfig. */
export function sanitizeTour(input: unknown): TourConfig {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const seen = new Set<string>();

  const rooms: Room[] = (Array.isArray(o.rooms) ? o.rooms : []).slice(0, 100).flatMap((r: any): Room[] => {
    if (!r || typeof r !== "object") return [];
    let id = str(r.id, 60).replace(/[^\w-]/g, "") || `room-${seen.size + 1}`;
    while (seen.has(id)) id += "-2";
    seen.add(id);
    const plan =
      r.plan && typeof r.plan === "object"
        ? { x: num(r.plan.x, 0, 1, 0.5), y: num(r.plan.y, 0, 1, 0.5) }
        : null;
    return [
      {
        id,
        name: str(r.name, 80) || "Untitled room",
        pano: panoRef(r.pano),
        plan,
        headingOffset: wrapDeg(num(r.headingOffset, -100000, 100000, 0)),
        initialYaw: wrapDeg(num(r.initialYaw, -100000, 100000, 0)),
        hotspots: (Array.isArray(r.hotspots) ? r.hotspots : []).slice(0, 40).flatMap((h: any): Hotspot[] =>
          h && typeof h === "object"
            ? [
                {
                  id: str(h.id, 40).replace(/[^\w-]/g, "") || `hs-${Math.random().toString(36).slice(2, 9)}`,
                  target: str(h.target, 60),
                  yaw: wrapDeg(num(h.yaw, -100000, 100000, 0)),
                  pitch: num(h.pitch, -85, 85, 0),
                },
              ]
            : [],
        ),
      },
    ];
  });

  // Hotspots may only point at other rooms that exist.
  for (const room of rooms) {
    room.hotspots = room.hotspots.filter((h) => h.target !== room.id && seen.has(h.target));
  }

  const fp = o.floorPlan ?? {};
  const startRoom = rooms.some((r) => r.id === o.startRoom) ? (o.startRoom as string) : (rooms[0]?.id ?? "");

  return {
    projectName: str(o.projectName) || "Virtual Tour",
    unitName: str(o.unitName),
    autoRotateSpeed: num(o.autoRotateSpeed, 0, 30, 4),
    startRoom,
    floorPlan: {
      file: file(fp.file),
      width: num(fp.width, 1, 100000, 1000),
      height: num(fp.height, 1, 100000, 700),
    },
    video: {
      file: file(o.video?.file),
      youtubeId: str(o.video?.youtubeId, 11).replace(/[^\w-]/g, ""),
    },
    brochure: {
      file: file(o.brochure?.file),
      downloadName: str(o.brochure?.downloadName, 120).replace(/[\\/:*?"<>|]/g, "") || "Brochure.pdf",
    },
    rooms,
  };
}
