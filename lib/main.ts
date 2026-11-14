import { checkImageSize } from "./utils";
import { WorkerManager } from "./workerManage";
import type { CompressPlugin, CompressBackInfo } from "./types.js";

export type {
  CompressPlugin,
  CompressBackInfo,
  CompressPluginConfig,
  CompressPayload,
  CompressResult,
  CompressFunc,
} from "./types.js";

export interface ImageCompressorOptions {
  workerNum?: number;
  plugins: CompressPlugin[];
}

// 通过插件和共用线程池批量压缩图片及音视频文件。
export class ImageCompressor {
  private workerManager: WorkerManager;

  // 注册插件并初始化线程池。
  constructor(params: ImageCompressorOptions) {
    this.workerManager = new WorkerManager(params.plugins, params.workerNum ?? 4);
  }

  // 压缩单个文件并生成文件对象和压缩统计。
  private compressFile = async (file: File): Promise<CompressBackInfo> => {
    if (file.type.startsWith("image/")) checkImageSize(file);
    const originalSize = file.size;
    const result = await this.workerManager.executeTask(file);

    const compressedSize = result.data.byteLength;
    const compressRate = originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;

    const compressedFile = new File([result.data], result.fileName || file.name, {
      type: result.fileType || file.type,
    });

    return {
      compressInfo: {
        rate: Math.round(compressRate * 100) / 100,
        time: result.endTime - result.startTime,
        originalSize,
        compressedSize,
      },
      file: compressedFile,
    };
  };

  // 按输入顺序返回每个文件的压缩结果，兼容缺少 allSettled 的环境。
  public compressFilesWorker = async (files: File[]): Promise<PromiseSettledResult<CompressBackInfo>[]> => {
    const promises = files.map((file) => this.compressFile(file));
    if (Promise.allSettled) return Promise.allSettled(promises);

    // 将成功结果转换为统一的批量返回格式。
    const resolveHandler = (value: CompressBackInfo): PromiseFulfilledResult<CompressBackInfo> => ({
      status: "fulfilled",
      value,
    });
    // 将失败原因转换为统一的批量返回格式。
    const rejectHandler = (reason: unknown): PromiseRejectedResult => ({ status: "rejected", reason });
    return Promise.all(promises.map((promise) => promise.then(resolveHandler, rejectHandler)));
  };

  // 兼容原图片压缩入口，也支持已注册插件匹配的音视频。
  public compressImagesWorker = (files: File[]): Promise<PromiseSettledResult<CompressBackInfo>[]> => {
    return this.compressFilesWorker(files);
  };

  // 取消未完成的任务，并释放全部 Worker。
  public cancelAll(): void {
    this.workerManager.terminate();
  }
}
