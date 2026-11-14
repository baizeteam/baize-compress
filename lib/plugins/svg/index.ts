import type { CompressPlugin, CompressPluginConfig } from "../../types.js";
import moduleUrl from "./compress.ts?worker&url";

export interface SvgConfig extends CompressPluginConfig {
  floatPrecision?: number;
  svgoPlugins?: any[];
}

const DEFAULT_SVGO_PLUGINS = ["preset-default", "removeDimensions"];

// 创建 SVG 压缩插件并设置默认优化参数。
export function svg(config?: SvgConfig): CompressPlugin {
  return {
    name: "svg",
    // 匹配插件支持的图片 MIME 类型。
    matches: (fileType: string) => fileType === "image/svg+xml",
    moduleUrl,
    defaultConfig: {
      floatPrecision: config?.floatPrecision ?? 8,
      svgoPlugins: config?.svgoPlugins ?? DEFAULT_SVGO_PLUGINS,
    },
  };
}
