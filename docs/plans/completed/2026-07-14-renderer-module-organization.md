# Renderer 模块组织实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 renderer 调整为页面组装、feature 内聚的目录结构，并用架构文档和 Harness 固化长期约束，同时保持行为不变。

**Architecture:** 页面继续承担组合职责；对话、阅读选区和设置分别收拢到独立 feature。迁移仅移动文件和更新 import，不拆分组件或改变运行时接口；稳定的路径、命名和依赖规则由 Harness 阻断。

**Tech Stack:** Electron、React 19、TypeScript、CSS Modules、Vitest、Node.js Harness

## Global Constraints

- 目录使用 `kebab-case`；React 组件使用 `PascalCase.tsx`；普通模块使用 `camelCase.ts`。
- 不改变 UI、组件 API、状态模型、IPC、持久化或运行时行为。
- 不新增依赖、barrel export、路径别名或旧路径兼容文件。
- 测试继续保留在 `tests/renderer/`。

---

### Task 1: 迁移 renderer 页面和 feature 文件

**Files:**

- Move: `src/renderer/pages/LibraryPage.tsx` → `src/renderer/pages/library-page/LibraryPage.tsx`
- Move: `src/renderer/pages/LibraryPage.module.css` → `src/renderer/pages/library-page/LibraryPage.module.css`
- Move: `src/renderer/pages/ReaderPage.tsx` → `src/renderer/pages/reader-page/ReaderPage.tsx`
- Move: `src/renderer/pages/ReaderPage.module.css` → `src/renderer/pages/reader-page/ReaderPage.module.css`
- Move: `src/renderer/components/{RightAiPanel,TargetPicker,ThreadHistory}*` → `src/renderer/features/conversation/`
- Move: `src/renderer/chat/draftState.ts` → `src/renderer/features/conversation/draftState.ts`
- Move: `src/renderer/components/SelectionMenu*` and `src/renderer/selection/selectionSnapshot.ts` → `src/renderer/features/reading-selection/`
- Move: `src/renderer/components/SettingsPanel*` → `src/renderer/features/settings/`
- Modify: `src/renderer/App.tsx`
- Modify: moved TypeScript files

**Interfaces:**

- Consumes: 现有组件 exports、`WhisperApi` 和 `src/shared` 类型。
- Produces: 相同 exports 和运行时行为，仅源码路径改变。

- [x] **Step 1: 移动文件并按新目录深度修正相对 import**

保持所有 export 名称和函数签名不变；页面通过 `../../features/...` 和 `../../api/whisper` 引用依赖，feature 通过 `../../../shared/...` 引用共享契约。

- [x] **Step 2: 更新 App 的页面和设置 import**

```ts
import { SettingsPanel } from './features/settings/SettingsPanel';
import { LibraryPage } from './pages/library-page/LibraryPage';
import { ReaderPage } from './pages/reader-page/ReaderPage';
```

- [x] **Step 3: 运行 TypeScript 检查**

Run: `pnpm lint:types`

Expected: 退出码 0，无缺失模块或类型错误。

---

### Task 2: 更新 renderer 测试路径并验证行为

**Files:**

- Modify: `tests/renderer/ReaderPage.test.tsx`
- Modify: `tests/renderer/RightAiPanel.test.tsx`
- Modify: `tests/renderer/TargetPicker.test.tsx`
- Modify: `tests/renderer/ThreadHistory.test.tsx`
- Modify: `tests/renderer/draftState.test.ts`
- Modify: `tests/renderer/selectionSnapshot.test.ts`

**Interfaces:**

- Consumes: Task 1 迁移后的源码路径。
- Produces: 现有回归测试对新路径的完整覆盖。

- [x] **Step 1: 将测试 import 和 mock 路径更新到对应页面或 feature**

例如：

```ts
import { ReaderPage } from '../../src/renderer/pages/reader-page/ReaderPage';
import { RightAiPanel } from '../../src/renderer/features/conversation/RightAiPanel';
import { captureSelection } from '../../src/renderer/features/reading-selection/selectionSnapshot';
```

- [x] **Step 2: 运行 renderer 测试**

Run: `pnpm exec vitest run tests/renderer`

Expected: 全部 renderer 测试通过。

---

### Task 3: 固化长期架构和 Harness 约束

**Files:**

- Modify: `ARCHITECTURE.md`
- Modify: `scripts/check-harness.mjs`

**Interfaces:**

- Consumes: Task 1 的目标目录结构。
- Produces: `pnpm harness:check` 自动验证稳定的结构规则。

- [x] **Step 1: 在 ARCHITECTURE.md 记录 renderer 目录职责、命名和依赖方向**

文档明确 `pages` 负责组合、`features` 负责功能内聚、`api` 负责 preload 适配，以及目录/组件/普通模块的命名规则。

- [x] **Step 2: 在 Harness 检查遗留目录、子目录命名、跨边界 import 和组件/CSS Module 命名**

检查失败时输出具体相对路径和修复方向；只检查无需业务判断的规则。

- [x] **Step 3: 证明 Harness 接受当前结构**

Run: `pnpm harness:check`

Expected: 输出 `Harness 检查通过`，退出码 0。

---

### Task 4: 完整验证并归档文档

**Files:**

- Move: `docs/specs/active/2026-07-14-renderer-module-organization.md` → `docs/specs/completed/2026-07-14-renderer-module-organization.md`
- Move: `docs/plans/active/2026-07-14-renderer-module-organization.md` → `docs/plans/completed/2026-07-14-renderer-module-organization.md`

**Interfaces:**

- Consumes: 前三项已完成的实现和检查。
- Produces: 完成态文档及通过全部质量门的仓库。

- [x] **Step 1: 运行完整质量门**

Run: `pnpm check`

Expected: harness、格式、lint、类型、测试和构建全部通过。

- [x] **Step 2: 检查旧目录和旧 import 已清除**

Run: `find src/renderer -maxdepth 3 -type f | sort && rg 'renderer/(components|chat|selection)|src/renderer/pages/(ReaderPage|LibraryPage)' src tests`

Expected: 文件只出现在目标目录，`rg` 无命中并以退出码 1 结束。

- [x] **Step 3: 将 Spec 和 Plan 移入 completed 并复查文档链接**

Run: `pnpm harness:check`

Expected: 输出 `Harness 检查通过`，退出码 0。
