# AI 右栏任务式 Composer 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把右栏首轮 Composer 重构为紧凑的解读任务表单，把正式会话收敛为只读任务摘要与纯文字追问，并将全书认知移到书籍级设置。

**Architecture:** renderer 继续通过现有 preload API 和 IPC 使用主进程服务，不改变数据库 schema。草稿领域规则仍集中在 `draftState.ts`，首轮目标与方式拆成聚焦组件；正式会话移除新引用状态但保留旧消息引用渲染；当前书的全书认知由 `ReaderPage` 持有并通过现有 `books.setContextStrategy` 持久化。

**Tech Stack:** Electron、React、TypeScript、CSS Modules、Vitest、Testing Library、现有 preload/IPC 契约。

## Global Constraints

- 面向用户的术语使用“解读方式”，不显示“技能”；内部 `skillType` 和 `ReadingSkillType` 保持不变。
- 首轮最低有效条件为有效解读目标加单选解读方式；补充提问可以为空。
- 无选区的新会话默认目标为整本书；有效选区自动成为草稿目标。
- 当前目标适用的 3–4 种解读方式必须单行等分，不横向滚动、不换行、不隐藏。
- 正式会话不能修改解读目标或解读方式，后续只支持非空文字追问。
- 正式会话中新选区只提供“新建解读”，不提供新增引用入口。
- 旧 `MessageReference` 数据继续可读、可展示和定位，不做数据库迁移。
- 全书认知按书保存，只影响之后创建的新会话。
- 所有控制语句必须使用花括号。
- 完成前运行 `pnpm check`。

---

## 文件结构

- 修改 `src/renderer/features/conversation/draftState.ts`：首轮任务的校验和草稿策略继承规则。
- 新建 `src/renderer/features/conversation/targetOptions.ts`：由当前章节路径和有效选区派生首轮可选目标，不写入持久化模型。
- 修改 `src/renderer/features/conversation/TargetPicker.tsx`：只负责紧凑目标摘要、菜单和目标变化提示。
- 新建 `src/renderer/features/conversation/InterpretationMethodPicker.tsx`：当前目标适用方式的单行单选。
- 修改 `src/renderer/features/conversation/DraftComposer.tsx`：编排三行首轮任务和提交。
- 修改 `src/renderer/features/conversation/ThreadChat.tsx`：只读任务摘要、旧引用展示和纯追问。
- 修改 `src/renderer/features/conversation/conversationWorkspace.ts` 与 `useConversationWorkspace.ts`：删除 renderer 的待发送引用状态，追问始终发送 `reference: null`。
- 新建 `src/renderer/features/conversation/BookCognitionMenu.tsx`：当前书全书认知 Popover。
- 修改 `src/renderer/features/conversation/RightAiPanel.tsx`：承载书籍级设置入口并连接两阶段 Composer。
- 修改 `src/renderer/pages/reader-page/ReaderPage.tsx`：持久化书籍策略、更新本地书籍快照、派发“新建解读”。
- 修改相关 CSS Modules：紧凑 360px 布局、常驻摘要和 Popover。
- 修改 renderer 测试及 `docs/MANUAL_TESTING.md`；完成后移动 Spec 与 Plan 到各自 `completed/`。

---

### Task 1: 固化首轮任务领域规则

**Files:**
- Modify: `src/shared/skills.ts`
- Modify: `src/renderer/features/conversation/draftState.ts`
- Create: `src/renderer/features/conversation/targetOptions.ts`
- Modify: `tests/renderer/draftState.test.ts`
- Modify: `tests/shared/skills.test.ts`

**Interfaces:**
- Consumes: `isSkillAllowed(targetType, skillType)` 和现有 `ConversationDraft`。
- Produces: `validateDraft(draft): { valid: true } | { valid: false; reason: 'method-required' | 'method-not-allowed' }`；`buildTargetOptions(chapters, activeChapterId, selectionTarget): ReadingTarget[]`；`targetLabel(target): string`；`labelForSkill(skillType): string`。

