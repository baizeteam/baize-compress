import type { CompressPayload, CompressResult, CompressPluginConfig } from "./types";

export interface WorkerTaskOptions extends Pick<CompressPayload, "arrayBuffer" | "fileName" | "fileType"> {
  moduleUrl: string;
  config: CompressPluginConfig;
  timeoutMs: number;
}

export interface WorkerTaskResult extends CompressResult {
  startTime: number;
  endTime: number;
}

// 执行单个 Worker 任务，统一处理计时、取消、异常和监听器清理。
export function runWorkerTask(
  worker: Worker,
  task: WorkerTaskOptions,
  signal: AbortSignal,
  discardWorker: () => void,
): Promise<WorkerTaskResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let settled = false;

    // 结束任务并清理定时器及事件监听器。
    const finish = (error?: unknown, result?: CompressResult, discard = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
      if (discard) discardWorker();
      if (result) resolve({ ...result, startTime, endTime: Date.now() });
      else reject(error);
    };

    // 接收压缩结果，普通压缩失败时保留线程供后续任务复用。
    const handleMessage = (event: MessageEvent<CompressResult>) => {
      const result = event.data;
      if (result.success) finish(undefined, result);
      else finish(new Error(result.error || "压缩失败"));
    };

    // 在线程异常时移除损坏的 Worker。
    const handleError = (event: ErrorEvent) => {
      finish(new Error(`Worker error: ${event.message}`), undefined, true);
    };

    // 取消当前任务并释放任务监听器。
    const handleAbort = () => finish(new Error("Worker manager terminated"));
    // 超时后丢弃线程，避免未完成的压缩干扰下一任务。
    const timeoutId = setTimeout(() => {
      finish(new Error("Worker timeout"), undefined, true);
    }, task.timeoutMs);

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
      return;
    }

    try {
      worker.postMessage(
        {
          ...task.config,
          type: "compress",
          moduleUrl: task.moduleUrl,
          arrayBuffer: task.arrayBuffer,
          fileName: task.fileName,
          fileType: task.fileType,
        },
        [task.arrayBuffer],
      );
    } catch (error) {
      finish(error);
    }
  });
}
