import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  Input,
  MATROSKA,
  MkvOutputFormat,
  MovOutputFormat,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  WAVE,
  WavOutputFormat,
} from "mediabunny";
import { media } from "../dist/plugins/media.js";

const { compress } = await import(media().moduleUrl);

// 生成真实的 PCM 音频容器，无需浏览器编解码器即可验证封装与转码。
async function createFixture(Format) {
  const target = new BufferTarget();
  const output = new Output({ format: new Format(), target });
  const source = new AudioSampleSource({ codec: "pcm-s16" });
  output.addAudioTrack(source);
  await output.start();
  const sample = new AudioSample({
    data: Float32Array.from({ length: 4800 }, (_, index) => Math.sin((index * Math.PI) / 48) * 0.5),
    format: "f32",
    numberOfChannels: 1,
    sampleRate: 48000,
    timestamp: 0,
  });
  await source.add(sample);
  sample.close();
  await output.finalize();
  return target.buffer;
}

// 重新解析结果数据，确认实际容器和采样率均符合预期。
async function verifyResult(result, format) {
  assert.equal(result.success, true);
  const input = new Input({ source: new BufferSource(result.data), formats: ALL_FORMATS });
  try {
    assert.equal(await input.getFormat(), format);
    assert.equal(await (await input.getPrimaryAudioTrack()).getSampleRate(), 24000);
  } finally {
    input.dispose();
  }
}

// 验证真正变小的输出仍保留原容器及元信息，包括 MP4 音频的不同扩展名。
test("音视频默认保留实际容器、文件名和 MIME", async (t) => {
  for (const [Format, format, fileName, fileType] of [
    [MovOutputFormat, QTFF, "录音.MOV", "video/quicktime"],
    [Mp4OutputFormat, MP4, "录音.mp4", "audio/mp4"],
    [Mp4OutputFormat, MP4, "录音.M4A", "audio/x-m4a"],
    [WavOutputFormat, WAVE, "录音.wav", "audio/wave"],
    [MkvOutputFormat, MATROSKA, "录音.mka", "audio/x-matroska"],
  ]) {
    await t.test(fileName, async () => {
      const arrayBuffer = await createFixture(Format);
      const result = await compress({ arrayBuffer, fileName, fileType, sampleRate: 24000 });
      assert.notEqual(result.data, arrayBuffer);
      assert.ok(result.data.byteLength < arrayBuffer.byteLength);
      assert.equal(result.fileName, fileName);
      assert.equal(result.fileType, fileType);
      await verifyResult(result, format);
    });
  }
});

// 验证显式转换使用真实容器及正确扩展名和 MIME。
test("指定 format 才转换容器，并更新文件名和 MIME", async (t) => {
  const arrayBuffer = await createFixture(WavOutputFormat);
  for (const [format, expectedFormat, fileName, fileType] of [
    ["mov", QTFF, "录音.mov", "audio/quicktime"],
    ["mp4", MP4, "录音.m4a", "audio/mp4"],
    ["mkv", MATROSKA, "录音.mkv", "audio/x-matroska"],
  ]) {
    await t.test(format, async () => {
      const result = await compress({
        arrayBuffer,
        fileName: "录音.wav",
        fileType: "audio/wav",
        format,
        sampleRate: 24000,
        keepOriginalIfLarger: false,
      });
      assert.equal(result.fileName, fileName);
      assert.equal(result.fileType, fileType);
      await verifyResult(result, expectedFormat);
    });
  }
});

// 验证检测使用文件内容而非 MIME，并保留未变小的原文件。
test("容器检测以内容为准，体积回退保留原文件", async () => {
  const arrayBuffer = await createFixture(MovOutputFormat);
  const payload = { arrayBuffer, fileName: "录音.mov", fileType: "video/mp4" };
  const smaller = await compress({ ...payload, sampleRate: 24000 });
  await verifyResult(smaller, QTFF);
  const larger = await compress({ ...payload, sampleRate: 96000 });
  assert.equal(larger.data, arrayBuffer);
  assert.equal(larger.fileName, payload.fileName);
  assert.equal(larger.fileType, payload.fileType);
  await assert.rejects(compress({ ...payload, format: "unknown" }), /不支持的输出格式/);
});
