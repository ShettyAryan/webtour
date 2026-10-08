const HOSTED_DIRECT = /^https:\/\/i\.yourimageshare\.com\/[\w.-]+$/i;
const HOSTED_PAGE = /^https:\/\/yourimageshare\.com\/ib\/([\w-]+)\/?$/i;

/**
 * Direct image URL for a hosted panorama. Accepts the CDN URL or the
 * yourimageshare.com/ib/… page link. Returns "" for anything else.
 */
export function hostedPanoUrl(value: string): string {
  const s = value.trim();
  if (HOSTED_DIRECT.test(s)) return s;
  const page = s.match(HOSTED_PAGE);
  return page ? `https://i.yourimageshare.com/${page[1]}.webp` : "";
}

/** URL of the normalised (2:1, sRGB JPEG) panorama — local file or hosted image. */
export function panoUrl(file: string, width: number): string {
  const remote = hostedPanoUrl(file);
  const w = Math.round(width);
  if (remote) return `/api/pano?src=${encodeURIComponent(remote)}&w=${w}`;
  const path = file.split("/").map(encodeURIComponent).join("/");
  return `/api/pano/${path}?w=${w}`;
}

/** URL of an uploaded file in data/media (floor plan, video, brochure). Absolute URLs pass through. */
export function mediaUrl(file: string): string {
  if (!file) return "";
  if (/^https?:\/\//i.test(file)) return file;
  return `/api/media/${encodeURIComponent(file)}`;
}

/** Accepts a YouTube id or any youtube.com / youtu.be URL and returns the id. */
export function parseYoutubeId(input: string): string {
  const s = input.trim();
  const m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : "";
}
