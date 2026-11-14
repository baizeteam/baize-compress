import { MAX_IMG_SIZE } from "./config";
import type { CompressPayload, CompressResult } from "./types";

// 校验图片是否超过大小限制。
export const checkImageSize = (file: File) => {
  if (file.size > MAX_IMG_SIZE) {
    throw new Error("Image size is too large");
  }
};

// 生成图片压缩结果，体积未减小时保留原文件数据。
export function createCompressResult(
  { arrayBuffer, fileName, fileType }: Pick<CompressPayload, "arrayBuffer" | "fileName" | "fileType">,
  data: ArrayBuffer,
): CompressResult {
  return {
    success: true,
    data: data.byteLength < arrayBuffer.byteLength ? data : arrayBuffer,
    fileName,
    fileType,
  };
}

// 校验任务超时是否处于浏览器定时器支持的范围。
export function validateTimeout(timeoutMs: number, name: string): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new Error(`${name} 的 timeoutMs 必须是 1-2147483647 之间的整数`);
  }
}
