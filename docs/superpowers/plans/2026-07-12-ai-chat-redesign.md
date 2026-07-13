# AI Chat 内容与会话交互重设计 Implementation Plan

> **最终决策（2026-07-13）：** 本项目开发阶段不再兼容旧 SQLite schema。旧数据库直接删除重建；本文中关于旧列、幂等迁移和旧会话映射的步骤仅保留为实施历史，不再是当前要求。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有“框选即执行动作”的 AI 面板改造成支持固定解读目标、单选技能、唯一草稿、原文引用、可关闭 Tab、历史恢复与失败重试的完整会话系统。

**Architecture:** renderer 负责未持久化草稿、打开 Tab 和 DOM 选区快照；主进程负责正式会话、消息、流式生成、删除和重试。`ContextAssembler` 将全书认知与解读目标拆成两层并记录覆盖 passage，按策略只补足缺失内容。

**Tech Stack:** Electron 35、React 19、TypeScript 5.8、better-sqlite3、assistant-ui、Vitest、Testing Library、jsdom

## Global Constraints

- 面向用户的文案、设计文档、计划、评审总结默认使用中文。
- 不创建或使用 git worktree；直接在主工作区 `main` 分支开发、验证和提交。
- 技能单选且只作用于首次回答。
- 同一时间只允许一个未持久化草稿；覆盖和关闭草稿均不提示。
- 一轮追问最多引用一处原文，引用时问题必填。
- 首版不做会话重命名、历史搜索、历史分组、多引用或跨设备同步。

**Spec:** `docs/superpowers/specs/2026-07-12-ai-chat-redesign.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/shared/types.ts` | 目标、选区、技能、引用、会话和 IPC 输入类型 |
| `src/shared/skills.ts` | 三类技能定义、校验和标题生成 |
| `src/main/library/MarkdownParser.ts` | Markdown 章节父子关系和父章节范围 |
| `src/main/storage/schema.ts` | 新库字段 |
| `src/main/storage/database.ts` | 旧库幂等列迁移 |
| `src/main/threads/ThreadStore.ts` | 会话/消息映射、删除、失败状态和重试存储 |
| `src/main/ai/ContextAssembler.ts` | 全书认知覆盖记录与目标去重补足 |
| `src/main/ai/ReadingActionService.ts` | 创建会话、追问、重试和流式生命周期 |
| `src/shared/ipc.ts` | retry/delete channel |
| `src/main/ipc/registerIpc.ts` | 主进程 handler |
| `src/preload/index.ts` | renderer API |
| `src/renderer/selection/selectionSnapshot.ts` | DOM Selection 到 passage/offset 快照及恢复 |
| `src/renderer/chat/draftState.ts` | 唯一草稿状态转换和校验 |
| `src/renderer/components/SelectionMenu.tsx` | 两个选区意图入口 |
| `src/renderer/components/TargetPicker.tsx` | 目标面包屑和技能选择 |
| `src/renderer/components/ThreadHistory.tsx` | 历史列表、恢复和删除 |
| `src/renderer/components/RightAiPanel.tsx` | 横向 Tab、草稿 Composer、正式聊天和引用附件 |
| `src/renderer/pages/ReaderPage.tsx` | 页面编排、后台流事件、打开 Tab 和原文定位 |
| `src/renderer/styles.css` | 新交互样式与高亮 |

---

### Task 1: 建立共享领域类型与三类技能目录

**Files:**
- Create: `src/shared/skills.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/shared/skills.test.ts`

**Interfaces:**
- Produces: `ReadingTarget`, `SelectionSnapshot`, `ReadingSkillType`, `MessageReference`, `CreateConversationInput`, `RetryMessageInput`, `DeleteThreadInput`
- Produces: `skillsForTarget(type)`, `isSkillAllowed(type, skill)`, `buildThreadTitle(input)`

- [ ] **Step 1: 写技能选择与标题生成的失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { buildThreadTitle, isSkillAllowed, skillsForTarget } from '../../src/shared/skills';

