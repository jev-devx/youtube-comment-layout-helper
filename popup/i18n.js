/**
 * 多言語メッセージ定義
 */

export const getLang = () => {
  return navigator.language.startsWith("ja") ? "ja" : "en";
};

export const MESSAGES = {
  ja: {
    // Header
    title: "YCLH",
    subtitle: "YouTube Comment Layout Helper",

    // Tabs
    tabLayout: "メイン",
    tabMute: "ミュート",

    // Panel: Layout
    enabledTitle: "YCLHを有効化する",
    enabledDesc: "コメント欄レイアウトを拡張します",
    optionsTitle: "OPTIONS",
    moveLeftTitle: "サイドパネルを左に配置",
    moveLeftDesc: "レイアウトの左右を切り替えます",
    chatAutoTitle: "チャット・チャットのリプレイの表示方法",
    chatAutoRecommendedTitle: "おすすめ",
    chatAutoRecommendedDesc:
      "生配信「チャット」<br>アーカイブ「上位のチャットのリプレイ」<br>を自動で選択します",
    chatAutoDefaultTitle: "デフォルト",
    chatAutoDefaultDesc: "YouTubeの既定の挙動を使用します",

    // Panel: Mute
    wordMuteTitle: "WORD MUTE",
    muteTitle: "ミュート",
    muteDesc:
      "指定したワードが含まれるコメント・チャットを見た目のみ置換してミュートします",
    muteApplyChatTitle: "チャットにも適用",
    muteApplyChatDesc: "チャット・チャットのリプレイにもミュートを適用します",
    replacePresetTitle: "置換設定",
    replacePresetDefaultTitle: "ミュートワードが含まれています",
    replacePresetNyanTitle: "にゃーん",
    muteListTitle: "ミュートリスト",
    muteAddButton: "＋ 追加",

    // Mute item
    muteItemLabel: "部分一致",
    muteItemPlaceholder: (max) => `ミュートワード（最大${max}文字）`,
    muteItemRemoveLabel: "削除",

    // Footer
    resetButton: "設定をリセット",
    resetDesc: "YCLHの設定をすべて初期状態に戻します",
    supportTitle: "コーヒーをおごる",
    supportDesc: "開発の継続の励みになります",
    buyMeCoffeeButton: "Buy Me a Coffee",

    // Overlay
    statusOverlayTitle: "YCLH は一時停止中",
    statusOverlayHint: "シアターモード解除 / ウィンドウ幅を広げると再開します",

    // Runtime messages
    NOT_YOUTUBE: "YCLHはYouTube専用の拡張機能です",
    NOT_WATCH: "YouTubeの動画ページで有効になります",
    RELOAD_HINT: "うまく反映されない場合は、ページをリロードしてください",
    RUNTIME_UNAVAILABLE:
      "ページ情報を取得できませんでした（タブを更新すると改善することがあります）",
    REQUIRE_ENABLE:
      "このページで有効にするには、下の「YCLHを有効化する」をONにしてください",
    THEATER_DISABLED: "シアターモードのため自動でOFFになりました",
    THEATER_HINT: "シアターモード解除してONにしてください",
    NARROW_DISABLED: "ウィンドウ幅が小さいため自動でOFFになりました",
    NARROW_HINT: "ウィンドウ幅を広げてONにしてください",
    MUTE_REQUIRE_ENABLE:
      "適用するには「YCLHを有効化」をONにしてください\nOFFの状態でも設定は保存できます",
  },
  en: {
    // Header
    title: "YCLH",
    subtitle: "YouTube Comment Layout Helper",

    // Tabs
    tabLayout: "Main",
    tabMute: "Mute",

    // Panel: Layout
    enabledTitle: "Enable YCLH",
    enabledDesc: "Extend comment section layout",
    optionsTitle: "OPTIONS",
    moveLeftTitle: "Place side panel on the left",
    moveLeftDesc: "Toggle layout direction",
    chatAutoTitle: "Chat / Chat Replay display method",
    chatAutoRecommendedTitle: "Recommended",
    chatAutoRecommendedDesc:
      'Live "Chat"<br>Archive "Top Chat Replays"<br>Auto-selected',
    chatAutoDefaultTitle: "Default",
    chatAutoDefaultDesc: "Use YouTube's default behavior",

    // Panel: Mute
    wordMuteTitle: "WORD MUTE",
    muteTitle: "Mute",
    muteDesc: "Replace appearance of comments/chats containing specified words",
    muteApplyChatTitle: "Apply to Chat",
    muteApplyChatDesc: "Apply mute to chat and chat replays",
    replacePresetTitle: "Replace Settings",
    replacePresetDefaultTitle: "Muted word is included",
    replacePresetNyanTitle: "Meow",
    muteListTitle: "Mute List",
    muteAddButton: "+ Add",

    // Mute item
    muteItemLabel: "Partial match",
    muteItemPlaceholder: (max) => `Muted word (max ${max} characters)`,
    muteItemRemoveLabel: "Remove",

    // Footer
    resetButton: "Reset Settings",
    resetDesc: "Restore all YCLH settings to defaults",
    supportTitle: "Buy Me a Coffee",
    supportDesc: "Your support keeps development going",
    buyMeCoffeeButton: "Buy Me a Coffee",

    // Overlay
    statusOverlayTitle: "YCLH is paused",
    statusOverlayHint: "Disable theater mode / widen window to resume",

    // Runtime messages
    NOT_YOUTUBE: "YCLH is an extension exclusive to YouTube",
    NOT_WATCH: "Works on YouTube video pages only",
    RELOAD_HINT: "If changes don't reflect, try reloading the page",
    RUNTIME_UNAVAILABLE: "Could not get page information (refresh may help)",
    REQUIRE_ENABLE: 'Enable "YCLH" below to use on this page',
    THEATER_DISABLED: "Automatically disabled in theater mode",
    THEATER_HINT: "Disable theater mode to enable YCLH",
    NARROW_DISABLED: "Automatically disabled due to narrow window",
    NARROW_HINT: "Widen your window to enable YCLH",
    MUTE_REQUIRE_ENABLE:
      'Enable "YCLH" above to apply\nSettings can be saved even when disabled',
  },
};

export const getMessage = (key, ...args) => {
  const lang = getLang();
  const message = MESSAGES[lang]?.[key] ?? MESSAGES.en?.[key];

  if (typeof message === "function") {
    return message(...args);
  }
  return message || key;
};
