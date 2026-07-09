# 主进程日志（electron-log） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 electron-log 给主进程关键事件（尤其 AI SDK 调用）打终端 + 文件双通道日志。

**Architecture:** 新增 `src/main/logging/logger.ts` 初始化 electron-log；在 `AIProvider`、`ReadingActionService`、`LibraryService`、`registerIpc` 按 spec 打点；`apiKey` 永远脱敏。

**Tech Stack:** Electron、electron-log、现有主进程服务

**约束：** 不写自动化测试；每步用手动量验证。不使用 git worktree，直接在主工作区 `main` 分支实现。

**Spec：** `docs/superpowers/specs/2026-07-10-main-process-logging-design.md`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `package.json` / `pnpm-lock.yaml` | 增加 `electron-log` |
| `src/main/logging/logger.ts` | 初始化、导出 `logger` / `redactSettings` |
| `src/main/index.ts` | 启动时初始化 |
| `src/main/ai/AIProvider.ts` | AI 起止与错误 |
| `src/main/ai/ReadingActionService.ts` | 会话创建 / 追问 |
| `src/main/library/LibraryService.ts` | 导入 / 打开书籍 |
| `src/main/ipc/registerIpc.ts` | IPC 错误包装 |

---

### Task 1: 安装依赖并创建 logger

**Files:**
- Modify: `package.json`
- Create: `src/main/logging/logger.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 安装 electron-log**

```bash
pnpm add electron-log
```

- [ ] **Step 2: 创建 logger 模块**

创建 `src/main/logging/logger.ts`：

```ts
import log from 'electron-log/main';
import path from 'node:path';
import type { AISettings } from '../../shared/types';

let initialized = false;

export function initLogger() {
  if (initialized) return;
  initialized = true;

  log.initialize();
  log.transports.ipc.level = false;
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.resolvePathFn = (variables) =>
    path.join(variables.userData, 'logs', 'main.log');
  log.transports.file.inspectOptions = { depth: 8 };
  log.transports.console.inspectOptions = { depth: 8 };

  log.info('logger.ready', { file: log.transports.file.getFile().path });
}

export const logger = log;

export function redactSettings(settings: AISettings) {
  return {
    ...settings,
    apiKey: settings.apiKey ? '***' : '',
  };
}
```

- [ ] **Step 3: 在主进程入口初始化**

在 `src/main/index.ts` 顶部 import，并在 `app.whenReady().then` 开头调用 `initLogger()`（创建窗口前）。

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/main/logging/logger.ts src/main/index.ts
git commit -m "$(cat <<'EOF'
feat: 接入 electron-log 主进程日志基础设施

EOF
)"
```

---

### Task 2: AIProvider 打点

**Files:**
- Modify: `src/main/ai/AIProvider.ts`

- [ ] **Step 1: 在 generate / streamGenerate 记录 start/done/error**

对 `generate` 与 `streamGenerate`：

- 入口：`logger.info('ai.generate.start' | 'ai.stream.start', { settings: redactSettings(settings), system, user, purpose? })`
- 成功：记 `durationMs`、`tokenUsage`、`text`
- `catch`：`logger.error(...)` 后 rethrow

`testConnection` 调用 `generate` 时传入 `purpose: 'testConnection'`（给 `generate` 增加可选 `purpose` 参数，或在 start 日志对象里由调用方扩展——推荐给 `generate` 增加可选第三参 `options?: { purpose?: string }`）。

- [ ] **Step 2: Commit**

```bash
git add src/main/ai/AIProvider.ts
git commit -m "$(cat <<'EOF'
feat: 为 AI SDK 调用记录全量日志

EOF
)"
```

---

### Task 3: 业务与 IPC 打点

**Files:**
- Modify: `src/main/ai/ReadingActionService.ts`
- Modify: `src/main/library/LibraryService.ts`
- Modify: `src/main/ipc/registerIpc.ts`

- [ ] **Step 1: ReadingActionService**

- `runReadingAction`：创建 thread 后记 `threads.create`
- `followUp`：记 `threads.followUp`

- [ ] **Step 2: LibraryService**

- `importMarkdown`：成功 `books.import`；用 try/catch 包一层，失败 `logger.error` 后 rethrow
- `openBook`：成功 `books.open`；找不到书时 error 日志后 throw（保持原 throw）

- [ ] **Step 3: registerIpc**

增加 `withIpcLog(channel, handler)`：async 包装，catch 记 `ipc.error` 再 throw。对关键 handler 套上（settings、books、ai、threads）。

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/ReadingActionService.ts src/main/library/LibraryService.ts src/main/ipc/registerIpc.ts
git commit -m "$(cat <<'EOF'
feat: 为书籍与会话业务及 IPC 错误补日志

EOF
)"
```

---

### Task 4: 手工验证

- [ ] **Step 1:** `pnpm dev`，确认终端有 `logger.ready`
- [ ] **Step 2:** 导入/打开书、白话解释、追问，确认事件与完整 prompt/回复
- [ ] **Step 3:** 确认 `{userData}/logs/main.log` 存在且无明文 apiKey
