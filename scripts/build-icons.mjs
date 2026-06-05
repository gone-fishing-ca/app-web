// One-off: composite the walleye silhouette onto the Lake Light bg
// and emit the favicon + Apple-touch icon used by Next.js App Router.
//
// Run with:  node scripts/build-icons.mjs

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public/walleye/walleye-glyph-navy.png");

// Lake Light tokens (kept in sync with app/design-tokens.css)
const LAKE_BG = "#F5F8FA"; // --bg
const LAKE_NAVY = { r: 0x16, g: 0x43, b: 0x5e }; // --primary  #16435E

async function makeIcon({ outPath, size, padding = 0.14, radiusFrac = 0.18 }) {
  const pad = Math.round(size * padding);
  const inner = size - pad * 2;

  // Recolor the silhouette to Lake navy:
  //   1) resize a navy-filled square to `inner x inner`,
  //   2) keep only where the silhouette has alpha (dest-in).
  const silhouette = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const navyTinted = await sharp({
    create: { width: inner, height: inner, channels: 4, background: { ...LAKE_NAVY, alpha: 1 } },
  })
    .composite([{ input: silhouette, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Rounded-square Lake-bg canvas with the navy walleye centered on it.
  const r = Math.round(size * radiusFrac);
  const roundedMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/>
     </svg>`,
  );

  await sharp({
    create: { width: size, height: size, channels: 4, background: LAKE_BG },
  })
    .composite([
      { input: navyTinted, top: pad, left: pad },
      { input: roundedMask, blend: "dest-in" },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`  wrote ${path.relative(ROOT, outPath)} (${size}x${size})`);
}

await mkdir(path.join(ROOT, "app"), { recursive: true });
await makeIcon({ outPath: path.join(ROOT, "app/icon.png"), size: 256 });
await makeIcon({ outPath: path.join(ROOT, "app/apple-icon.png"), size: 512 });
console.log("done.");
