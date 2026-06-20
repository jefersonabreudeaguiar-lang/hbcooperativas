import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "icons", "icon.svg");
const outDir = path.join(root, "public", "icons");

const svg = fs.readFileSync(svgPath);

const sizes = [
  { name: "icon-180.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-512-maskable.png", size: 512, maskable: true },
];

for (const { name, size, maskable } of sizes) {
  let pipeline = sharp(svg).resize(size, size);
  if (maskable) {
    pipeline = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 20, g: 83, b: 45, alpha: 1 },
      },
    }).composite([{ input: await sharp(svg).resize(Math.round(size * 0.72)).png().toBuffer(), gravity: "center" }]);
  }
  await pipeline.png().toFile(path.join(outDir, name));
  console.log(`Generated ${name}`);
}
