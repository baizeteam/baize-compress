declare module "gifsicle-wasm-browser" {
  interface Gifsicle {
    tool: {
      workerLocalUrl: string;
    };
  }

  const gifsicle: Gifsicle;
  export default gifsicle;
}

declare module "virtual:baize-gifsicle" {
  interface GifsicleOptions {
    data: Array<{ file: ArrayBuffer; name: string }>;
    command: string[];
  }

  // 在线程池内直接执行静态 gifsicle 引擎。
  export default function gifsicle(
    options: GifsicleOptions,
  ): Promise<Array<{ file: Uint8Array | ArrayBuffer; name: string }>>;
}