describe('reading skills', () => {
  it('按目标类型返回不同技能并拒绝不适用技能', () => {
    expect(skillsForTarget('selection').map((item) => item.id)).toContain('plain_explanation');
    expect(skillsForTarget('book').map((item) => item.id)).toContain('book_framework');
    expect(isSkillAllowed('chapter', 'plain_explanation')).toBe(false);
  });

  it('优先用目标和技能生成标题，无技能时使用首问', () => {
    expect(buildThreadTitle({ targetLabel: '第三章', skillLabel: '梳理论证', question: '' }))
      .toBe('第三章 · 梳理论证');
    expect(buildThreadTitle({ targetLabel: '全书', skillLabel: null, question: '作者为什么反对经验主义？' }))
      .toBe('全书 · 作者为什么反对经验主义？');
  });
});
```

- [ ] **Step 2: 运行测试确认因模块不存在而失败**

Run: `pnpm vitest run tests/shared/skills.test.ts`

Expected: FAIL，提示无法解析 `src/shared/skills`。

- [ ] **Step 3: 在 `types.ts` 定义目标、引用和输入类型**

```ts
export type ReadingTargetType = 'book' | 'chapter' | 'selection';
export type ReadingSkillType =
  | 'book_summary' | 'book_framework' | 'book_critique'
  | 'chapter_summary' | 'chapter_role' | 'chapter_argument'
  | 'plain_explanation' | 'concept_explanation' | 'background_context' | 'example_analogy';

