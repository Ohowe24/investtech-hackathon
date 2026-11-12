import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@contract": fileURLToPath(new URL("./contract", import.meta.url)),
      "@data": fileURLToPath(new URL("./data", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
