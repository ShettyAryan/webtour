// Generates placeholder equirectangular panoramas for every room in the tour so
// the site works before real renders are added. Existing files are NOT overwritten.
//   npm run placeholders
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "data", "panos");

const rooms = [
  ["living.jpg", "Living Room", "#c9b79c"],
  ["dining.jpg", "Dining Area", "#b8c4b0"],
  ["kitchen.jpg", "Kitchen", "#d8cfc2"],
  ["master-bedroom.jpg", "Master Bedroom", "#a9b6c6"],
  ["master-bath.jpg", "Master Bathroom", "#c3d3d6"],
  ["bedroom-2.jpg", "Bedroom 2", "#c6b3c0"],
  ["bedroom-3.jpg", "Bedroom 3", "#c2c9a6"],
  ["common-bath.jpg", "Common Bathroom", "#b9ccd0"],
  ["balcony.tif", "Balcony", "#9fc0d8"], // TIFF on purpose – proves TIF support
];

const W = 4096;
const H = 2048;

function svg(name, wall) {
  const labels = [
    [0.5, "FRONT · 0°"],
    [0.75, "RIGHT · 90°"],
    [0.0, "BACK · 180°"],
    [1.0, "BACK · 180°"],
    [0.25, "LEFT · 270°"],
  ];
  const lines = Array.from({ length: 16 }, (_, i) => {
    const x = (i / 16) * W;
    return `<line x1="${x}" y1="${H * 0.3}" x2="${x}" y2="${H * 0.72}" stroke="#000" stroke-opacity="0.08" stroke-width="4"/>`;
  }).join("");
  const text = labels
    .map(
      ([u, label]) => `
      <text x="${u * W}" y="${H * 0.47}" font-size="110" font-weight="700" text-anchor="middle" fill="#2b2f36" fill-opacity="0.85">${name}</text>
      <text x="${u * W}" y="${H * 0.55}" font-size="56" text-anchor="middle" fill="#2b2f36" fill-opacity="0.6">${label}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif">
    <defs>
      <linearGradient id="ceil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ece8e1"/></linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c7a57"/><stop offset="1" stop-color="#6e5136"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H * 0.3}" fill="url(#ceil)"/>
    <rect y="${H * 0.3}" width="${W}" height="${H * 0.42}" fill="${wall}"/>
    <rect y="${H * 0.72}" width="${W}" height="${H * 0.28}" fill="url(#floor)"/>
    <rect y="${H * 0.715}" width="${W}" height="${H * 0.012}" fill="#ffffff" fill-opacity="0.7"/>
    ${lines}
    ${text}
  </svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [file, name, wall] of rooms) {
  const dest = path.join(OUT, file);
  if (fs.existsSync(dest)) {
    console.log(`skip   ${file} (exists)`);
    continue;
  }
  const img = sharp(Buffer.from(svg(name, wall)));
  if (file.endsWith(".tif")) await img.tiff({ compression: "lzw" }).toFile(dest);
  else await img.jpeg({ quality: 85 }).toFile(dest);
  console.log(`create ${file}`);
}
