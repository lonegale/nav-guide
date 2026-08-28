/* nav-guide v1.2 自动化验收:纯网页模式(file:// 等价) + 真实扩展环境 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const EXEC = process.env.HOME +
  "/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const EXT = "/Users/tcy/projects/nav-guide";
const URL_PLAIN = "http://127.0.0.1:8742/index.html";

fs.rmSync("/tmp/nav-test", { recursive: true, force: true });
fs.mkdirSync("/tmp/nav-test", { recursive: true });

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name); }
}
function section(t) { console.log("\n== " + t + " =="); }

/* ------------------------------------------------------------------ */
async function plainMode() {
  section("A. 纯网页模式(file:// 等价)");
  const browser = await chromium.launch({ executablePath: EXEC, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push(m.text());
  });

  await page.goto(URL_PLAIN);
  await page.waitForSelector(".site-card");

  ok(errors.length === 0, "无 JS 报错" + (errors.length ? ": " + errors[0] : ""));
  ok((await page.locator(".site-card").count()) === 24, "24 张默认卡片");

  // 添加/设置入口应隐藏
  ok(await page.locator("#addBtn").isHidden(), "+ 按钮隐藏(无扩展环境)");
  ok(await page.locator("#settingsBtn").isHidden(), "设置按钮隐藏(无扩展环境)");

  // 搜索过滤
  await page.fill("#searchInput", "git");
  let visible = await page.locator(".site-card:not(.hidden)").count();
  ok(visible === 1, "过滤 'git' 仅剩 1 张卡片 (实际 " + visible + ")");
  ok(await page.locator("#noResult").isHidden(), "有结果时无结果提示隐藏");

  await page.fill("#searchInput", "zzz不存在的站");
  visible = await page.locator(".site-card:not(.hidden)").count();
  ok(visible === 0 && await page.locator("#noResult").isVisible(), "无匹配时显示无结果提示");

  // Esc 清空
  await page.press("#searchInput", "Escape");
  ok(await page.inputValue("#searchInput") === "" &&
     (await page.locator(".site-card:not(.hidden)").count()) === 24, "Esc 清空过滤恢复全部卡片");

  // ↓ 进入第一张卡片
  await page.focus("#searchInput");
  await page.keyboard.press("ArrowDown");
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("site-card")),
     "↓ 从搜索框聚焦第一张卡片");

  // Tab 循环引擎 / Shift+Tab 放行
  await page.focus("#searchInput");
  await page.keyboard.press("Tab");
  ok(await page.textContent("#currentEngineName") === "Bing", "Tab 切换引擎 Google→Bing");
  await page.focus("#searchInput");
  await page.keyboard.press("Shift+Tab");
  const ae = await page.evaluate(() => document.activeElement && document.activeElement.id);
  ok(ae === "engineBtn" && (await page.textContent("#currentEngineName")) === "Bing",
     "Shift+Tab 放行焦点离开搜索框(到达 " + ae + ")且不切引擎");

  // '/' 聚焦
  await page.click("body");
  await page.keyboard.press("/");
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === "searchInput",
     "/ 全局聚焦搜索框");

  // URL 直达 vs 搜索(拦截 window.open)
  const stub = () => page.evaluate(() => {
    window.__lastOpen = null;
    window.open = (u) => { window.__lastOpen = u; return null; };
  });
  await stub();
  await page.fill("#searchInput", "github.com");
  await page.press("#searchInput", "Enter");
  ok(await page.evaluate(() => window.__lastOpen) === "https://github.com", "输入域名直达 https://github.com");

  await stub();
  await page.fill("#searchInput", "node.js 是什么");
  await page.press("#searchInput", "Enter");
  ok((await page.evaluate(() => window.__lastOpen)).includes("bing.com/search"),
     "普通查询走搜索引擎(含空格不判为网址)");

  await stub();
  await page.fill("#searchInput", "node.js");
  await page.press("#searchInput", "Enter");
  ok((await page.evaluate(() => window.__lastOpen)).includes("bing.com/search"),
     "node.js 不误判为网址(两字符非白名单 TLD)");

  await stub();
  await page.fill("#searchInput", "devv.ai");
  await page.press("#searchInput", "Enter");
  ok(await page.evaluate(() => window.__lastOpen) === "https://devv.ai", "白名单 TLD(.ai)直达");

  // 主题三态
  const t0 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.click("#themeBtn");
  const t1 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.click("#themeBtn");
  const t2 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok(t0 === "auto" && t1 === "light" && t2 === "dark", `主题循环 auto→light→dark (${t0}→${t1}→${t2})`);

  await browser.close();
}