- [ ] **Step 1: 写出补充提问可空、解读方式必选的失败测试**

```ts
it('目标有效且已选解读方式时允许空补充提问', () => {
  expect(validateDraft({ ...draft, prompt: '', skillType: 'book_summary' })).toEqual({ valid: true });
});

it('未选解读方式时拒绝创建', () => {
  expect(validateDraft({ ...draft, prompt: '请总结', skillType: null })).toEqual({
    valid: false,
    reason: 'method-required',
  });
});

it('目标不支持所选方式时拒绝创建', () => {
  expect(validateDraft({ ...draft, target: selectionTarget, skillType: 'book_summary' })).toEqual({
    valid: false,
    reason: 'method-not-allowed',
  });
});
```

- [ ] **Step 2: 运行测试并确认旧校验失败**

Run: `pnpm vitest run tests/renderer/draftState.test.ts tests/shared/skills.test.ts`

Expected: FAIL，空 `prompt` 仍被判为 `prompt-required`，新 reason 尚不存在。

- [ ] **Step 3: 最小化修改草稿校验**

```ts
export type DraftValidation =
  | { valid: true }
  | { valid: false; reason: 'method-required' | 'method-not-allowed' };

export function validateDraft(draft: ConversationDraft): DraftValidation {
  if (!draft.skillType) {
    return { valid: false, reason: 'method-required' };
  }
  if (!isSkillAllowed(draft.target.type, draft.skillType)) {
    return { valid: false, reason: 'method-not-allowed' };
  }
  return { valid: true };
}
```

保留 `createBookDraft()` 的整本书默认目标和 `applyAutomaticSelection()`、`selectTarget()` 在目标不兼容时清除 `skillType` 的行为。

- [ ] **Step 4: 写出当前阅读位置和选区派生可选目标的失败测试**

```ts
expect(buildTargetOptions(chapters, 'section-1', selectionTarget).map((target) => target.type)).toEqual([
  'book',
  'chapter',
  'chapter',
  'selection',
]);
expect(buildTargetOptions(chapters, null, null)).toEqual([
  expect.objectContaining({ type: 'book' }),
]);
```

实现 `buildTargetOptions()`：始终先返回整本书；从 `activeChapterId` 沿 `parentChapterId` 回溯并按祖先到当前章节排列；存在有效 `selectionTarget` 时最后加入完整选区快照。该数组只用于草稿菜单，不写入 thread 或数据库。

- [ ] **Step 5: 补齐每种目标的方式列表断言并运行测试**

```ts
expect(skillsForTarget('book').map(({ label }) => label)).toEqual([
  '总结全书', '提炼框架', '评价全书',
]);
expect(skillsForTarget('chapter').map(({ label }) => label)).toEqual([
  '概括本章', '章节作用', '梳理论证',
]);
expect(skillsForTarget('selection').map(({ label }) => label)).toEqual([
  '白话解释', '解释概念', '补充背景', '举例类比',
]);
expect(labelForSkill('plain_explanation')).toBe('白话解释');
expect(targetLabel(selectionTarget)).toBe('框选内容');
```

在 `src/shared/skills.ts` 导出 `labelForSkill()`，遍历三组静态定义并对未知值执行穷尽检查；在 `targetOptions.ts` 导出 `targetLabel()`：book 返回“整本书”，selection 返回“框选内容”，chapter 返回 breadcrumb 末项标题。

