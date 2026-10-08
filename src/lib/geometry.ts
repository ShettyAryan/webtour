import type { Room, TourConfig } from "./types";

/** Wraps degrees into (-180, 180]. */
export function wrapDeg(d: number): number {
  const w = ((((d + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

/** Compass bearing on the floor plan from one room to another, clockwise from plan-up. */
export function planBearing(from: Room, to: Room, plan: TourConfig["floorPlan"]): number | null {
  if (!from.plan || !to.plan) return null;
  const dx = (to.plan.x - from.plan.x) * plan.width;
  const dy = (to.plan.y - from.plan.y) * plan.height;
  if (!dx && !dy) return null;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Yaw inside `from`'s photo that faces `to`, using both access points + heading calibration. */
export function yawToward(from: Room, to: Room, plan: TourConfig["floorPlan"]): number | null {
  const b = planBearing(from, to, plan);
  return b === null ? null : Math.round(wrapDeg(b - from.headingOffset));
}

/** Yaw to show on arriving in `to`, so the visitor keeps facing the way they walked. */
export function arrivalYaw(from: Room, to: Room, plan: TourConfig["floorPlan"]): number | null {
  const b = planBearing(from, to, plan);
  return b === null ? null : Math.round(wrapDeg(b - to.headingOffset));
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
