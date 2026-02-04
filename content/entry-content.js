import "./styles/content.css";

import { loadSettings, onSettingsChanged } from "./shared/storage.js";
import { applySettings, settings } from "./shared/state.js";
import { createOrchestrator } from "./app/orchestrator/index.js";

(() => {
  const orc = createOrchestrator();

  const applyAmbientFlags = () => {
    const html = document.documentElement;

    if (settings.enabled) {
      html.dataset.ytCommentExtEnabled = "1";
      html.dataset.ytCommentExtAmbientOff = "1";
    } else {
      delete html.dataset.ytCommentExtEnabled;
      delete html.dataset.ytCommentExtAmbientOff;
    }
  };

  const applyEnabledState = () => {
    if (settings.enabled) {
      orc.apply();

      // enabled 中は moveLeft も毎回反映
      orc.syncMoveLeft();

      // アンビエント効果を無効化する
      applyAmbientFlags();

      console.log("[YCLH] orc.apply() ok", location.href);
    } else {
      orc.restore();
      applyAmbientFlags();
      console.log("[YCLH] orc.restore() ok", location.href);
    }
    orc.publishRuntime?.(); // popup反映（最終状態をorc側が送る）
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
