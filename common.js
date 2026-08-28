/* ==========================================================================
   nav-guide 共享层:全局配置 + 常量 + 纯工具函数
   被 index.html(新标签页)、popup.html(扩展弹窗)、background.js(右键菜单)共用,
   不得依赖页面 DOM 或 chrome.* API。
   ========================================================================== */

const NAV_STORAGE_KEY = "navSites";          // chrome.storage.local 键:用户站点数组
const NAV_HIDDEN_KEY = "navHiddenDefaults";  // chrome.storage.local 键:已隐藏的默认站点(normalized url 数组)
const NAV_RECENT_KEY = "navRecent";          // chrome.storage.local 键:最近使用记录 [{url,name,at}]
const NAV_CAT_ORDER_KEY = "navCategoryOrder"; // chrome.storage 键:分类名称及顺序数组
const NAV_CAT_MAP_KEY = "navCategoryMap";     // chrome.storage 键:默认分类重命名映射 { "原分类名": "新分类名" }
const NAV_QUICK_CATEGORY = "快速收藏";        // 右键快捷添加/分类删除时的默认归属分类

const CONFIG = {
  title: "nav-guide · 导航",
  background: "", // 可选：自定义壁纸 URL，留空使用纯 CSS 动态渐变光斑
  engines: [
    { name: "Google", url: "https://www.google.com/search?q=%s" },
    { name: "Bing",   url: "https://www.bing.com/search?q=%s" },
    { name: "百度",   url: "https://www.baidu.com/s?wd=%s" },
    { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  ],
  categories: [
    {
      name: "常用",
      sites: [
        { name: "GitHub", url: "https://github.com", desc: "代码托管与全球开源社区", icon: "" },
        { name: "Vercel", url: "https://vercel.com", desc: "现代 Web 应用部署平台", icon: "" },
        { name: "Gmail", url: "https://mail.google.com", desc: "Google 邮箱服务", icon: "" },
        { name: "YouTube", url: "https://www.youtube.com", desc: "全球流媒体视频网站", icon: "" },
        { name: "哔哩哔哩", url: "https://www.bilibili.com", desc: "国内优质弹幕视频平台", icon: "" },
        { name: "知乎", url: "https://www.zhihu.com", desc: "中文互联网深度问答社区", icon: "" },
      ],
    },
    {
      name: "开发",
      sites: [
        { name: "MDN Web", url: "https://developer.mozilla.org", desc: "权威前端开发权威参考", icon: "" },
        { name: "Stack Overflow", url: "https://stackoverflow.com", desc: "程序员技术问答平台", icon: "" },
        { name: "Node.js", url: "https://nodejs.org", desc: "JavaScript 服务端运行时", icon: "" },
        { name: "npm", url: "https://www.npmjs.com", desc: "JavaScript 开源包管理", icon: "" },
        { name: "Docker Hub", url: "https://hub.docker.com", desc: "容器镜像仓库与分发", icon: "" },
        { name: "Devv AI", url: "https://devv.ai", desc: "面向开发者的下一代 AI 搜索", icon: "" },
      ],
    },
    {
      name: "工具",
      sites: [
        { name: "ChatGPT", url: "https://chatgpt.com", desc: "OpenAI 智能对话助手", icon: "" },
        { name: "Claude", url: "https://claude.ai", desc: "Anthropic 智能助手", icon: "" },
        { name: "Figma", url: "https://www.figma.com", desc: "云端协作界面原型设计", icon: "" },
        { name: "DeepL", url: "https://www.deepl.com/translator", desc: "极高准确度 AI 翻译", icon: "" },
        { name: "TinyPNG", url: "https://tinypng.com", desc: "高效智能图片压缩工具", icon: "" },
        { name: "Can I use", url: "https://caniuse.com", desc: "前端特性浏览器兼容性查验", icon: "" },
      ],
    },
    {
      name: "娱乐",
      sites: [
        { name: "Spotify", url: "https://open.spotify.com", desc: "全球音乐播客流媒体", icon: "" },
        { name: "Netflix", url: "https://www.netflix.com", desc: "优质影视剧流媒体", icon: "" },
        { name: "Steam", url: "https://store.steampowered.com", desc: "全球最大 PC 游戏社区", icon: "" },
        { name: "豆瓣", url: "https://www.douban.com", desc: "电影书影音评分社区", icon: "" },
        { name: "少数派", url: "https://sspai.com", desc: "优质高效数字生活指南", icon: "" },
        { name: "掘金", url: "https://juejin.cn", desc: "掘金技术成长社区", icon: "" },
      ],
    },
  ],
};

/* 站点可收藏协议(排除 chrome:// 等浏览器内部页面) */
function navIsCollectableUrl(url) {
  return typeof url === "string" && /^https?:/i.test(url);
}

/* URL 规范化:去 hash、去末尾斜杠,用于重复检测 */
function navNormalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.origin + u.pathname.replace(/\/+$/, "") + u.search;
  } catch (e) {
    return url;
  }
}

