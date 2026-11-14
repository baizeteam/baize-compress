import type { CompressPlugin } from "../../types";
import { compress } from "./compress";

export interface MediaConfig {
  /** 0-1，默认 0.5；对应轨道设置 bitrate 时忽略 quality */
  quality?: number;
  /** 默认保留 WebM / Ogg 容器，其他输入输出为 MP4（纯音频为 M4A） */
  format?: "mp4" | "webm" | "ogg";
  videoCodec?: "avc" | "hevc" | "vp8" | "vp9" | "av1";
  audioCodec?: "aac" | "opus" | "mp3" | "vorbis" | "flac";
  /** 比特率，单位 bit/s */
  videoBitrate?: number;
  audioBitrate?: number;
  /** 等比缩小，不放大；编码尺寸对齐为偶数 */
  maxWidth?: number;
  maxHeight?: number;
  frameRate?: number;
  sampleRate?: number;
  numberOfChannels?: number;
  /** 默认 true；结果没有变小时返回原文件，包括原文件名和 MIME */
  keepOriginalIfLarger?: boolean;
  /** 单个任务的超时时间（毫秒），默认 10 分钟 */
  timeoutMs?: number;
  moduleUrl?: string;
}

export function media(config: MediaConfig = {}): CompressPlugin {
  const { timeoutMs = 600_000, ...options } = config;
  delete options.moduleUrl;
  if (
    options.quality !== undefined &&
    (!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1)
  ) {
    throw new Error("media quality 必须是 0-1 之间的数值");
  }
  for (const key of [
    "videoBitrate",
    "audioBitrate",
    "maxWidth",
    "maxHeight",
    "sampleRate",
    "numberOfChannels",
  ] as const) {
    const value = options[key];
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < (key === "maxWidth" || key === "maxHeight" ? 2 : 1))
    ) {
      throw new Error(`media ${key} 必须是有效的正整数（视频尺寸至少为 2）`);
    }
  }
  if (options.frameRate !== undefined && (!Number.isFinite(options.frameRate) || options.frameRate <= 0)) {
    throw new Error("media frameRate 必须是正数");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new Error("media timeoutMs 必须是 1-2147483647 之间的整数");
  }
  return {
    name: "media",
    matches: (fileType) => /^(audio|video)\//i.test(fileType) || fileType === "application/ogg",
    func: compress,
    moduleUrl: config?.moduleUrl ?? import.meta.url,
    timeoutMs,
    defaultConfig: { quality: 0.5, keepOriginalIfLarger: true, ...options },
  };
}
