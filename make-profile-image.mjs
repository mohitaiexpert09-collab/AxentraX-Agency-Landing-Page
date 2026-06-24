import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'node:fs/promises';

const SRC = 'brand_assets/Logo-mark-warm.png';
const SIZE = 1000; // square output

const srcB64 = (await readFile(SRC)).toString('base64');
const dataUrl = `data:image/png;base64,${srcB64}`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();

const { png, jpg } = await page.evaluate(async (dataUrl, SIZE) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  // --- isolate the X-mark (top band, above the wordmark gap) and find its tight bbox ---
  const w = img.naturalWidth, h = img.naturalHeight;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(img, 0, 0);
  const d = tctx.getImageData(0, 0, w, h).data;

  const markBottom = 290; // gap between mark and wordmark is rows 280-313
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < markBottom; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const markW = maxX - minX + 1, markH = maxY - minY + 1;

  // --- compose square branded background ---
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d');

  // base deep-indigo radial (brand: indigo #2A2566 -> indigo-deep #141033)
  const bg = ctx.createRadialGradient(SIZE * 0.5, SIZE * 0.42, SIZE * 0.05, SIZE * 0.5, SIZE * 0.55, SIZE * 0.75);
  bg.addColorStop(0, '#2A2566');
  bg.addColorStop(0.55, '#1B1645');
  bg.addColorStop(1, '#100C28');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // soft peach glow behind the mark for warmth / depth
  const glow = ctx.createRadialGradient(SIZE * 0.5, SIZE * 0.46, 0, SIZE * 0.5, SIZE * 0.46, SIZE * 0.42);
  glow.addColorStop(0, 'rgba(230,154,115,0.20)');
  glow.addColorStop(0.6, 'rgba(206,122,82,0.07)');
  glow.addColorStop(1, 'rgba(206,122,82,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // subtle vignette so the circular crop has a clean edge
  const vg = ctx.createRadialGradient(SIZE * 0.5, SIZE * 0.5, SIZE * 0.35, SIZE * 0.5, SIZE * 0.5, SIZE * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,6,20,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // draw the mark centered, scaled so its larger side ~= 54% of canvas (safe inside circle)
  const target = SIZE * 0.54;
  const scale = target / Math.max(markW, markH);
  const dw = markW * scale, dh = markH * scale;
  const dx = (SIZE - dw) / 2;
  const dy = (SIZE - dh) / 2 - SIZE * 0.005;
  ctx.drawImage(tmp, minX, minY, markW, markH, dx, dy, dw, dh);

  return {
    png: c.toDataURL('image/png'),
    jpg: c.toDataURL('image/jpeg', 0.95),
  };
}, dataUrl, SIZE);

await browser.close();

await writeFile('brand_assets/axentrax-profile.png', Buffer.from(png.split(',')[1], 'base64'));
await writeFile('brand_assets/axentrax-profile.jpg', Buffer.from(jpg.split(',')[1], 'base64'));
console.log('Wrote brand_assets/axentrax-profile.png and .jpg');
