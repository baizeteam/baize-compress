import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ImageCompressor } from "../lib/main";
import { jpegWebp } from "../lib/plugins/jpeg-webp";
import { png } from "../lib/plugins/png";
import { svg } from "../lib/plugins/svg";
import { gif } from "../lib/plugins/gif";
import { media } from "../lib/plugins/media";

const ACCEPT_IMG_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"];

function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <div style={{ marginBottom: 16 }}>
      <div>{file.name}</div>
      {file.type.startsWith("video/") ? (
        <video src={url} controls style={{ maxWidth: "100%", maxHeight: 400 }} />
      ) : file.type.startsWith("audio/") || file.type === "application/ogg" ? (
        <audio src={url} controls />
      ) : (
        <img src={url} style={{ display: "block", maxWidth: "100%", maxHeight: 400 }} alt={file.name} />
      )}
      <a href={url} download={file.name}>
        下载
      </a>
    </div>
  );
}

function App() {
  const [originalImages, setOriginalImages] = useState<File[]>([]);
  const [compressedImages, setCompressedImages] = useState<Array<File | undefined>>([]);
  const [compressionInfo, setCompressionInfo] = useState<
    Array<{ rate: number; time: number; originalSize: number; compressedSize: number } | undefined>
  >([]);
  const [errors, setErrors] = useState<Array<string | undefined>>([]);
  const [compressing, setCompressing] = useState(false);

  const reset = () => {
    setOriginalImages([]);
    setCompressedImages([]);
    setCompressionInfo([]);
    setErrors([]);
  };

  const handleMultipleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }
    reset();
    setCompressing(true);
    const compressor = new ImageCompressor({
      workerNum: 2,
      plugins: [jpegWebp({ quality: 0.5 }), png(), svg({ floatPrecision: 6 }), gif(), media({ maxHeight: 720 })],
    });

    try {
      console.time("Compress Elapse");
      const originalImages = Array.from(files);
      setOriginalImages(originalImages);

      const compressionResults = await compressor.compressFilesWorker(originalImages);
      setErrors(compressionResults.map((res) => (res.status === "rejected" ? String(res.reason) : undefined)));

      const compressedImages = compressionResults.map((res) => {
        if (res.status === "rejected") {
          console.error("Compression failed", res.reason);
          return undefined;
        }
        return res.value.file;
      });
      setCompressedImages(compressedImages);

      const compressionInfo = compressionResults.map((res) => {
        if (res.status === "rejected") {
          return undefined;
        }
        return res.value.compressInfo;
      });
      setCompressionInfo(compressionInfo);

      console.timeEnd("Compress Elapse");
    } catch (error) {
      console.error("handleMultipleFileChange error:", error);
    } finally {
      compressor.cancelAll();
      setCompressing(false);
    }
  };

  return (
    <div>
      Hello baize-compress!
      <br />
      <br />
      <div
        style={{
          display: "flex",
        }}
      >
        <div
          style={{
            flex: 1,
          }}
        >
          <label htmlFor="image_uploads">选择图片、音频或视频</label>
          <input
            accept={[...ACCEPT_IMG_TYPES, "audio/*", "video/*", "application/ogg"].join(",")}
            type="file"
            multiple
            disabled={compressing}
            onChange={handleMultipleFileChange}
            id="image_uploads"
            name="image_uploads"
          />
          {compressing && <p>正在压缩…</p>}
          <div
            style={{
              display: "flex",
            }}
          >
            <div
              style={{
                flex: 1,
              }}
            >
              <h2>原文件</h2>
              {originalImages.map((file, index) => (
                <Preview key={index} file={file} />
              ))}
            </div>
            <div
              style={{
                flex: 1,
              }}
            >
              <h2>压缩结果</h2>
              {compressedImages.map((file, index) => {
                const info = compressionInfo[index];
                return (
                  <div key={index}>
                    {file && <Preview file={file} />}
                    {errors[index] && (
                      <p role="alert">
                        {originalImages[index].name}: {errors[index]}
                      </p>
                    )}
                    {info && (
                      <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
                        压缩率: {info.rate.toFixed(2)}% | 耗时: {info.time.toFixed(2)}ms
                        <br />
                        原始大小: {(info.originalSize / 1024).toFixed(2)}KB | 压缩后:{" "}
                        {(info.compressedSize / 1024).toFixed(2)}KB
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")!).render(<App />);
