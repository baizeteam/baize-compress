import { useState, type ChangeEvent } from "react";
import { ImageCompressor, type CompressBackInfo } from "../lib/main";
import { jpegWebp } from "../lib/plugins/jpeg-webp";
import { png } from "../lib/plugins/png";
import { svg } from "../lib/plugins/svg";
import { gif } from "../lib/plugins/gif";
import { media } from "../lib/plugins/media";
import { CompressionResult } from "./components/CompressionResult";
import { Preview } from "./components/Preview";

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

  // 压缩选中的文件，并在批次结束后释放线程池。
  const handleMultipleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

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
      console.error("批量压缩失败：", error);
    } finally {
      compressor.cancelAll();
      setCompressing(false);
    }
  };

  return (
    <div>
      <h1>baize-compress 文件压缩示例</h1>
      <label htmlFor="file_uploads">选择图片、音频或视频</label>
      <input
        accept={ACCEPT_FILE_TYPES.join(",")}
        type="file"
        multiple
        disabled={compressing}
        onChange={handleMultipleFileChange}
        id="file_uploads"
        name="file_uploads"
      />
      {compressing && <p>正在压缩…</p>}
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1 }}>
          <h2>原文件</h2>
          {originalFiles.map((file, index) => (
            <Preview key={index} file={file} />
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <h2>压缩结果</h2>
          {results.map((result, index) => (
            <CompressionResult key={index} originalFile={originalFiles[index]} result={result} />
          ))}
        </div>
      </div>
    </div>
  );
}