Run: `pnpm vitest run tests/renderer/draftState.test.ts tests/shared/skills.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交领域规则**

```bash
git add src/shared/skills.ts src/renderer/features/conversation/draftState.ts src/renderer/features/conversation/targetOptions.ts tests/renderer/draftState.test.ts tests/shared/skills.test.ts
git commit -m "refactor: 固化首轮解读任务规则"
```

---

### Task 2: 实现紧凑首轮任务表单

**Files:**
- Modify: `src/renderer/features/conversation/TargetPicker.tsx`
- Modify: `src/renderer/features/conversation/TargetPicker.module.css`
- Create: `src/renderer/features/conversation/InterpretationMethodPicker.tsx`
- Modify: `src/renderer/features/conversation/DraftComposer.tsx`
- Modify: `src/renderer/features/conversation/RightAiPanel.module.css`
- Modify: `tests/renderer/TargetPicker.test.tsx`
- Modify: `tests/renderer/RightAiPanel.test.tsx`
- Modify: `src/renderer/pages/reader-page/ReaderPage.tsx`

**Interfaces:**
- Consumes: Task 1 的 `validateDraft()`、`skillsForTarget()` 和 `buildTargetOptions()`。
- Produces: `InterpretationMethodPicker({ targetType, value, onChange })`；`TargetPicker({ draft, options, onTargetChange })`；提交文案“开始解读”。

- [ ] **Step 1: 写出三行表单与单行方式选择的失败测试**

```tsx
expect(screen.getByText('解读目标')).toBeTruthy();
expect(screen.getByText('解读方式')).toBeTruthy();
expect(screen.getByText('补充提问')).toBeTruthy();
expect(screen.queryByText('技能')).toBeNull();
expect(screen.getByRole('radiogroup', { name: '解读方式' })).toBeTruthy();
expect(screen.getAllByRole('radio')).toHaveLength(3); // 整本书目标
expect((screen.getByRole('button', { name: '开始解读' }) as HTMLButtonElement).disabled).toBe(true);
```

再选择“总结全书”，断言按钮启用；保持补充提问为空并提交，断言 `onCreate` 收到 `prompt: ''` 和 `skillType: 'book_summary'`。

- [ ] **Step 2: 运行组件测试并确认失败**

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/RightAiPanel.test.tsx`

Expected: FAIL，旧 UI 仍显示“技能”“全书认知”和“发送首次问题”。

- [ ] **Step 3: 新建目标相关的单行解读方式组件**

```tsx
interface InterpretationMethodPickerProps {
  targetType: ReadingTargetType;
  value: ReadingSkillType | null;
  onChange(value: ReadingSkillType): void;
}

export function InterpretationMethodPicker(props: InterpretationMethodPickerProps) {
  return (
    <div role="radiogroup" aria-label="解读方式" className={styles.methodGroup}>
      {skillsForTarget(props.targetType).map((method) => (
        <button
          type="button"
          role="radio"
          aria-checked={props.value === method.id}
          key={method.id}
          onClick={() => props.onChange(method.id)}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}
```

CSS 使用 `grid-template-columns: repeat(var(--method-count), minmax(0, 1fr))`，由内联 CSS 变量传入 3 或 4；按钮文字 `white-space: nowrap`，容器禁止横向滚动。

- [ ] **Step 4: 把 TargetPicker 收敛为单行摘要与按需菜单**

实现以下可访问行为：

```tsx
<button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
  <span>{targetLabel(draft.target)}</span>
  <span aria-hidden>⌄</span>
</button>
```

菜单渲染传入的 `options: ReadingTarget[]`，提供整本书、当前阅读位置的章节路径、存在有效选区时的框选内容。选择项直接回传完整 `ReadingTarget`；目标变化清除不兼容方式时显示“目标已变化，请重新选择解读方式”。

`ReaderPage` 使用 `document.chapters`、`activeChapterId` 和 `readingSelection.target` 调用 `buildTargetOptions()`，经 `RightAiPanel` 和 `DraftComposer` 传给 `TargetPicker`。因此从整本书草稿也能选择当前章节，切到章节后也能切回仍有效的选区。

- [ ] **Step 5: 重写 DraftComposer 为紧凑三行任务**

