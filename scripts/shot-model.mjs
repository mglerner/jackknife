// Screenshot the model preview from several turntable angles for iteration.
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173/preview.html";
const OUT = "/tmp/jk-model";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await (await browser.newContext({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 2 })).newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto(url, { waitUntil: "networkidle" });

// Capture at a few times so the orbiting camera gives front / side / rear angles.
const stops = [400, 1900, 3300, 4800];
for (let i = 0; i < stops.length; i++) {
  await page.waitForTimeout(i === 0 ? stops[0] : stops[i] - stops[i - 1]);
  await page.screenshot({ path: `${OUT}-${i}.png` });
  console.log("wrote", `${OUT}-${i}.png`);
}
await browser.close();
