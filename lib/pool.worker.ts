import type { CompressFunc, CompressPayload, CompressResult } from "./types";

const modules = new Map<string, Promise<CompressFunc>>();

// 按模块地址加载并缓存压缩函数，加载失败后允许重试。
function loadCompress(moduleUrl: string): Promise<CompressFunc> {
  const cached = modules.get(moduleUrl);
  if (cached) return cached;

  const pending = import(/* @vite-ignore */ /* webpackIgnore: true */ moduleUrl)
    // 确认插件模块提供可调用的压缩入口。
    .then((module) => {
      if (typeof module.compress !== "function") throw new Error("压缩模块缺少 compress 导出");
      return module.compress as CompressFunc;
    })
    // 清理失败缓存，让后续任务可以重新加载模块。
    .catch((error: unknown) => {
      modules.delete(moduleUrl);
      throw error;
    });
  modules.set(moduleUrl, pending);
  return pending;
}

// 执行插件压缩任务，并将结果缓冲区转移回主线程。
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
