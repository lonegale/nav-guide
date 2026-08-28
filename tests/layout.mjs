/* 布局断言:工具栏/模态框/网格/溢出 */
import { chromium } from "playwright-core";

const EXEC = process.env.HOME +
  "/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const EXT = "/Users/tcy/projects/nav-guide";

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:8742/index.html");
await page.waitForSelector(".site-card");
await page.waitForTimeout(400);

let r, pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log("  PASS " + n)) : (fail++, console.log("  FAIL " + n)); };

// 1. 无横向溢出
r = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
ok(r, "无横向溢出");

// 2. 工具栏三按钮(纯网页模式主题按钮可见,另两个隐藏但存在)
r = await page.evaluate(() => {
  const btn = document.getElementById("themeBtn");
  const bb = btn.getBoundingClientRect();
  return bb.right <= innerWidth && bb.top >= 0 && bb.width === 42;
});
ok(r, "主题按钮位于右上角固定位置");

// 3. 卡片网格:同行卡片顶部对齐、等高
r = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".site-card")];
  const rows = new Map();
  cards.forEach((c) => {
    const bb = c.getBoundingClientRect();
    const key = Math.round(bb.top);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ h: bb.height, left: bb.left, right: bb.right });
  });
  for (const [, list] of rows) {
    const h0 = list[0].h;
    if (list.some((x) => Math.abs(x.h - h0) > 1)) return false;
  }
  return true;
});
ok(r, "网格卡片等高对齐");

await browser.close();

// 扩展环境
const ctx = await chromium.launchPersistentContext("/tmp/nav-test/profile-layout", {
  executablePath: EXEC, headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
const p = await ctx.newPage();
await p.setViewportSize({ width: 1280, height: 800 });
await p.goto(`chrome-extension://${new URL(sw.url()).host}/index.html`);
await p.waitForSelector(".site-card");
await p.waitForTimeout(300);

// 工具栏三按钮可见、不重叠、右对齐
r = await p.evaluate(() => {
  const ids = ["addBtn", "settingsBtn", "themeBtn"];
  const boxes = ids.map((i) => document.getElementById(i).getBoundingClientRect());
  if (boxes.some((b) => b.width !== 42 || b.height !== 42)) return false;
  for (let i = 0; i < boxes.length - 1; i++) {
    if (boxes[i].right > boxes[i + 1].left) return false; // 无重叠
  }
  return boxes[2].right <= innerWidth - 10; // 最右贴近右缘
});
ok(r, "工具栏三按钮可见/等宽/无重叠/右对齐");

// 设置下拉展开后不超出视口
await p.click("#settingsBtn");
r = await p.evaluate(() => {
  const d = document.getElementById("settingsDropdown").getBoundingClientRect();
  return d.right <= innerWidth && d.width > 100;
});
ok(r, "设置下拉右对齐不溢出");
await p.keyboard.press("Escape");

// 搜索引擎下拉展开层级在卡片之上(不被网址卡片遮挡)
await p.click("#engineBtn");
r = await p.evaluate(() => {
  const dropdown = document.getElementById("engineDropdown");
  const options = [...dropdown.querySelectorAll(".engine-option")];
  return options.every((opt) => {
    const rect = opt.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit && dropdown.contains(hit);
  });
});
ok(r, "搜索引擎下拉层级在卡片之上且各选项可点击无遮挡");
await p.keyboard.press("Escape");

// 添加模态框居中
await p.click("#addBtn");
r = await p.evaluate(() => {
  const c = document.querySelector("#editModal .modal-card").getBoundingClientRect();
  return Math.abs((c.left + c.right) / 2 - innerWidth / 2) < 20
    && Math.abs((c.top + c.bottom) / 2 - innerHeight / 2) < 60
    && c.width <= 460;
});
ok(r, "模态框居中且宽度受限");
await p.keyboard.press("Escape");

// 触屏常显:无头桌面 Chromium 恒报 hover:hover,无法运行时触发,
// 故断言 @media (hover:none) 常显规则存在于样式表(注入法已验证规则本身生效)
r = await p.evaluate(() => {
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule.media && rule.media.mediaText.includes("hover: none")) {
        const text = [...rule.cssRules].map((x) => x.selectorText || "").join(",");
        if (text.includes("site-edit-btn") && text.includes("site-hide-btn")) return true;
      }
    }
  }
  return false;
});
ok(r, "样式表含 @media (hover:none) 角标常显规则");
// 移动端视口无横向溢出
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto(`chrome-extension://${new URL(sw.url()).host}/index.html`);
await m.waitForSelector(".site-card");
await m.waitForTimeout(300);
r = await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
ok(r, "390px 视口无横向溢出");

await ctx.close();
console.log(`\n布局断言: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
