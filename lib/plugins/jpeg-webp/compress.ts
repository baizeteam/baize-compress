import type { CompressPayload, CompressResult } from "../../types";
import { createCompressResult } from "../../utils";

// 使用离屏画布压缩 JPEG 或 WebP 图片。
export async function compress({ arrayBuffer, fileName, fileType, quality }: CompressPayload): Promise<CompressResult> {
  const blob = new Blob([arrayBuffer], { type: fileType });
  const offscreen = new OffscreenCanvas(100, 100);
  const ctx = offscreen.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const imgData = await createImageBitmap(blob);
  offscreen.width = imgData.width;
  offscreen.height = imgData.height;
  ctx.drawImage(imgData, 0, 0, offscreen.width, offscreen.height);
  const compressedBlob = await offscreen.convertToBlob({ type: fileType, quality });

  const data = compressedBlob.size < arrayBuffer.byteLength ? await compressedBlob.arrayBuffer() : arrayBuffer;
  return createCompressResult({ arrayBuffer, fileName, fileType }, data);
}