```tsx
<div className={styles.taskRow}>
  <span>解读目标</span>
  <TargetPicker draft={draft} options={targetOptions} onTargetChange={onSelectTarget} />
</div>
<div className={styles.taskRow}>
  <span>解读方式</span>
  <InterpretationMethodPicker
    targetType={draft.target.type}
    value={draft.skillType}
    onChange={(skillType) => onUpdate({ ...draft, skillType })}
  />
</div>
<label className={styles.taskRow}>
  <span>补充提问</span>
  <textarea rows={1} placeholder="还有特别想了解的吗？（可选）" />
</label>
<button type="submit" disabled={!validation.valid}>开始解读</button>
```

删除草稿内的 `ContextStrategyPicker`。Textarea 聚焦时扩展，空内容失焦恢复；非空内容保持可读高度。

- [ ] **Step 6: 实现约 360px 宽下的紧凑 CSS 并测试**

必须包含：固定标签列约 66px、行高约 30px、字段间距约 7px、方式单行等分、无横向滚动。不要用 JS 测像素；测试稳定的结构类名、3/4 个 radio 和无重复 label。

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/RightAiPanel.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交首轮表单**

```bash
git add src/renderer/features/conversation/TargetPicker.tsx src/renderer/features/conversation/TargetPicker.module.css src/renderer/features/conversation/InterpretationMethodPicker.tsx src/renderer/features/conversation/DraftComposer.tsx src/renderer/features/conversation/RightAiPanel.module.css src/renderer/pages/reader-page/ReaderPage.tsx tests/renderer/TargetPicker.test.tsx tests/renderer/RightAiPanel.test.tsx
git commit -m "feat: 重构紧凑首轮解读任务"
```

---

### Task 3: 正式会话改为只读摘要与纯追问

**Files:**
- Modify: `src/renderer/features/conversation/ThreadChat.tsx`
- Modify: `src/renderer/features/conversation/RightAiPanel.tsx`
- Modify: `src/renderer/features/conversation/RightAiPanel.module.css`
- Modify: `src/renderer/features/conversation/conversationWorkspace.ts`
- Modify: `src/renderer/features/conversation/useConversationWorkspace.ts`
- Modify: `tests/renderer/RightAiPanel.test.tsx`
- Modify: `tests/renderer/conversationWorkspace.test.ts`

**Interfaces:**
- Consumes: `ReadingThread.target`、`ReadingThread.skillType`、Task 1 的 `targetLabel()` 与 `labelForSkill()`。
- Produces: `ConversationCommands.followUp(threadId, question)`；workspace 不再含 `pendingReference`；旧消息 `message.reference` 继续渲染。

- [ ] **Step 1: 写出只读摘要和纯追问的失败测试**

```tsx
expect(screen.getByLabelText('当前解读任务').textContent).toContain('框选内容');
expect(screen.getByLabelText('当前解读任务').textContent).toContain('白话解释');
expect(screen.queryByText(/全书认知：/)).toBeNull();
expect(screen.getByPlaceholderText('继续追问……')).toBeTruthy();
expect(screen.queryByLabelText('移除引用')).toBeNull();
```

保留一条带历史 `message.reference` 的 fixture，断言“引用：…”按钮仍可点击并调用 `onLocate`。

- [ ] **Step 2: 写出 workspace 不再维护待发送引用的失败测试**

```ts
expect(createConversationWorkspace()).toEqual({
  threads: [],
  openThreadIds: [],
  activeView: null,
});
```

同时更新 mock command，断言 `followUp('thread-1', '继续解释')` 最终调用：

```ts
whisper.ai.followUp({ threadId: 'thread-1', question: '继续解释', reference: null });
```

- [ ] **Step 3: 运行测试并确认旧引用 Composer 导致失败**

Run: `pnpm vitest run tests/renderer/RightAiPanel.test.tsx tests/renderer/conversationWorkspace.test.ts`

Expected: FAIL，旧 workspace 仍含 `pendingReference`，ThreadChat 仍显示全书认知和引用附件。

