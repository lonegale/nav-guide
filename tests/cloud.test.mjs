/* ==========================================================================
   云同步三方合并逻辑单元测试(Node 环境直接运行,不依赖浏览器/chrome.*)
   运行: node tests/cloud.test.mjs
   ========================================================================== */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* cloud.js / common.js 均为浏览器全局脚本风格,Node 下需要:
   1. 提供 btoa/TextEncoder/crypto.subtle 桩;
   2. 以 CommonJS eval 方式加载拿到 module.exports。 */
globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
/* Node 20+ 自带 crypto.getRandomValues/subtle,仅缺失时补桩 */

const cloudSrc = readFileSync(path.join(ROOT, "cloud.js"), "utf8");
const commonSrc = readFileSync(path.join(ROOT, "common.js"), "utf8");

/* 用 Function 构造模拟 <script> 串联加载,再从 module.exports 取导出 */
const module_ = { exports: {} };
const loader = new Function(
  "module", "exports", "require",
  commonSrc + "\n" + cloudSrc + "\nreturn module.exports;"
);
const { navCloudMerge, navCloud, navCloudAuth } = loader(module_, module_.exports, require);

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ " + msg); }
}
function section(t) { console.log("\n" + t); }

const site = (id, url, over) => ({ id, name: id, url, desc: "", account: "", icon: "", category: "常用", pinned: false, addedAt: 1000, updatedAt: 1000, ...over });
const keyOf = (s) => navCloudMerge.siteKey(navCloudMerge.normalizeSite(s));

/* ------------------------------------------------------------------ */
section("A. 基础合并");

{
  // 本地与云端一致 → 原样保留,无回写
  const L = [site("a", "https://a.com"), site("b", "https://b.com")];
  const R = [site("a", "https://a.com"), site("b", "https://b.com")];
  const m = navCloudMerge.mergeSites(L, R, L);
  ok(m.sites.length === 2 && !m.localChanged && !m.remoteChanged, "两端一致:无变更");
}

{
  // 首次同步(无基线):并集,互不丢失
  const L = [site("a", "https://a.com")];
  const R = [site("a", "https://a.com"), site("b", "https://b.com")];
  const m = navCloudMerge.mergeSites(L, R, null);
  ok(m.sites.length === 2, "首次同步:本地缺的站点从云端补下");
}

{
  // 首次同步:本地新站上传
  const L = [site("a", "https://a.com"), site("c", "https://c.com")];
  const R = [site("a", "https://a.com")];
  const m = navCloudMerge.mergeSites(L, R, null);
  ok(m.sites.length === 2 && m.remoteChanged, "首次同步:本地新站标记远端需更新");
}

/* ------------------------------------------------------------------ */
section("B. 删除同步");

{
  // 本地删除(基线存在) → 删除同步到云端
  const B = [site("a", "https://a.com"), site("b", "https://b.com")];
  const L = [site("a", "https://a.com")];
  const R = B;
  const m = navCloudMerge.mergeSites(L, R, B);
  ok(m.sites.length === 1 && m.sites.every((s) => s.id !== "b"), "本地删除传播到合并结果");
  ok(m.remoteChanged, "本地删除 → 标记远端需更新");
  ok(!m.localChanged, "本地删除 → 本地无需回写");
}

{
  // 云端删除 → 本地也删
  const B = [site("a", "https://a.com"), site("b", "https://b.com")];
  const L = B;
  const R = [site("a", "https://a.com")];
  const m = navCloudMerge.mergeSites(L, R, B);
  ok(m.sites.length === 1 && m.localChanged, "云端删除 → 本地删除并回写");
}

{
  // 修改胜过删除:本地删除、云端改过 → 保留云端版本
  const B = [site("a", "https://a.com")];
  const L = [];
  const R = [site("a", "https://a.com", { name: "新名字", updatedAt: 2000 })];
  const m = navCloudMerge.mergeSites(L, R, B);
  ok(m.sites.length === 1 && m.sites[0].name === "新名字", "修改胜过删除:云端修改被保留");
}

