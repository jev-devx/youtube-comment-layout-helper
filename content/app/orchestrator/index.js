import { original, resetOriginal, runtimeState } from "../../shared/state.js";

import {
  rememberCommentsOriginal,
  restoreCommentsOriginal,
  rememberRelatedOriginal,
  restoreRelatedOriginal,
} from "../dom/originals.js";

import {
  canBuildLayoutRoot,
  ensureLayoutRoot,
  cleanupLayoutRoot,
} from "../dom/layoutRoot.js";

import {
  ensureSideTabs,
  ensureSidePanels,
  getPanelComments,
  getPanelRelated,
  setActivePanel,
  setActiveTab,
  cleanupSideUi,
} from "../dom/sideRoot.js";

export const createOrchestrator = () => {
  let applied = false;
  let bootObserver = null;
  let bootTimer = 0;

  let cssInserted = false;

  const stopBootWatch = () => {
    if (bootObserver) {
      bootObserver.disconnect();
      bootObserver = null;
    }
    if (bootTimer) {
      clearTimeout(bootTimer);
      bootTimer = 0;
    }
  };

  const ensureCssInserted = () => {
    if (cssInserted) return;
    cssInserted = true;
    try {
      chrome.runtime.sendMessage({ type: "YCLH_INSERT_CSS" });
    } catch {}
  };

  const ensureCssRemoved = () => {
    if (!cssInserted) return;
    cssInserted = false;
    try {
      chrome.runtime.sendMessage({ type: "YCLH_REMOVE_CSS" });
    } catch {}
  };

  const applyActive = (name) => {
    runtimeState.activePanel = name;
    setActivePanel(name);
    setActiveTab(name);
  };

  const tryApplyOnce = () => {
    if (!canBuildLayoutRoot()) return false;

    const roots = ensureLayoutRoot();
    const side = roots?.side;
    if (!side) return false;

    // tabs/panels を用意
    ensureSideTabs(side, {
      onTabClick: (name) => {
        if (!applied) return;
        applyActive(name);
      },
    });
    ensureSidePanels(side);

    const panelComments = getPanelComments();
    const panelRelated = getPanelRelated();
    if (!panelComments || !panelRelated) return false;

    // active 初期適用
    applyActive(runtimeState.activePanel || "comments");

    // 元位置を覚える
    const comments = rememberCommentsOriginal(original);
    const related = rememberRelatedOriginal(original);
    if (!comments && !related) return false;

    // panelへ移動
    if (comments && comments.parentElement !== panelComments) {
      panelComments.appendChild(comments);
    }
    if (related && related.parentElement !== panelRelated) {
      panelRelated.appendChild(related);
    }

    document.documentElement.dataset.yclh = "1";
    ensureCssInserted();
    return true;
  };

  const apply = () => {
    if (applied) return;
    applied = true;

    if (tryApplyOnce()) return;

    stopBootWatch();

    bootObserver = new MutationObserver(() => {
      if (!applied) return;
      if (tryApplyOnce()) stopBootWatch();
    });

    bootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    bootTimer = setTimeout(() => stopBootWatch(), 4000);
  };

  const restore = () => {
    if (!applied) return;
    applied = false;

    stopBootWatch();

    restoreCommentsOriginal(original);
    restoreRelatedOriginal(original);

    delete document.documentElement.dataset.yclh;

    cleanupSideUi();
    cleanupLayoutRoot();

    ensureCssRemoved();
    resetOriginal();
  };

  return { apply, restore };
};
