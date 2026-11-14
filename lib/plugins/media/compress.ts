import {
  ADTS,
  ALL_FORMATS,
  AdtsOutputFormat,
  BufferSource,
  BufferTarget,
  Conversion,
  FLAC,
  FlacOutputFormat,
  Input,
  MATROSKA,
  MkvOutputFormat,
  MovOutputFormat,
  MP3,
  MP4,
  MPEG_TS,
  Mp3OutputFormat,
  Mp4OutputFormat,
  MpegTsOutputFormat,
  OGG,
  OggOutputFormat,
  Output,
  QTFF,
  Quality,
  WAVE,
  WEBM,
  WavOutputFormat,
  WebMOutputFormat,
} from "mediabunny";
import type { CompressPayload, CompressResult } from "../../types";
import type { MediaConfig } from "./index";

const FORMATS = [
  [MP4, "mp4", Mp4OutputFormat],
  [QTFF, "mov", MovOutputFormat],
  [WEBM, "webm", WebMOutputFormat],
  [MATROSKA, "mkv", MkvOutputFormat],
  [MP3, "mp3", Mp3OutputFormat],
  [WAVE, "wav", WavOutputFormat],
  [OGG, "ogg", OggOutputFormat],
  [ADTS, "aac", AdtsOutputFormat],
  [FLAC, "flac", FlacOutputFormat],
  [MPEG_TS, "ts", MpegTsOutputFormat],
] as const;

// 使用浏览器编解码能力转码音视频并释放转换资源。
export async function compress(payload: CompressPayload): Promise<CompressResult> {
  const {
    arrayBuffer,
    fileName,
    fileType,
    format: requestedFormat,
    quality = 0.5,
    videoBitrate,
    audioBitrate,
    videoCodec,
    audioCodec,
    maxWidth,
    maxHeight,
    frameRate,
    sampleRate,
    numberOfChannels,
    keepOriginalIfLarger = true,
  } = payload as CompressPayload & MediaConfig;
  const input = new Input({ source: new BufferSource(arrayBuffer), formats: ALL_FORMATS });
  let output: Output | undefined;
  let conversion: Conversion | undefined;
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!videoTrack && !audioTrack) throw new Error("文件中没有可压缩的音视频轨道");

    const inputFormat = await input.getFormat();
    // 按实际容器保留格式，显式指定 format 时才转换容器。
    const definition = FORMATS.find(([source, format]) =>
      requestedFormat === undefined ? source === inputFormat : format === requestedFormat,
    );
    if (!definition) {
      throw new Error(
        requestedFormat === undefined
          ? `无法保留输入格式：${inputFormat.name}，请显式指定支持的输出格式`
          : `不支持的输出格式：${requestedFormat}`,
      );
    }
    const [, format, Format] = definition;
    const outputFormat = new Format();
    if (videoTrack && outputFormat.getSupportedVideoCodecs().length === 0) {
      throw new Error(`${format} 输出仅支持纯音频，请选择支持视频的容器`);
    }
    const target = new BufferTarget();
    output = new Output({ format: outputFormat, target });

    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      // 保持原始比例缩小视频，并将编码尺寸对齐为偶数。
      video: async (track) => {
        const width = await track.getDisplayWidth();
        const height = await track.getDisplayHeight();
        const scale = Math.min(1, (maxWidth ?? width) / width, (maxHeight ?? height) / height);
        return {
          codec: videoCodec,
          quality: videoBitrate === undefined ? new Quality(quality) : new Quality({ bitrate: videoBitrate }),
          width: Math.max(2, Math.floor((width * scale) / 2) * 2),
          height: Math.max(2, Math.floor((height * scale) / 2) * 2),
          fit: "contain",
          frameRate,
          forceTranscode: true,
        };
      },
      audio: {
        codec: audioCodec,
        quality: audioBitrate === undefined ? new Quality(quality) : new Quality({ bitrate: audioBitrate }),
        sampleRate,
        numberOfChannels,
        forceTranscode: true,
      },
    });
    // 转换有效时也可能丢弃不受支持的轨道，需显式拒绝以避免静默丢失音视频。
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      const reasons = conversion.discardedTracks.map(({ reason }) => reason).join(", ");
      throw new Error(
        `当前浏览器无法完成音视频压缩（${reasons || "没有可输出的轨道"}）。请检查 WebCodecs 编解码支持或更换输出格式。`,
      );
    }
    await conversion.execute();
    const data = target.buffer;
    if (!data) throw new Error("音视频压缩未生成输出数据");
    if (keepOriginalIfLarger && data.byteLength >= arrayBuffer.byteLength) {
      return { success: true, data: arrayBuffer, fileName, fileType };
    }
    const extension = format === "mp4" && !videoTrack ? ".m4a" : outputFormat.fileExtension;
    const baseName = fileName.replace(/\.[^.]+$/, "");
    return {
      success: true,
      data,
      fileName: requestedFormat === undefined ? fileName : `${baseName}${extension}`,
      fileType: requestedFormat === undefined ? fileType : (await output.getMimeType()).split(";")[0].trim(),
    };
  } finally {
    try {
      if (conversion && output?.state !== "finalized") await conversion.cancel();
      else if (output && output.state !== "finalized" && output.state !== "canceled") await output.cancel();
    } finally {
      input.dispose();
    }
  }
}