export interface ChapterCrumb { chapterId: string; title: string }
export interface SelectionSnapshot {
  selectedText: string;
  startPassageId: string;
  endPassageId: string;
  startOffset: number;
  endOffset: number;
}
export interface ReadingTarget {
  type: ReadingTargetType;
  chapterId: string | null;
  startPassageId: string | null;
  endPassageId: string | null;
  selectedText: string;
  startOffset: number | null;
  endOffset: number | null;
  breadcrumb: ChapterCrumb[];
}
export interface MessageReference extends SelectionSnapshot { breadcrumb: ChapterCrumb[] }
export interface CreateConversationInput {
  bookId: string;
  target: ReadingTarget;
  skillType: ReadingSkillType | null;
  prompt: string;
  contextStrategy: ContextStrategy;
}
export interface FollowUpInput { threadId: string; question: string; reference?: MessageReference | null }
export interface RetryMessageInput { threadId: string; messageId: string }
export interface DeleteThreadInput { threadId: string }
```

同时将 `ReadingThread` 改为保存 `target`、`skillType`、`lastError`，将 `ThreadMessage` 增加 `reference`、`status`、`error`。保留 `ReadingActionType` 作为旧库迁移兼容别名，业务新代码不再使用。

- [ ] **Step 4: 实现三类技能常量和纯函数**

`src/shared/skills.ts` 导出只读技能定义；`buildThreadTitle` 将换行压成空格，并以 18 个 Unicode code point 截断后加 `…`。不得调用 AI。

- [ ] **Step 5: 运行测试和类型检查**

Run: `pnpm vitest run tests/shared/skills.test.ts && pnpm lint:types`

Expected: 测试 PASS；类型检查可能因旧调用尚未迁移而 FAIL，失败仅允许来自 `ReadingThread` / `FollowUpInput` 旧字段，记录列表供 Task 4 修复。

- [ ] **Step 6: 提交**

```bash
git add src/shared/types.ts src/shared/skills.ts tests/shared/skills.test.ts
git commit -m "feat: 定义 AI 会话目标与技能模型"
```

---

### Task 2: 建立 Markdown 章节树和范围算法

**Files:**
- Modify: `src/main/library/MarkdownParser.ts`
- Test: `tests/main/MarkdownParser.test.ts`

**Interfaces:**
- Consumes: `Chapter`
- Produces: 正确的 `parentChapterId`，且父章节 `startPassageId/endPassageId` 覆盖后代 passage

- [ ] **Step 1: 添加多级标题失败测试**

```ts
it('建立多级章节树并让父章节覆盖子章节内容', () => {
  const result = new MarkdownParser().parse({
    bookId: 'b1',
    markdown: '# 第一编\n\n导言。\n\n## 第一章\n\n正文一。\n\n### 第一节\n\n正文二。\n\n## 第二章\n\n正文三。',
  });
  const [part, chapter, section, chapter2] = result.chapters;
  expect(chapter.parentChapterId).toBe(part.id);
  expect(section.parentChapterId).toBe(chapter.id);
  expect(chapter2.parentChapterId).toBe(part.id);
  expect(part.startPassageId).toBe(result.passages[0].id);
  expect(part.endPassageId).toBe(result.passages[3].id);
});
```

- [ ] **Step 2: 运行并确认父 ID 断言失败**

Run: `pnpm vitest run tests/main/MarkdownParser.test.ts`

Expected: FAIL，实际 `parentChapterId` 为 `null`。

- [ ] **Step 3: 用 heading 栈建立父子关系**

在解析 heading 时弹出所有 `level >= currentLevel` 的项，栈顶即父章节；段落仍归属最近标题。解析结束后，对每个章节以 passage order 判断其范围：从自身标题后的首段开始，直到下一个 `level <= chapter.level` 的章节之前。

- [ ] **Step 4: 运行解析测试**

Run: `pnpm vitest run tests/main/MarkdownParser.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/library/MarkdownParser.ts tests/main/MarkdownParser.test.ts
git commit -m "feat: 为 Markdown 建立章节层级与范围"
```

---

### Task 3: 实现 DOM 选区快照、面包屑与恢复定位

**Files:**
- Create: `src/renderer/selection/selectionSnapshot.ts`
- Test: `tests/renderer/selectionSnapshot.test.ts`

**Interfaces:**
- Produces: `captureSelection(selection, chapters, passages): ReadingTarget | null`
- Produces: `breadcrumbsForSelection(startPassageId, endPassageId, chapters, passages): ChapterCrumb[]`
- Produces: `locateSnapshot(snapshot, root): Range | null`

- [ ] **Step 1: 写同 passage、跨兄弟章节和偏移回退测试**

测试 DOM 中的正文段落必须带 `data-passage-id`；验证同段偏移、跨段文本拼接、跨兄弟节只返回共同父章节，以及偏移失效时按 `selectedText` 搜索恢复。

```ts
document.body.innerHTML = '<article id="reader"><p data-passage-id="p1">甲乙丙</p><p data-passage-id="p2">丁戊己</p></article>';
```

- [ ] **Step 2: 运行确认模块不存在**

Run: `pnpm vitest run tests/renderer/selectionSnapshot.test.ts --environment jsdom`

Expected: FAIL，无法解析模块。

- [ ] **Step 3: 实现快照捕获与最低公共祖先**

只接受起止节点都位于 `[data-passage-id]` 的 Range；把 DOM offset 换算为对应 passage 的纯文本 offset。跨 passage 的 `selectedText` 使用 `Selection.toString()` 快照。章节祖先链以 `parentChapterId` 向上遍历，返回起止 passage 章节链的共同后缀，并按低到高排列供按钮显示。

- [ ] **Step 4: 实现恢复顺序**

恢复依次尝试：精确 passage+offset → 起始 passage 内文本查找 → 起止 passage 范围 → 返回 `null`。函数只返回 Range，不直接滚动或修改 DOM。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm vitest run tests/renderer/selectionSnapshot.test.ts --environment jsdom`

Expected: PASS。

```bash
git add src/renderer/selection/selectionSnapshot.ts tests/renderer/selectionSnapshot.test.ts
git commit -m "feat: 捕获并恢复阅读器原文选区"
```

---

### Task 4: 迁移 SQLite 会话和消息模型

**Files:**
- Modify: `src/main/storage/schema.ts`
- Modify: `src/main/storage/database.ts`
- Modify: `src/main/threads/ThreadStore.ts`
- Test: `tests/main/ThreadStore.test.ts`
- Create: `tests/main/databaseMigration.test.ts`

**Interfaces:**
- Produces: `createThread(CreateThreadInput)`, `deleteThread(threadId)`, `markMessageFailed(messageId, error)`, `resetMessageForRetry(messageId)`
- Produces: 旧 row 到新 `ReadingThread` / `ThreadMessage` 的兼容映射

- [ ] **Step 1: 添加新模型 CRUD 和旧库迁移失败测试**

