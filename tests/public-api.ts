import {
  ImageCompressor,
  type CompressBackInfo,
  type CompressPlugin,
  type ImageCompressorOptions,
  type CompressResult,
} from "baize-compress";
import { jpegWebp } from "baize-compress/plugins/jpeg-webp";
import { png } from "baize-compress/plugins/png";
import { svg, type SvgConfig } from "baize-compress/plugins/svg";
import { gif, type GifConfig } from "baize-compress/plugins/gif";
import { media, type MediaConfig } from "baize-compress/plugins/media";

const svgConfig: SvgConfig = { floatPrecision: 6, svgoPlugins: ["preset-default"] };
const gifConfig: GifConfig = { quality: 0.75, optimize: 1, lossy: 40 };
const mediaConfig: MediaConfig = { format: "webm", maxHeight: 720, audioCodec: "opus" };
const plugins: CompressPlugin[] = [jpegWebp(), png(), svg(svgConfig), gif(gifConfig), media(mediaConfig)];
const options: ImageCompressorOptions = { workerNum: 2, plugins };
const compressor = new ImageCompressor(options);
const results: Promise<PromiseSettledResult<CompressBackInfo>[]> = compressor.compressFilesWorker([]);
const compatibleResults: typeof results = compressor.compressImagesWorker([]);

void results;
void compatibleResults;
compressor.cancelAll();

const success: CompressResult = { success: true, data: new ArrayBuffer(0) };
const failure: CompressResult = { success: false, error: "压缩失败" };
// @ts-expect-error 成功结果必须包含缓冲区。
const missingData: CompressResult = { success: true };
// @ts-expect-error 失败结果必须包含错误说明。
const missingError: CompressResult = { success: false };
void [success, failure, missingData, missingError];
