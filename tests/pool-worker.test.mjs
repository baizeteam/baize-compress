import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { readdir } from "node:fs/promises";

// 验证通用线程缓存模块、转移缓冲区并隔离加载和压缩失败。
test("通用线程缓存压缩模块并隔离失败", async (t) => {
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
  // 将压缩模块源码转换为可导入的测试地址。
  const moduleUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
  const first = moduleUrl(`
    // 校验插件参数并返回测试压缩数据。
    export let compress = async ({arrayBuffer, fileName, quality}) => {
      if (quality !== 0.5) throw new Error("configuration lost");
      if (fileName === "invalid") throw new Error("invalid input");
      return {success:true,data:arrayBuffer,fileName};
    };
    // 替换模块导出，用于验证线程仍使用缓存的函数。
    export function replace() { compress = () => {throw new Error("loaded again")}; }
  `);
  const second = moduleUrl(
    `export const compress = async ({arrayBuffer}) => ({success:true,data:arrayBuffer,fileName:"second"});`,
  );
  const retry = moduleUrl(`
    export let compress;
    setTimeout(() => { compress = async ({arrayBuffer}) => ({success:true,data:arrayBuffer,fileName:"retried"}); }, 0);
  `);
  // 向通用线程发送任务并转移返回的缓冲区。
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
  assert.deepEqual(await send(moduleUrl("export const compress = () => ({success:true});")), {
    success: false,
    error: "压缩模块未返回有效的 ArrayBuffer",
  });
  assert.match((await send(retry)).error, /缺少 compress 导出/);
  await delay(10);
  assert.equal((await send(retry)).fileName, "retried");
});
