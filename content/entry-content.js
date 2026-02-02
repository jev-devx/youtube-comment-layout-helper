import "./styles/content.css";

import { loadSettings, onSettingsChanged } from "./shared/storage.js";
import { applySettings, settings } from "./shared/state.js";
import { createOrchestrator } from "./app/orchestrator/index.js";

(() => {
  const orc = createOrchestrator();

  const applyFromSettings = async () => {
    const s = await loadSettings();
    applySettings(s);

    if (settings.enabled) {
      orc.apply();
      console.log("[YCLH] orc.apply() ok", location.href);
    } else {
      orc.restore();
      console.log("[YCLH] orc.restore() ok", location.href);
    }

    // popup向けruntime
    try {
      chrome.runtime.sendMessage({
        type: "YCLH_SET_RUNTIME",
        payload: {
          pageType: location.hostname.endsWith("youtube.com")
            ? "youtube"
            : "unsupported",
          suspended: !settings.enabled,
          suspendReason: settings.enabled ? null : "disabled",
        },
      });
    } catch {}
  };

  // 初回
  applyFromSettings();

  // 設定変更追従（popup toggle）
  onSettingsChanged((patch) => {
    applySettings(patch);
    applyFromSettings();
  });
})();
