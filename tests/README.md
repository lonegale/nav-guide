# nav-guide 自动化验收脚本

依赖 playwright-core（浏览器二进制需已缓存于 `~/Library/Caches/ms-playwright`）：

```bash
npm install playwright-core        # 任意目录
python3 -m http.server 8742 &      # 从项目根目录起本地服务(纯网页模式用)
node tests/test.mjs                # 功能验收 59 项
node tests/layout.mjs              # 布局断言 7 项
```

- `test.mjs`：纯网页模式（file:// 等价）+ 真实扩展环境（加载本项目为未打包扩展）双环境
- `layout.mjs`：溢出/对齐/居中/触屏规则
- 注意：无头桌面 Chromium 恒报 `hover: hover`，触屏常显只能验证规则存在（注入法），真机复核为准
