/* ==========================================================================
   nav-guide 云同步层: GitHub Gist (Secret Gist + Personal Access Token, 零后端)
   被 index.js(新标签页)引用;
   不依赖 DOM; chrome.* 仅在扩展环境使用, file:// 下功能自动禁用。
   ========================================================================== */

/* 云端同步文件名(Secret Gist 内) */
const NAV_GIST_FILENAME = "nav-guide-sync.json";
const NAV_CLOUD_FILENAME = NAV_GIST_FILENAME; // 别名兼容
const NAV_GIST_DESC = "nav-guide 导航云同步数据 (请勿手动修改)";

/* 本地缓存 GitHub Gist 凭据与基线的 storage 键 */
const NAV_CLOUD_TOKEN_KEY = "navGistToken";
const NAV_CLOUD_GIST_ID_KEY = "navGistId";
const NAV_CLOUD_USER_KEY = "navGistUser";
const NAV_CLOUD_HTML_URL_KEY = "navGistHtmlUrl";
const NAV_CLOUD_STATE_KEY = "navCloudState";

/* ==========================================================================
   navCloudMerge: 三方合并纯函数(本地 / 云端 / 上次同步基线)
   合并键: 站点 id(无 id 按规范化 url); 删除需基线佐证, 冲突时修改胜过删除。
   ========================================================================== */
