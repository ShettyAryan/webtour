/** Shape of data/tour.json – edited through /admin. Safe to import on the client. */

/** A clickable marker inside a room's 360 photo that takes the visitor to another room. */
export type Hotspot = {
  id: string;
  /** Id of the room this hotspot leads to */
  target: string;
  /** Degrees, same convention as Room.initialYaw (0 = centre of the photo, clockwise) */
  yaw: number;
  /** Degrees above (+) or below (−) the horizon */
  pitch: number;
};

export type Room = {
  id: string;
  name: string;
  /** File name inside data/panos, or a hosted image URL ("" until a photo is set) */
  pano: string;
  /** Access point on the floor plan as fractions (0–1) of its width/height; null = not placed yet */
  plan: { x: number; y: number } | null;
  /** Degrees (clockwise) that align the vision cone with the plan. 0 = pano centre faces plan top. */
  headingOffset: number;
  /** Where the camera looks when the room opens. 0 = centre of the panorama image. */
  initialYaw: number;
  hotspots: Hotspot[];
};

export type TourConfig = {
  projectName: string;
  unitName: string;
  /** Degrees per second of the idle auto-rotation */
  autoRotateSpeed: number;
  startRoom: string;
  floorPlan: { file: string; width: number; height: number };
  video: { file: string; youtubeId: string };
  brochure: { file: string; downloadName: string };
  rooms: Room[];
};

export const PANO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"];
