#!/bin/bash
# nav-guide 一键平滑更新脚本 (0 数据丢失)
set -e

echo "=========================================="
echo "🚀 正在更新 nav-guide 导航扩展..."
echo "=========================================="

if [ -d ".git" ]; then
  git pull
  echo "✅ 成功拉取最新代码！"
else
  echo "⚠️ 当前目录非 git 仓库，请直接覆盖解压新文件。"
fi

echo ""
echo "📌 生效指引："
echo "1. 打开 Chrome 浏览器，在地址栏输入 chrome://extensions"
echo "2. 找到「nav-guide 导航」"
echo "3. 点击卡片右下角的「重新加载 ⟳」按钮即可无缝生效"
echo "✨ 所有站点、分类与 Google 云同步数据均已安全保留。"
echo "=========================================="
