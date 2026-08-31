# nav-guide · 玻璃拟态新标签页网址导航

一款轻量、极简、沉浸式毛玻璃拟态（Glassmorphism）的 Chrome 扩展导航主页。

---

## ✨ 核心特性

- 🎨 **毛玻璃拟态美学**：柔和动态浮动光斑渐变背景 + 系统级毛玻璃卡片质感，支持亮色/暗色/跟随系统三态。
- 🔍 **聚合多引擎搜索**：居中大胶囊搜索框，内置 Google / Bing / 百度 / DuckDuckGo，支持 `Tab` 快捷键切源、`/` 全局聚焦。
- 📌 **快捷收藏与账号备注**：
  - 点击插件图标或网页右键一键添加到导航。
  - 支持站点置顶、自定义分类管理、敏感账号独立弹层展示。
- ☁️ **GitHub Gist 云同步（Secret Gist + PAT，零后端）**：
  - 站点、分类与账号备注同步到你 GitHub 账号的**私有 Secret Gist**（仅持 Token 可读写），多设备填入同一 Token 即自动同步。
  - 天然自带 Git 历史版本记录，误删可在 GitHub 页面查阅并回滚。
  - 修改后自动 3 秒防抖上传，每 5 分钟自动拉取远端变更；同步采用**三方合并**（本地/云端/上次同步基线），删除、冲突按“修改时间新者胜、修改胜过删除”裁决，不丢数据。
  - 仅需 1 分钟生成带 `gist` 权限的 GitHub Token 填入插件，无需自建服务器或申请 Google Cloud 项目。
- 🔑 **永久固定 Extension ID**：内置固定 RSA 公钥，确保在任意电脑上加载均绑定同一个扩展身份。
- ⚡ **零构建零依赖**：原生纯 JS/CSS/HTML 开发，无打包负担，打开即用。

---

## ☁️ 云同步配置（约 1 分钟）

扩展使用 GitHub 官方 Gist REST API 存储私有同步数据，无需部署任何服务端。

1. 打开 GitHub 生成 Token：[GitHub New Personal Access Token](https://github.com/settings/tokens/new?scopes=gist&description=nav-guide)。
2. 填写 Token 描述（如 `nav-guide`），**勾选 `gist` 权限**（创建与管理代码片段），点击最下方 **「Generate token」**。
3. 复制生成的 Token（以 `ghp_` 开头）。
4. 打开导航页，右上角 ⚙️ → 「云同步」→ 粘贴 Token → 点击 **「保存并同步」** 即可。

同步行为：本地改动 3 秒后自动上传；每 5 分钟自动拉取远端；多端冲突按站点级 `updatedAt` 新者胜，删除可跨端传播（有上次同步基线佐证时生效，修改永远胜过删除）。点击弹窗内的「在 GitHub 查看 Gist」可直达网页端查看数据与历史提交。

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

## 🔄 平滑更新指南

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
更新后在 `chrome://extensions` 点击卡片右下角的 **「重新加载 (⟳ 刷新按钮)」** 即可无缝生效，**所有自定义数据保存在本机 `chrome.storage` 中，重载/更新不会丢失**（卸载扩展仍会清空存储，但只要配置了云同步或导出备份即可一键恢复）。

---

## 🧪 自动化测试

```bash
# 1. 安装测试依赖
npm install

# 2. 启动本地服务并运行验收测试
python3 -m http.server 8742 &
npm test                           # 功能与布局验收测试
node tests/cloud.test.mjs          # 云同步合并逻辑单测 19 项
```
