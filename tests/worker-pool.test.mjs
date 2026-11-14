import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { ImageCompressor } from "../dist/index.js";
import { readdir } from "node:fs/promises";

function setup(t, workerNum = 2) {
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
  class TestWorker extends EventTarget {
    terminated = false;

    constructor() {
      super();
      stats.created++;
      stats.peak = Math.max(stats.peak, ++stats.live);
    }

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

    terminate() {
      if (this.terminated) return;
      this.terminated = true;
      stats.live--;
    }
  }

  globalThis.Worker = TestWorker;

  const plugin = (name, extra = {}) => ({
    name,
    matches: (type) => type === `application/${name}`,
    moduleUrl: `/modules/${name}.js`,
    defaultConfig: {},
    ...extra,
  });
  const plugins = [plugin("first"), plugin("second")];
  const compressor = new ImageCompressor({ workerNum, plugins });
  const file = (name = "file", type = "first") => new File([name], name, { type: `application/${type}` });
  return { compressor, plugins, plugin, file, stats, TestWorker };
}

test("mixed plugins share the concurrency limit and preserve input order", async (t) => {
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
  compressor.cancelAll();
  assert.equal(stats.live, 0);
});

test("reuses one worker across alternating plugins and separate batches", async (t) => {
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

test("isolates task errors and recovers from worker crashes", async (t) => {
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

test("recovers queued tasks after worker creation fails", async (t) => {
  const { compressor, TestWorker, file } = setup(t, 1);
  t.after(() => compressor.cancelAll());
  let attempts = 0;
  globalThis.Worker = class extends TestWorker {
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

test("terminates timed out workers and continues the queue", async (t) => {
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

test("cancels running, queued and reading tasks and supports reuse", async (t) => {
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

test("pool worker loads multiple modules once, transfers buffers and isolates failures", async (t) => {
  const previousSelf = globalThis.self;
  const scope = new EventTarget();
  globalThis.self = scope;
  t.after(() => {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  const assets = await readdir(new URL("../dist/assets/", import.meta.url));
  const pool = assets.find((name) => name.startsWith("pool.worker-") && name.endsWith(".js"));
  assert.ok(pool);
  await import(new URL(`../dist/assets/${pool}`, import.meta.url));
  const moduleUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
  const first = moduleUrl(`
    export let compress = async ({arrayBuffer, fileName, quality}) => {
      if (quality !== 0.5) throw new Error("configuration lost");
      if (fileName === "invalid") throw new Error("invalid input");
      return {success:true,data:arrayBuffer,fileName};
    };
    export function replace() { compress = () => {throw new Error("loaded again")}; }
  `);
  const second = moduleUrl(
    `export const compress = async ({arrayBuffer}) => ({success:true,data:arrayBuffer,fileName:"second"});`,
  );
  const retry = moduleUrl(`
    export let compress;
    setTimeout(() => { compress = async ({arrayBuffer}) => ({success:true,data:arrayBuffer,fileName:"retried"}); }, 0);
  `);
  const send = (url, fileName = "valid") =>
    new Promise((resolve) => {
      scope.postMessage = (result, transfer = []) => resolve(structuredClone(result, { transfer }));
      scope.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "compress",
            moduleUrl: url,
            arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
            fileName,
            quality: 0.5,
          },
        }),
      );
    });
  const result = await send(first);
  assert.deepEqual([...new Uint8Array(result.data)], [1, 2, 3]);
  assert.equal((await send(second)).fileName, "second");
  (await import(first)).replace();
  assert.equal((await send(first)).fileName, "valid");
  assert.deepEqual(await send(first, "invalid"), { success: false, error: "invalid input" });
  assert.match((await send(retry)).error, /缺少 compress 导出/);
  await delay(10);
  assert.equal((await send(retry)).fileName, "retried");
});
