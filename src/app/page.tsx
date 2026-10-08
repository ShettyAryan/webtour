import Tour from "@/components/Tour";
import { readTour } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const config = await readTour();
  return <Tour config={config} />;
}