覆盖：目标 JSON 映射、引用 JSON 映射、生成中置顶排序、事务删除消息并清空 `books.active_thread_id`、失败消息原 ID 重置、只有旧列的临时数据库升级后旧会话映射为 selection。

- [ ] **Step 2: 运行确认缺列/缺方法失败**

Run: `pnpm vitest run tests/main/ThreadStore.test.ts tests/main/databaseMigration.test.ts`

Expected: FAIL，提示新列或方法不存在。

- [ ] **Step 3: 扩展新库 schema**

向 `reading_threads` 加入 spec 中的 `target_*`、`skill_type`、`last_error`；向 `thread_messages` 加入 `reference_json`、`status`、`error`。新列必须有兼容旧 INSERT 的默认值。

- [ ] **Step 4: 实现幂等迁移助手**

```ts
function ensureColumn(db: AppDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
```

仅用固定内部常量调用，不能把外部输入传入表名或定义。升级后用一条事务 SQL 将旧会话的新目标字段回填为 `selection`，`skill_type = action_type`。

- [ ] **Step 5: 更新 Store 映射和事务方法**

列表排序使用：

```sql
ORDER BY CASE WHEN status = 'streaming' THEN 0 ELSE 1 END, updated_at DESC
```

删除事务先删 messages、再删 thread、最后把匹配的 `books.active_thread_id` 设为 `NULL`。重试只重置指定 assistant message，不新增 row。

- [ ] **Step 6: 运行测试和类型检查**

Run: `pnpm vitest run tests/main/ThreadStore.test.ts tests/main/databaseMigration.test.ts && pnpm lint:types`

Expected: Store 与迁移测试 PASS；类型错误不再来自 `ThreadStore`。

- [ ] **Step 7: 提交**

```bash
git add src/main/storage/schema.ts src/main/storage/database.ts src/main/threads/ThreadStore.ts tests/main/ThreadStore.test.ts tests/main/databaseMigration.test.ts
git commit -m "feat: 持久化会话目标引用与失败状态"
```

---

### Task 5: 重写上下文组装为全书认知加目标补足

**Files:**
- Modify: `src/main/ai/ContextAssembler.ts`
- Test: `tests/main/ContextAssembler.test.ts`

**Interfaces:**
- Consumes: `strategy`, `target`, `reference`, `skillInstruction`, `threadMessages`, book document
- Produces: `AssembledContext`，新增 `coveredPassageIds: string[]`

- [ ] **Step 1: 添加去重失败测试**

至少覆盖：full book 目标章节原文只出现一次；compressed book 的 selection 补入选区和附近 passage；hybrid 已覆盖目标章节时不重复；follow-up 不再重复首次 skill instruction；当轮引用以独立“本轮引用”段出现。

```ts
expect(result.messages[0].content.split('第三章完整文本')).toHaveLength(2);
```

上述断言表示该文本只出现一次。

- [ ] **Step 2: 运行确认现有实现重复或接口不匹配**

Run: `pnpm vitest run tests/main/ContextAssembler.test.ts`

Expected: FAIL。

- [ ] **Step 3: 拆出全书层和目标层纯函数**

实现 `buildBookKnowledge(input)` 返回 `{ text, coveredPassageIds }`；实现 `buildTargetSupplement(input, coveredIds)`。full book 标记所有 passage 已覆盖；hybrid 标记实际加入的 passage；compressed 只标记采样 passage。

- [ ] **Step 4: 首次技能与追问分离**

