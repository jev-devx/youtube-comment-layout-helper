import { safeInsertBefore } from "./insert.js";

export const IDS = {
  sticky: "yclh-sticky-root",
  layout: "yclh-layout-root",
  side: "yclh-side",
};

const $id = (id) => document.getElementById(id);

export const getStickyRoot = () => $id(IDS.sticky);
export const getLayoutRoot = () => $id(IDS.layout);
export const getSideRoot = () => $id(IDS.side);

export const canBuildLayoutRoot = () => !!document.querySelector("#secondary");

/**
 * #secondary の先頭に stickyRoot/layoutRoot/side を「必ず」用意（修復込み）
 */
export const ensureLayoutRoot = () => {
  const secondary = document.querySelector("#secondary");
  if (!secondary) return null;

  let sticky = $id(IDS.sticky);
  let layout = $id(IDS.layout);
  let side = $id(IDS.side);

  if (!sticky) {
    sticky = document.createElement("div");
    sticky.id = IDS.sticky;
  }

  if (!layout) {
    layout = document.createElement("div");
    layout.id = IDS.layout;
  }

  if (!side) {
    side = document.createElement("div");
    side.id = IDS.side;
    layout.appendChild(side);
  } else if (side.parentElement !== layout) {
    layout.appendChild(side);
  }

  if (layout.parentElement !== sticky) {
    sticky.appendChild(layout);
  }

  // sticky が #secondary 直下に居なければ差し直す
  if (sticky.parentElement !== secondary) {
    safeInsertBefore(secondary, sticky, secondary.firstChild);
  }

  return { sticky, layout, side };
};

/** 中身が無ければ掃除 */
export const cleanupLayoutRoot = () => {
  const sticky = $id(IDS.sticky);
  const layout = $id(IDS.layout);
  if (!sticky || !layout) return;

  const side = layout.querySelector(`#${IDS.side}`);
  if (side?.firstChild) return;

  sticky.remove();
};
