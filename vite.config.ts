/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
