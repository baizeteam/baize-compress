import UPNG from "upng-js";
import type { CompressPayload, CompressResult } from "../../types";
import { createCompressResult } from "../../utils";

// 使用调色板量化压缩 PNG 图片。
export async function compress({ arrayBuffer, fileName, fileType, quality }: CompressPayload): Promise<CompressResult> {
  const decoded = UPNG.decode(arrayBuffer);
  const rgba8 = UPNG.toRGBA8(decoded);
  const compressedData = UPNG.encode(rgba8, decoded.width, decoded.height, 256 * (quality ?? 0.8));

  return createCompressResult({ arrayBuffer, fileName, fileType }, compressedData);
}
