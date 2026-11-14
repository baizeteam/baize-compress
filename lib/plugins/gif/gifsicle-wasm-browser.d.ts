declare module "gifsicle-wasm-browser" {
  interface GifsicleRunOptions {
    input: Array<{
      file: string | Blob | ArrayBuffer;
      name: string;
    }>;
    command: string[];
    folder?: string[];
    isStrict?: boolean;
  }

  interface Gifsicle {
    tool: {
      workerLocalUrl: string;
    };
    // 调用 gifsicle 自带的 Worker 压缩输入文件。
    run(options: GifsicleRunOptions): Promise<File[] | null>;
  }

  const gifsicle: Gifsicle;
  export default gifsicle;
}