输入增加 `skillInstruction: string | null` 和 `isInitialTurn: boolean`。只有首次为真且技能非空时，system 才追加技能要求；追问只提供固定会话目标与历史。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm vitest run tests/main/ContextAssembler.test.ts`

Expected: PASS。

```bash
git add src/main/ai/ContextAssembler.ts tests/main/ContextAssembler.test.ts
git commit -m "feat: 按全书覆盖范围去重解读目标"
```

---

### Task 6: 实现创建、追问、失败重试和删除 IPC

**Files:**
- Modify: `src/main/ai/ReadingActionService.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/main/ReadingActionService.test.ts`

**Interfaces:**
- Consumes: Task 1 输入类型、Task 4 Store、Task 5 assembler
- Produces: `ai.createConversation`, `ai.followUp`, `ai.retry`, `threads.delete`

- [ ] **Step 1: 写服务失败测试**

用 fake provider/window/store 覆盖：空技能+空 prompt 被拒绝；有效首次请求只创建一组 user/assistant；引用追问写入 reference；重试复用失败 message ID；stream error 写入 message error；删除委托 Store。

- [ ] **Step 2: 运行确认旧服务接口失败**

Run: `pnpm vitest run tests/main/ReadingActionService.test.ts`

Expected: FAIL。

- [ ] **Step 3: 注入 Provider 并统一流式执行**

构造器允许可选注入 provider 以便测试。抽取私有 `streamIntoMessage({ thread, assistantMessage, context, window })`，started/chunk/done/error 均携带具体 thread/message ID；error 时持久化失败状态。

- [ ] **Step 4: 实现服务端校验和重试**

创建时验证 `skillType` 与目标类型匹配；无技能时 trim 后 prompt 必填。引用追问 question 必填。retry 验证 message 属于 thread、role 为 assistant 且 status 为 failed，然后重置并使用其前面的消息重新组装上下文。

- [ ] **Step 5: 接通 IPC 与 preload**

增加：

```ts
aiCreateConversation: 'ai.createConversation',
aiRetry: 'ai.retry',
threadsDelete: 'threads.delete',
```

旧 `ai.runReadingAction` 保留一个版本作为兼容入口，内部转换成 selection target；renderer 完成迁移后再删除。

- [ ] **Step 6: 运行服务测试和类型检查**

Run: `pnpm vitest run tests/main/ReadingActionService.test.ts && pnpm lint:types`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/main/ai/ReadingActionService.ts src/shared/ipc.ts src/main/ipc/registerIpc.ts src/preload/index.ts tests/main/ReadingActionService.test.ts
git commit -m "feat: 支持会话创建追问重试与删除"
```

---

### Task 7: 实现唯一草稿状态机

**Files:**
- Create: `src/renderer/chat/draftState.ts`
- Test: `tests/renderer/draftState.test.ts`

**Interfaces:**
- Produces: `ConversationDraft`, `createBookDraft`, `applyAutomaticSelection`, `selectTarget`, `replaceDraftFromSelection`, `validateDraft`

- [ ] **Step 1: 写状态转换失败测试**

覆盖：默认整本书；首次选区自动替换；手动选章节后新选区不覆盖；围绕新选区时清空技能、文字、引用和策略修改；目标改变清除不兼容技能；有技能可空发送、无技能不可空发送。

- [ ] **Step 2: 运行确认模块不存在**

Run: `pnpm vitest run tests/renderer/draftState.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现不可变纯函数**

`ConversationDraft` 明确包含 `mode: 'auto' | 'manual'` 和 `strategySource: 'book-default' | 'draft-override'`。`replaceDraftFromSelection` 必须从 `createBookDraft` 全新构造后再放入目标，不能复用旧字段。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm vitest run tests/renderer/draftState.test.ts`

Expected: PASS。

```bash
git add src/renderer/chat/draftState.ts tests/renderer/draftState.test.ts
git commit -m "feat: 实现 AI 会话唯一草稿状态机"
```

---

### Task 8: 构建目标、技能、历史和选区意图组件

**Files:**
- Modify: `src/renderer/components/SelectionMenu.tsx`
- Create: `src/renderer/components/TargetPicker.tsx`
- Create: `src/renderer/components/ThreadHistory.tsx`
- Test: `tests/renderer/TargetPicker.test.tsx`
- Test: `tests/renderer/ThreadHistory.test.tsx`

**Interfaces:**
- `SelectionMenu`: consumes `mode`, emits `onSetTarget`, `onStartConversation`, `onReference`
- `TargetPicker`: consumes draft and skill definitions, emits target/skill/strategy updates
- `ThreadHistory`: consumes all thread items, emits open/delete/retry

- [ ] **Step 1: 写组件行为失败测试**

验证草稿态只显示“设为解读目标”；正式态显示两个入口；TargetPicker 点击父章节触发目标更新且不重复技能；历史 streaming 置顶、无日期分组、删除弹出确认并只在确认后调用 callback。

