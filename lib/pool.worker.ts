import type { CompressFunc, CompressPayload, CompressResult } from "./types";

const modules = new Map<string, Promise<CompressFunc>>();

function loadCompress(moduleUrl: string): Promise<CompressFunc> {
  const cached = modules.get(moduleUrl);
  if (cached) return cached;

  const pending = import(/* @vite-ignore */ /* webpackIgnore: true */ moduleUrl)
    .then((module) => {
      if (typeof module.compress !== "function") throw new Error("压缩模块缺少 compress 导出");
      return module.compress as CompressFunc;
    })
    .catch((error: unknown) => {
      modules.delete(moduleUrl);
      throw error;
    });
  modules.set(moduleUrl, pending);
  return pending;
}

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, moduleUrl, ...payload } = event.data ?? {};
  if (type !== "compress") return;

  try {
    if (typeof moduleUrl !== "string" || !moduleUrl) throw new Error("插件缺少压缩模块入口");
    const compress = await loadCompress(moduleUrl);
    const result = await compress(payload as CompressPayload);
    self.postMessage(result, result.data ? [result.data] : []);
  } catch (error) {
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : "压缩失败",
    } satisfies CompressResult);
  }
});
