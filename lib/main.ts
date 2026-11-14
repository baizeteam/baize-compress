import { checkImageSize } from "./utils.ts";
import { WorkerManager } from "./workerManage.ts";
import type { CompressPlugin, CompressBackInfo } from "./types.ts";

export type {
  CompressPlugin,
  CompressBackInfo,
  CompressPluginConfig,
  CompressPayload,
  CompressResult,
  CompressFunc,
} from "./types.ts";

export interface ImageCompressorOptions {
  workerNum?: number;
  plugins: CompressPlugin[];
}

export class ImageCompressor {
  private workerManager: WorkerManager;
  private plugins: CompressPlugin[];
  private cancellationGeneration = 0;

  constructor(params: ImageCompressorOptions) {
    this.plugins = params.plugins;
    this.workerManager = new WorkerManager(this.plugins, params.workerNum || 4);
  }

  private checkFileType(file: File): void {
    if (!this.plugins.some((p) => p.matches(file.type))) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }
  }

  private compressFile = async (file: File): Promise<CompressBackInfo> => {
    const generation = this.cancellationGeneration;
    this.checkFileType(file);
    if (file.type.startsWith("image/")) checkImageSize(file);

    const arrayBuffer = await file.arrayBuffer();
    if (generation !== this.cancellationGeneration) throw new Error("Compression canceled");
    const originalSize = arrayBuffer.byteLength;

    const result = await this.workerManager.executeTask(arrayBuffer, file.name, file.type);

    if (!result.success || !result.data) {
      throw new Error(result.error || "压缩失败");
    }

    const compressedSize = result.data.byteLength;
    const compressRate = originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;

    const compressedFile = new File([result.data], result.fileName || file.name, {
      type: result.fileType || file.type,
    });

    return {
      compressInfo: {
        rate: Math.round(compressRate * 100) / 100,
        time: (result as any).endTime - (result as any).startTime,
        originalSize,
        compressedSize,
      },
      file: compressedFile,
    };
  };

  public compressFilesWorker = async (files: File[]): Promise<PromiseSettledResult<CompressBackInfo>[]> => {
    let allSettled: typeof Promise.allSettled;
    if (!Promise.allSettled) {
      const rejectHandler = (reason: any) => ({ status: "rejected", reason });
      const resolveHandler = (value: any) => ({ status: "fulfilled", value });
      allSettled = function (promises: any) {
        const convertedPromises = promises.map((p: any) => Promise.resolve(p).then(resolveHandler, rejectHandler));
        return Promise.all(convertedPromises);
      };
    } else {
      allSettled = Promise.allSettled.bind(Promise);
    }
    return await allSettled(files.map((file) => this.compressFile(file)));
  };

  /** 兼容原图片压缩 API，也可处理已注册插件支持的音视频 */
  public compressImagesWorker = (files: File[]): Promise<PromiseSettledResult<CompressBackInfo>[]> => {
    return this.compressFilesWorker(files);
  };

  public cancelAll(): void {
    this.cancellationGeneration++;
    this.workerManager.terminate();
  }
}
