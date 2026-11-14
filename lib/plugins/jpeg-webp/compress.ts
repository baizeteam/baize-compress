import type { CompressPayload, CompressResult } from "../../types";
import { createCompressResult } from "../../utils";

// 使用离屏画布压缩 JPEG 或 WebP 图片。
export async function compress({ arrayBuffer, fileName, fileType, quality }: CompressPayload): Promise<CompressResult> {
  const blob = new Blob([arrayBuffer], { type: fileType });
  const imgData = await createImageBitmap(blob);
  try {
    const offscreen = new OffscreenCanvas(imgData.width, imgData.height);
    const ctx = offscreen.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持离屏画布绘图");
    ctx.drawImage(imgData, 0, 0);
    const compressedBlob = await offscreen.convertToBlob({ type: fileType, quality });
    const data =
      compressedBlob.type === fileType && compressedBlob.size < arrayBuffer.byteLength
        ? await compressedBlob.arrayBuffer()
        : arrayBuffer;
    return createCompressResult({ arrayBuffer, fileName, fileType }, data);
  } finally {
    imgData.close();
  }
}
