export const DEFAULT_SETTINGS = {
  enabled: false,
  moveLeft: false,
  chatAutoMode: "recommended",

  wordMute: {
    preset: "default", // "default" | "nyan"
    items: [{ id: "init", exact: false, word: "" }],
    muteForChat: false,
  },
};
