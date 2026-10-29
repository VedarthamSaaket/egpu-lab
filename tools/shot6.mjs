import { createRequire } from "module";
const require = createRequire(process.env.HOME + "/development/pixel-arcade/tools/package.json");
const { chromium } = require("playwright");
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const [mod, cell, name] of [["w05", 6, "warn"], ["w06", 6, "ok"], ["w01", 0, "same"], ["w11", 8, "drop"], ["common", 3, "excerpt"]]) {
  await page.goto(`http://localhost:8791/app/#/m/${mod}/learn`);
  await page.waitForSelector(".cell.active");
  await page.click(`.toc[data-i="${cell}"]`);
  await page.waitForTimeout(250);
  await page.keyboard.press("s");
  await page.waitForTimeout(250);
  await page.locator(".cell.active").screenshot({ path: `${out}/simp-${name}.png` });
}
console.log("errors", JSON.stringify(errors));
await browser.close();
