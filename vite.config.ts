import { posix } from "node:path";
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import { gifsiclePlugin } from "./build/gifsicle.ts";

// 通过 ?worker&url 将压缩模块打包成独立 ESM，保留 compress 导出供通用 Worker 加载。
const worker: UserConfig["worker"] = {
  format: "es",
  // 为压缩模块保留导出，供通用 Worker 动态导入。
  plugins: () => [
    gifsiclePlugin(),
    {
      name: "baize-compression-module-exports",
      // 保留独立压缩模块入口的导出签名。
      options(options) {
        return { ...options, preserveEntrySignatures: "strict" };
      },
    },
  ],
};

const pageConfig: UserConfig = {
  worker,
  server: { port: 6103 },
  plugins: [react(), gifsiclePlugin()],
  base: "./",
  build: { outDir: "dist-page" },
  optimizeDeps: {
    include: ["upng-js", "svgo", "gifsicle-wasm-browser", "mediabunny"],
  },
};

const libConfig: UserConfig = {
  worker,
  base: "./",
  experimental: {
    // 为 Worker 和压缩模块保留同源资源地址，避免消费端内联为 data URL。
    renderBuiltUrl(filename, { hostId, hostType }) {
      if (hostType === "js" && /(?:pool\.worker|compress)-/.test(filename)) {
        const relative = posix.relative(posix.dirname(hostId), filename);
        return { runtime: `new URL(${JSON.stringify(`./${relative}?no-inline`)}, import.meta.url).href` };
      }
      return { relative: true };
    },
  },
  build: {
    lib: {
      entry: {
        index: "./lib/main.ts",
        "plugins/jpeg-webp": "./lib/plugins/jpeg-webp/index.ts",
        "plugins/png": "./lib/plugins/png/index.ts",
        "plugins/svg": "./lib/plugins/svg/index.ts",
        "plugins/gif": "./lib/plugins/gif/index.ts",
        "plugins/media": "./lib/plugins/media/index.ts",
      },
      formats: ["es"],
    },
  },
};

export default defineConfig(process.env.BUILD_MODE === "lib" ? libConfig : pageConfig);
