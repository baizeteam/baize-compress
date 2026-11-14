import type { CompressPlugin, CompressPluginConfig } from "../../types.js";
import moduleUrl from "./compress.ts?worker&url";

// 创建 PNG 压缩插件。
export function png(config?: CompressPluginConfig): CompressPlugin {
  return {
    name: "png",
    // 匹配插件支持的图片 MIME 类型。
    matches: (fileType: string) => fileType === "image/png",
    moduleUrl,
    defaultConfig: {
      quality: config?.quality ?? 0.8,
    },
  };
}
