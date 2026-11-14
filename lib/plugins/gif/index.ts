import type { CompressPlugin, CompressPluginConfig } from "../../types.js";
import moduleUrl from "./compress.ts?worker&url";

export interface GifConfig extends CompressPluginConfig {
  optimize?: 1 | 2 | 3;
  lossy?: number;
}

// 创建 GIF 压缩插件并设置默认质量和优化等级。
export function gif(config?: GifConfig): CompressPlugin {
  return {
    name: "gif",
    // 匹配插件支持的图片 MIME 类型。
    matches: (fileType: string) => fileType === "image/gif",
    moduleUrl,
    defaultConfig: {
      quality: config?.quality ?? 0.75,
      optimize: config?.optimize ?? 1,
      ...(config?.lossy !== undefined ? { lossy: config.lossy } : {}),
    },
  };
}
