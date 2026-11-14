import gifsicle from "gifsicle-wasm-browser";
import type { CompressPayload, CompressResult } from "../../types";
import { createCompressResult } from "../../utils";

interface GifsicleOutput {
  file: Uint8Array | ArrayBuffer;
  name: string;
}

type GifsicleHandler = (event: { data: unknown }) => void;

let gifsicleHandler: GifsicleHandler | null = null;
const resultWaiters: Array<(data: unknown) => void> = [];

// 将 GIF 优化等级归一化到支持的取值。
function resolveOptimize(optimize: unknown): 1 | 2 | 3 {
  if (optimize === 2 || optimize === 3) return optimize;
  return 1;
}

// 优先读取有损参数，否则将图片质量换算为有损程度。
function resolveLossy(quality: unknown, lossy: unknown): number {
  if (typeof lossy === "number" && Number.isFinite(lossy)) {
    return Math.min(200, Math.max(0, Math.round(lossy)));
  }
  const normalizedQuality =
    typeof quality === "number" && Number.isFinite(quality) ? Math.min(1, Math.max(0, quality)) : 0.75;
  return Math.round((1 - normalizedQuality) * 200);
}

// 将 gifsicle 输出复制为可转移的独立缓冲区。
function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

// 在线程池内初始化并复用 gifsicle 的 WASM 消息处理器。
function getGifsicleHandler(): GifsicleHandler {
  if (gifsicleHandler) return gifsicleHandler;

  const script = gifsicle.tool?.workerLocalUrl;
  if (!script) {
    throw new Error("gifsicle worker 脚本不可用");
  }

  // gifsicle.run() 会再创建一个 worker。压缩已经在线程池内，直接执行它自带的 wasm 脚本。
  const factory = new Function("postMessage", `var onmessage;\n${script}\nreturn onmessage;`) as (
    postMessage: (data: unknown) => void,
  ) => GifsicleHandler;

  // 将 WASM 输出分发给当前等待中的压缩任务。
  gifsicleHandler = factory((data: unknown) => {
    if (data === undefined) return;
    resultWaiters.shift()?.(data);
  });
  return gifsicleHandler;
}

// 执行 gifsicle 命令并等待当前任务的输出。
function runGifsicle(arrayBuffer: ArrayBuffer, command: string): Promise<GifsicleOutput[]> {
  const handler = getGifsicleHandler();
  return new Promise((resolve, reject) => {
    // 校验 WASM 返回值，并结束当前压缩任务。
    resultWaiters.push((data: unknown) => {
      if (typeof data === "string") {
        reject(new Error(data));
        return;
      }
      if (!Array.isArray(data)) {
        reject(new Error("压缩失败"));
        return;
      }
      resolve(data as GifsicleOutput[]);
    });

    handler({
      data: {
        data: [{ file: arrayBuffer, name: "input.gif" }],
        command: [command],
        folder: [],
        isStrict: false,
      },
    });
  });
}

// 按质量和优化等级压缩 GIF 图片。
export async function compress({
  arrayBuffer,
  fileName,
  fileType,
  quality,
  optimize,
  lossy,
}: CompressPayload): Promise<CompressResult> {
  const level = resolveOptimize(optimize);
  const lossyValue = resolveLossy(quality, lossy);
  const args = [`-O${level}`];
  if (lossyValue > 0) args.push(`--lossy=${lossyValue}`);
  args.push("input.gif", "-o", "/out/out.gif");

  const outputs = await runGifsicle(arrayBuffer, args.join(" "));
  const output = outputs.find((file) => file.name.endsWith(".gif"));
  if (!output) {
    const detail = outputs[0]?.file ? new TextDecoder().decode(outputs[0].file) : "";
    throw new Error(detail || "压缩失败");
  }

  const compressedData = toArrayBuffer(output.file);
  return createCompressResult({ arrayBuffer, fileName, fileType }, compressedData);
}
