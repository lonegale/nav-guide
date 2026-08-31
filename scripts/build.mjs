import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.resolve(ROOT, "dist");
const STAGING = path.resolve(ROOT, ".staging");
let KEY_FILE = path.resolve(ROOT, "key.pem");

// 如果环境变量传入了私钥 (GitHub Actions Secrets)
if (process.env.CRX_PRIVATE_KEY) {
  KEY_FILE = path.resolve(ROOT, ".temp-key.pem");
  fs.writeFileSync(KEY_FILE, process.env.CRX_PRIVATE_KEY);
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(ROOT, "manifest.json"), "utf8"));
const VERSION = manifest.version;
const APP_ID = "njogdhegfdcojlflfichbpekgnacaknp";
const BASE_URL = "https://lonegale.github.io/nav-guide";

console.log(`🔨 [nav-guide build] 开始打包 v${VERSION}...`);

// 1. 清理并创建目录
fs.rmSync(DIST, { recursive: true, force: true });
fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(STAGING, { recursive: true });

// 2. 复制扩展运行时文件到暂存目录
const RUNTIME_FILES = [
  "manifest.json",
  "background.js",
  "common.js",
  "cloud.js",
  "index.html",
  "index.js",
  "popup.html",
  "popup.js",
  "icons",
];

for (const item of RUNTIME_FILES) {
  const src = path.resolve(ROOT, item);
  const dest = path.resolve(STAGING, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    // 同时复制一份到 dist 作为 GitHub Pages 静态网页
    fs.cpSync(src, path.resolve(DIST, item), { recursive: true });
  }
}

// 3. 生成 updates.xml
const updatesXml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${APP_ID}'>
    <updatecheck codebase='${BASE_URL}/nav-guide.crx' version='${VERSION}' />
  </app>
</gupdate>
`;
fs.writeFileSync(path.resolve(DIST, "updates.xml"), updatesXml.trim());

// 4. 生成 version.json
const versionJson = {
  version: VERSION,
  appId: APP_ID,
  updatedAt: new Date().toISOString(),
  crxUrl: `${BASE_URL}/nav-guide.crx`,
  zipUrl: `${BASE_URL}/nav-guide.zip`,
  updateUrl: `${BASE_URL}/updates.xml`,
};
fs.writeFileSync(path.resolve(DIST, "version.json"), JSON.stringify(versionJson, null, 2));

// 5. 打包 ZIP
try {
  execSync(`cd "${STAGING}" && zip -q -r "${path.resolve(DIST, 'nav-guide.zip')}" .`);
  console.log(`✅ 成功生成 zip 包: dist/nav-guide.zip`);
} catch (e) {
  console.warn("⚠️ zip 打包警告:", e.message);
}

// 6. 打包 CRX (通过 Chrome / Chromium CLI)
let packedCrx = false;
if (fs.existsSync(KEY_FILE)) {
  const CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "google-chrome",
    "chromium",
  ];

  for (const bin of CHROME_CANDIDATES) {
    try {
      execSync(`"${bin}" --pack-extension="${STAGING}" --pack-extension-key="${KEY_FILE}" --headless=new 2>/dev/null`);
      const generatedCrx = path.resolve(ROOT, ".staging.crx");
      if (fs.existsSync(generatedCrx)) {
        fs.renameSync(generatedCrx, path.resolve(DIST, "nav-guide.crx"));
        packedCrx = true;
        console.log(`✅ 成功生成 crx 包: dist/nav-guide.crx`);
        break;
      }
    } catch (e) {}
  }
}

if (!packedCrx) {
  console.log("ℹ️ 仅生成 zip 与静态网页。");
}

// 7. 清理暂存与临时文件
fs.rmSync(STAGING, { recursive: true, force: true });
if (process.env.CRX_PRIVATE_KEY && fs.existsSync(KEY_FILE)) {
  fs.rmSync(KEY_FILE, { force: true });
}

console.log(`🎉 [nav-guide build] 打包完成！输出目录: dist/\n`);
