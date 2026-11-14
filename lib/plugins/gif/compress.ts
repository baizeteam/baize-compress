import gifsicle from "virtual:baize-gifsicle";
import type { CompressPayload, CompressResult } from "../../types";
import { createCompressResult } from "../../utils";

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

  const outputs = await gifsicle({ data: [{ file: arrayBuffer, name: "input.gif" }], command: [args.join(" ")] });
  const output = outputs.find((file) => file.name.endsWith(".gif"));
  if (!output) {
    const detail = outputs[0]?.file ? new TextDecoder().decode(outputs[0].file) : "";
    throw new Error(detail || "压缩失败");
  }

  const compressedData = toArrayBuffer(output.file);
  return createCompressResult({ arrayBuffer, fileName, fileType }, compressedData);
}
