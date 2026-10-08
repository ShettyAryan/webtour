import { cookies } from "next/headers";
import { adminPassword, checkPassword, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server/auth";

export async function POST(req: Request) {
  if (!adminPassword()) {
    return Response.json({ error: "Admin is disabled. Set ADMIN_PASSWORD in the server environment." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const token = checkPassword(typeof body.password === "string" ? body.password : "");
  if (!token) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json({ ok: true });
}
