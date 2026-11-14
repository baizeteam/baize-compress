import assert from "node:assert/strict";
import { test } from "node:test";
import { ImageCompressor } from "../dist/index.js";
import { setup } from "./helpers/worker.mjs";

// 验证非法并发参数在创建线程和读取文件前被拒绝。
test("线程数必须是有效的正整数", () => {
  for (const workerNum of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new ImageCompressor({ workerNum, plugins: [] }), /workerNum/);
  }
});

// 验证排队文件不会在获得执行名额前读取到内存。
test("文件读取与压缩共用并发名额", async (t) => {
  const { compressor, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  const files = Array.from({ length: 12 }, (_, index) => file(String(index)));
  const reads = [];
  let releaseFirst;
  for (const [index, item] of files.entries()) {
    const read = item.arrayBuffer.bind(item);
    // 记录开始读取的文件，并阻塞首个文件以检查队列状态。
    item.arrayBuffer = () => {
      reads.push(index);
      return index === 0
        ? new Promise((resolve) => {
            releaseFirst = resolve;
          })
        : read();
    };
  }
  const pending = compressor.compressFilesWorker(files);
  assert.deepEqual(reads, [0]);
  assert.equal(stats.created, 1);
  releaseFirst(new Uint8Array([1]).buffer);
  const results = await pending;
  assert.ok(results.every((result) => result.status === "fulfilled"));
  assert.deepEqual(
    reads,
    files.map((_, index) => index),
  );
  assert.equal(stats.peak, 1);
});

// 验证取消不必等待无法中止的原生读取，且不会启动排队文件的读取。
test("取消读取等待并跳过排队文件", { timeout: 1000 }, async (t) => {
  const { compressor, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  const reading = file("reading");
  const queued = file("queued");
  let queuedRead = false;
  // 模拟迟迟未完成的原生文件读取。
  reading.arrayBuffer = () => new Promise(() => {});
  // 记录取消后是否意外读取排队文件。
  queued.arrayBuffer = async () => {
    queuedRead = true;
    return new ArrayBuffer(1);
  };
  const pending = compressor.compressFilesWorker([reading, queued]);
  compressor.cancelAll();
  assert.deepEqual(
    (await pending).map((result) => result.status),
    ["rejected", "rejected"],
  );
  assert.equal(queuedRead, false);
  assert.equal(stats.live, 0);
  assert.equal((await compressor.compressFilesWorker([file("reused")]))[0].status, "fulfilled");
});

// 验证读取失败不会占住线程并发名额。
test("读取失败后继续处理下一文件", async (t) => {
  const { compressor, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  const invalid = file("unreadable");
  // 模拟浏览器读取文件失败。
  invalid.arrayBuffer = async () => {
    throw new Error("读取失败");
  };
  const results = await compressor.compressFilesWorker([invalid, file("valid")]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["rejected", "fulfilled"],
  );
  assert.match(String(results[0].reason), /读取失败/);
  assert.equal(stats.created, 1);
});
