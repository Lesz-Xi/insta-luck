import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["hosted/**/*.test.ts", "web/**/*.test.ts"]
  }
});
