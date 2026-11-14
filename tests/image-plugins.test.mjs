import assert from "node:assert/strict";
import { test } from "node:test";
import { jpegWebp } from "../dist/plugins/jpeg-webp.js";
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
      return new Blob([new Uint8Array(compressedSize)]);
    }
  };
  // 提供待绘制图片的尺寸。
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1 });

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
