import { safeInsertBefore } from "./insert.js";

export const IDS = {
  layout: "yclh-layout-root",
  side: "yclh-side",
};

const $id = (id) => document.getElementById(id);

export const getLayoutRoot = () => $id(IDS.layout);
export const getSideRoot = () => $id(IDS.side);

export const canBuildLayoutRoot = () => !!document.querySelector("#secondary");

/**
 * #secondary の先頭に layoutRoot/side を「必ず」用意（修復込み）
 */
export const ensureLayoutRoot = () => {
  const secondary = document.querySelector("#secondary");
  if (!secondary) return null;

  let layout = $id(IDS.layout);
  let side = $id(IDS.side);

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

  // layout が #secondary 直下に居なければ差し直す（detach対策）
  if (layout.parentElement !== secondary) {
    safeInsertBefore(secondary, layout, secondary.firstChild);
  }

  return { layout, side };
};

/** 中身が無ければ掃除 */
export const cleanupLayoutRoot = () => {
  const layout = $id(IDS.layout);
  if (!layout) return;

  const side = layout.querySelector(`#${IDS.side}`);
  if (side?.firstChild) return;

  layout.remove();
};