/* ------------------------------------------------------------------ */
async function extensionMode() {
  section("B. 扩展环境(chrome.storage / 新标签页)");
  const ctx = await chromium.launchPersistentContext("/tmp/nav-test/profile", {
    executablePath: EXEC,
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
  const extId = new URL(sw.url()).host;
  ok(extId === "nbppdilmfooepdggolkeiplefdhphflp", `固定公钥生效: Extension ID 为 ${extId}`);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push(m.text());
  });

  const INDEX = `chrome-extension://${extId}/index.html`;
  await page.goto(INDEX);
  await page.waitForSelector(".site-card");
  await page.waitForTimeout(300);

  ok(errors.length === 0, "无 JS 报错" + (errors.length ? ": " + errors.join(" | ") : ""));
  ok((await page.locator(".site-card").count()) === 24, "24 张默认卡片");
  ok(await page.locator("#addBtn").isVisible(), "+ 添加按钮可见");
  ok(await page.locator("#settingsBtn").isVisible(), "设置按钮可见");
  ok(await page.locator(".site-hide-btn").count() === 24, "默认卡片各带 ✕ 隐藏按钮");
  ok((await page.locator(".site-edit-btn").count()) === 0, "默认卡片无编辑按钮");

  /* ---- 隐藏默认卡片 + 撤销 ---- */
  await page.locator(".site-card", { hasText: "GitHub" }).locator(".site-hide-btn").click();
  ok((await page.locator(".site-card").count()) === 23, "点击 ✕ 后 GitHub 卡片隐藏");
  ok(await page.locator("#toast").textContent() !== "", "隐藏后 toast 提示");
  await page.locator(".toast-action").click(); // 撤销
  await page.waitForTimeout(200);
  ok((await page.locator(".site-card").count()) === 24, "撤销后恢复 24 张");

  /* ---- + 添加站点(新建分类) ---- */
  await page.click("#addBtn");
  ok(await page.locator("#editModal").evaluate((el) => el.classList.contains("open")), "+ 打开添加模态框");
  ok((await page.textContent("#mTitle")) === "添加站点", "模态框标题为「添加站点」");
  ok(await page.locator("#mDeleteBtn").isHidden() && await page.locator("#mPinBtn").isHidden(),
     "添加模式隐藏删除/置顶按钮");
  await page.fill("#mName", "测试站");
  await page.fill("#mUrl", "http://127.0.0.1:8742/");
  await page.selectOption("#mCategory", "__new__");
  ok(await page.locator("#mNewCat").evaluate((el) => el.classList.contains("show")), "选择新建分类出现输入框");
  await page.fill("#mNewCategory", "我的分类");
  await page.click("#mSaveBtn");
  await page.waitForTimeout(300);
  ok(await page.locator("#editModal").evaluate((el) => !el.classList.contains("open")), "保存后模态框关闭");
  ok((await page.locator(".category-section", { hasText: "我的分类" }).locator(".site-card").count()) === 1,
     "新分类区块出现测试站卡片");
  let sites = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites))));
  ok(sites.length === 1 && sites[0].category === "我的分类" && sites[0].icon === "", "storage.local 落盘正确(新站 icon 为空自动取 favicon)");
  let syncSites = await page.evaluate(() => new Promise((r) => chrome.storage.sync.get(["navSites"], (x) => r(x.navSites))));
  ok(syncSites.length === 1 && syncSites[0].category === "我的分类", "chrome.storage.sync Google 云同步落盘正确");

  /* ---- 重复校验 ---- */
  await page.click("#addBtn");
  await page.fill("#mName", "重复站");
  await page.fill("#mUrl", "http://127.0.0.1:8742");
  await page.click("#mSaveBtn");
  ok((await page.textContent("#mError")).includes("已在导航中"), "重复 URL 保存被拦截并提示");
  ok(await page.locator("#editModal").evaluate((el) => el.classList.contains("open")), "模态框保持打开");
  await page.keyboard.press("Escape");

  /* ---- '/' 在模态框输入框内不被劫持 ---- */
  await page.click("#addBtn");
  await page.fill("#mName", "a/b");
  ok((await page.inputValue("#mName")) === "a/b", "模态框内可输入 '/' 字符");
  ok(await page.locator("#editModal").evaluate((el) => el.classList.contains("open")), "输入 '/' 不抢焦点不关模态框");
  await page.keyboard.press("Escape");

  /* ---- 编辑:账号 + 置顶 ---- */
  await page.locator(".site-card", { hasText: "测试站" }).locator(".site-edit-btn").click();
  ok((await page.textContent("#mTitle")) === "编辑站点", "⋯ 打开编辑模态框");
  await page.fill("#mAccount", "test@example.com");
  await page.click("#mPinBtn");
  ok((await page.textContent("#mPinBtn")).includes("已置顶"), "置顶按钮切换为已置顶");
  await page.fill("#mDesc", "本地测试页");
  await page.click("#mSaveBtn");
  await page.waitForTimeout(300);
  sites = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites))));
  ok(sites[0].account === "test@example.com" && sites[0].pinned === true && sites[0].desc === "本地测试页",
     "编辑保存落盘(账号/置顶/描述)" + (sites[0].account === "test@example.com" && sites[0].pinned === true && sites[0].desc === "本地测试页" ? "" : " 实际: " + JSON.stringify(sites)));
  const card = page.locator(".site-card", { hasText: "测试站" });
  ok(await card.locator(".account-badge").count() === 1, "👤 角标显示");
  const tip = await card.getAttribute("title");
  ok(!tip.includes("test@example.com"), "hover title 不再泄露账号信息");

  /* ---- 👤 点击查看账号 ---- */
  await card.locator(".account-badge").click();
  ok((await page.textContent(".account-popover")).includes("test@example.com"), "点击 👤 弹层展示账号信息");
  await page.mouse.click(20, 20);
  ok((await page.locator(".account-popover").count()) === 0, "点击别处关闭账号弹层");

  /* ---- 最近使用 ---- */
  const [newPage] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 8000 }),
    card.click(),
  ]);
  await newPage.close();
  await page.waitForTimeout(400);
  const recentSec = page.locator('.category-section[data-recent]');
  ok(await recentSec.count() === 1 && (await recentSec.locator(".site-card").count()) === 1,
     "点击卡片后出现「最近使用」区块");

  /* ---- 分类管理:重命名 → 删除(移入快速收藏) ---- */
  await page.click("#settingsBtn");
  await page.click("#manageCatsBtn");
  ok(await page.locator("#catModal").evaluate((el) => el.classList.contains("open")), "打开分类管理");
  const row = page.locator(".cat-row", { hasText: "1 个站点" });
  ok(await row.count() === 1, "列出 1 个自定义分类");
  await row.locator(".cat-name-input").fill("改名分类");
  await row.locator(".cat-name-input").press("Enter");
  await page.waitForTimeout(300);
  sites = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites))));
  ok(sites[0].category === "改名分类", "重命名同步到站点");
  await page.locator(".cat-del").click();
  await page.locator(".cat-del").click(); // 二次确认
  await page.waitForTimeout(300);
  sites = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites))));
  ok(sites[0].category === "快速收藏", "删除分类后站点移入「快速收藏」");
  ok(await page.locator(".category-section", { hasText: "快速收藏" }).count() === 1, "快速收藏区块出现");
  await page.keyboard.press("Escape");

  /* ---- 导出 ---- */
  await page.click("#settingsBtn");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }),
    page.click("#exportBtn"),
  ]);
  const dlPath = "/tmp/nav-test/export.json";
  await download.saveAs(dlPath);
  const exported = JSON.parse(fs.readFileSync(dlPath, "utf8"));
  ok(exported.app === "nav-guide" && exported.sites.length === 1, "导出 JSON 含站点数据");

  /* ---- 导入(改名字段模拟外部备份) ---- */
  const backup = JSON.stringify({
    app: "nav-guide", version: 1, sites: [
      { name: "导入站", url: "https://example.com/import", category: "备份分类", account: "acc" },
      { name: "更新站", url: "http://127.0.0.1:8742/", category: "备份分类", desc: "updated" },
    ],
  });
  fs.writeFileSync("/tmp/nav-test/import.json", backup);
  await page.click("#settingsBtn");
  await page.setInputFiles("#importFile", "/tmp/nav-test/import.json");
  await page.waitForTimeout(400);
  sites = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites))));
  ok(sites.length === 2 && sites.some((s) => s.name === "导入站") && sites.some((s) => s.desc === "updated"),
     "导入合并:新增 1 条 + 同址更新 1 条");
  ok((await page.textContent("#toast")).includes("导入完成"), "导入结果 toast");

  /* ---- 删除站点(armed 3 秒逻辑) ---- */
  await page.locator(".site-card", { hasText: "导入站" }).locator(".site-edit-btn").click();
  await page.click("#mDeleteBtn");
  ok((await page.textContent("#mDeleteBtn")) === "确认删除？", "删除进入二次确认");
  await page.click("#mDeleteBtn");
  await page.waitForTimeout(300);
  sites = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites))));
  ok(sites.length === 1, "确认后删除成功");

  /* ---- 外部添加 toast(storage.onChanged) ---- */
  await page.evaluate(() => {
    const cur = new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites)));
    cur.then((s) => chrome.storage.local.set({
      navSites: [...s, { id: "ext-1", name: "外部站", url: "https://example.org", desc: "", account: "", icon: "", category: "常用", pinned: false, addedAt: Date.now() }],
    }));
  });
  await page.waitForTimeout(400);
  ok((await page.textContent("#toast")).includes("外部站"), "外部入口添加后 toast 提示「已添加」");
  ok((await page.locator(".site-card", { hasText: "外部站" }).count()) === 1, "外部添加即时渲染");

  /* ---- 过滤联动(扩展环境) ---- */
  await page.fill("#searchInput", "导入");
  ok((await page.locator(".site-card:visible").count()) === 0, "过滤词无匹配时可见卡片为 0");
  await page.press("#searchInput", "Escape");

  /* ---- file:// 回归:扩展环境下 index.html 仍可独立渲染(CONFIG 只读) ---- */
  const p2 = await ctx.newPage();
  await p2.goto(URL_PLAIN);
  await p2.waitForSelector(".site-card");
  ok((await p2.locator(".site-card").count()) === 24 && (await p2.locator("#addBtn").isHidden()),
     "http(file://等价)访问仍为只读 24 卡模式");

  await ctx.close();
}