/* ------------------------------------------------------------------ */
section("C. 冲突裁决");

{
  // 两端同站不同内容 → updatedAt 新者胜
  const B = [site("a", "https://a.com")];
  const L = [site("a", "https://a.com", { name: "本地新", updatedAt: 5000 })];
  const R = [site("a", "https://a.com", { name: "云端旧", updatedAt: 2000 })];
  const m = navCloudMerge.mergeSites(L, R, B);
  ok(m.sites[0].name === "本地新", "冲突:updatedAt 新者胜(本地新)");
  ok(m.remoteChanged && !m.localChanged, "冲突:仅需回写远端");
}

{
  // 两端同站不同内容 → 云端新
  const B = [site("a", "https://a.com")];
  const L = [site("a", "https://a.com", { name: "本地旧", updatedAt: 1000 })];
  const R = [site("a", "https://a.com", { name: "云端新", updatedAt: 9000 })];
  const m = navCloudMerge.mergeSites(L, R, B);
  ok(m.sites[0].name === "云端新" && m.localChanged, "冲突:updatedAt 新者胜(云端新)");
}

{
  // 旧数据无 updatedAt:退化为 addedAt 比较,不抛错
  const B = [{ id: "a", name: "a", url: "https://a.com", desc: "", account: "", icon: "", category: "常用", pinned: false, addedAt: 100 }];
  const L = [{ id: "a", name: "本地", url: "https://a.com", desc: "", account: "", icon: "", category: "常用", pinned: false, addedAt: 300 }];
  const R = [{ id: "a", name: "云端", url: "https://a.com", desc: "", account: "", icon: "", category: "常用", pinned: false, addedAt: 200 }];
  const m = navCloudMerge.mergeSites(L, R, B);
  ok(m.sites[0].name === "本地", "无 updatedAt 旧数据:addedAt 兜底裁决");
}

/* ------------------------------------------------------------------ */
section("D. 归一化与容错");

{
  // 非法记录被滤除,字段被截断
  const raw = [
    null,
    { name: "x", url: "chrome://settings" },
    site("a", "https://a.com", { name: "n".repeat(100), desc: "d".repeat(200) }),
  ];
  const n = raw.map((r) => navCloudMerge.normalizeSite(r)).filter(Boolean);
  ok(n.length === 1, "非法记录(null/chrome://)被滤除");
  ok(n[0].name.length === 60 && n[0].desc.length === 80, "超长字段截断到 60/80");
}

{
  // 无 id 记录按规范化 url 作为合并键
  const L = [{ name: "a", url: "https://a.com/", category: "常用" }];
  const R = [{ name: "a2", url: "https://a.com", category: "常用", updatedAt: 9000 }];
  const m = navCloudMerge.mergeSites(L, R, null);
  ok(m.sites.length === 1, "无 id 站点按规范化 url 合并为一");
}

/* ------------------------------------------------------------------ */
section("E. 分类配置合并");

{
  const base = { categoryOrder: ["常用", "开发"], categoryMap: { 常用: "日常" }, hidden: ["https://x.com"] };
  // 本地改了排序,云端没动 → 取本地
  let m = navCloudMerge.mergeArray(["开发", "常用"], ["常用", "开发"], ["常用", "开发"]);
  ok(JSON.stringify(m) === JSON.stringify(["开发", "常用"]), "数组合并:仅本地变 → 取本地");
  // 云端改了,本地没动 → 取云端
  m = navCloudMerge.mergeArray(["常用", "开发"], ["工具", "常用"], ["常用", "开发"]);
  ok(JSON.stringify(m) === JSON.stringify(["工具", "常用"]), "数组合并:仅云端变 → 取云端");
  // 都没变 → 原样
  m = navCloudMerge.mergeArray(["常用"], ["常用"], ["常用"]);
  ok(JSON.stringify(m) === JSON.stringify(["常用"]), "数组合并:无变化 → 原样");

  // 对象键级合并
  const mo = navCloudMerge.mergeObject(
    { 常用: "日常", 开发: "coding" },            // 本地:改了"开发"
    { 常用: "日常2" },                            // 云端:改了"常用"
    { 常用: "日常" }                              // 基线
  );
  ok(mo["常用"] === "日常2" && mo["开发"] === "coding", "对象合并:各端改动键互不覆盖");
  void base;
}

