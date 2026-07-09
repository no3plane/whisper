# 主进程日志（electron-log）

日期：2026-07-10

## 问题

主进程目前没有任何结构化日志。调试 AI SDK 调用、书籍导入/打开、会话创建与追问时，只能靠前端表现或临时 `console.log`，事后难以复盘。

## 目标

- 主进程关键事件同时输出到终端与本地日志文件。
- AI SDK 调用（`generateText` / `streamText`）记录完整 prompt 与回复，便于复盘模型行为。
- `apiKey` 等敏感字段永远脱敏。
- 业务侧记录导入书籍、打开书籍、创建会话/追问，以及 IPC 关键路径失败。

## 非目标

- 不做渲染进程日志。
- 不做应用内日志查看 UI。
- 不做远程上报 / 遥测。
- 不做按级别动态开关的设置页。
- 不记录每个 stream chunk（噪声过大）。
- 不记录应用生命周期细项（ready / 窗口创建等）；本阶段范围止于 AI + 关键业务事件。

## 方案选择

采用 **electron-log**（主进程入口 `electron-log/main`）：

1. 开箱支持 console + file 双 transport，符合「终端 + 文件」需求。
2. 自带文件轮转，避免自研文件 IO。
3. 项目体量小，引入一个成熟依赖可接受。

不采用自研薄封装：省掉轮转与路径细节，优先落地打点。

## 基础设施

### 依赖与入口

- 依赖：`electron-log`
- 新增：`src/main/logging/logger.ts`
- 在 `src/main/index.ts` 尽早调用初始化（`app.whenReady` 前或其中、创建窗口前）

### 初始化行为

```ts
import log from 'electron-log/main';

log.initialize();
log.transports.ipc.level = false; // 本阶段不桥接渲染进程
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.resolvePathFn = (variables) =>
  path.join(variables.userData, 'logs', 'main.log');
```

- 文件路径：`{userData}/logs/main.log`（与现有 `whisper-data` 并列）
- console + file 均开启
- 导出统一 `logger`（即配置后的 `log`）
- 导出 `redactSettings(settings)`：返回去掉明文 `apiKey` 的副本（如 `apiKey: '***'`）

### 日志形态

- 使用 `logger.info` / `logger.warn` / `logger.error`
- 事件名用稳定字符串（如 `ai.stream.start`），附加对象字段
- 对象序列化深度需足够覆盖完整 prompt / 回复（必要时调高 `inspectOptions.depth`）

## 打点清单

### AI（`AIProvider`）

| 事件 | 级别 | 字段 |
|------|------|------|
| `ai.generate.start` / `ai.stream.start` | info | `model`、`baseURL`、脱敏后的 settings 摘要、`system`、`user` 全文；`testConnection` 可带 `purpose: 'testConnection'` |
| `ai.generate.done` / `ai.stream.done` | info | 耗时 `durationMs`、`tokenUsage`、回复 `text` 全文 |
| `ai.generate.error` / `ai.stream.error` | error | 上述上下文摘要 + `message` / `stack` |

规则：

- 在方法入口记 start；成功记 done；`catch` 记 error 后 **rethrow**（不改变现有错误传播）。
- 不记录 stream 的每个 chunk。
- 永不把明文 `apiKey` 写入日志。

### 业务事件

| 事件 | 位置 | 级别 | 字段 |
|------|------|------|------|
| `books.import` | `LibraryService.importMarkdown` | info / error | 源路径、书名、`bookId`；失败时 error |
| `books.open` | `LibraryService.openBook` | info / error | `bookId`、title（可得时）；失败时 error |
| `threads.create` | `ReadingActionService.runReadingAction` | info | `bookId`、`threadId`、`actionType`、`contextStrategy`、选中文本 |
| `threads.followUp` | `ReadingActionService.followUp` | info | `bookId`、`threadId`、问题文本 |
| `ipc.error` | `registerIpc` 关键 handler 包装 | error | `channel`、`message` / `stack` |

说明：

- AI 细节仍由 `AIProvider` 记录；`ReadingActionService` 只记业务语义事件。
- IPC 包装：捕获未处理异常 → 记 `ipc.error` → 再抛出，前端行为不变。
- 日志写入失败不阻断主流程（依赖 electron-log 默认行为）。

## 文件改动预期

| 文件 | 职责 |
|------|------|
| `package.json` / lockfile | 增加 `electron-log` |
| `src/main/logging/logger.ts` | 初始化、导出 `logger` / `redactSettings` |
| `src/main/index.ts` | 启动时初始化 logger |
| `src/main/ai/AIProvider.ts` | AI 起止与错误日志 |
| `src/main/ai/ReadingActionService.ts` | 会话创建 / 追问业务事件 |
| `src/main/library/LibraryService.ts` | 导入 / 打开书籍事件 |
| `src/main/ipc/registerIpc.ts` | 关键 handler 错误包装 |

## 验证方式

手工验证（不写自动化测试）：

1. `pnpm dev` 启动后，终端可见初始化或业务日志。
2. 导入一本书、打开书籍 → 出现 `books.import` / `books.open`。
3. 发起白话解释与追问 → 出现 `threads.*` 与 `ai.stream.start/done`，文件中含完整 prompt/回复。
4. 确认日志文件存在于 `{userData}/logs/main.log`，且内容中无明文 apiKey。
5. 故意触发失败（如错误 API）→ 出现 `ai.stream.error` / `ipc.error`，前端错误行为与改前一致。

## 约束

- 不写自动化测试；用手动量验证。
- 不使用 git worktree；在主工作区 `main` 分支实现。
