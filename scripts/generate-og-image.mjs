/**
 * Generates the static social-card image at public/og-image.png (1200×630)
 * used as the default `og:image` for /s/<token> link previews when no
 * per-event dynamic OG service is configured. This avoids shipping the small
 * `party.svg` icon which renders as a square thumbnail in iMessage/Slack.
 *
 * Run manually: `npm run og:image`
 * Run on demand from the build: see `predeploy` style scripts.
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "public", "og-image.png");

const WIDTH = 1200;
const HEIGHT = 630;

// Brand palette mirrors tailwind.config.js after the indigo→violet refresh.
const GRADIENT_START = "#6366f1"; // indigo-500
const GRADIENT_END = "#a855f7"; // violet-500
const ACCENT = "#facc15"; // amber-400 confetti highlight

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${WIDTH}" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${GRADIENT_START}" />
      <stop offset="100%" stop-color="${GRADIENT_END}" />
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="60%" fx="50%" fy="40%">
      <stop offset="0%" stop-color="white" stop-opacity="0.18" />
      <stop offset="100%" stop-color="white" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="100%" height="100%" fill="url(#bg)" />
  <rect width="100%" height="100%" fill="url(#vignette)" />

  <!-- Confetti dots scattered around the canvas -->
  <g opacity="0.85">
    <circle cx="120" cy="110" r="14" fill="${ACCENT}" />
    <circle cx="1040" cy="180" r="22" fill="white" opacity="0.55" />
    <circle cx="160" cy="520" r="10" fill="white" opacity="0.6" />
    <circle cx="1080" cy="540" r="18" fill="${ACCENT}" />
    <rect x="980" y="80" width="20" height="20" fill="white" opacity="0.65" transform="rotate(20 990 90)" />
    <rect x="200" y="430" width="14" height="14" fill="${ACCENT}" transform="rotate(-12 207 437)" />
    <rect x="900" y="430" width="22" height="22" fill="white" opacity="0.45" transform="rotate(35 911 441)" />
  </g>

  <!-- Party popper glyph in a soft circle, top-left of the headline block -->
  <g transform="translate(110 200)">
    <circle cx="60" cy="60" r="60" fill="white" opacity="0.18" />
    <g transform="translate(20 20) scale(3.5)" fill="none" stroke="white" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M5.8 11.3 2 22l10.7-3.79"/>
      <path d="M4 3h.01"/>
      <path d="M22 8h.01"/>
      <path d="M15 2h.01"/>
      <path d="M22 20h.01"/>
      <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/>
      <path d="m22 13-1.99 1.16a2 2 0 0 1-2.66-.7l-.04-.06a2 2 0 0 0-3.62.4l-1.13 3.06"/>
      <path d="m11 13.5 1 1.5"/>
      <path d="m13 11.5 1 .5"/>
    </g>
  </g>

  <text x="260" y="270" font-family="-apple-system, Segoe UI, Inter, system-ui, sans-serif"
        font-size="86" font-weight="800" fill="white" letter-spacing="-1.5">
    Party Planner
  </text>
  <text x="260" y="332" font-family="-apple-system, Segoe UI, Inter, system-ui, sans-serif"
        font-size="34" font-weight="500" fill="white" opacity="0.92">
    You're invited.
  </text>

  <text x="110" y="540" font-family="-apple-system, Segoe UI, Inter, system-ui, sans-serif"
        font-size="26" font-weight="500" fill="white" opacity="0.85">
    RSVP, view the menu, add to your calendar — one link.
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(out);

console.log("wrote", path.relative(root, out));
