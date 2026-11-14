import type { CompressBackInfo } from "../../lib/main";
import { Preview } from "./Preview";

interface CompressionResultProps {
  result: PromiseSettledResult<CompressBackInfo>;
}

// 显示单个文件的压缩预览、统计信息或失败原因。
export function CompressionResult({ result }: CompressionResultProps) {
  if (result.status === "rejected") {
    return (
      <div className="result-message result-error" role="alert">
        <strong>压缩失败</strong>
        <p>{String(result.reason)}</p>
      </div>
    );
  }
  const { file, compressInfo: info } = result.value;
  return (
    <div className="compression-result">
      <Preview file={file} />
      <div className="compression-stats">
        <span className="saving-badge">
          {info.rate > 0
            ? `减少 ${((100 * (info.originalSize - info.compressedSize)) / info.originalSize).toFixed(1)}%`
            : "体积未变"}
        </span>
        <span>耗时 {info.time < 1000 ? `${info.time} ms` : `${(info.time / 1000).toFixed(1)} s`}</span>
      </div>
    </div>
  );
}
