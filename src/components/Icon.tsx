const paths = {
  upload: "M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4",
  file: "M14 2H6v20h12V6l-4-4Zm0 0v5h5M9 12h6m-6 4h6",
};

// 绘制示例页共用的操作图标。
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