/* ------------------------------------------------------------------ */
async function syncAndMigrationMode() {
  section("C. Google Sync 与数据防丢迁移验证");
  const ctx = await chromium.launchPersistentContext("/tmp/nav-test/profile-sync", {
    executablePath: EXEC,
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js"));
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();

  const INDEX = `chrome-extension://${extId}/index.html`;

  // 1. 模拟换机/重装: 本地 local 为空，但 Google Sync 中已有站点
  await page.goto(INDEX);
  await page.waitForSelector(".site-card");
  await page.evaluate(async () => {
    await new Promise((r) => chrome.storage.local.clear(r));
    await new Promise((r) => chrome.storage.sync.set({
      navSites: [
        { id: "sync-1", name: "Google云端站", url: "https://cloud.google.com", category: "云端分类", desc: "从云端恢复", account: "pro@google.com", icon: "", addedAt: Date.now() }
      ]
    }, r));
  });

  // 重新打开页面，检验是否从 Google Sync 自动恢复并回填 local
  await page.reload();
  await page.waitForSelector(".site-card");
  const restoredCard = page.locator(".site-card", { hasText: "Google云端站" });
  ok(await restoredCard.count() === 1, "重装后从 Google Sync 自动恢复云端站点");
  const localRestored = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["navSites"], (x) => r(x.navSites))));
  ok(Array.isArray(localRestored) && localRestored.length === 1 && localRestored[0].name === "Google云端站",
     "Google Sync 数据自动回填镜像至本地 local 缓存");

  // 2. 模拟老版本用户升级: local 有数据但 sync 为空，自动迁移至 sync
  await page.evaluate(async () => {
    await new Promise((r) => chrome.storage.sync.clear(r));
    await new Promise((r) => chrome.storage.local.set({
      navSites: [
        { id: "legacy-1", name: "老版本本地站", url: "https://legacy.example.com", category: "常用", desc: "待迁移", account: "", icon: "", addedAt: Date.now() }
      ]
    }, r));
  });

  await page.reload();
  await page.waitForSelector(".site-card");
  await page.waitForTimeout(300);
  const syncMigrated = await page.evaluate(() => new Promise((r) => chrome.storage.sync.get(["navSites"], (x) => r(x.navSites))));
  ok(Array.isArray(syncMigrated) && syncMigrated.length === 1 && syncMigrated[0].name === "老版本本地站",
     "旧版 local 本地数据自动静默迁移至 Google Sync 云端");

  await ctx.close();
}

/* ------------------------------------------------------------------ */
plainMode()
  .then(extensionMode)
  .then(syncAndMigrationMode)
  .then(() => {
    console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
    process.exit(fail ? 1 : 0);
  })
  .catch((e) => { console.error("测试中断:", e); process.exit(1); });

