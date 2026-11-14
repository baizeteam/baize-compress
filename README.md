# baize-compress

支持 jpg、jpeg、png、webp、svg、gif 图片压缩，以及基于 Mediabunny / WebCodecs 的音视频压缩。插件按需引入，压缩任务通过共用 Web Worker 池执行。

图片和音视频统一使用 `ImageCompressor`，通过插件选择压缩格式。

## 开始

### 安装

```
pnpm install baize-compress
```

### 使用

插件按需引入，每个插件可独立配置压缩参数：

```typescript
import { ImageCompressor } from "baize-compress";
import { jpegWebp } from "baize-compress/plugins/jpeg-webp";
import { png } from "baize-compress/plugins/png";
import { svg } from "baize-compress/plugins/svg";
import { gif } from "baize-compress/plugins/gif";

const compressor = new ImageCompressor({
  workerNum: 8,
  plugins: [
    jpegWebp({ quality: 0.75 }),
    png({ quality: 0.8 }),
    svg({ floatPrecision: 8, svgoPlugins: ["preset-default", "removeDimensions"] }),
    gif({ quality: 0.75, optimize: 1 }),
  ],
});

const compressionResults = await compressor.compressImagesWorker(files);

compressionResults.forEach((result, index) => {
  if (result.status === "fulfilled") {
    const { compressInfo, file } = result.value;
    console.log(`图片 ${index + 1}:`);
    console.log(`  压缩率: ${compressInfo.rate}%`);
    console.log(`  压缩耗时: ${compressInfo.time}ms`);
    console.log(`  原始大小: ${compressInfo.originalSize} bytes`);
    console.log(`  压缩后大小: ${compressInfo.compressedSize} bytes`);
    console.log(`  压缩后文件:`, file);
  } else {
    console.error(`图片 ${index + 1} 压缩失败:`, result.reason);
  }
});
```

## 插件

### jpegWebp

处理 `image/jpeg` 和 `image/webp` 格式，使用 OffscreenCanvas 压缩。

```typescript
import { jpegWebp } from "baize-compress/plugins/jpeg-webp";

// 使用默认配置
jpegWebp();

// 自定义 quality（0-1，默认 0.75）
jpegWebp({ quality: 0.75 });
```

### png

处理 `image/png` 格式，使用 upng-js 压缩。

```typescript
import { png } from "baize-compress/plugins/png";

// 使用默认配置
png();

// 自定义 quality（0-1，映射为调色板颜色数，默认 0.8）
png({ quality: 0.6 });
```

### svg

处理 `image/svg+xml` 格式，使用 svgo 压缩。

```typescript
import { svg } from "baize-compress/plugins/svg";

// 使用默认配置
svg();

// 自定义 SVGO 参数
svg({
  floatPrecision: 6, // 浮点数精度，默认 8
  svgoPlugins: ["preset-default", "removeDimensions"], // SVGO 插件列表
});
```

### gif

