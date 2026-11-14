import { useEffect, useState } from "react";
import { formatFileSize } from "../utils";
import "./preview.css";

// 预览图片、音频或视频，并显示文件大小。
export function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState("");

  // 为当前文件创建预览地址，并在文件变更或卸载时释放。
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="file-preview">
      <div className="preview-stage">
        {file.type.startsWith("video/") ? (
          <video src={url} controls />
        ) : file.type.startsWith("audio/") || file.type === "application/ogg" ? (
          <div className="audio-preview">
            <audio src={url} controls />
          </div>
        ) : (
          <img src={url} alt={file.name} />
        )}
      </div>
      <div className="file-details">
        <span>{formatFileSize(file.size)}</span>
      </div>
    </div>
  );
}
