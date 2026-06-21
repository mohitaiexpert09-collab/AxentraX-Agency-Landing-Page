import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'node:fs/promises';

// Source logo (old blue→violet→magenta gradient) and output (warm peach palette)
const SRC = 'brand_assets/Logo-mark.png';
const OUT = 'brand_assets/Logo-mark-warm.png';

const srcB64 = (await readFile(SRC)).toString('base64');
const dataUrl = `data:image/png;base64,${srcB64}`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();

const out = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;

  // ---- palette (site tokens) ----
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

  // peach ramp for the saturated (colored) parts: X-mark + wordmark "X"
  // dark → bright glossy highlight
  const stops = [
    [0.0, [150, 74, 44]],    // deep burnt edge
    [0.3, [182, 95, 56]],    // peach-ink
    [0.5, [206, 122, 82]],   // peach-deep
    [0.7, [230, 154, 115]],  // peach
    [0.85, [244, 198, 168]], // peach-soft
    [1.0, [252, 246, 238]],  // warm cream highlight
  ];
  const peachRamp = (L) => {
    for (let i = 1; i < stops.length; i++) {
      if (L <= stops[i][0]) {
        const t = (L - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return mix(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  };

  // warm neutral ramp for the gray "axentra" wordmark → reads as cream on dark footer
  const grayRamp = (L) => mix([176, 150, 130], [250, 244, 236], Math.min(1, L * 1.15));

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const S = max === 0 ? 0 : (max - min) / max;

    const col = S > 0.18 ? peachRamp(L) : grayRamp(L);
    d[i] = Math.round(col[0]);
    d[i + 1] = Math.round(col[1]);
    d[i + 2] = Math.round(col[2]);
    // alpha preserved
  }

  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}, dataUrl);

await browser.close();

const buf = Buffer.from(out.split(',')[1], 'base64');
await writeFile(OUT, buf);
console.log(`Wrote ${OUT} (${buf.length} bytes)`);