- [ ] **Step 4: 删除 renderer 待发送引用状态**

从 `ConversationWorkspace`、action union、reducer 和 `ConversationCommands` 删除 `pendingReference`、`referenceChanged`、`setReference`。把追问签名改为：

```ts
followUp(threadId: string, question: string): Promise<void>;
```

调用主进程时固定发送 `reference: null`，保留 IPC 契约以兼容已有主进程逻辑。

- [ ] **Step 5: 实现只读任务摘要和纯追问**

```tsx
<header className={styles.threadTaskSummary} aria-label="当前解读任务">
  <button onClick={() => onLocate(item.thread.id)} disabled={item.thread.target.type === 'book'}>
    {targetLabel(item.thread.target)}
  </button>
  <span aria-hidden>·</span>
  <span>{item.thread.skillType ? labelForSkill(item.thread.skillType) : '自由提问'}</span>
  <span className={styles.readOnly}>只读</span>
</header>
```

删除 pending reference props 和 Composer UI；历史消息上的 `message.reference` 定位按钮保持原样。追问 placeholder 改为“继续追问……”，空输入和生成中继续禁用。

- [ ] **Step 6: 运行测试并确认通过**

Run: `pnpm vitest run tests/renderer/RightAiPanel.test.tsx tests/renderer/conversationWorkspace.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交正式会话改造**

```bash
git add src/renderer/features/conversation/ThreadChat.tsx src/renderer/features/conversation/RightAiPanel.tsx src/renderer/features/conversation/RightAiPanel.module.css src/renderer/features/conversation/conversationWorkspace.ts src/renderer/features/conversation/useConversationWorkspace.ts tests/renderer/RightAiPanel.test.tsx tests/renderer/conversationWorkspace.test.ts
git commit -m "feat: 收敛正式会话为纯追问"
```

---

### Task 4: 正文选区只创建新解读

**Files:**
- Modify: `src/renderer/features/reading-selection/SelectionMenu.tsx`
- Modify: `src/renderer/pages/reader-page/ReaderPage.tsx`
- Modify: `tests/renderer/TargetPicker.test.tsx`
- Modify: `tests/renderer/ReaderPage.test.tsx`

**Interfaces:**
- Consumes: `replaceDraftFromSelection()` 与 `conversation.commands.selectView({ type: 'draft' })`。
- Produces: 选区菜单唯一动作“新建解读”；新草稿自动带入结构化选区并保留原会话 Tab。

- [ ] **Step 1: 写出选区菜单文案和行为的失败测试**

```tsx
render(<SelectionMenu selectedText="一段原文" onStartInterpretation={onStart} />);
expect(screen.getByRole('button', { name: '新建解读' })).toBeTruthy();
expect(screen.queryByRole('button', { name: '提问' })).toBeNull();
expect(screen.queryByRole('button', { name: '引用到当前会话' })).toBeNull();
```

ReaderPage 测试先打开一个正式会话，再创建正文选区并点击“新建解读”，断言新会话任务区出现“框选内容”，原正式 Tab 仍存在。

- [ ] **Step 2: 运行选区与 ReaderPage 测试并确认失败**

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/ReaderPage.test.tsx`

Expected: FAIL，当前按钮仍叫“提问”。

- [ ] **Step 3: 重命名 SelectionMenu 的唯一动作并连接 ReaderPage**

```tsx
interface SelectionMenuProps {
  selectedText: string;
  position?: { left: number; top: number };
  onStartInterpretation?: () => void;
}

<button onClick={onStartInterpretation}>新建解读</button>
```

`ReaderPage.startFromSelection()` 继续使用 `replaceDraftFromSelection()`，清除旧草稿方式、使用当前书策略、切换到 draft；不得关闭或删除当前正式 Tab。

- [ ] **Step 4: 运行测试并确认通过**

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/ReaderPage.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交选区流程**

