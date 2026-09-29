/* ==========================================================================
   popup:收藏/编辑当前标签页
   依赖:common.js
   ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const htmlEl = document.documentElement;
  const pageIcon = $("pageIcon");
  const pageTitle = $("pageTitle");
  const pageDomain = $("pageDomain");
  const editFlag = $("editFlag");
  const editCat = $("editCat");
  const fCategory = $("fCategory");
  const fNewCategory = $("fNewCategory");
  const newCatBox = $("newCat");
  const fName = $("fName");
  const fUrl = $("fUrl");
  const fDesc = $("fDesc");
  const fAccount = $("fAccount");
  const fError = $("fError");
  const saveBtn = $("saveBtn");
  const removeBtn = $("removeBtn");
  const form = $("form");

  const NEW_CAT = "__new__";
  let currentTab = null;
  let editing = null; // 已收藏的站点对象或 null

  // 主题跟随系统
  function applyScheme() {
    htmlEl.setAttribute(
      "data-scheme",
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
  }
  applyScheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyScheme);

  function domainOf(url) {
    try { return new URL(url).hostname; } catch (e) { return url; }
  }

  function setIconPreview(iconUrl, initial) {
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.onerror = () => { img.remove(); pageIcon.textContent = initial; };
      pageIcon.innerHTML = "";
      pageIcon.appendChild(img);
    } else {
      pageIcon.textContent = initial;
    }
  }

  function fillCategorySelect(allCategoryNames, selected) {
    const seen = new Set();
    fCategory.innerHTML = "";
    allCategoryNames.forEach((n) => {
      if (!n || seen.has(n)) return;
      seen.add(n);
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      fCategory.appendChild(opt);
    });
    const newOpt = document.createElement("option");
    newOpt.value = NEW_CAT;
    newOpt.textContent = "＋ 新建分类…";
    fCategory.appendChild(newOpt);

    if (selected && seen.has(selected)) {
      fCategory.value = selected;
    } else {
      fCategory.value = allCategoryNames[0] || NEW_CAT;
    }
  }

  function getStorageData() {
    return navStorage.get([NAV_STORAGE_KEY, NAV_CAT_ORDER_KEY, NAV_CAT_MAP_KEY]).then((res) => {
      return {
        sites: Array.isArray(res && res[NAV_STORAGE_KEY]) ? res[NAV_STORAGE_KEY] : [],
        catOrder: Array.isArray(res && res[NAV_CAT_ORDER_KEY]) ? res[NAV_CAT_ORDER_KEY] : [],
        catMap: (res && res[NAV_CAT_MAP_KEY] && typeof res[NAV_CAT_MAP_KEY] === "object") ? res[NAV_CAT_MAP_KEY] : {},
      };
    });
  }

  function getSites() {
    return navStorage.get([NAV_STORAGE_KEY]).then((res) => {
      return Array.isArray(res && res[NAV_STORAGE_KEY]) ? res[NAV_STORAGE_KEY] : [];
    });
  }

  function persist(sites) {
    return navStorage.set({ [NAV_STORAGE_KEY]: sites });
  }

  function finish(btnText) {
    saveBtn.disabled = true;
    saveBtn.textContent = btnText;
    setTimeout(() => window.close(), 650);
  }

  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab || !navIsCollectableUrl(tab.url)) {
      document.body.classList.add("mode-unsupported");
      return;
    }

    const { sites, catOrder, catMap } = await getStorageData();
    editing = navFindSite(sites, tab.url) || null;

    // 页面预览
    const iconUrl = (editing && editing.icon) || tab.favIconUrl || "";
    const displayName = editing ? editing.name : tab.title || domainOf(tab.url);
    pageTitle.textContent = displayName;
    pageDomain.textContent = domainOf(tab.url);
    setIconPreview(iconUrl, (displayName || "✦").trim().charAt(0).toUpperCase());

    // 分类选项: 收集所有分类并按 catOrder 排序
    const names = new Set();
    catOrder.forEach((n) => { if (n && n.trim()) names.add(n.trim()); });
    CONFIG.categories.forEach((c) => {
      const n = (catMap && catMap[c.name]) || c.name;
      names.add(n);
    });
    sites.forEach((s) => {
      if (s.category && s.category.trim()) names.add(s.category.trim());
    });
    const sortedCatNames = Array.from(names).sort((a, b) => {
      const ia = catOrder.indexOf(a);
      const ib = catOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });

    const lastCat = editing ? null : localStorage.getItem("nav-last-cat");
    fillCategorySelect(sortedCatNames, editing ? editing.category : (lastCat || null));

    // 表单预填
    fName.value = displayName;
    fUrl.value = editing ? editing.url : tab.url;
    fDesc.value = editing ? editing.desc || "" : "";
    fAccount.value = editing ? editing.account || "" : "";

    if (editing) {
      editFlag.classList.add("show");
      editCat.textContent = editing.category;
      saveBtn.textContent = "保存修改";
      removeBtn.classList.add("show");
    }

    fName.focus();
    fName.select();
  }

  fCategory.addEventListener("change", () => {
    const isNew = fCategory.value === NEW_CAT;
    newCatBox.classList.toggle("show", isNew);
    if (isNew) fNewCategory.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    fError.textContent = "";

    const name = fName.value.trim();
    const url = fUrl.value.trim();
    if (!name || !url) {
      fError.textContent = "名称和网址不能为空";
      return;
    }
    try {
      new URL(url);
    } catch (err) {
      fError.textContent = "网址格式无效,需以 http(s):// 开头";
      return;
    }

    let category = fCategory.value;
    if (category === NEW_CAT) {
      category = fNewCategory.value.trim();
      if (!category) {
        fError.textContent = "请填写新分类名称";
        return;
      }
    }

    getSites().then((sites) => {
      // 重复检测(编辑自身除外):URL 可能被手动改成了另一条已收藏地址
      const dup = navFindSite(sites, url);
      if (dup && (!editing || dup.id !== editing.id)) {
        fError.textContent = `该网址已在导航中（${dup.category}）`;
        return null;
      }

      // 网址被修改时丢弃旧 favicon,让导航页按新域名自动获取
      const origUrl = editing ? editing.url : (currentTab && currentTab.url) || "";
      const urlChanged = !origUrl || navNormalizeUrl(url) !== navNormalizeUrl(origUrl);
      let iconUrl = urlChanged
        ? ""
        : ((editing && editing.icon) || (currentTab && currentTab.favIconUrl) || "");
      if (iconUrl.startsWith("data:") && iconUrl.length > 2048) {
        iconUrl = "";
      }

      const record = {
        id: editing ? editing.id : navSiteId(),
        name,
        url,
        desc: fDesc.value.trim(),
        account: fAccount.value.trim(),
        icon: iconUrl,
        category,
        pinned: editing ? !!editing.pinned : false,
        addedAt: editing ? editing.addedAt : Date.now(),
        updatedAt: Date.now(),
      };

      let next;
      if (editing) {
        next = sites.map((s) => (s.id === editing.id ? record : s));
      } else {
        next = [...sites, record];
      }
      localStorage.setItem("nav-last-cat", category);
      return persist(next);
    }).then((res) => {
      if (res === null) return; // 校验未通过
      finish(editing ? "✓ 已更新" : "✓ 已添加");
    });
  });

  // 移除(二次确认,3 秒未确认自动解除)
  let removeArmed = false;
  let removeTimer = null;
  removeBtn.addEventListener("click", () => {
    if (!editing) return;
    if (!removeArmed) {
      removeArmed = true;
      removeBtn.textContent = "确认移除?";
      removeTimer = setTimeout(() => {
        removeArmed = false;
        removeBtn.textContent = "移除";
      }, 3000);
      return;
    }
    clearTimeout(removeTimer);
    getSites().then((sites) => persist(sites.filter((s) => s.id !== editing.id)))
      .then(() => finish("✓ 已移除"));
  });

  init();
})();
