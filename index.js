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

    sections.forEach((sec) => {
      if (!q) {
        sec.classList.remove("hidden");
        sec.querySelectorAll(".site-card").forEach((c) => c.classList.remove("hidden"));
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
      visibleCount += secVisible;
    });

    noResult.hidden = !q || visibleCount > 0;
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
  let lastSavedSignature = null; // 本页自身写入的签名,用于避免自身变动弹「已添加」toast

  function storageGet(keys) {
    return navStorage.get(keys);
  }
  function storageSet(obj) {
    return navStorage.set(obj);
  }

  function loadAll() {
    if (!IS_EXT) return Promise.resolve();
    return storageGet([NAV_STORAGE_KEY, NAV_HIDDEN_KEY, NAV_RECENT_KEY]).then((res) => {
      userSites = Array.isArray(res[NAV_STORAGE_KEY]) ? res[NAV_STORAGE_KEY] : [];
      hiddenDefaults = Array.isArray(res[NAV_HIDDEN_KEY]) ? res[NAV_HIDDEN_KEY] : [];
      recent = Array.isArray(res[NAV_RECENT_KEY]) ? res[NAV_RECENT_KEY] : [];
    });
  }

  function saveUserSites() {
    if (!IS_EXT) return Promise.resolve();
    lastSavedSignature = JSON.stringify(userSites);
    return storageSet({ [NAV_STORAGE_KEY]: userSites });
  }

  function getCustomCategoryNames() {
    const names = new Set(userSites.map((s) => s.category));
    CONFIG.categories.forEach((c) => names.delete(c.name));
    return [...names];
  }

  /* 扩展环境下,其他入口(popup / 右键菜单 / 其他设备 Google Sync)写入后即时刷新本页,并对外部新增给出 toast 反馈 */
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

      if (needRender) renderCategories();
    });
  }

  /* CONFIG 默认分类(滤除已隐藏) + 用户站点按分类合并;新分类追加末尾;
     分类内置顶优先(稳定排序,不打乱原有相对顺序);空分类不渲染 */
  function getMergedCategories() {
    const hiddenSet = new Set(hiddenDefaults);
    const cats = CONFIG.categories.map((c) => ({
      name: c.name,
      sites: c.sites.filter((s) => !hiddenSet.has(navNormalizeUrl(s.url))),
    }));
    const customMap = new Map();
    userSites.forEach((site) => {
      const target = cats.find((c) => c.name === site.category);
      if (target) {
        target.sites.push(site);
      } else {
        if (!customMap.has(site.category)) {
          customMap.set(site.category, { name: site.category, sites: [] });
        }
        customMap.get(site.category).sites.push(site);
      }
    });
    return [...cats, ...customMap.values()]
      .map((c) => ({
        name: c.name,
        sites: c.sites
          .map((s, i) => ({ s, i }))
          .sort((a, b) => ((b.s.pinned ? 1 : 0) - (a.s.pinned ? 1 : 0)) || (a.i - b.i))
          .map((x) => x.s),
      }))
      .filter((c) => c.sites.length > 0);
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
    card.target = "_blank";
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

    getMergedCategories().forEach((cat) => {
      categoriesContainer.appendChild(buildSection(cat.name, cat.sites));
    });

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
    const names = [...CONFIG.categories.map((c) => c.name), ...getCustomCategoryNames()];
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
      || (CONFIG.categories[0] && CONFIG.categories[0].name);
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
    storageSet({ [NAV_HIDDEN_KEY]: hiddenDefaults });
    renderCategories();
    closeSettingsDropdown();
    toast("已恢复全部默认卡片");
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

  // 导出:全部用户站点(含账号备注)为 JSON 备份
  document.getElementById("exportBtn").addEventListener("click", () => {
    const payload = {
      app: "nav-guide",
      version: 1,
      exportedAt: new Date().toISOString(),
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
    toast(`已导出 ${userSites.length} 条站点数据`);
  });

  // 导入:与现有数据按规范化 URL 合并(同址更新,新址追加)
  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.sites) ? data.sites : null);
      if (!list) throw new Error("bad format");

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

      saveUserSites().then(renderCategories);
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
  // 11. 分类管理模态框:自定义分类重命名/合并/删除
  // ------------------------------------------------------------------------
  const catModal = document.getElementById("catModal");
  const catList = document.getElementById("catList");

  function buildCatRows() {
    catList.innerHTML = "";
    const names = getCustomCategoryNames();
    if (!names.length) {
      const empty = document.createElement("div");
      empty.className = "cat-empty";
      empty.textContent = "暂无自定义分类（在收藏时选择「＋ 新建分类…」即可创建）";
      catList.appendChild(empty);
      return;
    }

    names.forEach((name) => {
      const count = userSites.filter((s) => s.category === name).length;
      const row = document.createElement("div");
      row.className = "cat-row";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "cat-name-input";
      input.value = name;
      input.maxLength = 20;
      input.setAttribute("aria-label", `重命名分类 ${name}`);

      const countEl = document.createElement("span");
      countEl.className = "cat-count";
      countEl.textContent = `${count} 个站点`;

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
        moveCategorySites(name);
      });

      input.addEventListener("change", () => renameCategory(name, input.value));

      row.appendChild(input);
      row.appendChild(countEl);
      row.appendChild(delBtn);
      catList.appendChild(row);
    });
  }

  function renameCategory(oldName, newValue) {
    const nv = String(newValue || "").trim();
    if (!nv || nv === oldName) {
      buildCatRows(); // 空值还原显示
      return;
    }
    const exists = CONFIG.categories.some((c) => c.name === nv) || getCustomCategoryNames().includes(nv);
    userSites.forEach((s) => {
      if (s.category === oldName) s.category = nv;
    });
    saveUserSites().then(renderCategories);
    toast(exists ? `已合并到「${nv}」` : `已重命名为「${nv}」`);
    buildCatRows();
  }

  function moveCategorySites(name) {
    const affected = userSites.filter((s) => s.category === name);
    affected.forEach((s) => { s.category = NAV_QUICK_CATEGORY; });
    saveUserSites().then(renderCategories);
    toast(`已将 ${affected.length} 个站点移入「${NAV_QUICK_CATEGORY}」`);
    buildCatRows();
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
    }
  });

  // ------------------------------------------------------------------------
  // 13. Initial Render
  // ------------------------------------------------------------------------
  loadAll().then(renderCategories);

  // Auto-focus search input on initial page load
  window.addEventListener("DOMContentLoaded", () => {
    searchInput.focus();
  });
})();