```bash
git add src/renderer/features/reading-selection/SelectionMenu.tsx src/renderer/pages/reader-page/ReaderPage.tsx tests/renderer/TargetPicker.test.tsx tests/renderer/ReaderPage.test.tsx
git commit -m "feat: 让正文选区创建独立解读"
```

---

### Task 5: 增加书籍级全书认知 Popover

**Files:**
- Create: `src/renderer/features/conversation/BookCognitionMenu.tsx`
- Modify: `src/renderer/features/conversation/RightAiPanel.tsx`
- Modify: `src/renderer/features/conversation/RightAiPanel.module.css`
- Modify: `src/renderer/pages/reader-page/ReaderPage.tsx`
- Modify: `tests/renderer/RightAiPanel.test.tsx`
- Modify: `tests/renderer/ReaderPage.test.tsx`

**Interfaces:**
- Consumes: `ContextStrategy`、`whisper.books.setContextStrategy({ bookId, strategy })`、`BookDocument.book.defaultContextStrategy`。
- Produces: `BookCognitionMenu({ bookTitle, value, onChange })`；RightAiPanel 新增书籍设置 props；ReaderPage 成功后更新本地 document 和仍继承默认值的草稿。

- [ ] **Step 1: 写出 Popover 的失败测试**

```tsx
fireEvent.click(screen.getByRole('button', { name: '全书认知设置' }));
expect(screen.getByRole('radiogroup', { name: '全书认知' })).toBeTruthy();
expect(screen.getByRole('radio', { name: /完整全书/ })).toBeTruthy();
expect(screen.getByRole('radio', { name: /压缩全书/ })).toBeTruthy();
expect(screen.getByRole('radio', { name: /混合/ })).toBeTruthy();
```

ReaderPage 测试点击“混合”，断言：

```ts
expect(whisper.books.setContextStrategy).toHaveBeenCalledWith({
  bookId: 'book-1',
  strategy: 'hybrid',
});
```

随后新建草稿应使用 `hybrid`；既有 thread fixture 的 `contextStrategy` 保持原值。

- [ ] **Step 2: 写出保存失败恢复原值的测试**

令 `setContextStrategy` reject，点击“混合”后断言原 radio 仍选中，并出现错误提示。不要乐观写入 document。

- [ ] **Step 3: 运行测试并确认组件不存在**

Run: `pnpm vitest run tests/renderer/RightAiPanel.test.tsx tests/renderer/ReaderPage.test.tsx`

Expected: FAIL，找不到“全书认知设置”。

- [ ] **Step 4: 实现受控 BookCognitionMenu**

```tsx
const options = [
  { value: 'full_book', label: '完整全书', description: '尽可能提供原书全文' },
  { value: 'compressed_book', label: '压缩全书', description: '使用压缩后的全书背景' },
  { value: 'hybrid', label: '混合', description: '全书摘要加目标附近原文' },
] satisfies Array<{ value: ContextStrategy; label: string; description: string }>;
```

齿轮按钮使用 `aria-label="全书认知设置"`；Popover 使用 radio 语义，选择后调用 async `onChange`，成功才关闭。保存中禁用重复选择。

- [ ] **Step 5: 在 ReaderPage 中持久化并更新本地快照**

```ts
async function changeBookContextStrategy(strategy: ContextStrategy) {
  try {
    await whisper.books.setContextStrategy({ bookId, strategy });
    setDocument((current) =>
      current ? { ...current, book: { ...current.book, defaultContextStrategy: strategy } } : current,
    );
    setDraft((current) =>
      current?.strategySource === 'book-default'
        ? { ...current, contextStrategy: strategy }
        : current,
    );
  } catch (reason) {
    setError(messageOf(reason));
    throw reason;
  }
}
```

现有会话不更新；新会话通过 `createBookDraft()` 获取最新书籍策略。

- [ ] **Step 6: 运行测试并确认通过**

