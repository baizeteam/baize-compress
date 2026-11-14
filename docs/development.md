# 开发与验证

使用 Node.js 20.19+ 或 22.12+（推荐 Node.js 24），以及 `packageManager` 指定的 pnpm 版本。

```sh
pnpm install
pnpm dev
```

## 代码组织

- `lib/main.ts`：对外 API、文件校验与压缩统计。
- `lib/workerManage.ts` / `lib/workerTask.ts`：线程池调度，以及任务读取、执行、超时与取消。
- `lib/pool.worker.ts`：在线程内加载和缓存插件压缩模块。
- `lib/plugins/`：插件配置入口与独立压缩实现。
- `build/gifsicle.ts`：将锁定版本的 GIF 引擎转换为静态模块；依赖升级时会校验脚本结构。
- `lib/types.ts`：共用类型；`src/`：示例页面与预览组件。

`pnpm build` 从源码生成 `dist/types/`，根目录和 `plugins/` 下的声明文件仅转出公共类型。修改 API 时直接更新源码，`pnpm pack` 会自动构建。

## 常用检查

```sh
pnpm typecheck
pnpm format
pnpm format:check
pnpm test
pnpm build:page
```

`pnpm test` 构建发布产物、验证公共类型导入，并执行线程池、取消、异常恢复和图片插件回归测试。
