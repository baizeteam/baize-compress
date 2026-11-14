import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { getEventListeners } from "node:events";
import { setup } from "./helpers/worker.mjs";

// 验证混合插件共用并发上限并保持输入顺序。
test("混合插件共用并发上限并保持输入顺序", async (t) => {
  const { compressor, file, stats } = setup(t);
  t.after(() => compressor.cancelAll());
  assert.equal(stats.created, 0);
  const files = Array.from({ length: 12 }, (_, i) => file(String(i), i % 2 ? "second" : "first"));
  const results = await compressor.compressFilesWorker(files);
  assert.ok(results.every((result) => result.status === "fulfilled"));
  assert.deepEqual(
    results.map((result) => result.value.file.name),
    files.map((item) => item.name),
  );
  assert.equal(stats.peak, 2);
  assert.equal(stats.created, 2);
  assert.equal(stats.transferred, files.length);
  for (const result of results) {
    assert.ok(Number.isFinite(result.value.compressInfo.time));
    assert.ok(result.value.compressInfo.time >= 0);
  }
  compressor.cancelAll();
  assert.equal(stats.live, 0);
});

// 验证输入转移失败后清理事件监听器，后续任务仍可复用线程。
test("输入转移失败后清理监听器并继续执行队列", async (t) => {
  const { compressor, TestWorker, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  let worker;
  // 模拟消息序列化失败并记录实际使用的线程。
  globalThis.Worker = class extends TestWorker {
    // 保存线程引用以检查任务结束后的事件监听器。
    constructor() {
      super();
      worker = this;
    }

    // 让首个任务在发送时失败，其余任务正常压缩。
    postMessage(message, transfer) {
      if (message.fileName === "uncloneable") throw new Error("无法转移输入");
      super.postMessage(message, transfer);
    }
  };
  const results = await compressor.compressFilesWorker([file("uncloneable"), file("valid")]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["rejected", "fulfilled"],
  );
  assert.match(String(results[0].reason), /无法转移输入/);
  assert.equal(stats.created, 1);
  assert.equal(getEventListeners(worker, "message").length, 0);
  assert.equal(getEventListeners(worker, "error").length, 0);
});

// 验证旧环境的批量结果仍能保留成功、失败和输入顺序。
test("缺少 Promise.allSettled 时保留批量结果语义", async (t) => {
  const { compressor, file } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  const previousAllSettled = Promise.allSettled;
  t.after(() => {
    Promise.allSettled = previousAllSettled;
  });
  Promise.allSettled = undefined;
  const results = await compressor.compressImagesWorker([file("invalid"), file("valid")]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["rejected", "fulfilled"],
  );
  assert.equal(results[1].value.file.name, "valid");
});

// 验证跨插件和批次复用同一线程。
test("跨插件和批次复用同一线程", async (t) => {
  const { compressor, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  await compressor.compressFilesWorker([file(), file()]);
  await compressor.compressFilesWorker([file()]);
  assert.equal(stats.created, 1);
  await compressor.compressFilesWorker([file("other", "second")]);
  await compressor.compressFilesWorker([file("back", "first"), file("other", "second")]);
  assert.equal(stats.created, 1);
  assert.equal(stats.live, 1);
  assert.equal(stats.peak, 1);
});

// 验证隔离压缩失败并在线程崩溃后恢复。
test("隔离压缩失败并在线程崩溃后恢复", async (t) => {
  const { compressor, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  const results = await compressor.compressFilesWorker([file("invalid"), file("crash"), file("valid")]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["rejected", "rejected", "fulfilled"],
  );
  assert.match(String(results[0].reason), /invalid file/);
  assert.match(String(results[1].reason), /worker crashed/);
  assert.equal(stats.created, 2);
  assert.equal(stats.peak, 1);
});

// 验证线程创建失败后继续执行排队任务。
test("线程创建失败后继续执行排队任务", async (t) => {
  const { compressor, TestWorker, file } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  let attempts = 0;
  // 模拟首次创建线程失败。
  globalThis.Worker = class extends TestWorker {
    // 首次抛错后恢复正常创建线程。
    constructor() {
      if (attempts++ === 0) throw new Error("worker unavailable");
      super();
    }
  };
  const results = await compressor.compressFilesWorker([file(), file("valid", "second")]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["rejected", "fulfilled"],
  );
  assert.match(String(results[0].reason), /worker unavailable/);
});

// 验证终止超时线程并继续执行队列。
test("终止超时线程并继续执行队列", async (t) => {
  const { compressor, plugins, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  plugins[0].timeoutMs = 30;
  const results = await compressor.compressFilesWorker([file("hang"), file("valid")]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["rejected", "fulfilled"],
  );
  assert.match(String(results[0].reason), /Worker timeout/);
  assert.equal(stats.created, 2);
  assert.equal(stats.peak, 1);
});

// 验证取消运行、排队和读取中的任务并支持复用。
test("取消运行、排队和读取中的任务并支持复用", async (t) => {
  const { compressor, file, stats } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  const reading = compressor.compressFilesWorker([file()]);
  compressor.cancelAll();
  assert.equal((await reading)[0].status, "rejected");
  const pending = compressor.compressFilesWorker([file("hang"), file("queued", "second")]);
  await delay(0);
  compressor.cancelAll();
  assert.deepEqual(
    (await pending).map((result) => result.status),
    ["rejected", "rejected"],
  );
  assert.equal(stats.live, 0);
  assert.equal((await compressor.compressFilesWorker([file("reused")]))[0].status, "fulfilled");
});
