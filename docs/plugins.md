# 插件配置与扩展

基础用法见 [README](../README.md)。内置插件已封装压缩模块入口，使用时只需配置压缩参数。

## 图片插件

```typescript
import { jpegWebp } from "baize-compress/plugins/jpeg-webp";
import { png } from "baize-compress/plugins/png";
import { svg } from "baize-compress/plugins/svg";
import { gif } from "baize-compress/plugins/gif";

jpegWebp({ quality: 0.75 });
png({ quality: 0.8 });
svg({ floatPrecision: 8, svgoPlugins: ["preset-default", "removeDimensions"] });
gif({ quality: 0.75, optimize: 1, lossy: 40 });
```

- `jpegWebp` 使用 OffscreenCanvas，匹配 `image/jpeg` 和 `image/webp`。
- `png` 使用 upng-js，匹配 `image/png`；`quality` 映射为调色板颜色数。APNG 保留原文件。
- `svg` 使用 SVGO，匹配 `image/svg+xml`；上例即默认参数。
- `gif` 使用 gifsicle-wasm-browser，匹配 `image/gif`。`optimize` 支持 `1 | 2 | 3`，默认 `1`；`lossy` 范围为 0–200，设置后覆盖质量换算，`0` 表示无损优化。未设置 `lossy` 时，按 `(1 - quality) * 200` 换算。

## 音视频插件

`media` 基于 Mediabunny / WebCodecs，在 Worker 内解码、重新编码并封装媒体，匹配 `audio/*`、`video/*` 和 `application/ogg`。

```typescript
import { media } from "baize-compress/plugins/media";

media({
  quality: 0.5,
  format: "webm",
  maxWidth: 1280,
  maxHeight: 720,
  keepOriginalIfLarger: false,
});
```

| 参数                              | 默认值   | 说明                                                                                                             |
| --------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `quality`                         | `0.5`    | 0–1，越大质量越高                                                                                                |
| `format`                          | 自动选择 | WebM / Ogg 输入保留容器，其他输入输出 MP4；MP4 纯音频使用 `.m4a`，Ogg 仅支持纯音频                               |
| `videoCodec` / `audioCodec`       | 自动选择 | 视频支持 `avc`、`hevc`、`vp8`、`vp9`、`av1`；音频支持 `aac`、`opus`、`mp3`、`vorbis`、`flac`，取决于浏览器和容器 |
| `videoBitrate` / `audioBitrate`   | 未设置   | bit/s，覆盖对应轨道的 `quality`                                                                                  |
| `maxWidth` / `maxHeight`          | 原始尺寸 | 等比缩小，不放大，尺寸向下对齐偶数（至少 2）                                                                     |
| `frameRate`                       | 原始帧率 | 输出视频帧率                                                                                                     |
| `sampleRate` / `numberOfChannels` | 原始值   | 音频采样率（Hz）和声道数                                                                                         |
| `keepOriginalIfLarger`            | `true`   | 结果未变小时保留原文件，包括文件名和 MIME                                                                        |
| `timeoutMs`                       | `600000` | 单文件超时（毫秒），包含模块加载和转码                                                                           |

默认仅输出主要视频轨道和主要音频轨道，其他音轨和字幕会被丢弃。不支持的编解码会返回该文件失败，不会静默丢失音轨；不内置额外 WASM 编码器。

## 自定义插件

插件提供 MIME 匹配、独立压缩模块地址和默认参数。例如压缩 JSON 空白的插件入口 `compact-json.ts`：

```typescript
import type { CompressPlugin } from "baize-compress";

// 创建 JSON 空白压缩插件。
export function compactJson(): CompressPlugin {
  return {
    name: "compact-json",
    // 匹配 JSON 文件的 MIME 类型。
    matches: (fileType) => fileType === "application/json",
    moduleUrl: new URL("./json.compress.js", import.meta.url).href,
    defaultConfig: {},
  };
}
```

独立压缩模块 `json.compress.js`：

```javascript
// 删除 JSON 空白，并在结果未变小时保留原始数据。
export async function compress({ arrayBuffer, fileName, fileType }) {
  const value = JSON.parse(new TextDecoder().decode(arrayBuffer));
  const compressed = new TextEncoder().encode(JSON.stringify(value));
  const data = compressed.byteLength < arrayBuffer.byteLength ? compressed.buffer : arrayBuffer;
  return { success: true, data, fileName, fileType };
}
```

将 `compactJson()` 放入 `ImageCompressor` 的 `plugins` 数组即可使用。

| 插件字段        | 说明                                 |
| --------------- | ------------------------------------ |
| `name`          | 插件名称                             |
| `matches`       | 判断文件 MIME 是否匹配               |
| `moduleUrl`     | 插件封装的压缩模块地址               |
| `defaultConfig` | 与文件数据一起传给压缩函数的默认参数 |
| `timeoutMs`     | 单任务超时（毫秒），默认 `30000`     |

压缩模块须为浏览器可直接加载的独立 ESM，导出异步 `compress` 函数。使用 TypeScript 或第三方编码库时，发布前应打包模块及其依赖；模块在 Worker 内执行，不要注册 Worker 消息监听器。

`compress` 接收 `arrayBuffer`、`fileName`、`fileType` 和默认参数。成功时返回 `{ success: true, data, fileName?, fileType? }`，`data` 必须为 `ArrayBuffer`；失败时返回 `{ success: false, error }` 或抛错。结果未变小时可返回原始缓冲区，文件名和 MIME 未返回时沿用输入值。