const navCloudMerge = {
  /* 规范化一条站点记录: 截断字段、保留(而非生成)id; 非法记录返回 null */
  normalizeSite(raw) {
    if (!raw || typeof raw.name !== "string" || !navIsCollectableUrl(raw.url)) return null;
    let iconStr = typeof raw.icon === "string" ? raw.icon.trim() : "";
    // 防御超大 Base64 Data URL 撑爆 storage.sync 配额(8KB)
    if (iconStr.startsWith("data:") && iconStr.length > 2048) {
      iconStr = "";
    }
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : "",
      name: raw.name.trim().slice(0, 60),
      url: raw.url.trim(),
      desc: typeof raw.desc === "string" ? raw.desc.slice(0, 80) : "",
      account: typeof raw.account === "string" ? raw.account.slice(0, 500) : "",
      icon: iconStr,
      category: (typeof raw.category === "string" && raw.category.trim())
        ? raw.category.trim().slice(0, 20)
        : NAV_QUICK_CATEGORY,
      pinned: !!raw.pinned,
      addedAt: Number(raw.addedAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Number(raw.addedAt) || 0,
    };
  },

  /* 站点合并键: 有 id 用 id, 否则退化为规范化 url */
  siteKey(s) {
    return s.id ? s.id : ("url:" + navNormalizeUrl(s.url));
  },

  /* 站点级合并: 两端都有但内容不同 → updatedAt 新者胜(旧数据无 updatedAt 退化为 addedAt) */
  mergeSite(local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    if (JSON.stringify(local) === JSON.stringify(remote)) return local;
    return (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  },

  /* 三方合并入口。入参均为 sites 数组; baseSites 为上次同步时的快照, 可为 null。
     返回 { sites, localChanged, remoteChanged }(后两者表示合并结果与该端不同, 需回写) */
  mergeSites(localSites, remoteSites, baseSites) {
    const norm = (list) => (Array.isArray(list) ? list.map(navCloudMerge.normalizeSite).filter(Boolean) : []);
    const L = norm(localSites);
    const R = norm(remoteSites);
    const B = norm(baseSites);
    const byKey = (list) => new Map(list.map((s) => [navCloudMerge.siteKey(s), s]));
    const lMap = byKey(L);
    const rMap = byKey(R);
    const bMap = byKey(B);

    const out = [];
    const seen = new Set();

    // 以确定顺序遍历(本地序优先, 云端补充), 避免 Map 迭代顺序影响结果;
    // mergeOne 返回 null 表示该键被删除, 不入结果
    L.forEach((l) => {
      seen.add(navCloudMerge.siteKey(l));
      const one = navCloudMerge.mergeOne(l, rMap.get(navCloudMerge.siteKey(l)) || null, bMap.get(navCloudMerge.siteKey(l)) || null);
      if (one) out.push(one);
    });
    R.forEach((r) => {
      const key = navCloudMerge.siteKey(r);
      if (seen.has(key)) return;
      seen.add(key);
      const one = navCloudMerge.mergeOne(lMap.get(key) || null, r, bMap.get(key) || null);
      if (one) out.push(one);
    });

    return {
      sites: out,
      localChanged: JSON.stringify(out) !== JSON.stringify(L),
      remoteChanged: JSON.stringify(out) !== JSON.stringify(R),
    };
  },

  /* 单键三方裁决: 返回该键的最终站点或 null(删除) */
  mergeOne(l, r, b) {
    if (l && r) return navCloudMerge.mergeSite(l, r);
    if (!l && !r) return null;

    // 仅一端存在: 基线同款 → 该端是「删除」; 基线缺位(新增/首次) → 取存在端;
    // 基线存在但内容不同 → 存在端在删除后仍修改过, 修改胜过删除, 予以保留
    const existing = l || r;
    if (!b) return existing;
    return JSON.stringify(b) === JSON.stringify(existing) ? null : existing;
  },

  /* 对象合并(categoryMap): 键级对比基线, 哪端相对基线有变化取哪端; 两端都变或仅一端有键 → 取存在值 */
  mergeObject(localObj, remoteObj, baseObj) {
    const L = (localObj && typeof localObj === "object") ? localObj : {};
    const R = (remoteObj && typeof remoteObj === "object") ? remoteObj : {};
    const B = (baseObj && typeof baseObj === "object") ? baseObj : {};
    const out = {};
    const sig = (v) => JSON.stringify(v === undefined ? null : v);
    new Set([...Object.keys(L), ...Object.keys(R)]).forEach((k) => {
      const lv = sig(L[k]);
      const rv = sig(R[k]);
      if (k in L && k in R && lv === rv) { out[k] = L[k]; return; }
      const bv = sig(B[k]);
      const lChanged = (k in L) && lv !== bv;
      const rChanged = (k in R) && rv !== bv;
      if (lChanged && !rChanged) out[k] = L[k];
      else if (rChanged && !lChanged) out[k] = R[k];
      else if (k in L) out[k] = L[k];
      else out[k] = R[k];
    });
    return out;
  },

  /* 数组合并(categoryOrder/hiddenDefaults): 哪端相对基线变化取哪端, 无基线或都变取远端 */
  mergeArray(localArr, remoteArr, baseArr) {
    const lv = JSON.stringify(localArr || []);
    const rv = JSON.stringify(remoteArr || []);
    if (lv === rv) return localArr || [];
    const bv = JSON.stringify(baseArr || []);
    const lChanged = lv !== bv;
    const rChanged = rv !== bv;
    if (lChanged && !rChanged) return localArr || [];
    if (rChanged && !lChanged) return remoteArr || [];
    return remoteArr || [];
  },
};

/* ==========================================================================
   navCloudAuth: GitHub Token 凭据管理与校验(仅扩展环境)
   ========================================================================== */
const navCloudAuth = {
  /* 是否处于扩展环境 */
  configured() {
    return typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.local);
  },

  /* 读取已保存的凭据 { token, gistId, user, htmlUrl } */
  async load() {
    if (!this.configured()) return null;
    const res = await new Promise((r) =>
      chrome.storage.local.get([NAV_CLOUD_TOKEN_KEY, NAV_CLOUD_GIST_ID_KEY, NAV_CLOUD_USER_KEY, NAV_CLOUD_HTML_URL_KEY], r)
    );
    if (!res || !res[NAV_CLOUD_TOKEN_KEY]) return null;
    return {
      token: res[NAV_CLOUD_TOKEN_KEY],
      gistId: res[NAV_CLOUD_GIST_ID_KEY] || "",
      user: res[NAV_CLOUD_USER_KEY] || "",
      htmlUrl: res[NAV_CLOUD_HTML_URL_KEY] || "",
    };
  },

  /* 保存凭据 */
  async save({ token, gistId, user, htmlUrl }) {
    if (!this.configured()) return;
    const data = {};
    if (token !== undefined) data[NAV_CLOUD_TOKEN_KEY] = token ? token.trim() : "";
    if (gistId !== undefined) data[NAV_CLOUD_GIST_ID_KEY] = gistId;
    if (user !== undefined) data[NAV_CLOUD_USER_KEY] = user;
    if (htmlUrl !== undefined) data[NAV_CLOUD_HTML_URL_KEY] = htmlUrl;
    await new Promise((r) => chrome.storage.local.set(data, r));
  },

  /* 清除凭据与云同步状态 */
  async clear() {
    if (!this.configured()) return;
    await new Promise((r) =>
      chrome.storage.local.remove(
        [NAV_CLOUD_TOKEN_KEY, NAV_CLOUD_GIST_ID_KEY, NAV_CLOUD_USER_KEY, NAV_CLOUD_HTML_URL_KEY, NAV_CLOUD_STATE_KEY],
        r
      )
    );
  },

  /* 获取当前可用 token 字符串 */
  async getToken() {
    const auth = await this.load();
    return (auth && auth.token) || null;
  },

  /* 校验 GitHub Personal Access Token 有效性，成功返回 { user, avatar, name } */
  async validateToken(rawToken) {
    const token = (rawToken || "").trim();
    if (!token) {
      const err = new Error("TOKEN_EMPTY");
      err.code = "TOKEN_EMPTY";
      throw err;
    }
    try {
      const resp = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (resp.status === 401) {
        const err = new Error("INVALID_TOKEN");
        err.code = "INVALID_TOKEN";
        throw err;
      }
      if (resp.status === 403) {
        const err = new Error("FORBIDDEN");
        err.code = "FORBIDDEN";
        throw err;
      }
      if (!resp.ok) {
        const err = new Error("GITHUB_API_" + resp.status);
        err.code = "GITHUB_API";
        throw err;
      }
      const data = await resp.json();
      return {
        user: data.login || "GitHub 用户",
        name: data.name || data.login || "",
        avatar: data.avatar_url || "",
      };
    } catch (e) {
      if (e.code) throw e;
      const err = new Error("NETWORK_ERROR");
      err.code = "NETWORK_ERROR";
      throw err;
    }
  },
};