Run: `pnpm vitest run tests/renderer/RightAiPanel.test.tsx tests/renderer/ReaderPage.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交书籍设置**

```bash
git add src/renderer/features/conversation/BookCognitionMenu.tsx src/renderer/features/conversation/RightAiPanel.tsx src/renderer/features/conversation/RightAiPanel.module.css src/renderer/pages/reader-page/ReaderPage.tsx tests/renderer/RightAiPanel.test.tsx tests/renderer/ReaderPage.test.tsx
git commit -m "feat: 增加书籍级全书认知设置"
```

---

### Task 6: 完成回归、人工验收与文档生命周期

**Files:**
- Modify: `docs/MANUAL_TESTING.md`
- Move: `docs/specs/active/2026-07-17-ai-panel-task-composer-redesign.md` → `docs/specs/completed/2026-07-17-ai-panel-task-composer-redesign.md`
- Move: `docs/plans/active/2026-07-17-ai-panel-task-composer-redesign.md` → `docs/plans/completed/2026-07-17-ai-panel-task-composer-redesign.md`
- Modify as required by failures: affected source/test files from Tasks 1–5 only

**Interfaces:**
- Consumes: Tasks 1–5 的完整用户旅程。
- Produces: 自动检查通过、人工验收清单更新、Spec/Plan 生命周期完成。

- [ ] **Step 1: 更新人工验收旅程**

在 `docs/MANUAL_TESTING.md` 增加明确步骤和预期：

```markdown
### 任务式 AI 侧栏

1. 不框选正文，新建会话：目标默认为整本书，解读方式未选，“开始解读”禁用。
2. 选择一种整本书解读方式，不填写补充提问：可以开始并立即看到流式回答。
3. 框选正文并点击“新建解读”：目标自动变为框选内容，方式显示四个单行选项。
4. 会话建立后：顶部摘要常驻，底部只有追问；摘要可回到原文。
5. 正式会话中框选另一段并新建解读：原 Tab 保留，新草稿带入新选区。
6. 修改全书认知后新建会话：新会话使用新策略，旧会话保持原策略。
7. 将右栏缩至产品允许的最窄宽度：三行任务无横向滚动，方式不换行。
```

- [ ] **Step 2: 运行相关 renderer 与 shared 测试**

Run: `pnpm vitest run tests/shared/skills.test.ts tests/renderer/draftState.test.ts tests/renderer/TargetPicker.test.tsx tests/renderer/RightAiPanel.test.tsx tests/renderer/conversationWorkspace.test.ts tests/renderer/ReaderPage.test.tsx`

Expected: PASS，0 failed。

- [ ] **Step 3: 运行完整质量检查**

Run: `pnpm check`

Expected: typecheck、lint、format check 和全部测试通过，退出码 0。

- [ ] **Step 4: 执行人工验收并记录结果**

按新增旅程逐项操作，特别检查约 360px 右栏、输入框展开、任务摘要常驻、选区新建解读和策略仅对新会话生效。若环境无法执行真实模型请求，记录未执行项及原因，不得声称已通过。

- [ ] **Step 5: 移动已完成 Spec 与 Plan**

```bash
mkdir -p docs/specs/completed docs/plans/completed
git mv docs/specs/active/2026-07-17-ai-panel-task-composer-redesign.md docs/specs/completed/2026-07-17-ai-panel-task-composer-redesign.md
git mv docs/plans/active/2026-07-17-ai-panel-task-composer-redesign.md docs/plans/completed/2026-07-17-ai-panel-task-composer-redesign.md
```

- [ ] **Step 6: 提交验收和文档生命周期**

```bash
git add docs/MANUAL_TESTING.md docs/specs/completed/2026-07-17-ai-panel-task-composer-redesign.md docs/plans/completed/2026-07-17-ai-panel-task-composer-redesign.md
git commit -m "docs: 完成 AI 侧栏重设计验收"
```