/* ------------------------------------------------------------------ */
section("F. 安全熔断与配额防御");

{
  // 1. 超大 Base64 图标过滤
  const big = navCloudMerge.normalizeSite({
    name: "big",
    url: "https://big.com",
    icon: "data:image/png;base64," + "A".repeat(5000),
  });
  ok(big.icon === "", "超大 Data URL (>2KB) 被自动清空,防 storage.sync 8KB 配额溢出");

  const small = navCloudMerge.normalizeSite({
    name: "small",
    url: "https://small.com",
    icon: "https://small.com/favicon.ico",
  });
  ok(small.icon === "https://small.com/favicon.ico", "标准 HTTP 图标正常保留");
}

{
  // 2. 模拟 runSync 大批量误删熔断保护
  const origDownload = navCloud.download;
  const origLoadState = navCloud.loadState;
  const origUpload = navCloud.upload;
  const origSaveState = navCloud.saveState;

  // 场景：本地 10 个站点，远程由于新建变为空，基线记录了 10 个站点
  const localList = Array.from({ length: 10 }, (_, i) => site(`s${i}`, `https://s${i}.com`));
  navCloud.download = async () => ({
    gistId: "gist-new",
    content: { sites: [], hiddenDefaults: [], categoryOrder: [], categoryMap: {} },
    htmlUrl: "https://gist.github.com/new",
  });
  navCloud.loadState = async () => ({
    gistId: "gist-old", // 跨 Gist 测试
    sites: localList,
    hiddenDefaults: [],
    categoryOrder: [],
    categoryMap: {},
  });
  let uploadedPayload = null;
  navCloud.upload = async (payload) => { uploadedPayload = payload; return true; };
  navCloud.saveState = async () => {};

  await (async () => {
    const res = await navCloud.runSync({
      sites: localList,
      hiddenDefaults: [],
      categoryOrder: [],
      categoryMap: {},
    });
    ok(res.merged.sites.length === 10, "大批量删除熔断：远程为空时拒绝清空本地 10 个站点");
    ok(!res.localChanged, "大批量删除熔断：本地不发生破坏性回写");
    ok(res.uploaded && uploadedPayload && uploadedPayload.sites.length === 10, "大批量删除熔断：将本地数据补写同步至新远端");
  })();

  // 恢复 mock
  navCloud.download = origDownload;
  navCloud.loadState = origLoadState;
  navCloud.upload = origUpload;
  navCloud.saveState = origSaveState;
}

{
  // 3. findOrCreateGist 网络错误不应静默降级新建 Gist
  const origApi = navCloud._api;
  const origLoad = navCloudAuth.load;
  navCloudAuth.load = async () => ({ token: "dummy-token", gistId: "dummy-gist-id" });

  navCloud._api = async (path) => {
    if (path.includes("dummy-gist-id")) {
      const err = new Error("NETWORK_ERROR");
      err.code = "NETWORK_ERROR";
      throw err;
    }
    return { ok: true, json: async () => ({ files: {} }) };
  };

  await (async () => {
    let threw = false;
    try {
      await navCloud.findOrCreateGist(null, "dummy-token");
    } catch (e) {
      threw = (e && e.code === "NETWORK_ERROR");
    }
    ok(threw, "校验已有 Gist 遇网络错误时中止抛出，绝不静默新建空白 Gist");
  })();

  // 恢复 mock
  navCloud._api = origApi;
  navCloudAuth.load = origLoad;
}

console.log(`\n===== cloud 合并测试: ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