/* 在站点数组中查找与 url 匹配的站点(规范化比较),返回元素或 undefined */
function navFindSite(sites, url) {
  const n = navNormalizeUrl(url);
  return (sites || []).find(s => navNormalizeUrl(s.url) === n);
}

/* 生成站点唯一 id */
function navSiteId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "site-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/* ==========================================================================
   navStorage: 统一存储抽象层 (Google 账号 Sync 优先 + Local 高速缓存兜底 + 自动迁移)
   ========================================================================== */
const navStorage = {
  get hasSync() {
    return typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.sync);
  },
  get hasLocal() {
    return typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.local);
  },

  /* 读取数据:优先读 sync,若 sync 为空但 local 有数据则自动同步到 sync */
  async get(keys) {
    if (!this.hasLocal && !this.hasSync) return {};
    const keyList = Array.isArray(keys) ? keys : [keys];
    let syncRes = {};
    let localRes = {};

    if (this.hasSync) {
      try {
        syncRes = (await new Promise((resolve) => chrome.storage.sync.get(keyList, resolve))) || {};
      } catch (e) {
        console.warn("[navStorage] sync.get error:", e);
      }
    }

    if (this.hasLocal) {
      try {
        localRes = (await new Promise((resolve) => chrome.storage.local.get(keyList, resolve))) || {};
      } catch (e) {
        console.warn("[navStorage] local.get error:", e);
      }
    }

    const result = {};
    const needMigrateToSync = {};

    for (const k of keyList) {
      // navRecent 属于高频本地历史记录,主要走 local 存储
      if (k === NAV_RECENT_KEY) {
        result[k] = localRes[k] !== undefined ? localRes[k] : syncRes[k];
        continue;
      }

      if (syncRes && syncRes[k] !== undefined && syncRes[k] !== null) {
        result[k] = syncRes[k];
        // 保持 local 副本最新
        if (this.hasLocal && JSON.stringify(localRes[k]) !== JSON.stringify(syncRes[k])) {
          chrome.storage.local.set({ [k]: syncRes[k] });
        }
      } else if (localRes && localRes[k] !== undefined && localRes[k] !== null) {
        // 老用户升级或离线产生的数据: 自动同步至 Google Sync
        result[k] = localRes[k];
        needMigrateToSync[k] = localRes[k];
      } else {
        result[k] = undefined;
      }
    }

    if (this.hasSync && Object.keys(needMigrateToSync).length > 0) {
      try {
        await new Promise((resolve) => chrome.storage.sync.set(needMigrateToSync, resolve));
      } catch (e) {
        console.warn("[navStorage] auto-migrate to sync error:", e);
      }
    }

    return result;
  },

  /* 写入数据: 双写模式 (写入 sync + 镜像到 local) */
  async set(items) {
    if (!items || typeof items !== "object") return;
    const syncItems = {};
    const localItems = {};

    for (const [k, v] of Object.entries(items)) {
      localItems[k] = v;
      // navRecent 存 local,其余核心配置与站点存 sync
      if (k !== NAV_RECENT_KEY) {
        syncItems[k] = v;
      }
    }

    const promises = [];
    if (this.hasLocal && Object.keys(localItems).length > 0) {
      promises.push(new Promise((resolve) => chrome.storage.local.set(localItems, resolve)));
    }
    if (this.hasSync && Object.keys(syncItems).length > 0) {
      promises.push(
        new Promise((resolve) => {
          chrome.storage.sync.set(syncItems, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              console.warn("[navStorage] sync.set warning:", chrome.runtime.lastError.message);
            }
            resolve();
          });
        })
      );
    }

    await Promise.all(promises);
  },

  /* 移除特定键 */
  async remove(keys) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const promises = [];
    if (this.hasLocal) promises.push(new Promise((r) => chrome.storage.local.remove(keyList, r)));
    if (this.hasSync) promises.push(new Promise((r) => chrome.storage.sync.remove(keyList, r)));
    await Promise.all(promises);
  }
};

