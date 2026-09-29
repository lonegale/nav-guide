/* ==========================================================================
   background service worker:右键菜单快捷添加当前页到导航
   依赖:common.js(importScripts)
   ========================================================================== */
importScripts("common.js");

const MENU_ID = "nav-guide-add";

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "添加到导航",
    contexts: ["page", "frame", "selection"],
  });

  // 扩展升级时的自动安全快照与兼容处理
  if (details.reason === "update") {
    const prevVer = details.previousVersion || "unknown";
    const currVer = chrome.runtime.getManifest().version;
    console.log(`[nav-guide] 扩展已平滑升级: v${prevVer} -> v${currVer}`);
    try {
      const data = await navStorage.get([NAV_STORAGE_KEY]);
      if (data && Array.isArray(data[NAV_STORAGE_KEY]) && data[NAV_STORAGE_KEY].length > 0) {
        await chrome.storage.local.set({
          [`navBackup_v${prevVer}_${Date.now()}`]: {
            version: prevVer,
            backedUpAt: Date.now(),
            sites: data[NAV_STORAGE_KEY],
          }
        });
      }
    } catch (e) {
      console.warn("[nav-guide] 升级自动快照异常:", e);
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || !tab.url) return;

  if (!navIsCollectableUrl(tab.url)) {
    flashBadge("✗", "#ef4444"); // 页面类型不支持
    return;
  }

  const res = await navStorage.get([NAV_STORAGE_KEY]);
  const sites = Array.isArray(res && res[NAV_STORAGE_KEY]) ? res[NAV_STORAGE_KEY] : [];

  if (navFindSite(sites, tab.url)) {
    flashBadge("已有", "#f59e0b"); // 已收藏过,不重复添加
    return;
  }

  // 右键快速添加:默认名称用选中文本,否则用页面标题/域名
  const name = (info.selectionText && info.selectionText.trim()) ||
    tab.title || new URL(tab.url).hostname;

  sites.push({
    id: navSiteId(),
    name,
    url: tab.url,
    desc: "",
    account: "",
    icon: (tab.favIconUrl && (!tab.favIconUrl.startsWith("data:") || tab.favIconUrl.length <= 2048)) ? tab.favIconUrl : "",
    category: NAV_QUICK_CATEGORY,
    addedAt: Date.now(),
  });

  await navStorage.set({ [NAV_STORAGE_KEY]: sites });
  flashBadge("✓", "#6366f1");
});

/* 扩展图标上短暂显示角标反馈 */
function flashBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor({ color: "#ffffff" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}
