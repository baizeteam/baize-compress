import assert from "node:assert/strict";
import { ImageCompressor } from "../../dist/index.js";

// 创建模拟线程池及插件，记录线程复用和缓冲区转移。
export function setup(t, workerNum = 2) {
  const previousWorker = globalThis.Worker;
  const previousLocation = globalThis.location;
  t.after(() => {
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  });
  globalThis.location = { href: "https://example.test/app/" };
  const stats = { live: 0, peak: 0, created: 0, transferred: 0 };
  // 模拟浏览器 Worker 的异步压缩、异常和终止行为。
  class TestWorker extends EventTarget {
    terminated = false;

    // 创建线程并统计并发峰值。
    constructor() {
      super();
      stats.created++;
      stats.peak = Math.max(stats.peak, ++stats.live);
    }

    // 转移输入缓冲区并模拟压缩结果。
    postMessage(message, transfer) {
      const data = structuredClone(message, { transfer });
      assert.equal(message.arrayBuffer.byteLength, 0);
      stats.transferred++;
      assert.equal(data.moduleUrl, `https://example.test/modules/${data.fileType.split("/")[1]}.js`);
      if (data.fileName === "hang") return;
      setTimeout(() => {
        if (this.terminated) return;
        if (data.fileName === "crash") {
          this.dispatchEvent(Object.assign(new Event("error"), { message: "worker crashed" }));
          return;
        }
        this.dispatchEvent(
          new MessageEvent("message", {
            data:
              data.fileName === "invalid"
                ? { success: false, error: "invalid file" }
                : { success: true, data: data.arrayBuffer, fileName: data.fileName, fileType: data.fileType },
          }),
        );
      }, 5);
    }

    // 释放线程并更新存活数量。
    terminate() {
      if (this.terminated) return;
      this.terminated = true;
      stats.live--;
    }
  }

  globalThis.Worker = TestWorker;

  // 创建可按 MIME 类型匹配的测试插件。
  const plugin = (name, extra = {}) => ({
    name,
    // 匹配当前测试插件的文件类型。
    matches: (type) => type === `application/${name}`,
    moduleUrl: `/modules/${name}.js`,
    defaultConfig: {},
    ...extra,
  });
  const plugins = [plugin("first"), plugin("second")];
  const compressor = new ImageCompressor({ workerNum, plugins });
  // 创建指定类型的测试文件。
  const file = (name = "file", type = "first") => new File([name], name, { type: `application/${type}` });
  return { compressor, plugins, plugin, file, stats, TestWorker };
}
