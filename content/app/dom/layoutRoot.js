import { safeInsertBefore } from "./insert.js";

export const IDS = {
  layout: "yclh-layout-root",
  side: "yclh-side",
};

const $id = (id) => document.getElementById(id);

export const hasLayoutRoot = () => !!$id(IDS.layout);

export const canBuildLayoutRoot = () => {
  const secondary = document.querySelector("#secondary");
  return !!secondary;
};

/**
 * #secondary の先頭に layoutRoot/side を「必ず」用意する（修復込み）
 * - layout が存在しても、secondary配下に無ければ差し直す
 * - side が無ければ作り直す
 */
export const ensureLayoutRoot = () => {
  const secondary = document.querySelector("#secondary");
  if (!secondary) return null;

  let layout = $id(IDS.layout);
  let side = $id(IDS.side);

  // layout が無ければ新規作成
  if (!layout) {
    layout = document.createElement("div");
    layout.id = IDS.layout;
  }

  // side が無ければ作成（layout の子にする）
  if (!side) {
    side = document.createElement("div");
    side.id = IDS.side;
    layout.appendChild(side);
  } else if (side.parentElement !== layout) {
    // side がどこかに居たら layout 配下へ戻す
    layout.appendChild(side);
  }

  // layout が #secondary 直下に居なければ差し直す（detach対策）
  if (layout.parentElement !== secondary) {
    safeInsertBefore(secondary, layout, secondary.firstChild);
  }

  return { layout, side };
};

export const getSideRoot = () => $id(IDS.side);

/** 何も入ってなければ掃除 */
export const cleanupLayoutRoot = () => {
  const layout = $id(IDS.layout);
  if (!layout) return;

  const side = layout.querySelector(`#${IDS.side}`);
  if (side?.firstChild) return; // 中身が残ってるなら触らない

  layout.remove();
};