/* ==========================================================================
   navCloud: GitHub Gist 客户端 + 同步编排
   云端 payload 结构:{ app, version, savedAt, sites, hiddenDefaults,
                       categoryOrder, categoryMap }
   ========================================================================== */
const navCloud = {
  get configured() {
    return navCloudAuth.configured();
  },

  /* 底层统一 GitHub API 请求包装 */
  async _api(path, options, explicitToken) {
    const token = explicitToken || (await navCloudAuth.getToken());
    if (!token) {
      const e = new Error("NOT_LOGGED_IN");
      e.code = "NOT_LOGGED_IN";
      throw e;
    }
    let resp;
    try {
      resp = await fetch("https://api.github.com" + path, {
        ...options,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(options && options.headers),
        },
      });
    } catch (e) {
      const netErr = new Error("NETWORK_ERROR");
      netErr.code = "NETWORK_ERROR";
      throw netErr;
    }

    if (resp.status === 401) {
      const e = new Error("NOT_LOGGED_IN");
      e.code = "NOT_LOGGED_IN";
      throw e;
    }
    if (resp.status === 404) {
      const e = new Error("NOT_FOUND");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (!resp.ok) {
      const e = new Error("GITHUB_API_" + resp.status);
      e.code = "GITHUB_API";
      throw e;
    }
    return resp;
  },

  /* 查找已有同步 Gist 或新建 Secret Gist，返回 { gistId, htmlUrl } */
  async findOrCreateGist(initialPayload, explicitToken) {
    const auth = await navCloudAuth.load();
    const token = explicitToken || (auth && auth.token);
    if (!token) {
      const e = new Error("NOT_LOGGED_IN");
      e.code = "NOT_LOGGED_IN";
      throw e;
    }

    // 1. 若本地已有记录的 gistId，先校验该 Gist 是否存在
    if (auth && auth.gistId) {
      try {
        const resp = await this._api("/gists/" + auth.gistId, {}, token);
        const data = await resp.json();
        if (data && data.files && data.files[NAV_GIST_FILENAME]) {
          if (data.html_url && data.html_url !== auth.htmlUrl) {
            await navCloudAuth.save({ htmlUrl: data.html_url });
          }
          return { gistId: auth.gistId, htmlUrl: data.html_url || auth.htmlUrl };
        }
      } catch (e) {
        // 关键安全修复：仅当 HTTP 404 (NOT_FOUND) 时才代表远端 Gist 被用户在网页端彻底删除；
        // 若为网络错误 (NETWORK_ERROR)、限频 (403) 或服务器异常，绝不能误判为已删除并盲目新建空白 Gist！
        if (e && e.code === "NOT_FOUND") {
          console.warn("[navCloud] 记录的 Gist 已在远端被删除 (404)，准备检索或新建");
        } else {
          console.error("[navCloud] 校验已有 Gist 失败，中止同步以保全本地数据:", e);
          throw e;
        }
      }
    }

    // 2. 检索用户的 Gist 列表中是否已有包含 NAV_GIST_FILENAME 的 Gist
    try {
      const listResp = await this._api("/gists?per_page=100", {}, token);
      const list = (await listResp.json()) || [];
      const found = list.find((g) => g.files && g.files[NAV_GIST_FILENAME]);
      if (found) {
        await navCloudAuth.save({ gistId: found.id, htmlUrl: found.html_url });
        return { gistId: found.id, htmlUrl: found.html_url };
      }
    } catch (e) {
      // 关键安全修复：检索失败（如网络中断、限流）时，中止同步，绝不可静默穿透去新建覆盖！
      console.error("[navCloud] 检索已有 Gist 列表失败，中止同步以保全本地数据:", e);
      throw e;
    }

    // 3. 未找到则创建新的 Secret Gist（以本地数据为初值，绝不盲目写入空白）
    const payload = initialPayload ? {
      app: "nav-guide",
      version: 3,
      savedAt: new Date().toISOString(),
      sites: Array.isArray(initialPayload.sites) ? initialPayload.sites : [],
      hiddenDefaults: Array.isArray(initialPayload.hiddenDefaults) ? initialPayload.hiddenDefaults : [],
      categoryOrder: Array.isArray(initialPayload.categoryOrder) ? initialPayload.categoryOrder : [],
      categoryMap: (initialPayload.categoryMap && typeof initialPayload.categoryMap === "object") ? initialPayload.categoryMap : {},
    } : {
      app: "nav-guide",
      version: 3,
      savedAt: new Date().toISOString(),
      sites: [],
      hiddenDefaults: [],
      categoryOrder: [],
      categoryMap: {},
    };

    const createResp = await this._api(
      "/gists",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: NAV_GIST_DESC,
          public: false,
          files: {
            [NAV_GIST_FILENAME]: {
              content: JSON.stringify(payload, null, 2),
            },
          },
        }),
      },
      token
    );
    const newGist = await createResp.json();
    await navCloudAuth.save({ gistId: newGist.id, htmlUrl: newGist.html_url });
    return { gistId: newGist.id, htmlUrl: newGist.html_url };
  },

  /* 下载云端数据，返回 { gistId, content, modifiedTime, htmlUrl } */
  async download(initialPayload) {
    const { gistId, htmlUrl } = await this.findOrCreateGist(initialPayload);
    const resp = await this._api("/gists/" + gistId);
    const data = await resp.json();
    if (!data.files || !data.files[NAV_GIST_FILENAME]) {
      const err = new Error("CLOUD_CORRUPT");
      err.code = "CLOUD_CORRUPT";
      throw err;
    }
    const rawContent = data.files[NAV_GIST_FILENAME].content;
    let content;
    try {
      content = JSON.parse(rawContent);
    } catch (e) {
      const err = new Error("CLOUD_CORRUPT");
      err.code = "CLOUD_CORRUPT";
      throw err;
    }
    return {
      gistId: data.id,
      content,
      modifiedTime: data.updated_at,
      htmlUrl: data.html_url || htmlUrl,
    };
  },

  /* 上传 payload 到 Gist */
  async upload(payload, uploadGistId) {
    let gistId = uploadGistId || null;
    if (!gistId) {
      const existing = await this.findOrCreateGist(payload);
      gistId = existing.gistId;
    }
    await this._api(`/gists/${gistId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: NAV_GIST_DESC,
        files: {
          [NAV_GIST_FILENAME]: {
            content: JSON.stringify(payload, null, 2),
          },
        },
      }),
    });
    return true;
  },

  /* 上次同步基线 { sites, hiddenDefaults, categoryOrder, categoryMap, savedAt, gistId } */
  async loadState() {
    if (!navCloudAuth.configured()) return null;
    const res = await new Promise((r) => chrome.storage.local.get([NAV_CLOUD_STATE_KEY], r));
    return (res && res[NAV_CLOUD_STATE_KEY]) || null;
  },

  async saveState(state) {
    if (!navCloudAuth.configured()) return;
    await new Promise((r) => chrome.storage.local.set({ [NAV_CLOUD_STATE_KEY]: state }, r));
  },

  async clearState() {
    if (!navCloudAuth.configured()) return;
    await new Promise((r) => chrome.storage.local.remove([NAV_CLOUD_STATE_KEY], r));
  },

  /* 一轮完整同步: 下载 → 三方合并 → 本地回写 → 按需上传 → 保存新基线。
     localData 形如 { sites, hiddenDefaults, categoryOrder, categoryMap }。
     返回 { merged, uploaded, localChanged, stats, htmlUrl } 或抛出带 code 的错误。 */
  async runSync(localData) {
    const remote = await this.download(localData).catch((e) => {
      if (e.code === "NOT_LOGGED_IN") throw e;
      throw e;
    });
    const base = (await this.loadState()) || {};

    const remoteContent = remote ? remote.content : null;

    // 关键安全修复 1：跨 Gist 基线防冲撞
    // 若本地基线的 gistId 与当前远程 gistId 不一致，说明连接了不同 Gist，旧基线失效，避免误删
    const isSameGist = !base.gistId || !remote.gistId || base.gistId === remote.gistId;
    const baseContent = (isSameGist && base && base.sites !== undefined) ? base : null;

    const mSites = navCloudMerge.mergeSites(
      localData.sites,
      remoteContent ? remoteContent.sites : [],
      baseContent ? baseContent.sites : null
    );

    // 关键安全修复 2：大批量删除熔断保护 (Circuit Breaker)
    // 当本地有若干数据，但三方合并结果导致 50% 以上站点被删除或全部清空时，熔断拦截，优先保全本地数据
    const localCount = (localData.sites || []).length;
    const mergedCount = mSites.sites.length;
    if (localCount >= 3 && (mergedCount === 0 || (localCount - mergedCount >= 3 && mergedCount < localCount * 0.5))) {
      console.warn(`[navCloud] 触发大批量删除熔断保护：本地现有 ${localCount} 个站点，合并结果仅剩 ${mergedCount} 个站点。自动拒绝静默删除，保全本地数据！`);
      const localMap = new Map((localData.sites || []).map((s) => [navCloudMerge.siteKey(s), s]));
      mSites.sites.forEach((s) => localMap.set(navCloudMerge.siteKey(s), s));
      mSites.sites = Array.from(localMap.values());
      mSites.localChanged = false;
      mSites.remoteChanged = true;
    }

    const merged = {
      app: "nav-guide",
      version: 3,
      savedAt: new Date().toISOString(),
      sites: mSites.sites,
      hiddenDefaults: navCloudMerge.mergeArray(
        localData.hiddenDefaults,
        remoteContent ? remoteContent.hiddenDefaults : [],
        baseContent ? baseContent.hiddenDefaults : null
      ),
      categoryOrder: navCloudMerge.mergeArray(
        localData.categoryOrder,
        remoteContent ? remoteContent.categoryOrder : [],
        baseContent ? baseContent.categoryOrder : null
      ),
      categoryMap: navCloudMerge.mergeObject(
        localData.categoryMap,
        remoteContent ? remoteContent.categoryMap : {},
        baseContent ? baseContent.categoryMap : null
      ),
    };

    // 本地有变化 → 回写本地存储; 远端有变化或云端原本为空 → 上传
    const localChanged =
      mSites.localChanged ||
      JSON.stringify(merged.hiddenDefaults) !== JSON.stringify(localData.hiddenDefaults || []) ||
      JSON.stringify(merged.categoryOrder) !== JSON.stringify(localData.categoryOrder || []) ||
      JSON.stringify(merged.categoryMap) !== JSON.stringify(localData.categoryMap || {});

    const needUpload =
      mSites.remoteChanged ||
      !remote ||
      JSON.stringify(merged.hiddenDefaults) !== JSON.stringify((remoteContent && remoteContent.hiddenDefaults) || []) ||
      JSON.stringify(merged.categoryOrder) !== JSON.stringify((remoteContent && remoteContent.categoryOrder) || []) ||
      JSON.stringify(merged.categoryMap) !== JSON.stringify((remoteContent && remoteContent.categoryMap) || {});

    let uploaded = false;
    if (needUpload) {
      await this.upload(merged, remote ? remote.gistId : null);
      uploaded = true;
    }

    await this.saveState({
      sites: merged.sites,
      hiddenDefaults: merged.hiddenDefaults,
      categoryOrder: merged.categoryOrder,
      categoryMap: merged.categoryMap,
      savedAt: merged.savedAt,
      gistId: remote ? remote.gistId : null,
    });

    const prevCount = (localData.sites || []).length;
    return {
      merged,
      uploaded,
      localChanged,
      htmlUrl: remote ? remote.htmlUrl : "",
      stats: {
        before: prevCount,
        after: merged.sites.length,
        added: merged.sites.length - prevCount,
      },
    };
  },
};

/* 供 tests(Node 环境)引入; 扩展页面环境为普通 <script> 加载, 不触发 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { navCloudMerge, navCloud, navCloudAuth, NAV_GIST_FILENAME, NAV_CLOUD_FILENAME };
}
