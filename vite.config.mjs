import { defineConfig } from "vite";
import { resolve } from "path";

const root = process.cwd();

export default defineConfig(({ mode }) => {
  const isContent = mode === "content";

  return {
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: false,
      cssCodeSplit: !isContent,

      rollupOptions: {
        input: resolve(
          root,
          isContent ? "content/entry-content.js" : "popup/entry-popup.js",
        ),
        output: {
          format: isContent ? "iife" : "es",
          inlineDynamicImports: isContent,
          entryFileNames: isContent ? "content.js" : "popup.js",
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || "";
            if (name.endsWith(".css"))
              return isContent ? "content.css" : "popup.css";
            return "assets/[name][extname]";
          },
        },
      },
    },
  };
});
