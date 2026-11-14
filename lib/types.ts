export interface CompressResult {
  success: boolean;
  data?: ArrayBuffer;
  fileName?: string;
  fileType?: string;
  error?: string;
}

export interface CompressPluginConfig {
  quality?: number;
  floatPrecision?: number;
  svgoPlugins?: any[];
  /** gif：gifsicle -O 等级，1 | 2 | 3 */
  optimize?: 1 | 2 | 3;
  /** gif：gifsicle --lossy，0-200。设置后不再按 quality 换算 */
  lossy?: number;
  /** 自定义插件可附带自己的参数，会原样发给 worker */
  [key: string]: any;
}

export interface CompressPayload {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  fileType: string;
  [key: string]: any;
}

export type CompressFunc = (payload: CompressPayload) => Promise<CompressResult>;

export interface CompressPlugin {
  name: string;
  matches: (fileType: string) => boolean;
  /** 插件内部的压缩模块入口，模块必须导出 compress；使用者无需配置 */
  moduleUrl: string;
  /** 单个任务的超时时间（毫秒），默认 30000 */
  timeoutMs?: number;
  defaultConfig: CompressPluginConfig;
}

export interface CompressBackInfo {
  compressInfo: {
    rate: number;
    time: number;
    originalSize: number;
    compressedSize: number;
  };
  file: File;
}
