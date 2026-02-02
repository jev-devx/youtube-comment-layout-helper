import "./styles/content.css";

import { loadSettings, onSettingsChanged } from "./shared/storage.js";
import { applySettings, settings } from "./shared/state.js";
import { createOrchestrator } from "./app/orchestrator/index.js";

(() => {
  const orc = createOrchestrator();

  const updateRuntimeToPopup = () => {
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

  const applyEnabledState = () => {
    if (settings.enabled) {
      orc.apply();
      // enabled 中は moveLeft も毎回反映
      orc.syncMoveLeft();
      console.log("[YCLH] orc.apply() ok", location.href);
    } else {
      orc.restore();
      console.log("[YCLH] orc.restore() ok", location.href);
    }
    updateRuntimeToPopup();
  };

  // 初回
  (async () => {
    applySettings(await loadSettings());
    applyEnabledState();
  })();

  // 設定変更追従（popup toggle）
  onSettingsChanged((patch) => {
    applySettings(patch);

    // enabled の変更だけ apply/restore が必要
    if ("enabled" in patch) {
      applyEnabledState();
      return;
    }

    // moveLeft 単体は即反映（有効中のみ中で弾く）
    if ("moveLeft" in patch) {
      orc.syncMoveLeft();
      console.log("[YCLH] orc.syncMoveLeft() ok");
    }
  });
})();
