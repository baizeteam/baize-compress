import assert from "node:assert/strict";
import { test } from "node:test";
import { jpegWebp } from "../dist/plugins/jpeg-webp.js";
import UPNG from "upng-js";
import { png } from "../dist/plugins/png.js";
import { svg } from "../dist/plugins/svg.js";

// 验证图片插件仅在结果更小时替换数据，并始终保留文件元信息。
test("画布压缩按体积选择结果并保留文件名和类型", async (t) => {
  const previousCanvas = globalThis.OffscreenCanvas;
  const previousBitmap = globalThis.createImageBitmap;
  t.after(() => {
    if (previousCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousCanvas;
    if (previousBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previousBitmap;
  });

  let compressedSize = 2;
  let closed = 0;
  // 模拟画布输出不同大小的数据，独立验证压缩结果选择策略。
  globalThis.OffscreenCanvas = class {
    // 提供绘图上下文供压缩模块调用。
    getContext() {
      return {
        // 模拟绘图操作。
        drawImage() {},
      };
    }

    // 返回指定大小的压缩数据。
    async convertToBlob() {
      return new Blob([new Uint8Array(compressedSize)], { type: "image/webp" });
    }
  };
  // 提供待绘制图片的尺寸。
  globalThis.createImageBitmap = async () => ({
    width: 1,
    height: 1,
    // 记录位图资源的释放次数。
    close() {
      closed++;
    },
  });

  const { compress } = await import(jpegWebp().moduleUrl);
  const payload = { arrayBuffer: new Uint8Array([1, 2, 3, 4]).buffer, fileName: "图片.webp", fileType: "image/webp" };
  const smaller = await compress(payload);
  assert.equal(smaller.data.byteLength, 2);
  assert.equal(smaller.fileName, payload.fileName);
  assert.equal(smaller.fileType, payload.fileType);
  for (compressedSize of [4, 8]) {
    const result = await compress(payload);
    assert.equal(result.success, true);
    assert.equal(result.data, payload.arrayBuffer);
  }
  assert.equal(closed, 3);
  // 模拟浏览器将不支持的编码格式回退为 PNG。
  globalThis.OffscreenCanvas.prototype.convertToBlob = async () => new Blob([new Uint8Array(1)], { type: "image/png" });
  const fallback = await compress(payload);
  assert.equal(fallback.data, payload.arrayBuffer);
  assert.equal(fallback.fileType, "image/webp");
  assert.equal(fallback.fileName, payload.fileName);
  assert.equal(closed, 4);
  // 模拟编码器失败，确认异常路径仍然释放位图。
  globalThis.OffscreenCanvas.prototype.convertToBlob = async () => {
    throw new Error("编码失败");
  };
  await assert.rejects(compress(payload), /编码失败/);
  assert.equal(closed, 5);
});

// 使用实际 SVGO 模块验证优化内容和压缩结果格式。
test("SVG 插件优化内容并返回有效结果", async () => {
  const plugin = svg();
  const { compress } = await import(plugin.moduleUrl);
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><!-- 可删除的说明 --><rect x="0" y="0" width="100" height="100" fill="#ff0000"/></svg>';
  const payload = {
    ...plugin.defaultConfig,
    arrayBuffer: new TextEncoder().encode(source).buffer,
    fileName: "图片.svg",
    fileType: "image/svg+xml",
  };
  const result = await compress(payload);
  assert.equal(result.success, true);
  assert.ok(result.data.byteLength < payload.arrayBuffer.byteLength);
  assert.match(new TextDecoder().decode(result.data), /<svg\b/);
  assert.equal(result.fileName, payload.fileName);
  assert.equal(result.fileType, payload.fileType);
});

// 验证真实 PNG 编码器可以处理静态图片，并完整保留动画 PNG。
test("PNG 压缩保留动画的帧、延时和原始数据", async () => {
  const { compress } = await import(png().moduleUrl);
  const width = 32,
    height = 32;
  const red = new Uint8Array(width * height * 4);
  const blue = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < red.length; offset += 4) {
    red.set([255, 0, 0, 255], offset);
    blue.set([0, 0, 255, 255], offset);
  }
  const arrayBuffer = UPNG.encode([red.buffer, blue.buffer], width, height, 0, [100, 200]);
  const result = await compress({ arrayBuffer, fileName: "动画.png", fileType: "image/png", quality: 0.8 });
  assert.equal(result.success, true);
  assert.equal(result.data, arrayBuffer);
  const decoded = UPNG.decode(result.data);
  assert.deepEqual(
    decoded.frames.map((frame) => frame.delay),
    [100, 200],
  );
  const still = UPNG.encode([red.buffer], width, height, 0);
  const compressed = await compress({ arrayBuffer: still, fileName: "静态.png", fileType: "image/png", quality: 0.8 });
  assert.equal(compressed.success, true);
  assert.equal(UPNG.decode(compressed.data).width, width);
});
