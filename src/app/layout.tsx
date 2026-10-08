import type { Metadata, Viewport } from "next";
import { readTour } from "@/lib/server/storage";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tour = await readTour();
  const unit = tour.unitName ? `${tour.unitName} ` : "";
  return {
    title: `${tour.projectName} · ${unit}Virtual Tour`,
    description: `Walk through the ${unit}at ${tour.projectName} in 360°.`,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0d0f12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