- [ ] **Step 2: 运行确认组件不存在或接口不符**

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/ThreadHistory.test.tsx --environment jsdom`

Expected: FAIL。

- [ ] **Step 3: 实现无业务副作用的展示组件**

组件不得直接调用 `whisper`。删除确认使用组件内 dialog 状态；TargetPicker 根据 `skillsForTarget` 渲染单选按钮，技能被父状态清除时显示 `role="status"` 的轻提示。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/ThreadHistory.test.tsx --environment jsdom`

Expected: PASS。

```bash
git add src/renderer/components/SelectionMenu.tsx src/renderer/components/TargetPicker.tsx src/renderer/components/ThreadHistory.tsx tests/renderer/TargetPicker.test.tsx tests/renderer/ThreadHistory.test.tsx
git commit -m "feat: 增加目标技能历史与选区意图组件"
```

---

### Task 9: 重构右侧面板为横向 Tab、草稿 Composer 与引用追问

**Files:**
- Modify: `src/renderer/components/RightAiPanel.tsx`
- Test: `tests/renderer/RightAiPanel.test.tsx`

**Interfaces:**
- Consumes: `openThreadIds`, `activeView`, `draft`, `pendingReference`, histories
- Emits: create/send/close/open/delete/follow-up/retry/locate callbacks

- [ ] **Step 1: 写关键交互失败测试**

验证 `+` 打开草稿但不调用 create；草稿有技能时空 prompt 可发送；无技能为空时禁用；正式 Tab 的关闭只调用 close；引用附件要求问题且发送后调用时携带 reference；streaming Tab 可关闭；失败消息按钮传递原 message ID。

- [ ] **Step 2: 运行确认旧面板接口失败**

Run: `pnpm vitest run tests/renderer/RightAiPanel.test.tsx --environment jsdom`

Expected: FAIL。

- [ ] **Step 3: 拆分面板内部组件**

同文件内先保持 `ThreadTabs`、`DraftComposer`、`ThreadChat` 三个聚焦组件；超过约 350 行时再把它们移入 `src/renderer/components/chat/`，不得让 `ReaderPage` 承担渲染细节。

- [ ] **Step 4: assistant-ui Composer 接入引用规则**

正式会话的 `onNew` 从受控 pending reference 读取附件；有引用且文本为空时抛出中文校验提示。草稿使用普通受控 textarea，因为首次发送包含目标、技能和策略，不适合伪装为既有 runtime 的 follow-up。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm vitest run tests/renderer/RightAiPanel.test.tsx --environment jsdom`

Expected: PASS。

```bash
git add src/renderer/components/RightAiPanel.tsx tests/renderer/RightAiPanel.test.tsx
git commit -m "feat: 重构 AI 面板草稿 Tab 与引用交互"
```

---

### Task 10: 在 ReaderPage 编排会话、后台流和回到原文

**Files:**
- Modify: `src/renderer/pages/ReaderPage.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer/ReaderPage.test.tsx`

**Interfaces:**
- Consumes: Task 3 selection helpers、Task 7 draft reducer、Task 9 panel callbacks、preload API
- Produces: 完整用户流程

- [ ] **Step 1: 写页面集成失败测试**

mock `whisper`，覆盖：点击 `+` 不发 IPC；首次发送才 create；新 selection 自动更新草稿；正式会话两个选区动作分流；关闭 streaming Tab 后 chunk/done 仍更新历史；打开历史不滚动；点击回到原文才滚动；删除后移除历史和打开 Tab。

- [ ] **Step 2: 运行确认旧页面行为失败**

Run: `pnpm vitest run tests/renderer/ReaderPage.test.tsx --environment jsdom`

Expected: FAIL。

- [ ] **Step 3: 将正文 passage 标记为可定位元素**

```tsx
<p id={passage.id} data-passage-id={passage.id} key={passage.id}>
  {passage.text}