处理 `image/gif` 格式，使用 [gifsicle-wasm-browser](https://github.com/renzhezhilu/gifsicle-wasm-browser) 压缩。任务走共用的 worker 池，gifsicle 只负责在 worker 内执行压缩。

```typescript
import { gif } from "baize-compress/plugins/gif";

// 使用默认配置：quality 0.75（约等于 --lossy=50）、optimize 1（-O1）
gif();

gif({
  quality: 0.75, // 0-1，越大画质越高。未传 lossy 时换算为 --lossy = (1 - quality) * 200
  optimize: 1, // gifsicle -O 等级，1 | 2 | 3，默认 1
  lossy: 40, // 0-200。设置后忽略 quality 换算；0 表示不做有损压缩
});
```

大图建议保持 `optimize: 1`。`-O2` / `-O3` 耗时会明显增加，压缩效果通常接近 `-O1`。单次任务超过 30 秒会超时。

### media（音视频）

使用 [Mediabunny Conversion API](https://mediabunny.dev/guide/converting-media-files)，在共用 Worker 中解码、重新编码并封装音视频，不需要 FFmpeg。需在 HTTPS 或 localhost 下运行；可处理的输入编码和输出编码取决于浏览器的 [WebCodecs 支持](https://mediabunny.dev/guide/supported-formats-and-codecs)。不支持的编解码会返回该文件失败，不会静默丢失音轨。

```typescript
import { ImageCompressor } from "baize-compress";
import { media } from "baize-compress/plugins/media";

const compressor = new ImageCompressor({
  workerNum: 2,
  plugins: [
    media({
      quality: 0.5,
      maxWidth: 1280,
      maxHeight: 720,
      // format: "webm",       // 可选：mp4 | webm | ogg（ogg 仅纯音频）
      // videoBitrate: 1_500_000, // bit/s；覆盖视频 quality
      // audioBitrate: 96_000,    // bit/s；覆盖音频 quality
    }),
  ],
});

try {
  const results = await compressor.compressFilesWorker(files); // File[]，可混合音频和视频
  for (const result of results) {
    if (result.status === "fulfilled") {
      console.log(result.value.file, result.value.compressInfo);
    } else {
      console.error(result.reason);
    }
  }
} finally {
  compressor.cancelAll(); // 释放 Worker；取消运行中和排队中的任务时，对应结果会 rejected
}
```

也可以把 `media()` 和图片插件放在同一个 `plugins` 数组中。原有 `compressImagesWorker()` 兼容音视频，推荐新代码使用 `compressFilesWorker()`。

| 参数                              | 默认值       | 说明                                                                          |
| --------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| `quality`                         | `0.5`        | 0-1，越大质量越高；音视频轨道均重新编码                                       |
| `format`                          | 自动选择     | WebM / Ogg 输入保留容器，其他输入输出 MP4；MP4 纯音频文件使用 `.m4a`          |
| `videoCodec` / `audioCodec`       | 自动选择     | 浏览器可编码、容器可容纳的编码；可指定 `avc`、`vp9`、`aac`、`opus` 等         |
| `videoBitrate` / `audioBitrate`   | 未设置       | bit/s，覆盖对应轨道的 `quality`                                               |
| `maxWidth` / `maxHeight`          | 原始尺寸     | 保持比例缩小，不放大，尺寸向下对齐偶数（至少 2）                              |
| `frameRate`                       | 原始帧率     | 输出视频帧率                                                                  |
| `sampleRate` / `numberOfChannels` | 原始值       | 音频采样率（Hz）和声道数                                                      |
| `keepOriginalIfLarger`            | `true`       | 结果没有变小时返回原文件，保留原文件名和 MIME；必须输出指定格式时设为 `false` |
| `timeoutMs`                       | `600000`     | 单文件任务超时，包含模块加载和转码时间                                        |
| `moduleUrl`                       | 插件内置地址 | 覆盖 Worker 加载模块地址                                                      |

匹配 `audio/*`、`video/*` 和 `application/ogg` MIME。MIME 为空的 `File` 需先设置正确类型。默认只保留主要视频轨道和主要音频轨道；其他音轨、字幕不会进入输出。不内置额外 WASM 编码器，例如 MP3 输入可以压缩到 M4A / WebM / Ogg，MP3 输出编码取决于运行环境。

音视频不受图片的 50 MB 限制，但输入、输出均在内存中缓冲，建议 `workerNum: 1` 或 `2`，避免同时转码多个大文件耗尽内存。指定格式时应检查返回 `File` 的名称和 MIME，压缩未变小可能返回原文件。

### Worker 模块地址

每个内置插件都可以传 `moduleUrl`，用来替换 worker 加载压缩模块的地址。不传时使用包内自带的地址。打包器没有改写包内地址、worker 报 `Failed to fetch dynamically imported module` 时，在业务代码里自己填：

```typescript
import { gif } from "baize-compress/plugins/gif";

gif({
  moduleUrl: new URL("baize-compress/plugins/gif-compress.js", import.meta.url).href,
});
```

对应文件：

| 插件       | 地址                                           |
| ---------- | ---------------------------------------------- |
| `jpegWebp` | `baize-compress/plugins/jpeg-webp-compress.js` |
| `png`      | `baize-compress/plugins/png-compress.js`       |
| `svg`      | `baize-compress/plugins/svg-compress.js`       |
| `gif`      | `baize-compress/plugins/gif-compress.js`       |
| `media`    | `baize-compress/plugins/media-compress.js`     |

`new URL` 要写在业务代码里，这样打包器才会把文件发到站点上。也可以填已经部署好的地址，比如 `gif({ moduleUrl: "/vendor/gif-compress.js" })`。

## 自定义插件

`workerNum` 是全部插件共用的线程数。比如设成 4，不管注册了几种格式，都只有 4 个 worker。空闲的会复用，都在忙就排队。插件不用自己开线程，只要匹配文件类型，并用 `func` 指定压缩函数。

多个插件都能匹配同一个类型时，使用先注册的那个。`name` 不要和已注册插件重复。

`func` 写在插件同一个模块里即可，文件名不限。共用 worker 会按 `moduleUrl` 加载这个模块，再调用其中的 `func`。这个文件会被 worker 再执行一次，不要在里面启动页面。

Vite 里 `moduleUrl` 写 `import.meta.url`。Next.js（Turbopack）和 Webpack 会把裸的 `import.meta.url` 变成 `file://` 地址，浏览器里的 worker 拉不到，压缩会报 `Failed to fetch dynamically imported module`。这时要写成 `new URL("./压缩模块.js", import.meta.url).href`，让打包器把该文件发到站点上。这个文件必须是浏览器能直接 `import()` 的 ESM。

```typescript
import type { CompressPayload, CompressPlugin, CompressResult } from "baize-compress";

async function compressAvif({
  arrayBuffer,
  fileName,
  fileType,
  quality,
  colors,
}: CompressPayload): Promise<CompressResult> {
  const compressed = await encodeAvif(arrayBuffer, { quality, colors });
  const data = compressed.byteLength < arrayBuffer.byteLength ? compressed : arrayBuffer;
  return { success: true, data, fileName, fileType };
}

async function encodeAvif(buffer: ArrayBuffer, _options: { quality: number; colors: number }) {
  return buffer;
}

export function myFormat(config?: { quality?: number; colors?: number }): CompressPlugin {
  return {
    name: "my-format",
    matches: (fileType) => fileType === "image/avif",
    func: compressAvif,
    moduleUrl: import.meta.url,
    defaultConfig: {
      quality: config?.quality ?? 0.8,
      colors: config?.colors ?? 128,
    },
  };
}
```

| 字段            | 说明                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `name`          | 插件名称                                                                                              |
| `matches`       | 返回 `true` 的文件会进这个插件                                                                        |
| `func`          | 压缩函数                                                                                              |
| `moduleUrl`     | 压缩模块地址。Vite 用 `import.meta.url`；Next/Webpack 用 `new URL("./文件.js", import.meta.url).href` |
| `defaultConfig` | 默认参数，会和文件数据一起传给 `func`                                                                 |
| `timeoutMs`     | 单任务超时（毫秒），默认 30000；`media` 插件默认 600000                                               |

`func` 收到的参数包含 `arrayBuffer`、`fileName`、`fileType`，以及 `defaultConfig` 里的字段。返回 `{ success: true, data, fileName, fileType }`。`data` 是压缩后的 `ArrayBuffer`。压缩后没有变小时，把原始 `arrayBuffer` 原样返回。抛错会当成该文件失败。可用插件的 `timeoutMs` 调整超时。

```typescript
const compressor = new ImageCompressor({
  workerNum: 4,
  plugins: [myFormat(), gif()],
});

await compressor.compressImagesWorker(files);
```

## API

### ImageCompressor

```typescript
new ImageCompressor(options: ImageCompressorOptions)
```

| 参数        | 类型               | 说明                               |
| ----------- | ------------------ | ---------------------------------- |
| `workerNum` | `number`           | 全部插件共用的 worker 数量，默认 4 |
| `plugins`   | `CompressPlugin[]` | 插件列表（必填）                   |

### ImageCompressor.compressFilesWorker / compressImagesWorker

```typescript
compressFilesWorker(files: File[]): Promise<PromiseSettledResult<CompressBackInfo>[]>
compressImagesWorker(files: File[]): Promise<PromiseSettledResult<CompressBackInfo>[]>
```

返回顺序与输入一致，每个文件独立成功或失败。图片最大 50 MB，音视频没有固定大小限制。

`cancelAll()` 终止并释放全部 Worker，运行中和排队中的任务均失败结束。实例之后仍可再次提交文件。

### CompressBackInfo

| 字段                          | 类型     | 说明                   |
| ----------------------------- | -------- | ---------------------- |
| `compressInfo.rate`           | `number` | 压缩率百分比           |
| `compressInfo.time`           | `number` | 压缩耗时（毫秒）       |
| `compressInfo.originalSize`   | `number` | 原始文件大小（字节）   |
| `compressInfo.compressedSize` | `number` | 压缩后文件大小（字节） |
| `file`                        | `File`   | 压缩后的文件对象       |

## 本地开发与验证

在仓库根目录执行：

```sh
pnpm install
pnpm dev
```

构建验证：

```sh
pnpm build
pnpm build:page
```
