import gifsicle from "gifsicle-wasm-browser";
import type { Plugin } from "vite";

const moduleId = "virtual:baize-gifsicle";

// 在构建期将锁定版本的 gifsicle 脚本转换为静态模块，避免浏览器执行动态代码。
export function gifsiclePlugin(): Plugin {
  return {
    name: "baize-gifsicle-module",
    // 将 GIF 引擎入口解析为内部虚拟模块。
    resolveId(id) {
      if (id === moduleId) return `\0${moduleId}`;
    },
    // 提取静态引擎并直接传入 WASM 字节，避免动态代码和 data URL 网络请求。
    load(id) {
      if (id !== `\0${moduleId}`) return;
      const script = gifsicle.tool.workerLocalUrl;
      const handlerStart = script.lastIndexOf("onmessage=");
      const wasm = script.match(/"data:application\/wasm;base64,([A-Za-z0-9+/=]+)"/);
      const initialization = "c({stdout:f.stdout";
      if (!script.startsWith("var gifsicle=") || handlerStart < 0 || !wasm || !script.includes(initialization)) {
        throw new Error("gifsicle 脚本结构已变化，请更新构建适配器");
      }
      const binary = `const wasmBinary = Uint8Array.from(atob(${JSON.stringify(wasm[1])}), value => value.charCodeAt(0));`;
      const engine = script
        .slice(0, handlerStart)
        .replace(wasm[0], '""')
        .replace(initialization, "c({wasmBinary,stdout:f.stdout");
      return `${binary}\n${engine}\nexport default gifsicle;`;
    },
  };
}
