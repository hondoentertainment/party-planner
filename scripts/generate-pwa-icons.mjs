/**
 * Rasterizes public/party.svg into PNGs for the web app manifest (install prompts).
 * Run after changing the SVG: `npm run pwa:icons`
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "public", "party.svg");

const sizes = [192, 512];

async function main() {
  const svg = await sharp(svgPath).resize(256, 256).toBuffer();
  for (const size of sizes) {
    const out = path.join(root, "public", `icon-${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log("wrote", path.relative(root, out));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
