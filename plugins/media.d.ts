import type { CompressPlugin } from "../index";

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

export declare function media(config?: MediaConfig): CompressPlugin;
