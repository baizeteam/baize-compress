import { optimize } from "svgo/browser";
import type { CompressPayload, CompressResult } from "../../types";
import { createCompressResult } from "../../utils";

// 使用 SVGO 优化 SVG 内容并保留体积更小的数据。
export async function compress({
  arrayBuffer,
  fileName,
  fileType,
  floatPrecision,
  svgoPlugins,
}: CompressPayload): Promise<CompressResult> {
  const svgString = new TextDecoder().decode(arrayBuffer);
  const result = optimize(svgString, {
    floatPrecision: floatPrecision ?? 8,
    plugins: svgoPlugins ?? ["preset-default", "removeDimensions"],
  });
  const compressedData = new TextEncoder().encode(result.data);
  const compressedBuffer = compressedData.buffer.slice(
    compressedData.byteOffset,
    compressedData.byteOffset + compressedData.byteLength,
  );

  return createCompressResult({ arrayBuffer, fileName, fileType }, compressedBuffer);
}
