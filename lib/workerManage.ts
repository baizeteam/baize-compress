import workerUrl from "./pool.worker.ts?worker&url";
import type { CompressPlugin } from "./types";
import { validateTimeout } from "./utils";
import { runWorkerTask, type WorkerTaskOptions, type WorkerTaskResult } from "./workerTask";

interface QueuedTask extends WorkerTaskOptions {
  resolve: (value: WorkerTaskResult) => void;
  reject: (reason: unknown) => void;
}

// 管理所有插件共用的 Worker 池和待执行队列。
export class WorkerManager {
  private plugins: CompressPlugin[];
  private workers = new Set<Worker>();
  private active = new Map<Worker, AbortController>();
  private taskQueue: QueuedTask[] = [];
  private maxWorkers: number;

  // 保存插件列表和线程并发上限。
  constructor(plugins: CompressPlugin[], maxWorkers = 4) {
    this.plugins = plugins;
    this.maxWorkers = maxWorkers;
  }

  // 按注册顺序查找支持当前文件类型的插件。
  private findPlugin(fileType: string): CompressPlugin | null {
    return this.plugins.find((plugin) => plugin.matches(fileType)) ?? null;
  }

  // 优先复用空闲线程，并在并发上限内创建新线程。
  private processNextTask(): void {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      let worker = [...this.workers].find((item) => !this.active.has(item));

      if (!worker) {
        if (this.workers.size >= this.maxWorkers) return;
        try {
          // 部分打包器返回站点路径，统一相对页面解析，避免落到 file:// 基地址。
          worker = new Worker(new URL(workerUrl, globalThis.location.href), { type: "module" });
          this.workers.add(worker);
        } catch (error) {
          this.taskQueue.shift();
          task.reject(error);
          continue;
        }
      }

      this.taskQueue.shift();
      void this.executeTaskWithWorker(worker, task);
    }
  }

  // 执行排队任务，并在任务结束后继续调度。
  private async executeTaskWithWorker(worker: Worker, task: QueuedTask): Promise<void> {
    const controller = new AbortController();
    this.active.set(worker, controller);

    // 终止并移除无法继续使用的线程。
    const discardWorker = () => {
      worker.terminate();
      this.workers.delete(worker);
    };

    try {
      task.resolve(await runWorkerTask(worker, task, controller.signal, discardWorker));
    } catch (error) {
      task.reject(error);
    } finally {
      this.active.delete(worker);
      this.processNextTask();
    }
  }

  // 校验插件配置并将压缩任务加入队列。
  public async executeTask(arrayBuffer: ArrayBuffer, fileName: string, fileType: string): Promise<WorkerTaskResult> {
    const plugin = this.findPlugin(fileType);
    if (!plugin) {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
    if (typeof plugin.moduleUrl !== "string" || !plugin.moduleUrl) {
      throw new Error(`插件 ${plugin.name} 缺少压缩模块入口`);
    }
    const moduleUrl = new URL(plugin.moduleUrl, globalThis.location.href).href;
    const timeoutMs = plugin.timeoutMs ?? 30_000;
    validateTimeout(timeoutMs, `插件 ${plugin.name}`);

    return new Promise((resolve, reject) => {
      this.taskQueue.push({
        arrayBuffer,
        fileName,
        fileType,
        moduleUrl,
        config: plugin.defaultConfig,
        timeoutMs,
        resolve,
        reject,
      });
      this.processNextTask();
    });
  }

  // 取消排队和运行中的任务，释放线程并允许后续重新提交。
  public terminate(): void {
    this.taskQueue.forEach((task) => task.reject(new Error("Worker manager terminated")));
    this.taskQueue = [];
    this.active.forEach((controller) => controller.abort());
    this.workers.forEach((worker) => worker.terminate());
    this.workers.clear();
    this.active.clear();
  }
}
