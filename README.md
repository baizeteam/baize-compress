# baize-compress

浏览器端图片、音视频压缩库。插件按需引入，共用 Web Worker 池，支持批量压缩、超时和取消。

## 安装

```sh
pnpm add baize-compress
```

## 使用

```typescript
import { ImageCompressor } from "baize-compress";
import { jpegWebp } from "baize-compress/plugins/jpeg-webp";
import { png } from "baize-compress/plugins/png";
import { svg } from "baize-compress/plugins/svg";
import { gif } from "baize-compress/plugins/gif";
import { media } from "baize-compress/plugins/media";

const compressor = new ImageCompressor({
  workerNum: 2,
  plugins: [jpegWebp(), png(), svg(), gif(), media()],
});

try {
  const results = await compressor.compressFilesWorker(files); // File[]
  for (const result of results) {
    if (result.status === "fulfilled") {
      console.log(result.value.file, result.value.compressInfo);
    } else {
      console.error(result.reason);
    }
  }
} finally {
  compressor.cancelAll();
}
```

按需保留需要的插件。返回结果与输入顺序一致，每个文件独立成功或失败；多个插件匹配同一类型时，使用先注册的插件。

## 插件

| 插件       | 支持格式        | 默认参数                                     |
| ---------- | --------------- | -------------------------------------------- |
| `jpegWebp` | JPEG、WebP      | `quality: 0.75`                              |
| `png`      | PNG             | `quality: 0.8`                               |
| `svg`      | SVG             | `floatPrecision: 8`                          |
| `gif`      | GIF             | `quality: 0.75`、`optimize: 1`               |
| `media`    | 音频、视频、Ogg | `quality: 0.5`、`keepOriginalIfLarger: true` |

参数传入对应工厂函数，如 `jpegWebp({ quality: 0.8 })`。`quality` 范围为 0–1，越大质量越高。完整配置与扩展方式见 [插件指南](./docs/plugins.md)。

## API

`new ImageCompressor({ plugins, workerNum })`：`plugins` 必填，`workerNum` 为安全正整数，默认 `4`。文件读取与压缩共用并发上限，Worker 按需创建并复用。

| 方法                                  | 用途                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| `compressFilesWorker(files: File[])`  | 批量压缩，返回 `Promise<PromiseSettledResult<CompressBackInfo>[]>` |
| `compressImagesWorker(files: File[])` | 兼容入口，与 `compressFilesWorker` 行为一致                        |
| `cancelAll()`                         | 取消未完成的任务并释放 Worker，之后可再次提交                      |

成功结果的 `value` 包含：

| 字段                          | 含义               |
| ----------------------------- | ------------------ |
| `file`                        | 压缩后的 `File`    |
| `compressInfo.rate`           | 压缩率（%）        |
| `compressInfo.time`           | 压缩耗时（毫秒）   |
| `compressInfo.originalSize`   | 压缩前体积（字节） |
| `compressInfo.compressedSize` | 压缩后体积（字节） |

## 使用约定

- 使用支持 ESM Worker 的现代浏览器；JPEG / WebP 需要 OffscreenCanvas，音视频需要 HTTPS 或 localhost 及 WebCodecs 支持。
- 文件需具有正确的 MIME 类型。图片最大 50 MB，音视频不设固定上限，但在内存中处理，建议音视频并发设为 `1` 或 `2`。
- 默认在结果未变小时保留原文件；APNG 始终保留原始动画数据。音视频必须转换到指定格式时，设置 `keepOriginalIfLarger: false`。
- 音视频默认保留原容器格式、文件名和 MIME（MOV 仍为 MOV），显式设置 `format` 时才转换容器；仅保留主要视频轨道和主要音频轨道。支持的编解码取决于浏览器，不支持时返回该文件失败。
- 图片任务默认超时 30 秒，音视频 10 分钟。取消会立即结束任务等待，已开始的原生文件读取会自行完成并丢弃结果。
- 启用 CSP 时允许同源脚本和 Worker；GIF 还需 `script-src 'wasm-unsafe-eval'`，音视频还需 `worker-src 'self' blob:`。

开发、构建和测试说明见 [开发指南](./docs/development.md)。
