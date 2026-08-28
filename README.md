# nav-guide · 玻璃拟态新标签页网址导航

一款轻量、极简、沉浸式毛玻璃拟态（Glassmorphism）的 Chrome 扩展导航主页。

---

## ✨ 核心特性

- 🎨 **毛玻璃拟态美学**：柔和动态浮动光斑渐变背景 + 系统级毛玻璃卡片质感，支持亮色/暗色/跟随系统三态。
- 🔍 **聚合多引擎搜索**：居中大胶囊搜索框，内置 Google / Bing / 百度 / DuckDuckGo，支持 `Tab` 快捷键切源、`/` 全局聚焦。
- 📌 **快捷收藏与账号备注**：
  - 点击插件图标或网页右键一键添加到导航。
  - 支持站点置顶、自定义分类管理、敏感账号独立弹层展示。
- ☁️ **Google 账号原生云同步 (0 额外费用)**：
  - 全量接入 `chrome.storage.sync`，所有站点、分类与账号备注自动随 Google 账号在云端多设备实时双向同步。
  - 换机、重装、误删插件秒级自动拉取恢复，**0 数据丢失**。
- 🔑 **永久固定 Extension ID**：内置固定 RSA 公钥，确保在任意电脑上加载均绑定同一个扩展身份。
- ⚡ **零构建零依赖**：原生纯 JS/CSS/HTML 开发，无打包负担，打开即用。

---

## 📦 安装指南

1. **下载或克隆仓库**：
   ```bash
   git clone https://github.com/lonegale/nav-guide.git
   ```
2. **在 Chrome 中加载**：
   - 打开 Chrome 浏览器，在地址栏输入 `chrome://extensions`。
   - 开启右上角的 **「开发者模式」**。
   - 点击左上角 **「加载已解压的扩展程序」**，选择本项目文件夹即可。

---

## 🔄 平滑更新指南 (多端同步)

### 1. 开发机更新代码后推送：
```bash
git add .
git commit -m "feat: your changes"
git push
```

### 2. 其他电脑一键拉取更新：
```bash
./update.sh
```
更新后在 `chrome://extensions` 点击卡片右下角的 **「重新加载 (⟳ 刷新按钮)」** 即可无缝生效，**所有自定义数据永久保留并自动云同步**。

---

## 🧪 自动化测试

```bash
# 1. 安装测试依赖
npm install

# 2. 启动本地服务并运行验收测试
python3 -m http.server 8742 &
node tests/test.mjs    # 64 项功能与云同步验收
node tests/layout.mjs  # 9 项响应式布局断言
```
