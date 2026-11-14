import type { CompressBackInfo } from "../../lib/main";
import { Preview } from "./Preview";

interface CompressionResultProps {
  originalFile: File;
  result: PromiseSettledResult<CompressBackInfo>;
}

// 显示单个文件的压缩预览、统计信息或失败原因。
export function CompressionResult({ originalFile, result }: CompressionResultProps) {
  if (result.status === "rejected") {
    return (
      <p role="alert">
        {originalFile.name}: {String(result.reason)}
      </p>
    );
  }
  const { file, compressInfo: info } = result.value;
  return (
    <div>
      <Preview file={file} />
      <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
        压缩率: {info.rate.toFixed(2)}% | 耗时: {info.time.toFixed(2)}ms
        <br />
        原始大小: {(info.originalSize / 1024).toFixed(2)}KB | 压缩后: {(info.compressedSize / 1024).toFixed(2)}KB
      </div>
    </div>
  );
}
