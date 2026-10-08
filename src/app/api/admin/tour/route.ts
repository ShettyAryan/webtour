import { revalidatePath } from "next/cache";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { readTour, removeOrphans, sanitizeTour, writeTour } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json(await readTour());
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const config = sanitizeTour(body);
  await writeTour(config);
  await removeOrphans(config).catch((err) => console.error("[tour] orphan cleanup failed", err));
  revalidatePath("/");
  return Response.json(config);
}
