import { useState, type ChangeEvent } from "react";
import { ImageCompressor, type CompressBackInfo } from "../lib/main";
import { jpegWebp } from "../lib/plugins/jpeg-webp";
import { png } from "../lib/plugins/png";
import { svg } from "../lib/plugins/svg";
import { gif } from "../lib/plugins/gif";
import { media } from "../lib/plugins/media";
import { CompressionResult } from "./components/CompressionResult";
import { Preview } from "./components/Preview";
import { Icon } from "./components/Icon";
import { formatFileSize } from "./utils";
import "./results.css";

const ACCEPT_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "audio/*",
  "video/*",
  "application/ogg",
];

// 提供批量文件压缩示例，并对比原文件与压缩结果。
export function App() {
  const [originalFiles, setOriginalFiles] = useState<File[]>([]);
  const [results, setResults] = useState<PromiseSettledResult<CompressBackInfo>[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState("");
  const completed = results.filter((result) => result.status === "fulfilled");
  const originalSize = completed.reduce((total, result) => total + result.value.compressInfo.originalSize, 0);
  const compressedSize = completed.reduce((total, result) => total + result.value.compressInfo.compressedSize, 0);
  const savedSize = Math.max(0, originalSize - compressedSize);
  const savedRate = originalSize > 0 ? (savedSize / originalSize) * 100 : 0;

  // 压缩选中的文件，并在批次结束后释放线程池。
  const handleMultipleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    event.target.value = "";
    setError("");
    setOriginalFiles(files);
    setResults([]);
    setCompressing(true);
    const compressor = new ImageCompressor({
      workerNum: 2,
      plugins: [jpegWebp({ quality: 0.5 }), png(), svg({ floatPrecision: 6 }), gif(), media({ maxHeight: 720 })],
    });

    try {
      setResults(await compressor.compressFilesWorker(files));
    } catch (error) {
      setError(`批量压缩失败：${String(error)}`);
    } finally {
      compressor.cancelAll();
      setCompressing(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="./">
          <span className="brand-mark">b.</span>baize-compress
        </a>
      </header>

      <div className="page-heading">
        <h1>文件压缩</h1>
        <div className="upload-action">
          <input
            className="visually-hidden"
            accept={ACCEPT_FILE_TYPES.join(",")}
            type="file"
            multiple
            disabled={compressing}
            onChange={handleMultipleFileChange}
            id="file_uploads"
          />
          <label className="file-picker" htmlFor="file_uploads" aria-disabled={compressing}>
            {compressing ? <span className="spinner" /> : <Icon name="upload" />}
            {compressing ? "正在压缩…" : "选择文件"}
          </label>
        </div>
      </div>
      {error && (
        <p className="page-error" role="alert">
          {error}
        </p>
      )}

      {originalFiles.length > 0 && (
        <dl className="summary-grid" aria-live="polite">
          <div>
            <dt>文件</dt>
            <dd>
              {originalFiles.length}
              <span>个</span>
            </dd>
          </div>
          <div>
            <dt>压缩前 / 后</dt>
            <dd className="size-comparison">
              {completed.length ? (
                <>
                  <span>{formatFileSize(originalSize)}</span> / <span>{formatFileSize(compressedSize)}</span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>体积减少</dt>
            <dd>
              {completed.length ? savedRate.toFixed(1) : "—"}
              {completed.length > 0 && <span>%</span>}
            </dd>
          </div>
        </dl>
      )}

      <section className="results-section" aria-label="文件压缩对比" aria-busy={compressing}>
        {originalFiles.length === 0 ? (
          <div className="empty-state">
            <Icon name="file" />
            <p>暂无文件</p>
          </div>
        ) : (
          <div className="comparison-list">
            {originalFiles.map((file, index) => (
              <article className="comparison-card" key={index} aria-label={`${file.name} 的压缩对比`}>
                <h2 className="comparison-title" title={file.name}>
                  {file.name}
                </h2>
                <div className="comparison-column">
                  <span className="column-label">原文件</span>
                  <Preview file={file} />
                </div>
                <div className="comparison-column">
                  <span className="column-label">压缩后</span>
                  {results[index] ? (
                    <CompressionResult result={results[index]} />
                  ) : (
                    <div
                      className="result-message"
                      role="status"
                      aria-label={compressing ? "正在压缩" : "未生成压缩结果"}
                    >
                      {compressing ? <span className="spinner" /> : "压缩失败"}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
