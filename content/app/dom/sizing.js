import { getSideRoot } from "./layoutRoot.js";
import { getTabsRoot } from "./sideRoot.js";

/**
 * sizing.js
 * - side の top を基準に「残り高さ」を算出し CSS 変数へ反映
 */
export const createSizing = () => {
  const sync = () => {
    const side = getSideRoot?.();
    if (!side) return false;

    const top = side.getBoundingClientRect().top;
    const pad = 8;

    const layoutH = Math.max(240, Math.floor(window.innerHeight - top - pad));

    const tabs = getTabsRoot?.();
    const tabsH = tabs ? Math.ceil(tabs.getBoundingClientRect().height) : 0;
    const panelsH = Math.max(180, layoutH - tabsH);

    document.documentElement.style.setProperty(
      "--yclh-layout-h",
      `${layoutH}px`,
    );
    document.documentElement.style.setProperty(
      "--yclh-panels-h",
      `${panelsH}px`,
    );

    return true;
  };

  let raf = 0;
  let t1 = 0;
  let t2 = 0;
  let ro = null;

  const onResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sync);

    clearTimeout(t1);
    t1 = setTimeout(sync, 120);

    clearTimeout(t2);
    t2 = setTimeout(sync, 520);
  };

  const startResizeObserver = () => {
    if (ro) return;

    const side = getSideRoot?.();
    if (!side) return;

    const tabs = getTabsRoot?.();

    ro = new ResizeObserver(() => {
      requestAnimationFrame(sync);
    });

    ro.observe(side);
    if (tabs) ro.observe(tabs);
  };

  const stopResizeObserver = () => {
    ro?.disconnect();
    ro = null;
  };

  const start = () => {
    sync();
    window.addEventListener("resize", onResize, { passive: true });
    startResizeObserver();
  };

  const stop = () => {
    window.removeEventListener("resize", onResize);
    stopResizeObserver();

    cancelAnimationFrame(raf);
    raf = 0;

    clearTimeout(t1);
    t1 = 0;
    clearTimeout(t2);
    t2 = 0;

    document.documentElement.style.removeProperty("--yclh-layout-h");
    document.documentElement.style.removeProperty("--yclh-panels-h");
  };

  return { start, stop, sync };
};