</p>
```

Reader article 保存 ref；`onMouseUp` 捕获结构化 selection。原 `passage.text.includes(selectedText)` 的模糊查找必须删除。

- [ ] **Step 4: 编排唯一草稿和打开 Tab**

使用区分联合：

```ts
type ActiveView = { type: 'draft' } | { type: 'thread'; threadId: string } | { type: 'empty' };
```

`openThreadIds` 从 `localStorage` 的 `whisper.openThreads.${bookId}` 恢复并过滤不存在 ID；每次变化写回。新建正式会话后把 ID 加入并激活。

- [ ] **Step 5: 将错误绑定具体消息**

删除全局 `streamError`。流事件根据 threadId/messageId 更新对应项；Tab 是否打开不影响更新。`started` 不强制把后台 thread 重新打开，只有用户主动发送的当前操作才激活对应视图。

- [ ] **Step 6: 实现定位和临时高亮**

点击定位时调用 Task 3 helper，Range 成功则 `scrollIntoView({ block: 'center' })` 并把 Range 包围区域添加临时 CSS 高亮；失败时滚动至 start passage 并展示非阻塞提示。高亮 2 秒后移除，不改变 selection 草稿。

- [ ] **Step 7: 完成样式**

横向 Tab 使用 `overflow-x: auto; flex-wrap: nowrap`；目标条和引用附件有清晰层级；历史以右侧浮层覆盖聊天区；所有按钮有 `:focus-visible`；临时原文高亮使用不遮挡文字的半透明背景。

- [ ] **Step 8: 运行页面测试和类型检查**

Run: `pnpm vitest run tests/renderer/ReaderPage.test.tsx --environment jsdom && pnpm lint:types`

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add src/renderer/pages/ReaderPage.tsx src/renderer/styles.css tests/renderer/ReaderPage.test.tsx
git commit -m "feat: 接通 AI 会话重设计完整阅读流程"
```

---

### Task 11: 删除兼容入口并完成全量验证

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ai/ReadingActionService.ts`
- Modify: `src/renderer/pages/ReaderPage.tsx`
- Test: existing full suite

**Interfaces:**
- Produces: 无 renderer 调用旧 `runReadingAction` / `ReadingActionType` 的最终 API

- [ ] **Step 1: 搜索旧入口和旧字段**

Run: `rg -n "runReadingAction|ReadingActionType|actionType|selectedText|passageId" src tests`

Expected: 仅迁移兼容映射或 selection snapshot 中合理的 `selectedText` 命中；renderer 不再调用旧入口。

- [ ] **Step 2: 删除旧 IPC 和 renderer 死代码**

移除 `aiRunReadingAction` channel、preload 方法及旧 `SelectionMenu` action props。数据库旧列保留，不做破坏性 DROP；迁移映射继续保留。

- [ ] **Step 3: 运行全量单元测试**

Run: `pnpm test`

Expected: 所有 Vitest 测试 PASS，无 unhandled rejection。

- [ ] **Step 4: 运行类型检查和生产构建**

Run: `pnpm lint:types && pnpm build`

Expected: 两条命令退出码均为 0。

- [ ] **Step 5: 手工验收关键流程**

Run: `pnpm dev`

依次验证 spec 的 13 条验收标准，重点检查：跨章节面包屑、关闭 streaming Tab 后后台完成、引用定位、旧数据库会话打开、失败重试不新增消息。记录任何偏差并在相应任务测试中补回归用例后修复。

- [ ] **Step 6: 提交清理与验证修复**

```bash
git add src tests
git commit -m "refactor: 移除旧阅读动作入口并完成会话重设计"
```

---

## 自检结果

- **Spec coverage:** 章节树、三类目标/技能、唯一草稿、策略锁定、上下文去重、引用、Tab/历史、删除、定位、后台生成、失败重试和旧库迁移均有对应任务。
- **范围拆分:** 11 个任务按可独立测试的领域边界拆分；每项都能由下一项通过明确接口消费。
- **类型一致性:** 全计划统一使用 `ReadingTarget`、`ReadingSkillType`、`MessageReference`、`CreateConversationInput`、`RetryMessageInput`。
- **非目标检查:** 未加入重命名、搜索、分组、多引用、多草稿或同步。
- **项目约束:** 未规划 worktree 或子代理；所有提交直接发生在主工作区 `main`。
