import puppeteer from 'puppeteer';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] ? `-${process.argv[3]}` : '';
const width = Number(process.argv[4]) || 1440;

const OUT_DIR = join(process.cwd(), 'temporary screenshots');
await mkdir(OUT_DIR, { recursive: true });

// Auto-increment screenshot-N
let next = 1;
try {
  const files = await readdir(OUT_DIR);
  const nums = files
    .map((f) => /^screenshot-(\d+)/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  if (nums.length) next = Math.max(...nums) + 1;
} catch {}

const outPath = join(OUT_DIR, `screenshot-${next}${label}.png`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

// Scroll through the page so IntersectionObserver scroll-reveals fire,
// then return to top before capturing the full page.
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = Math.round(window.innerHeight * 0.8);
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await sleep(120);
  }
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(300);
  window.scrollTo(0, 0);
  await sleep(400);
  // Force final reveal/count state so the full-page capture is deterministic
  document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in'));
  document.querySelectorAll('.count').forEach((e) => {
    const to = parseFloat(e.dataset.to);
    e.textContent = to % 1 === 0 ? Math.round(to).toString() : to.toFixed(1);
  });
});

// give animations/fonts a beat to settle
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Saved ${outPath}`);
