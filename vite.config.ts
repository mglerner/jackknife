/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // Production build is served from mglerner.com/jackknife/, so assets need that
  // base. Dev (vite serve) stays at root so localhost works unchanged.
  base: command === "build" ? "/jackknife/" : "/",
  server: { host: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
}));
