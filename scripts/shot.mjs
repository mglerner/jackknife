// Dev-only: screenshot the running dev server's WebGL canvas headlessly so we can
// verify the 3D render without a phone. Usage: node scripts/shot.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173/";
const OUT = "/tmp/jk";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.on("console", (m) => console.log("PAGE:", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.screenshot({ path: `${OUT}-topdown.png` });
console.log("wrote topdown");

// Switch to camera view.
await page.click("[data-view]");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}-camera.png` });
console.log("wrote camera");

// Back to top-down, then play the Demo and capture the parked result.
await page.click("[data-view]");
await page.click("[data-demo-run]");
await page.waitForTimeout(2300); // mid-maneuver: wheel should be turned
await page.screenshot({ path: `${OUT}-demo-mid.png` });
console.log("wrote demo-mid");
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}-demo.png` });
console.log("wrote demo");

await browser.close();
