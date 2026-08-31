/* ==========================================================================
   nav-guide 应用逻辑(新标签页 / file:// 双环境)
   依赖:common.js(需先于本文件加载)
   ========================================================================== */
(function () {
  // DOM Elements
  const htmlEl = document.documentElement;
  const searchInput = document.getElementById("searchInput");
  const searchCapsule = document.getElementById("searchCapsule");
  const engineBtn = document.getElementById("engineBtn");
  const currentEngineName = document.getElementById("currentEngineName");
  const engineDropdown = document.getElementById("engineDropdown");
  const categoriesContainer = document.getElementById("categoriesContainer");
  const sideCategoryNav = document.getElementById("sideCategoryNav");
  const themeBtn = document.getElementById("themeBtn");
  const themeIcon = document.getElementById("themeIcon");
  const addBtn = document.getElementById("addBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsDropdown = document.getElementById("settingsDropdown");
  const importFile = document.getElementById("importFile");
  const noResult = document.getElementById("noResult");
  const toastEl = document.getElementById("toast");

  const NEW_CAT = "__new__";

  // Set Document Title
  if (CONFIG.title) {
    document.title = CONFIG.title;
  }

  // ------------------------------------------------------------------------
  // 0. 小工具:HTML 转义 / toast 轻提示
  // ------------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  let toastTimer = null;
  function toast(msg, action) {
    toastEl.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = msg;
    toastEl.appendChild(span);
    if (action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast-action";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        action.onClick();
        hideToast();
      });
      toastEl.appendChild(btn);
    }
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 5000 : 3200);
  }
  function hideToast() {
    toastEl.classList.remove("show");
    clearTimeout(toastTimer);
  }

  // ------------------------------------------------------------------------
  // 1. Theme Management (auto -> light -> dark -> auto)
  // ------------------------------------------------------------------------
  const THEMES = ["auto", "light", "dark"];
  let currentTheme = localStorage.getItem("nav-theme") || "auto";

  const THEME_ICONS = {
    auto: `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 3a9 9 0 0 1 0 18v-18z" fill="currentColor"></path>
    `,
    light: `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `,
    dark: `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    `
  };

  const THEME_LABELS = {
    auto: "跟随系统 (Auto)",
    light: "浅色模式 (Light)",
    dark: "深色模式 (Dark)"
  };

  function applyTheme(theme) {
    htmlEl.setAttribute("data-theme", theme);
    themeIcon.innerHTML = THEME_ICONS[theme];
    themeBtn.setAttribute("title", `当前主题：${THEME_LABELS[theme]} (点击切换)`);
  }

  function toggleTheme() {
    const nextIndex = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
    currentTheme = THEMES[nextIndex];
    localStorage.setItem("nav-theme", currentTheme);
    applyTheme(currentTheme);

    // 旋转微动效
    themeIcon.style.transform = "rotate(360deg)";
    setTimeout(() => {
      themeIcon.style.transform = "none";
    }, 400);
  }

  themeBtn.addEventListener("click", toggleTheme);
  applyTheme(currentTheme);

  // 监听系统主题变更（当为 auto 态时实时感知）
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentTheme === "auto") {
      applyTheme("auto");
    }
  });

  // ------------------------------------------------------------------------
  // 2. Search Engine Management
  // ------------------------------------------------------------------------
  let currentEngineIndex = 0;
  const savedEngineName = localStorage.getItem("nav-engine");
  if (savedEngineName) {
    const idx = CONFIG.engines.findIndex(e => e.name === savedEngineName);
    if (idx !== -1) currentEngineIndex = idx;
  }

  function renderEngineDropdown() {
    engineDropdown.innerHTML = "";
    CONFIG.engines.forEach((eng, index) => {
      const btn = document.createElement("button");
      btn.className = `engine-option ${index === currentEngineIndex ? "active" : ""}`;
      btn.textContent = eng.name;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        setEngine(index);
        closeEngineDropdown();
        searchInput.focus();
      });
      engineDropdown.appendChild(btn);
    });
  }

  function setEngine(index) {
    currentEngineIndex = index;
    const eng = CONFIG.engines[currentEngineIndex];
    currentEngineName.textContent = eng.name;
    localStorage.setItem("nav-engine", eng.name);
    renderEngineDropdown();
  }

  function cycleEngine() {
    const nextIndex = (currentEngineIndex + 1) % CONFIG.engines.length;
    setEngine(nextIndex);
  }

  function toggleEngineDropdown() {
    const isOpen = engineDropdown.classList.contains("open");
    if (isOpen) {
      closeEngineDropdown();
    } else {
      engineDropdown.classList.add("open");
      engineBtn.setAttribute("aria-expanded", "true");
    }
  }

  function closeEngineDropdown() {
    engineDropdown.classList.remove("open");
    engineBtn.setAttribute("aria-expanded", "false");
  }

  engineBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleEngineDropdown();
  });

  setEngine(currentEngineIndex);

  // ------------------------------------------------------------------------
  // 3. Search Execution:URL 直达 / 引擎搜索 + 收藏卡片实时过滤
  // ------------------------------------------------------------------------

  /* 常见两字符 TLD 白名单:末段命中才视为直达网址,避免 "node.js" 这类查询被误判 */
  const COMMON_TLDS = new Set([
    "ai", "io", "cn", "cc", "co", "me", "tv", "gg", "sh", "so", "im", "is", "am",
    "us", "uk", "de", "fr", "jp", "kr", "ru", "in", "nz", "au", "ca", "br", "mx",
    "se", "no", "fi", "dk", "nl", "be", "ch", "at", "it", "es", "pt", "cz", "pl",
    "tr", "hk", "tw", "sg", "vn", "th", "id", "ph", "my", "ua", "ir", "pk", "bd",
    "lk", "np", "mm", "kh", "la", "li", "lu", "mc", "sk", "si", "hr", "rs", "bg",
    "ro", "hu", "ee", "lv", "lt", "by", "ge", "az", "kz", "uz",
  ]);

  function looksLikeUrl(q) {
    if (!q || /\s/.test(q)) return false;
    if (/^https?:\/\//i.test(q)) return true;
    // 无 scheme:按「主机名[端口][路径]」解析
    const m = q.match(/^(\[[0-9a-f:]+\]|[a-z0-9-]+(?:\.[a-z0-9-]+)*)(:\d+)?([\/?#].*)?$/i);
    if (!m) return false;
    if (q.startsWith("[")) return true; // IPv6
    const host = m[1];
    if (host === "localhost") return true;
    const labels = host.split(".");
    if (labels.length < 2) return false;
    const tld = labels[labels.length - 1].toLowerCase();
    return tld.length >= 3 || COMMON_TLDS.has(tld);
  }

  function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      searchInput.focus();
      return;
    }
    // URL 直达:输入网址时直接打开,而非搜索该字符串
    if (looksLikeUrl(query)) {
      const url = /^https?:/i.test(query) ? query : "https://" + query;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const engine = CONFIG.engines[currentEngineIndex];
    const searchUrl = engine.url.replace("%s", encodeURIComponent(query));
    window.open(searchUrl, "_blank", "noopener,noreferrer");
  }

  /* 过滤收藏卡片:按 名称/描述/域名/网址 匹配;过滤中隐藏「最近使用」,空分类整节隐藏 */
  function applyFilter() {
    const q = searchInput.value.trim().toLowerCase();
    const sections = categoriesContainer.querySelectorAll(".category-section");
    let visibleCount = 0;
    let visibleSections = 0;

    sections.forEach((sec) => {
      if (!q) {
        sec.classList.remove("hidden");
        sec.querySelectorAll(".site-card").forEach((c) => c.classList.remove("hidden"));
        if (!sec.dataset.recent) visibleSections++;
        return;
      }
      if (sec.dataset.recent) {
        sec.classList.add("hidden"); // 过滤时最近使用不参与,避免干扰查找
        return;
      }
      let secVisible = 0;
      sec.querySelectorAll(".site-card").forEach((card) => {
        const match = (card.dataset.search || "").includes(q);
        card.classList.toggle("hidden", !match);
        if (match) secVisible++;
      });
      sec.classList.toggle("hidden", secVisible === 0);
      if (secVisible > 0) {
        visibleSections++;
        visibleCount += secVisible;
      }
    });

    noResult.hidden = !q || visibleCount > 0;

    if (sideCategoryNav) {
      if (visibleSections <= 1) {
        sideCategoryNav.hidden = true;
      } else {
        sideCategoryNav.hidden = false;
        sideCategoryNav.querySelectorAll(".side-nav-item").forEach((item) => {
          const sec = document.querySelector(`.category-section[data-cat-name="${CSS.escape(item.dataset.cat)}"]`);
          item.classList.toggle("hidden", !sec || sec.classList.contains("hidden"));
        });
        onScrollUpdateActiveSideNav();
      }
    }
  }

  function firstVisibleCard() {
    return categoriesContainer.querySelector(".site-card:not(.hidden)");
  }

  searchInput.addEventListener("keydown", (e) => {
    // Tab 正向循环切换引擎;Shift+Tab 放行,保留键盘焦点反向导航(避免键盘陷阱)
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      cycleEngine();
      return;
    }

    // Enter:URL 直达或引擎搜索
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch();
      return;
    }

    // Esc:清空过滤,回到初始视图
    if (e.key === "Escape" && searchInput.value) {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input"));
      return;
    }

    // ↓:从搜索框进入过滤后的第一张卡片(卡片为 <a>,可直接 Enter 打开)
    if (e.key === "ArrowDown") {
      const first = firstVisibleCard();
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  searchInput.addEventListener("input", () => {
    if (searchInput.value.trim().length > 0) {
      searchCapsule.classList.add("has-value");
    } else {
      searchCapsule.classList.remove("has-value");
    }
    applyFilter();
  });

  searchInput.addEventListener("focus", () => {
    searchCapsule.classList.add("focused");
  });

  searchInput.addEventListener("blur", () => {
    searchCapsule.classList.remove("focused");
  });

  // ------------------------------------------------------------------------
  // 4. Stable Color Hash for Favicon Fallback (Level 3 Fallback)
  // ------------------------------------------------------------------------
  const FALLBACK_GRADIENTS = [
    "linear-gradient(135deg, #6366f1, #4f46e5)", // Indigo
    "linear-gradient(135deg, #ec4899, #db2777)", // Pink
    "linear-gradient(135deg, #06b6d4, #0891b2)", // Cyan
    "linear-gradient(135deg, #10b981, #059669)", // Emerald
    "linear-gradient(135deg, #f59e0b, #d97706)", // Amber
    "linear-gradient(135deg, #8b5cf6, #7c3aed)", // Purple
    "linear-gradient(135deg, #3b82f6, #2563eb)", // Blue
    "linear-gradient(135deg, #f43f5e, #e11d48)", // Rose
  ];

  function getStableGradient(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % FALLBACK_GRADIENTS.length;
    return FALLBACK_GRADIENTS[idx];
  }

  function getSiteInitial(name) {
    return (name || "").trim().charAt(0).toUpperCase() || "✦";
  }

  // ------------------------------------------------------------------------
  // 5. 用户数据层(仅扩展环境生效,file:// 下为只读展示 CONFIG)
  // ------------------------------------------------------------------------
  const IS_EXT = typeof chrome !== "undefined" && !!(chrome.storage && (chrome.storage.local || chrome.storage.sync));
  let userSites = [];
  let hiddenDefaults = []; // 已隐藏的默认站点(normalized url)
  let recent = [];         // 最近使用 [{url, name, at}]
  let categoryOrder = [];  // 分类自定义显示顺序数组
  let categoryMap = {};    // 默认分类重命名映射
  let lastSavedSignature = null; // 本页自身写入的签名,用于避免自身变动弹「已添加」toast

  function storageGet(keys) {
    return navStorage.get(keys);
  }
  function storageSet(obj) {
    return navStorage.set(obj);
  }

  function loadAll() {
    if (!IS_EXT) return Promise.resolve();
    return storageGet([NAV_STORAGE_KEY, NAV_HIDDEN_KEY, NAV_RECENT_KEY, NAV_CAT_ORDER_KEY, NAV_CAT_MAP_KEY]).then((res) => {
      userSites = Array.isArray(res[NAV_STORAGE_KEY]) ? res[NAV_STORAGE_KEY] : [];
      hiddenDefaults = Array.isArray(res[NAV_HIDDEN_KEY]) ? res[NAV_HIDDEN_KEY] : [];
      recent = Array.isArray(res[NAV_RECENT_KEY]) ? res[NAV_RECENT_KEY] : [];
      categoryOrder = Array.isArray(res[NAV_CAT_ORDER_KEY]) ? res[NAV_CAT_ORDER_KEY] : [];
      categoryMap = (res[NAV_CAT_MAP_KEY] && typeof res[NAV_CAT_MAP_KEY] === "object") ? res[NAV_CAT_MAP_KEY] : {};
    });
  }

  function saveUserSites() {
    if (!IS_EXT) return Promise.resolve();
    lastSavedSignature = JSON.stringify(userSites);
    return storageSet({ [NAV_STORAGE_KEY]: userSites });
  }

  function saveCategoryState() {
    if (!IS_EXT) return Promise.resolve();
    return storageSet({
      [NAV_CAT_ORDER_KEY]: categoryOrder,
      [NAV_CAT_MAP_KEY]: categoryMap,
    });
  }

  function saveAllCategoryState() {
    if (!IS_EXT) return Promise.resolve();
    lastSavedSignature = JSON.stringify(userSites);
    return storageSet({
      [NAV_STORAGE_KEY]: userSites,
      [NAV_HIDDEN_KEY]: hiddenDefaults,
      [NAV_CAT_ORDER_KEY]: categoryOrder,
      [NAV_CAT_MAP_KEY]: categoryMap,
    });
  }

  function getAllCategoryNames() {
    const names = new Set();
    if (Array.isArray(categoryOrder)) {
      categoryOrder.forEach((n) => { if (n && n.trim()) names.add(n.trim()); });
    }
    CONFIG.categories.forEach((c) => {
      const n = (categoryMap && categoryMap[c.name]) || c.name;
      names.add(n);
    });
    userSites.forEach((s) => {
      if (s.category && s.category.trim()) names.add(s.category.trim());
    });

    const orderList = Array.isArray(categoryOrder) ? categoryOrder : [];
    return Array.from(names).sort((a, b) => {
      const ia = orderList.indexOf(a);
      const ib = orderList.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });
  }

  function getCustomCategoryNames() {
    const defaultNames = new Set(CONFIG.categories.map((c) => (categoryMap && categoryMap[c.name]) || c.name));
    const names = new Set(userSites.map((s) => s.category));
    defaultNames.forEach((n) => names.delete(n));
    return [...names];
  }

  // ------------------------------------------------------------------------
  // 5.5 云同步编排(仅扩展环境且已配置 OAuth 客户端时启用)
  //     策略:本地任何写变更后防抖 3s 上传;每 5 分钟拉取远端;手动「立即同步」。
  //     回写本地走 navStorage.set → storage.onChanged → 重渲染,与 popup/右键同路径。
  // ------------------------------------------------------------------------
  const cloudModal = document.getElementById("cloudModal");
  const cloudModalTitle = document.getElementById("cloudModalTitle");
  const cloudSyncBtn = document.getElementById("cloudSyncBtn");
  const cloudStatusEl = document.getElementById("cloudStatus");
  const cloudTokenGroup = document.getElementById("cloudTokenGroup");
  const cloudTokenInput = document.getElementById("cloudTokenInput");
  const cloudToggleTokenVisibility = document.getElementById("cloudToggleTokenVisibility");
  const cloudConnectedInfo = document.getElementById("cloudConnectedInfo");
  const cloudGistLink = document.getElementById("cloudGistLink");
  const cloudSaveBtn = document.getElementById("cloudSaveBtn");
  const cloudSkipBtn = document.getElementById("cloudSkipBtn");
  const cloudSyncNowBtn = document.getElementById("cloudSyncNowBtn");
  const cloudLogoutBtn = document.getElementById("cloudLogoutBtn");

  const CLOUD_PULL_INTERVAL = 5 * 60 * 1000; // 远端拉取周期 (5分钟)
  const CLOUD_UPLOAD_DEBOUNCE = 3000;        // 本地变更后防抖上传 (3秒)
  let cloudLoggedIn = false;
  let cloudSyncing = false;       // 单飞行锁:防止上传回写再触发上传的循环
  let cloudCurrentUser = "";
  let cloudGistUrl = "";
  let cloudUploadTimer = null;
  let cloudPullTimer = null;

  /* 收集当前本地数据快照(合并的输入) */
  function cloudLocalData() {
    return {
      sites: userSites,
      hiddenDefaults,
      categoryOrder,
      categoryMap,
    };
  }

  /* 同步结果回写本地存储(不直接改内存变量,统一走 onChanged 通路) */
  async function cloudApplyMerged(merged) {
    await storageSet({
      [NAV_STORAGE_KEY]: merged.sites,
      [NAV_HIDDEN_KEY]: merged.hiddenDefaults,
      [NAV_CAT_ORDER_KEY]: merged.categoryOrder,
      [NAV_CAT_MAP_KEY]: merged.categoryMap,
    });
  }

  function updateCloudStatus(state, extra) {
    if (!cloudStatusEl) return;
    if (state === "idle") {
      if (cloudModalTitle) cloudModalTitle.textContent = "云同步 (GitHub Gist)";
      cloudStatusEl.className = "cloud-status status-connected";
      cloudStatusEl.textContent = "✓ 已连接 GitHub · " + (cloudCurrentUser ? "@" + cloudCurrentUser : "已授权") + " (自动双向同步中)";
      if (cloudTokenGroup) cloudTokenGroup.hidden = true;
      if (cloudConnectedInfo) cloudConnectedInfo.hidden = false;
      if (cloudLogoutBtn) cloudLogoutBtn.hidden = false;
      if (cloudSkipBtn) cloudSkipBtn.hidden = true;
      if (cloudSaveBtn) cloudSaveBtn.hidden = true;
      if (cloudSyncNowBtn) {
        cloudSyncNowBtn.hidden = false;
        cloudSyncNowBtn.disabled = false;
      }
      if (cloudGistLink) {
        if (cloudGistUrl) {
          cloudGistLink.href = cloudGistUrl;
          cloudGistLink.hidden = false;
        } else {
          cloudGistLink.hidden = true;
        }
      }
    } else if (state === "syncing") {
      cloudStatusEl.className = "cloud-status status-syncing";
      cloudStatusEl.textContent = "⟳ 正在连接 GitHub 并同步数据…";
      if (cloudSyncNowBtn) cloudSyncNowBtn.disabled = true;
      if (cloudSaveBtn) cloudSaveBtn.disabled = true;
    } else if (state === "loggedOut") {
      if (cloudModalTitle) cloudModalTitle.textContent = "首次使用配置 (GitHub Gist)";
      cloudStatusEl.className = "cloud-status";
      cloudStatusEl.textContent = "尚未配置云同步。推荐配置 GitHub Token 开启多设备自动双向同步与防丢云备份。";
      if (cloudTokenGroup) cloudTokenGroup.hidden = false;
      if (cloudConnectedInfo) cloudConnectedInfo.hidden = true;
      if (cloudLogoutBtn) cloudLogoutBtn.hidden = true;
      if (cloudSkipBtn) cloudSkipBtn.hidden = false;
      if (cloudSaveBtn) {
        cloudSaveBtn.hidden = false;
        cloudSaveBtn.disabled = false;
      }
      if (cloudSyncNowBtn) cloudSyncNowBtn.hidden = true;
      if (cloudGistLink) cloudGistLink.hidden = true;
    } else if (state === "error") {
      cloudStatusEl.className = "cloud-status status-error";
      cloudStatusEl.textContent = extra || "同步失败，请检查 Token 或网络";
      if (cloudSyncNowBtn) cloudSyncNowBtn.disabled = false;
      if (cloudSaveBtn) cloudSaveBtn.disabled = false;
    }
  }

  /* 执行一轮同步;manual=true 时给出更明确的 toast 反馈 */
  async function cloudRunSync(manual) {
    if (!cloudLoggedIn || cloudSyncing) return;
    cloudSyncing = true;
    updateCloudStatus("syncing");
    try {
      const result = await navCloud.runSync(cloudLocalData());
      if (result.htmlUrl) cloudGistUrl = result.htmlUrl;
      if (result.localChanged) await cloudApplyMerged(result.merged);
      updateCloudStatus("idle");
      if (manual) {
        toast(result.uploaded
          ? `云同步完成：GitHub Gist 已更新（${result.merged.sites.length} 条站点）`
          : `云同步完成：本地已与 Gist 一致（${result.merged.sites.length} 条站点）`);
      }
    } catch (e) {
      if (e && e.code === "NOT_LOGGED_IN") {
        cloudLoggedIn = false;
        updateCloudStatus("loggedOut");
        if (manual) toast("云同步：Token 已失效，请重新配置");
      } else if (manual) {
        const msg = e && e.code === "NETWORK_ERROR" ? "GitHub 连接超时或网络不可用" : "云同步失败：服务暂不可用";
        toast(msg);
        updateCloudStatus("error", msg);
      } else {
        updateCloudStatus("idle");
      }
    } finally {
      cloudSyncing = false;
      if (cloudLoggedIn) updateCloudStatus("idle");
    }
  }

  /* 本地数据变更 → 防抖上传(由 storage.onChanged 驱动,自身回写因飞行锁被忽略) */
  function cloudScheduleUpload() {
    if (!cloudLoggedIn) return;
    clearTimeout(cloudUploadTimer);
    cloudUploadTimer = setTimeout(() => cloudRunSync(false), CLOUD_UPLOAD_DEBOUNCE);
  }

  async function cloudInit() {
    if (!IS_EXT || !navCloud || !navCloud.configured) return;

    if (cloudSyncBtn) cloudSyncBtn.hidden = false;

    const auth = await navCloudAuth.load();
    if (auth && auth.token) {
      cloudLoggedIn = true;
      cloudCurrentUser = auth.user || "";
      cloudGistUrl = auth.htmlUrl || "";
      updateCloudStatus("idle");
      cloudRunSync(false); // 打开页面即拉取一轮
      cloudPullTimer = setInterval(() => cloudRunSync(false), CLOUD_PULL_INTERVAL);
    } else {
      updateCloudStatus("loggedOut");
      // 未配置时在界面自动弹出配置窗口，引导用户优先配置 Token
      openCloudModal();
    }
  }

  function openCloudModal() {
    closeSettingsDropdown();
    updateCloudStatus(cloudLoggedIn ? "idle" : "loggedOut");
    if (cloudModal) cloudModal.classList.add("open");
  }

  function closeCloudModal() {
    if (cloudModal) cloudModal.classList.remove("open");
  }

  if (cloudSyncBtn) cloudSyncBtn.addEventListener("click", openCloudModal);

  if (cloudSaveBtn) {
    cloudSaveBtn.addEventListener("click", async () => {
      const token = (cloudTokenInput ? cloudTokenInput.value : "").trim();
      if (!token) {
        updateCloudStatus("error", "请输入 GitHub Personal Access Token");
        return;
      }
      cloudSaveBtn.disabled = true;
      cloudSaveBtn.textContent = "验证中…";
      updateCloudStatus("syncing");
      try {
        const userInfo = await navCloudAuth.validateToken(token);
        cloudCurrentUser = userInfo.user;
        await navCloudAuth.save({ token, user: userInfo.user });
        cloudLoggedIn = true;
        cloudSaveBtn.textContent = "保存并开启同步";
        cloudSaveBtn.disabled = false;
        if (cloudTokenInput) cloudTokenInput.value = "";
        if (!cloudPullTimer) {
          cloudPullTimer = setInterval(() => cloudRunSync(false), CLOUD_PULL_INTERVAL);
        }
        await cloudRunSync(true);
        renderCategories();
      } catch (e) {
        cloudSaveBtn.textContent = "保存并开启同步";
        cloudSaveBtn.disabled = false;
        if (e.code === "INVALID_TOKEN") {
          updateCloudStatus("error", "Token 无效或已过期，请重新创建");
        } else if (e.code === "NETWORK_ERROR") {
          updateCloudStatus("error", "连接 GitHub 失败，请检查网络");
        } else {
          updateCloudStatus("error", "验证失败: " + (e.message || "未知错误"));
        }
      }
    });
  }

  if (cloudSkipBtn) {
    cloudSkipBtn.addEventListener("click", () => {
      closeCloudModal();
      toast("已进入离线模式。数据保存在本机，可随时在右上角 ⚙️ 设置中开启云同步。");
    });
  }

  if (cloudToggleTokenVisibility) {
    cloudToggleTokenVisibility.addEventListener("click", () => {
      if (!cloudTokenInput) return;
      if (cloudTokenInput.type === "password") {
        cloudTokenInput.type = "text";
        cloudToggleTokenVisibility.textContent = "🔒";
      } else {
        cloudTokenInput.type = "password";
        cloudToggleTokenVisibility.textContent = "👁";
      }
    });
  }

  if (cloudSyncNowBtn) {
    cloudSyncNowBtn.addEventListener("click", async () => {
      if (cloudSyncing || !cloudLoggedIn) return;
      await cloudRunSync(true);
    });
  }

  if (cloudLogoutBtn) {
    cloudLogoutBtn.addEventListener("click", async () => {
      if (!cloudLoggedIn) { closeCloudModal(); return; }
      cloudLogoutBtn.textContent = "断开中…";
      cloudLogoutBtn.disabled = true;
      await navCloudAuth.clear();
      cloudLogoutBtn.textContent = "断开连接";
      cloudLogoutBtn.disabled = false;
      cloudLoggedIn = false;
      cloudCurrentUser = "";
      cloudGistUrl = "";
      clearTimeout(cloudUploadTimer);
      clearInterval(cloudPullTimer);
      cloudPullTimer = null;
      updateCloudStatus("loggedOut");
      toast("已断开 GitHub 云同步（本地数据保留）");
    });
  }

  if (cloudModal) {
    cloudModal.querySelector(".modal-close").addEventListener("click", closeCloudModal);
    cloudModal.querySelector(".modal-cancel")?.addEventListener("click", closeCloudModal);
    cloudModal.addEventListener("click", (e) => {
      if (e.target === cloudModal) closeCloudModal();
    });
  }

  /* 扩展环境下,其他入口(popup / 右键菜单 / 云同步)写入后即时刷新本页,并对外部新增给出 toast 反馈 */
  if (IS_EXT && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" && area !== "sync") return;
      let needRender = false;

      if (changes[NAV_STORAGE_KEY]) {
        const next = Array.isArray(changes[NAV_STORAGE_KEY].newValue)
          ? changes[NAV_STORAGE_KEY].newValue
          : [];
        const nextSig = JSON.stringify(next);

        if (lastSavedSignature === nextSig) {
          userSites = next;
        } else {
          const prev = userSites;
          userSites = next;
          needRender = true;
          const prevIds = new Set(prev.map((s) => s.id));
          const added = userSites.filter((s) => !prevIds.has(s.id));
          if (added.length === 1) {
            toast(`已添加「${added[0].name}」到「${added[0].category}」`);
          }
        }
      }
      if (changes[NAV_HIDDEN_KEY]) {
        hiddenDefaults = Array.isArray(changes[NAV_HIDDEN_KEY].newValue)
          ? changes[NAV_HIDDEN_KEY].newValue
          : [];
        needRender = true;
      }
      if (changes[NAV_RECENT_KEY]) {
        recent = Array.isArray(changes[NAV_RECENT_KEY].newValue)
          ? changes[NAV_RECENT_KEY].newValue
          : [];
        needRender = true;
      }
      if (changes[NAV_CAT_ORDER_KEY]) {
        categoryOrder = Array.isArray(changes[NAV_CAT_ORDER_KEY].newValue)
          ? changes[NAV_CAT_ORDER_KEY].newValue
          : [];
        needRender = true;
      }
      if (changes[NAV_CAT_MAP_KEY]) {
        categoryMap = (changes[NAV_CAT_MAP_KEY].newValue && typeof changes[NAV_CAT_MAP_KEY].newValue === "object")
          ? changes[NAV_CAT_MAP_KEY].newValue
          : {};
        needRender = true;
      }

      if (needRender) renderCategories();

      // 本地数据被任一入口改动(popup/右键/本页) → 防抖上传云端;
      // 云同步自身回写时 cloudSyncing 为真,跳过以免循环
      if (!cloudSyncing && (changes[NAV_STORAGE_KEY] || changes[NAV_HIDDEN_KEY] ||
          changes[NAV_CAT_ORDER_KEY] || changes[NAV_CAT_MAP_KEY])) {
        cloudScheduleUpload();
      }
    });
  }

  /* CONFIG 默认分类(根据 categoryMap 重命名并滤除已隐藏) + 用户站点按分类合并;
     按 categoryOrder 自定义排序;分类内置顶优先(稳定排序);空分类不渲染 */
  function getMergedCategories() {
    const hiddenSet = new Set(hiddenDefaults);

    // 1. 映射默认分类及其站点
    const mappedDefaults = new Map();
    CONFIG.categories.forEach((c) => {
      const targetName = (categoryMap && categoryMap[c.name]) || c.name;
      const visibleSites = c.sites.filter((s) => !hiddenSet.has(navNormalizeUrl(s.url)));
      if (!mappedDefaults.has(targetName)) {
        mappedDefaults.set(targetName, []);
      }
      mappedDefaults.get(targetName).push(...visibleSites);
    });

    // 2. 合并用户站点
    const allCatMap = new Map();
    for (const [name, sites] of mappedDefaults.entries()) {
      allCatMap.set(name, [...sites]);
    }
    userSites.forEach((site) => {
      const catName = site.category || NAV_QUICK_CATEGORY;
      if (!allCatMap.has(catName)) {
        allCatMap.set(catName, []);
      }
      allCatMap.get(catName).push(site);
    });

    // 3. 计算分类展示顺序
    const existingCatNames = Array.from(allCatMap.keys());
    let order = Array.isArray(categoryOrder) && categoryOrder.length > 0
      ? [...categoryOrder]
      : CONFIG.categories.map((c) => (categoryMap && categoryMap[c.name]) || c.name);

    existingCatNames.forEach((n) => {
      if (!order.includes(n)) {
        order.push(n);
      }
    });

    // 4. 生成分类区块,置顶优先
    const result = [];
    order.forEach((catName) => {
      const sites = allCatMap.get(catName);
      if (sites && sites.length > 0) {
        const sortedSites = sites
          .map((s, i) => ({ s, i }))
          .sort((a, b) => ((b.s.pinned ? 1 : 0) - (a.s.pinned ? 1 : 0)) || (a.i - b.i))
          .map((x) => x.s);
        result.push({
          name: catName,
          sites: sortedSites,
        });
      }
    });

    return result;
  }

  /* 点击卡片时记录最近使用(仅扩展环境;含默认站点) */
  function recordRecent(site) {
    if (!IS_EXT) return;
    const norm = navNormalizeUrl(site.url);
    recent = [
      { url: site.url, name: site.name, at: Date.now() },
      ...recent.filter((r) => navNormalizeUrl(r.url) !== norm),
    ].slice(0, 12);
    storageSet({ [NAV_RECENT_KEY]: recent }); // onChanged 触发重渲染
  }

  // ------------------------------------------------------------------------
  // 6. Render Categorized Website Cards
  // ------------------------------------------------------------------------
  function buildCard(site, opts) {
    const allowCorner = !opts || !opts.recent;
    const card = document.createElement("a");
    card.className = "site-card";
    card.href = site.url;
    card.target = "_self";
    card.rel = "noopener noreferrer";

    let domain = "";
    try {
      domain = new URL(site.url).hostname;
    } catch (e) {
      domain = site.url;
    }

    // Hover tooltip:描述 + 域名。账号信息不放入 title,防肩窥(改由 👤 点击查看)
    const titleParts = [];
    if (site.desc) titleParts.push(site.desc);
    titleParts.push(domain);
    card.title = titleParts.join("\n");

    // 搜索过滤用的小写索引串
    card.dataset.search = [site.name, site.desc || "", domain, site.url]
      .join(" ")
      .toLowerCase();

    // Favicon 3-level strategy
    const iconWrapper = document.createElement("div");
    iconWrapper.className = "site-icon-wrapper";

    const fallbackBadge = document.createElement("div");
    fallbackBadge.className = "site-icon-fallback";
    fallbackBadge.style.background = getStableGradient(site.name);
    fallbackBadge.textContent = getSiteInitial(site.name);

    let faviconSrc = site.icon;
    if (!faviconSrc) {
      try {
        const origin = new URL(site.url).origin;
        faviconSrc = `${origin}/favicon.ico`;
      } catch (e) {
        faviconSrc = "";
      }
    }

    if (faviconSrc) {
      const img = document.createElement("img");
      img.className = "site-icon-img";
      img.src = faviconSrc;
      img.alt = site.name;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        iconWrapper.appendChild(fallbackBadge);
      };
      iconWrapper.appendChild(img);
    } else {
      iconWrapper.appendChild(fallbackBadge);
    }

    // Info section
    const info = document.createElement("div");
    info.className = "site-info";
    info.innerHTML = `
      <div class="site-name">
        ${escapeHtml(site.name)}${site.account ? '<button type="button" class="account-badge" title="查看账号信息">👤</button>' : ""}
      </div>
      <div class="site-desc">${escapeHtml(site.desc || domain)}</div>
    `;
    const badge = info.querySelector(".account-badge");
    if (badge) {
      badge.setAttribute("aria-label", `查看 ${site.name} 的账号信息`);
      badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAccountPopover(site, e);
      });
    }

    // 角标按钮:用户站点 → 编辑(⋯);默认站点 → 隐藏(✕,仅扩展环境)
    if (allowCorner) {
      if (site.id) {
        const editBtn = document.createElement("button");
        editBtn.className = "site-edit-btn";
        editBtn.textContent = "⋯";
        editBtn.title = "编辑 / 删除";
        editBtn.setAttribute("aria-label", `编辑 ${site.name}`);
        editBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openSiteModal("edit", site.id);
        });
        card.appendChild(editBtn);
      } else if (IS_EXT) {
        const hideBtn = document.createElement("button");
        hideBtn.className = "site-hide-btn";
        hideBtn.textContent = "✕";
        hideBtn.title = "隐藏此卡片";
        hideBtn.setAttribute("aria-label", `隐藏 ${site.name}`);
        hideBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideDefaultSite(site);
        });
        card.appendChild(hideBtn);
      }
    }

    card.appendChild(iconWrapper);
    card.appendChild(info);

    // 记录最近使用(角标按钮已 stopPropagation,不会误记)
    if (allowCorner) {
      card.addEventListener("click", () => recordRecent(site));
    }

    return card;
  }

  function buildSection(title, sites, opts) {
    const section = document.createElement("section");
    section.className = "category-section";
    section.dataset.catName = title;
    section.id = "cat-sec-" + encodeURIComponent(title);
    if (opts && opts.recent) section.dataset.recent = "1";

    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `
      <div class="category-title">${escapeHtml(title)}</div>
      <div class="category-line"></div>
    `;
    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "site-grid";
    sites.forEach((site) => grid.appendChild(buildCard(site, opts)));
    section.appendChild(grid);

    return section;
  }

  function renderSideNav(mergedCats) {
    if (!sideCategoryNav) return;
    sideCategoryNav.innerHTML = "";
    const list = mergedCats || [];
    if (list.length <= 1) {
      sideCategoryNav.hidden = true;
      return;
    }
    sideCategoryNav.hidden = false;

    list.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "side-nav-item";
      btn.dataset.cat = cat.name;
      btn.title = `跳转到 ${cat.name}`;
      btn.textContent = cat.name;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const sec = document.querySelector(`.category-section[data-cat-name="${CSS.escape(cat.name)}"]`);
        if (sec) {
          sec.scrollIntoView({ behavior: "smooth", block: "start" });
          setActiveSideNavItem(cat.name);
        }
      });
      sideCategoryNav.appendChild(btn);
    });

    onScrollUpdateActiveSideNav();
  }

  function setActiveSideNavItem(catName) {
    if (!sideCategoryNav) return;
    const items = sideCategoryNav.querySelectorAll(".side-nav-item");
    items.forEach((item) => {
      const match = item.dataset.cat === catName;
      item.classList.toggle("active", match);
      if (match) {
        item.setAttribute("aria-current", "true");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  let scrollTimer = null;
  function onScrollUpdateActiveSideNav() {
    if (!sideCategoryNav || sideCategoryNav.hidden) return;
    const sections = Array.from(categoriesContainer.querySelectorAll(".category-section:not(.hidden)"));
    if (!sections.length) return;
    let currentCat = null;
    for (const sec of sections) {
      const top = sec.getBoundingClientRect().top;
      if (top <= 160) {
        currentCat = sec.dataset.catName;
      } else {
        break;
      }
    }
    if (!currentCat && sections[0]) {
      currentCat = sections[0].dataset.catName;
    }
    if (currentCat) {
      setActiveSideNavItem(currentCat);
    }
  }

  window.addEventListener("scroll", () => {
    if (scrollTimer) cancelAnimationFrame(scrollTimer);
    scrollTimer = requestAnimationFrame(onScrollUpdateActiveSideNav);
  }, { passive: true });

  function renderCategories() {
    categoriesContainer.innerHTML = "";

    // 最近使用区块(过滤中不显示;已隐藏的默认站点不出现在此)
    if (IS_EXT && recent.length && !searchInput.value.trim()) {
      const hiddenSet = new Set(hiddenDefaults);
      const visibleRecent = recent.filter((r) => !hiddenSet.has(navNormalizeUrl(r.url)));
      if (visibleRecent.length) {
        categoriesContainer.appendChild(buildSection("最近使用", visibleRecent, { recent: true }));
      }
    }

    const merged = getMergedCategories();
    merged.forEach((cat) => {
      categoriesContainer.appendChild(buildSection(cat.name, cat.sites));
    });

    renderSideNav(merged);
    applyFilter();
  }

  // ------------------------------------------------------------------------
  // 7. 账号信息查看弹层(防肩窥:hover 不再展示,点击 👤 才显示)
  // ------------------------------------------------------------------------
  let acctPopover = null;

  function onAcctDocClick(e) {
    if (acctPopover && acctPopover.contains(e.target)) return;
    hideAccountPopover();
  }

  function hideAccountPopover() {
    if (!acctPopover) return;
    acctPopover.remove();
    acctPopover = null;
    document.removeEventListener("click", onAcctDocClick, true);
  }

  function showAccountPopover(site, ev) {
    hideAccountPopover();
    const el = document.createElement("div");
    el.className = "account-popover";
    const title = document.createElement("div");
    title.className = "ap-title";
    title.textContent = site.name;
    const body = document.createElement("div");
    body.className = "ap-body";
    body.textContent = site.account || "（未记录）";
    el.appendChild(title);
    el.appendChild(body);
    document.body.appendChild(el);

    // 定位到点击处附近并钳制在视口内
    const rect = el.getBoundingClientRect();
    const pad = 12;
    let x = ev.clientX + 12;
    let y = ev.clientY + 14;
    if (x + rect.width > window.innerWidth - pad) x = Math.max(pad, ev.clientX - rect.width - 12);
    if (y + rect.height > window.innerHeight - pad) y = Math.max(pad, ev.clientY - rect.height - 14);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    acctPopover = el;
    document.addEventListener("click", onAcctDocClick, true);
  }

  // ------------------------------------------------------------------------
  // 8. 站点模态框:添加 / 编辑(仅扩展环境可达)
  // ------------------------------------------------------------------------
  const editModal = document.getElementById("editModal");
  const mTitle = document.getElementById("mTitle");
  const mName = document.getElementById("mName");
  const mUrl = document.getElementById("mUrl");
  const mCategory = document.getElementById("mCategory");
  const mNewCat = document.getElementById("mNewCat");
  const mNewCategory = document.getElementById("mNewCategory");
  const mDesc = document.getElementById("mDesc");
  const mAccount = document.getElementById("mAccount");
  const mError = document.getElementById("mError");
  const saveBtn = document.getElementById("mSaveBtn");
  const deleteBtn = document.getElementById("mDeleteBtn");
  const pinBtn = document.getElementById("mPinBtn");
  let editingId = null;
  let deleteArmed = false;
  let deleteTimer = null;

  function fillCategoryOptions(selected) {
    const names = getAllCategoryNames();
    const seen = new Set();
    mCategory.innerHTML = "";
    names.forEach((n) => {
      if (!n || seen.has(n)) return;
      seen.add(n);
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      mCategory.appendChild(opt);
    });
    const newOpt = document.createElement("option");
    newOpt.value = NEW_CAT;
    newOpt.textContent = "＋ 新建分类…";
    mCategory.appendChild(newOpt);

    // 记住上次使用的分类
    const lastCat = localStorage.getItem("nav-last-cat");
    const target = (selected && seen.has(selected) && selected)
      || (lastCat && seen.has(lastCat) && lastCat)
      || (names[0])
      || NEW_CAT;
    mCategory.value = target || NEW_CAT;
    mNewCat.classList.toggle("show", mCategory.value === NEW_CAT);
  }

  function updatePinBtn(site) {
    pinBtn.textContent = site && site.pinned ? "📌 已置顶" : "📌 置顶";
    pinBtn.classList.toggle("active", !!(site && site.pinned));
    pinBtn.title = site && site.pinned ? "取消置顶" : "置顶到分类顶部";
  }

  function openSiteModal(mode, siteId) {
    const site = mode === "edit" ? userSites.find((s) => s.id === siteId) : null;
    editingId = site ? site.id : null;
    resetDeleteBtn();
    clearTimeout(deleteTimer);
    mError.textContent = "";

    mTitle.textContent = site ? "编辑站点" : "添加站点";
    deleteBtn.style.display = site ? "" : "none";
    pinBtn.style.display = site ? "" : "none";

    mName.value = site ? site.name : "";
    mUrl.value = site ? site.url : "";
    mDesc.value = site ? site.desc || "" : "";
    mAccount.value = site ? site.account || "" : "";
    mNewCategory.value = "";
    fillCategoryOptions(site ? site.category : null);
    updatePinBtn(site);

    editModal.classList.add("open");
    mName.focus();
  }

  function closeSiteModal() {
    editModal.classList.remove("open");
    editingId = null;
  }

  function saveSiteModal() {
    const name = mName.value.trim();
    const url = mUrl.value.trim();
    if (!name || !url) {
      mError.textContent = "名称和网址不能为空";
      return;
    }
    try {
      new URL(url);
    } catch (e) {
      mError.textContent = "网址格式无效，需以 http(s):// 开头";
      return;
    }

    let category = mCategory.value;
    if (category === NEW_CAT) {
      category = mNewCategory.value.trim();
      if (!category) {
        mError.textContent = "请填写新分类名称";
        return;
      }
    }

    // 重复检测:用户站点 + 未隐藏的默认卡片
    const hiddenSet = new Set(hiddenDefaults);
    const all = [
      ...CONFIG.categories.flatMap((c) => c.sites)
        .filter((s) => !hiddenSet.has(navNormalizeUrl(s.url))),
      ...userSites,
    ];
    const dup = all.find(
      (s) => s.id !== editingId && navNormalizeUrl(s.url) === navNormalizeUrl(url)
    );
    if (dup) {
      mError.textContent = `该网址已在导航中（${dup.category || "默认"}）`;
      return;
    }

    if (editingId) {
      const site = userSites.find((s) => s.id === editingId);
      if (!site) return;
      const urlChanged = navNormalizeUrl(url) !== navNormalizeUrl(site.url);
      Object.assign(site, {
        name,
        url,
        desc: mDesc.value.trim(),
        account: mAccount.value.trim(),
        category,
        // 网址变了就丢弃旧 favicon,改按新域名自动获取
        icon: urlChanged ? "" : site.icon,
        updatedAt: Date.now(),
      });
    } else {
      userSites.push({
        id: navSiteId(),
        name,
        url,
        desc: mDesc.value.trim(),
        account: mAccount.value.trim(),
        icon: "",
        category,
        pinned: false,
        addedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    localStorage.setItem("nav-last-cat", category);
    saveUserSites().then(() => {
      renderCategories();
      closeSiteModal();
    });
  }

  function resetDeleteBtn() {
    deleteArmed = false;
    deleteBtn.textContent = "删除";
    deleteBtn.classList.remove("armed");
  }

  function deleteEditingSite() {
    if (!editingId) return;
    if (!deleteArmed) {
      deleteArmed = true;
      deleteBtn.textContent = "确认删除？";
      deleteBtn.classList.add("armed");
      clearTimeout(deleteTimer);
      // 3 秒未确认自动解除,避免误触不可逆状态
      deleteTimer = setTimeout(resetDeleteBtn, 3000);
      return;
    }
    clearTimeout(deleteTimer);
    userSites = userSites.filter((s) => s.id !== editingId);
    saveUserSites().then(() => {
      renderCategories();
      closeSiteModal();
    });
  }

  if (editModal) {
    saveBtn.addEventListener("click", saveSiteModal);
    deleteBtn.addEventListener("click", deleteEditingSite);
    pinBtn.addEventListener("click", () => {
      const site = userSites.find((s) => s.id === editingId);
      if (!site) return;
      site.pinned = !site.pinned;
      updatePinBtn(site);
      saveUserSites().then(renderCategories);
    });
    mCategory.addEventListener("change", () => {
      const isNew = mCategory.value === NEW_CAT;
      mNewCat.classList.toggle("show", isNew);
      if (isNew) mNewCategory.focus();
    });
    editModal.querySelector(".modal-close").addEventListener("click", closeSiteModal);
    editModal.querySelector(".modal-cancel").addEventListener("click", closeSiteModal);
    editModal.addEventListener("click", (e) => {
      if (e.target === editModal) closeSiteModal();
    });
    // 模态框内表单回车直接保存(textarea 除外)
    editModal.querySelector(".modal-card").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        saveSiteModal();
      }
    });
  }

  // ------------------------------------------------------------------------
  // 9. 默认卡片隐藏 / 恢复
  // ------------------------------------------------------------------------
  function hideDefaultSite(site) {
    const key = navNormalizeUrl(site.url);
    if (!hiddenDefaults.includes(key)) {
      hiddenDefaults = [...hiddenDefaults, key];
      storageSet({ [NAV_HIDDEN_KEY]: hiddenDefaults });
    }
    renderCategories();
    toast(`已隐藏「${site.name}」`, {
      label: "撤销",
      onClick: () => {
        hiddenDefaults = hiddenDefaults.filter((k) => k !== key);
        storageSet({ [NAV_HIDDEN_KEY]: hiddenDefaults }).then(renderCategories);
      },
    });
  }

  function restoreDefaults() {
    hiddenDefaults = [];
    categoryOrder = CONFIG.categories.map((c) => c.name);
    categoryMap = {};
    saveAllCategoryState().then(() => {
      renderCategories();
      closeSettingsDropdown();
      toast("已恢复全部默认卡片与分类");
    });
  }

  // ------------------------------------------------------------------------
  // 10. 顶栏:添加入口 + 设置菜单(导出/导入/分类管理/恢复默认)
  // ------------------------------------------------------------------------
  function closeSettingsDropdown() {
    settingsDropdown.classList.remove("open");
    settingsBtn.setAttribute("aria-expanded", "false");
  }

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = settingsDropdown.classList.contains("open");
    if (isOpen) closeSettingsDropdown();
    else {
      settingsDropdown.classList.add("open");
      settingsBtn.setAttribute("aria-expanded", "true");
    }
  });

  document.addEventListener("click", (e) => {
    if (!engineDropdown.contains(e.target) && !engineBtn.contains(e.target)) {
      closeEngineDropdown();
    }
    if (!settingsDropdown.contains(e.target) && !settingsBtn.contains(e.target)) {
      closeSettingsDropdown();
    }
  });

  addBtn.addEventListener("click", () => openSiteModal("add"));

  // 导出:全部用户站点(含账号备注)与分类配置为 JSON 备份
  document.getElementById("exportBtn").addEventListener("click", () => {
    const payload = {
      app: "nav-guide",
      version: 2,
      exportedAt: new Date().toISOString(),
      categoryOrder,
      categoryMap,
      sites: userSites,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `nav-guide-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    closeSettingsDropdown();
    toast(`已导出 ${userSites.length} 条站点及分类数据`);
  });

  // 导入:与现有数据按规范化 URL 合并(同址更新,新址追加),同步分类排序配置
  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.sites) ? data.sites : null);
      if (!list) throw new Error("bad format");

      if (Array.isArray(data.categoryOrder) && data.categoryOrder.length > 0) {
        categoryOrder = data.categoryOrder;
      }
      if (data.categoryMap && typeof data.categoryMap === "object") {
        categoryMap = { ...categoryMap, ...data.categoryMap };
      }

      let added = 0;
      let updated = 0;
      let skipped = 0;
      list.forEach((raw) => {
        if (!raw || typeof raw.name !== "string" || !navIsCollectableUrl(raw.url)) {
          skipped++;
          return;
        }
        const rec = {
          id: typeof raw.id === "string" && raw.id ? raw.id : navSiteId(),
          name: raw.name.trim().slice(0, 60),
          url: raw.url.trim(),
          desc: typeof raw.desc === "string" ? raw.desc.slice(0, 80) : "",
          account: typeof raw.account === "string" ? raw.account.slice(0, 500) : "",
          icon: typeof raw.icon === "string" ? raw.icon : "",
          category: (typeof raw.category === "string" && raw.category.trim())
            ? raw.category.trim().slice(0, 20)
            : NAV_QUICK_CATEGORY,
          pinned: !!raw.pinned,
          addedAt: Number(raw.addedAt) || Date.now(),
        };
        const idx = userSites.findIndex(
          (s) => navNormalizeUrl(s.url) === navNormalizeUrl(rec.url)
        );
        if (idx >= 0) {
          userSites[idx] = rec;
          updated++;
        } else {
          userSites.push(rec);
          added++;
        }
      });

      saveAllCategoryState().then(renderCategories);
      closeSettingsDropdown();
      toast(`导入完成：新增 ${added}，更新 ${updated}${skipped ? `，跳过 ${skipped}` : ""}`);
    } catch (e) {
      toast("导入失败：文件不是有效的 nav-guide 备份");
    }
  });

  document.getElementById("importBtn").addEventListener("click", () => importFile.click());
  document.getElementById("restoreDefaultsBtn").addEventListener("click", restoreDefaults);
  document.getElementById("manageCatsBtn").addEventListener("click", () => {
    closeSettingsDropdown();
    openCatModal();
  });

  // file:// 环境无扩展存储:隐藏添加与设置入口
  if (!IS_EXT) {
    addBtn.style.display = "none";
    settingsBtn.style.display = "none";
  }

  // ------------------------------------------------------------------------
  // 11. 分类管理模态框:所有分类(内置/自定义)排序/重命名/删除/添加
  // ------------------------------------------------------------------------
  const catModal = document.getElementById("catModal");
  const catList = document.getElementById("catList");
  const catAddInput = document.getElementById("catAddInput");
  const catAddBtn = document.getElementById("catAddBtn");
  const catResetBtn = document.getElementById("catResetBtn");
  let draggedCatIndex = null;

  function buildCatRows() {
    catList.innerHTML = "";
    const names = getAllCategoryNames();
    if (!names.length) {
      const empty = document.createElement("div");
      empty.className = "cat-empty";
      empty.textContent = "暂无分类";
      catList.appendChild(empty);
      return;
    }

    const merged = getMergedCategories();
    const siteCountMap = new Map();
    merged.forEach((c) => siteCountMap.set(c.name, c.sites.length));

    names.forEach((name, index) => {
      const count = siteCountMap.get(name) || 0;
      const row = document.createElement("div");
      row.className = "cat-row";
      row.draggable = true;
      row.dataset.index = String(index);
      row.dataset.catName = name;

      // 拖拽手柄
      const handle = document.createElement("span");
      handle.className = "cat-drag-handle";
      handle.textContent = "⠿";
      handle.title = "按住拖拽排序";
      handle.setAttribute("aria-label", "拖拽排序");

      // 排序微调按钮组 (▲ / ▼)
      const reorderBtns = document.createElement("div");
      reorderBtns.className = "cat-reorder-btns";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "cat-order-btn cat-up-btn";
      upBtn.textContent = "▲";
      upBtn.title = "上移";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => moveCategory(index, -1));

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "cat-order-btn cat-down-btn";
      downBtn.textContent = "▼";
      downBtn.title = "下移";
      downBtn.disabled = index === names.length - 1;
      downBtn.addEventListener("click", () => moveCategory(index, 1));

      reorderBtns.appendChild(upBtn);
      reorderBtns.appendChild(downBtn);

      // 分类名称输入框 (支持重命名)
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cat-name-input";
      input.value = name;
      input.maxLength = 20;
      input.setAttribute("aria-label", `重命名分类 ${name}`);
      input.addEventListener("change", () => renameCategory(name, input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });

      // 站点计数
      const countEl = document.createElement("span");
      countEl.className = "cat-count";
      countEl.textContent = `${count} 个站点`;

      // 删除按钮
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-danger cat-del";
      delBtn.textContent = "删除";
      let armed = false;
      let timer = null;
      delBtn.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          delBtn.textContent = "确认？";
          delBtn.classList.add("armed");
          timer = setTimeout(() => {
            armed = false;
            delBtn.textContent = "删除";
            delBtn.classList.remove("armed");
          }, 3000);
          return;
        }
        clearTimeout(timer);
        deleteCategory(name);
      });

      // Drag & Drop 事件
      row.addEventListener("dragstart", (e) => {
        draggedCatIndex = index;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        catList.querySelectorAll(".cat-row").forEach((r) => {
          r.classList.remove("drag-over-top", "drag-over-bottom");
        });
        draggedCatIndex = null;
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          row.classList.add("drag-over-top");
          row.classList.remove("drag-over-bottom");
        } else {
          row.classList.add("drag-over-bottom");
          row.classList.remove("drag-over-top");
        }
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over-top", "drag-over-bottom");
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over-top", "drag-over-bottom");
        if (draggedCatIndex === null || draggedCatIndex === index) return;
        reorderCategories(draggedCatIndex, index);
      });

      row.appendChild(handle);
      row.appendChild(reorderBtns);
      row.appendChild(input);
      row.appendChild(countEl);
      row.appendChild(delBtn);
      catList.appendChild(row);
    });
  }

  function moveCategory(fromIdx, offset) {
    const names = getAllCategoryNames();
    const toIdx = fromIdx + offset;
    if (toIdx < 0 || toIdx >= names.length) return;
    const item = names.splice(fromIdx, 1)[0];
    names.splice(toIdx, 0, item);
    categoryOrder = names;
    saveCategoryState().then(() => {
      renderCategories();
      buildCatRows();
    });
  }

  function reorderCategories(fromIdx, toIdx) {
    const names = getAllCategoryNames();
    if (fromIdx < 0 || fromIdx >= names.length || toIdx < 0 || toIdx >= names.length) return;
    const item = names.splice(fromIdx, 1)[0];
    names.splice(toIdx, 0, item);
    categoryOrder = names;
    saveCategoryState().then(() => {
      renderCategories();
      buildCatRows();
    });
  }

  function renameCategory(oldName, newValue) {
    const nv = String(newValue || "").trim();
    if (!nv || nv === oldName) {
      buildCatRows();
      return;
    }

    const allNames = getAllCategoryNames();
    const isMerge = allNames.some((n) => n === nv);

    // 1. 更新 userSites
    userSites.forEach((s) => {
      if (s.category === oldName) s.category = nv;
    });

    // 2. 更新 categoryMap (用于映射默认分类)
    CONFIG.categories.forEach((c) => {
      const currentName = (categoryMap && categoryMap[c.name]) || c.name;
      if (currentName === oldName) {
        if (!categoryMap) categoryMap = {};
        categoryMap[c.name] = nv;
      }
    });

    // 3. 更新 categoryOrder
    if (!Array.isArray(categoryOrder) || categoryOrder.length === 0) {
      categoryOrder = getAllCategoryNames();
    }
    const idx = categoryOrder.indexOf(oldName);
    if (idx !== -1) {
      categoryOrder[idx] = nv;
    } else {
      categoryOrder.push(nv);
    }
    // 去重保持唯一
    categoryOrder = Array.from(new Set(categoryOrder));

    saveAllCategoryState().then(() => {
      renderCategories();
      buildCatRows();
      toast(isMerge ? `已合并到「${nv}」` : `已重命名为「${nv}」`);
    });
  }

  function deleteCategory(catName) {
    const hiddenSet = new Set(hiddenDefaults);
    let movedCount = 0;

    // 1. 移动用户自定义站点
    userSites.forEach((s) => {
      if (s.category === catName) {
        s.category = NAV_QUICK_CATEGORY;
        movedCount++;
      }
    });

    // 2. 处理默认站点: 如果属于该分类且未隐藏,转为快速收藏用户站点并隐藏默认原站
    CONFIG.categories.forEach((c) => {
      const currentName = (categoryMap && categoryMap[c.name]) || c.name;
      if (currentName === catName) {
        c.sites.forEach((s) => {
          const norm = navNormalizeUrl(s.url);
          if (!hiddenSet.has(norm)) {
            hiddenDefaults.push(norm);
            userSites.push({
              id: navSiteId(),
              name: s.name,
              url: s.url,
              desc: s.desc || "",
              account: "",
              icon: s.icon || "",
              category: NAV_QUICK_CATEGORY,
              pinned: false,
              addedAt: Date.now(),
            });
            movedCount++;
          }
        });
      }
    });

    // 3. 从 categoryOrder 和 categoryMap 中移除
    if (Array.isArray(categoryOrder)) {
      categoryOrder = categoryOrder.filter((n) => n !== catName);
      if (!categoryOrder.includes(NAV_QUICK_CATEGORY)) {
        categoryOrder.push(NAV_QUICK_CATEGORY);
      }
    }
    if (categoryMap) {
      CONFIG.categories.forEach((c) => {
        if ((categoryMap[c.name] || c.name) === catName) {
          delete categoryMap[c.name];
        }
      });
    }

    saveAllCategoryState().then(() => {
      renderCategories();
      buildCatRows();
      toast(`已删除分类「${catName}」，${movedCount} 个站点已移入「${NAV_QUICK_CATEGORY}」`);
    });
  }

  function addCategory(name) {
    const n = String(name || "").trim();
    if (!n) return;
    const allNames = getAllCategoryNames();
    if (allNames.includes(n)) {
      toast(`分类「${n}」已存在`);
      return;
    }
    if (!Array.isArray(categoryOrder) || categoryOrder.length === 0) {
      categoryOrder = getAllCategoryNames();
    }
    categoryOrder.push(n);
    saveCategoryState().then(() => {
      renderCategories();
      buildCatRows();
      toast(`已创建分类「${n}」`);
    });
  }

  function resetDefaultCategories() {
    categoryOrder = CONFIG.categories.map((c) => c.name);
    categoryMap = {};
    saveCategoryState().then(() => {
      renderCategories();
      buildCatRows();
      toast("已恢复默认分类排序与名称");
    });
  }

  function openCatModal() {
    buildCatRows();
    catModal.classList.add("open");
  }

  function closeCatModal() {
    catModal.classList.remove("open");
  }

  if (catModal) {
    catModal.querySelector(".modal-close").addEventListener("click", closeCatModal);
    catModal.querySelector(".modal-cancel").addEventListener("click", closeCatModal);
    catModal.addEventListener("click", (e) => {
      if (e.target === catModal) closeCatModal();
    });

    if (catAddBtn && catAddInput) {
      catAddBtn.addEventListener("click", () => {
        const val = catAddInput.value.trim();
        if (val) {
          addCategory(val);
          catAddInput.value = "";
        }
      });
      catAddInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const val = catAddInput.value.trim();
          if (val) {
            addCategory(val);
            catAddInput.value = "";
          }
        }
      });
    }

    if (catResetBtn) {
      catResetBtn.addEventListener("click", resetDefaultCategories);
    }
  }

  // ------------------------------------------------------------------------
  // 12. 全局快捷键:/ 聚焦搜索(避开输入态),Esc 逐层关闭
  // ------------------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" ) {
      const el = document.activeElement;
      const inField = el && (
        el === searchInput ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
        el.isContentEditable
      );
      const modalOpen =
        (editModal && editModal.classList.contains("open")) ||
        (catModal && catModal.classList.contains("open"));
      if (inField || modalOpen) return;
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (e.key === "Escape") {
      hideAccountPopover();
      closeEngineDropdown();
      closeSettingsDropdown();
      if (editModal && editModal.classList.contains("open")) closeSiteModal();
      if (catModal && catModal.classList.contains("open")) closeCatModal();
      if (cloudModal && cloudModal.classList.contains("open")) closeCloudModal();
    }
  });

  // ------------------------------------------------------------------------
  // 13. Initial Render
  // ------------------------------------------------------------------------
  loadAll().then(() => {
    renderCategories();
    cloudInit();
  });

  // Auto-focus search input on initial page load
  window.addEventListener("DOMContentLoaded", () => {
    searchInput.focus();
  });
})();
