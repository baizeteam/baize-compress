import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from "mediabunny";
import type { CompressPayload, CompressResult } from "../../types";
import type { MediaConfig } from "./index";

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

    const format = requestedFormat ?? (/webm/i.test(fileType) ? "webm" : /ogg/i.test(fileType) ? "ogg" : "mp4");
    if (format === "ogg" && videoTrack) throw new Error("Ogg 输出仅支持纯音频，请使用 mp4 或 webm");
    const outputFormat =
      format === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : format === "webm"
        ? new WebMOutputFormat()
        : format === "ogg"
        ? new OggOutputFormat()
        : undefined;
    if (!outputFormat) throw new Error(`不支持的输出格式：${format}`);
    const target = new BufferTarget();
    output = new Output({ format: outputFormat, target });

    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
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
    // A conversion can be valid even after dropping an unsupported audio/video track.
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
    const extension = format === "mp4" && !videoTrack ? "m4a" : format;
    const baseName = fileName.replace(/\.[^.]+$/, "");
    return {
      success: true,
      data,
      fileName: `${baseName}.${extension}`,
      fileType: `${videoTrack ? "video" : "audio"}/${format}`,
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

export { compress as func };
