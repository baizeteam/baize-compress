import type { CompressPlugin, CompressPluginConfig } from "../../types.js";
import moduleUrl from "./compress.ts?worker&url";

// 创建 JPEG 和 WebP 压缩插件。
export function jpegWebp(config?: CompressPluginConfig): CompressPlugin {
  return {
    name: "jpeg-webp",
    // 匹配插件支持的图片 MIME 类型。
    matches: (fileType: string) => fileType === "image/jpeg" || fileType === "image/webp",
    moduleUrl,
    defaultConfig: {
      quality: config?.quality ?? 0.75,
    },
  };
}
