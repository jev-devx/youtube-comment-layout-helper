import { safeInsertBefore } from "./insert.js";

export const IDS = {
  tabs: "yclh-tabs",
  panels: "yclh-panels",
  panelComments: "yclh-panel-comments",
  panelRelated: "yclh-panel-related",
  panelPlaylist: "yclh-panel-playlist",
};

const $id = (id) => document.getElementById(id);

export const getTabsRoot = () => $id(IDS.tabs);
export const getPanelsRoot = () => $id(IDS.panels);
export const getPanelComments = () => $id(IDS.panelComments);
export const getPanelRelated = () => $id(IDS.panelRelated);
export const getPanelPlaylist = () => $id(IDS.panelPlaylist);

/**
 * tabs（comments / related）を作る
 * - onTabClick(tabName) を呼ぶだけ（状態管理は orchestrator 側）
 * - 多重bind防止：__yclhBound を使う
 */
export const ensureSideTabs = (sideRoot, { onTabClick } = {}) => {
  if (!sideRoot) return null;

  let tabs = getTabsRoot();
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.id = IDS.tabs;

    const mkBtn = (name, label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.tab = name; // "comments" | "related"
      b.textContent = label;
      return b;
    };

    tabs.appendChild(mkBtn("comments", "Comments"));
    tabs.appendChild(mkBtn("related", "Related"));
    tabs.appendChild(mkBtn("playlist", "Playlist"));

    // side の先頭へ（tabsが上、panelsが下）
    safeInsertBefore(sideRoot, tabs, sideRoot.firstChild);
  }

  // bind（1回だけ）
  if (!tabs.__yclhBound) {
    tabs.__yclhBound = true;
    tabs.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      const btn = t.closest("button[data-tab]");
      if (!btn) return;

      const name = btn.dataset.tab;
      if (!name) return;

      if (typeof onTabClick === "function") onTabClick(name);
    });
  }

  // onTabClick を差し替え可能にする（SPAでも安全）
  tabs.__yclhOnTabClick = onTabClick;

  return tabs;
};

/** panels（置き場）を作る（tabsの下に来る） */
export const ensureSidePanels = (sideRoot) => {
  if (!sideRoot) return null;

  let panels = getPanelsRoot();
  if (!panels) {
    panels = document.createElement("div");
    panels.id = IDS.panels;

    const panelComments = document.createElement("div");
    panelComments.id = IDS.panelComments;

    const panelRelated = document.createElement("div");
    panelRelated.id = IDS.panelRelated;

    const panelPlaylist = document.createElement("div");
    panelPlaylist.id = IDS.panelPlaylist;

    panels.appendChild(panelComments);
    panels.appendChild(panelRelated);
    panels.appendChild(panelPlaylist);

    // tabs が居ればその後ろ、無ければ side の先頭に置く
    const tabs = getTabsRoot();
    const ref = tabs ? tabs.nextSibling : sideRoot.firstChild;
    safeInsertBefore(sideRoot, panels, ref);
  }

  return panels;
};

/** active panel を切替（DOMは残す。表示はCSSで制御） */
export const setActivePanel = (name) => {
  const panels = getPanelsRoot();
  if (!panels) return false;

  panels.dataset.active = name; // "comments" | "related"
  return true;
};

/** active tab の見た目を更新 */
export const setActiveTab = (name) => {
  const tabs = getTabsRoot();
  if (!tabs) return false;

  for (const btn of tabs.querySelectorAll("button[data-tab]")) {
    const isActive = btn.dataset.tab === name;
    btn.dataset.active = isActive ? "1" : "0";
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  return true;
};

/**
 * panels/tabs が空なら掃除（事故防止：中身があれば触らない）
 */
export const cleanupSideUi = () => {
  const panels = getPanelsRoot();
  if (panels) {
    // panelに何か入ってたら消さない
    const c = getPanelComments();
    const r = getPanelRelated();
    const p = getPanelPlaylist();
    if (!c?.firstChild && !r?.firstChild && !p?.firstChild) panels.remove();
  }

  const tabs = getTabsRoot();
  if (tabs) tabs.remove();
};
