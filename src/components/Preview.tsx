import { useEffect, useState } from "react";

// 预览图片、音频或视频，并提供文件下载。
export function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState("");

  // 为当前文件创建预览地址，并在文件变更或卸载时释放。
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
