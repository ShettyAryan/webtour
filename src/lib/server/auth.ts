import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "tour_admin";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Admin password comes from the ADMIN_PASSWORD env var (.env.local).
 * In development it falls back to "admin"; in production the admin panel
 * stays locked until ADMIN_PASSWORD is set.
 */
export function adminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (pw) return pw;
  return process.env.NODE_ENV === "production" ? null : "admin";
}

/** Session token derived from the password, so changing the password logs everyone out. */
function sessionToken(password: string) {
  return createHmac("sha256", password).update("webtour-admin-session-v1").digest("hex");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): string | null {
  const pw = adminPassword();
  if (!pw || !safeEqual(input, pw)) return null;
  return sessionToken(pw);
}

export async function isAdmin(): Promise<boolean> {
  const pw = adminPassword();
  if (!pw) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return !!value && safeEqual(value, sessionToken(pw));
}

export function unauthorized() {
  return Response.json({ error: "Not signed in" }, { status: 401 });
}
