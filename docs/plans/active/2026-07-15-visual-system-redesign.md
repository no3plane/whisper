# Whisper 视觉系统重建实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有信息架构、交互流程、IPC 和数据模型的前提下，将所有用户可达界面重建为“学者的工作桌”浅色视觉系统。

**Architecture:** 先建立可机械校验的 CSS Variables 与字体约束，再以阅读器为样板完成三栏视觉层级，随后覆盖 AI 会话、书库和设置。Base UI 只进入需要焦点管理或表单语义的现有 feature；页面和 feature 边界保持不变，不创建被 Harness 禁止的 `src/renderer/components/`。

**Tech Stack:** Electron 43、React 19、TypeScript 5.8、CSS Modules、CSS Variables、Base UI 1.6、Vitest、Testing Library

## Global Constraints

- 只实现浅色主题，不实现深色模式或双主题切换。
- 不使用 Tailwind、shadcn/ui、在线字体或随应用打包的字体文件。
- 阅读正文和书籍标题使用系统衬线字体栈；控件使用系统无衬线字体栈。
- 原书是阅读页绝对视觉主角，AI 默认处于辅助层级。
- 保留当前信息架构、交互流程、页面状态、IPC、数据模型和主进程行为。
- 所有控制语句必须使用花括号。
- 不重新创建 `src/renderer/components/`，不提前建设通用组件库。
- 完成前运行 `pnpm check`，并执行本计划列出的人工验收。

---

## 文件结构与职责

```text
src/renderer/
├── styles.css                              # 全局 tokens、字体栈、基础焦点/表单/状态样式
├── App.tsx                                 # 书库与设置的页面级组合，不改变导航状态
├── App.module.css                          # 书房应用壳、首页工作台布局、启动错误
├── pages/
│   ├── reader-page/
│   │   ├── ReaderPage.tsx                  # 三栏语义结构与现有阅读编排
│   │   └── ReaderPage.module.css           # 目录、纸张阅读面、响应式布局
│   └── library-page/
│       ├── LibraryPage.tsx                 # 书库标题、导入区、书籍条目和空状态
│       └── LibraryPage.module.css           # 书架/封面式条目视觉
└── features/
    ├── reading-selection/
    │   └── SelectionMenu.module.css         # 紧凑琥珀选区工具条
    ├── conversation/
    │   ├── RightAiPanel.tsx                 # AI 辅助区标题与已有视图组合
    │   ├── RightAiPanel.module.css          # tabs、消息、输入、流式/错误状态
    │   ├── TargetPicker.module.css           # 目标、技能和策略控件
    │   ├── ThreadHistory.tsx                # Base UI Dialog 删除确认
    │   └── ThreadHistory.module.css          # 历史抽屉与确认对话框
    └── settings/
        ├── SettingsPanel.tsx                # Base UI Field 表单语义与原有命令
        └── SettingsPanel.module.css          # 桌边抽屉式设置面板

tests/renderer/
├── visualTokens.test.ts                    # token、字体和依赖禁令的静态约束
├── ReaderPage.test.tsx                     # 三栏语义及既有交互回归
├── RightAiPanel.test.tsx                   # AI 区域语义与会话行为
├── ThreadHistory.test.tsx                  # Base UI Dialog 确认行为
├── LibraryPage.test.tsx                    # 加载、空、导入和打开书籍
└── SettingsPanel.test.tsx                  # 表单加载、保存、测试和错误

docs/MANUAL_TESTING.md                      # 新视觉与可访问性人工验收项
```

Storybook 本阶段不引入。当前视觉单元仍集中在页面和 feature，Vitest 回归加真实 Electron 人工验收足以覆盖本阶段；出现跨 feature 的稳定组件库后再单独评估。

### Task 1: 建立视觉约束、Base UI 依赖与全局 Tokens

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/renderer/styles.css`
- Create: `tests/renderer/visualTokens.test.ts`

**Interfaces:**

- Consumes: 当前 renderer 入口已导入的 `src/renderer/styles.css`。
- Produces: `--color-*`、`--font-*`、`--space-*`、`--radius-*`、`--shadow-*`、`--duration-*` 和 `--reader-*` CSS Variables；安装后的 `@base-ui/react`。

- [ ] **Step 1: 写入失败的静态约束测试**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/renderer/styles.css', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('renderer visual system', () => {
  it('声明浅色语义 token 和系统字体栈', () => {
    for (const token of [
      '--color-canvas-desk',
      '--color-surface-paper',
      '--color-structure-walnut',
      '--color-accent-amber',
      '--color-feedback-danger',
      '--font-reading',
      '--font-interface',
      '--reader-measure',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('不加载外部字体、Tailwind 或 shadcn', () => {
    expect(css).not.toMatch(/@font-face|fonts\.(googleapis|gstatic)\.com/);
    expect(packageJson.dependencies['@base-ui/react']).toBeDefined();
    expect(packageJson.dependencies.tailwindcss).toBeUndefined();
    expect(packageJson.dependencies['shadcn-ui']).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run tests/renderer/visualTokens.test.ts`

Expected: FAIL，提示缺少语义 token 或 `@base-ui/react`。

- [ ] **Step 3: 安装 Base UI 并建立全局视觉基础**

Run: `pnpm add @base-ui/react@^1.6.0`

将 `src/renderer/styles.css` 改为以这些值为基础，并保留全局 `.muted`、`.error` 接口供现有组件使用：

```css
:root {
  color-scheme: light;
  --color-canvas-desk: #ded2c0;
  --color-surface-workbench: #e9dece;
  --color-surface-paper: #fbf5e9;
  --color-surface-raised: #fffaf0;
  --color-structure-walnut: #342e28;
  --color-text-primary: #312920;
  --color-text-secondary: #6f6255;
  --color-text-inverse: #f5ecdf;
  --color-border-subtle: #c9baa5;
  --color-accent-amber: #d8bd76;
  --color-accent-amber-strong: #8f704f;
  --color-feedback-danger: #9b4938;
  --font-reading: Georgia, 'Songti SC', STSong, SimSun, serif;
  --font-interface: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-paper: 0 5px 23px rgb(67 47 28 / 13%);
  --shadow-overlay: 0 14px 36px rgb(46 32 20 / 20%);
  --duration-fast: 120ms;
  --duration-normal: 180ms;
  --reader-measure: 46rem;
  font-family: var(--font-interface);
  color: var(--color-text-primary);
  background: var(--color-canvas-desk);
}
```

同时统一 `body`、`button`、`input`、`textarea`、`select`、`:focus-visible`、disabled、`.muted`、`.error` 和 `prefers-reduced-motion`；不得加入 `@font-face` 或远程 URL。

- [ ] **Step 4: 验证约束与基础构建**

Run: `pnpm vitest run tests/renderer/visualTokens.test.ts && pnpm lint:types && pnpm build`

Expected: 全部 PASS，Electron renderer 能解析 Base UI 依赖和新 CSS。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-lock.yaml src/renderer/styles.css tests/renderer/visualTokens.test.ts
git commit -m "feat(renderer): establish visual system tokens"
```

### Task 2: 用阅读器建立完整视觉样板

**Files:**

- Modify: `src/renderer/pages/reader-page/ReaderPage.tsx`
- Modify: `src/renderer/pages/reader-page/ReaderPage.module.css`
- Modify: `tests/renderer/ReaderPage.test.tsx`

**Interfaces:**

- Consumes: Task 1 的全局语义 tokens；现有 `ReaderPageProps`、`useConversationWorkspace()` 和选区定位逻辑。
- Produces: `styles.layout`、`styles.leftNav`、`styles.readerStage`、`styles.readerPaper`、`styles.readerHeader` 和 `styles.temporarySourceHighlight`；不改变 `ReaderPageProps`。

- [ ] **Step 1: 增加三栏语义与标题回归测试**

在 `tests/renderer/ReaderPage.test.tsx` 增加：

```tsx
it('以原书为主区域并保留目录和 AI 辅助区域', async () => {
  render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
  expect(await screen.findByRole('article', { name: '阅读正文' })).toBeTruthy();
  expect(screen.getByRole('navigation', { name: '书籍目录' })).toBeTruthy();
  expect(screen.getByRole('complementary', { name: '书旁低语' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: bookDocument.book.title })).toBeTruthy();
});

it('打开书籍期间显示与阅读面一致的加载状态', () => {
  api.books.open.mockReturnValueOnce(new Promise(() => undefined));
  render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('正在打开书籍');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run tests/renderer/ReaderPage.test.tsx`

Expected: FAIL，当前 article、navigation 和 AI aside 没有对应 accessible name。

- [ ] **Step 3: 调整 ReaderPage 结构但保持事件编排**

将现有三栏 JSX 调整为以下语义骨架：

```tsx
<section className={styles.layout}>
  <nav className={styles.leftNav} aria-label="书籍目录">
    <button className={styles.backButton} onClick={onBack}>
      返回书库
    </button>
    <p className={styles.navEyebrow}>正在阅读</p>
    <h2>{document.book.title}</h2>
    <div className={styles.chapterList}>
      {document.chapters.map((chapter) => (
        <a key={chapter.id} href={`#${chapter.startPassageId}`}>
          {chapter.title}
        </a>
      ))}
    </div>
  </nav>
  <main className={styles.readerStage}>
    <article
      ref={articleRef}
      className={styles.readerPaper}
      aria-label="阅读正文"
      onMouseUp={updateSelection}
      onKeyUp={updateSelection}
    >
      <header className={styles.readerHeader}>
        <span>WHISPER READING</span>
        <h1>{document.book.title}</h1>
      </header>
      {activeView?.type === 'draft' || activeView?.type === 'thread' ? (
        <SelectionMenu
          selectedText={selection?.selectedText ?? ''}
          mode={activeView.type}
          onSetTarget={() =>
            selection &&
            setDraft((current) => (current ? applyAutomaticSelection(current, selection) : current))
          }
          onStartConversation={startFromSelection}
          onReference={referenceSelection}
        />
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {document.passages.map((passage) => (
        <p id={passage.id} data-passage-id={passage.id} key={passage.id}>
          {passage.text}
        </p>
      ))}
    </article>
  </main>
  <RightAiPanel
    conversation={conversation}
    draft={{
      value: draft,
      open: openDraft,
      update: setDraft,
      selectTarget: (target) =>
        setDraft((current) => (current ? selectTarget(current, target) : current)),
    }}
    onLocate={locate}
  />
</section>
```

不得修改 `updateSelection()`、`startFromSelection()`、`referenceSelection()`、`locate()` 或数据加载 effect。

把现有纯文本 loading 分支改为 `className={styles.loadingShell}`、`aria-busy="true"` 且包含 `<p role="status">正在打开书籍…</p>`；错误分支也使用该页面样式，保留“返回书库”恢复入口并为错误文本增加 `role="alert"`，随后删除不再使用的 `appStyles` import。在 `ReaderPage.module.css` 中让 `.loadingShell` 使用工作台背景和纸张式居中占位。

- [ ] **Step 4: 实现阅读器视觉层级与窄窗口兜底**

在 `ReaderPage.module.css` 中使用：

```css
.layout {
  display: grid;
  grid-template-columns: clamp(168px, 15vw, 220px) minmax(34rem, 1fr) clamp(300px, 27vw, 380px);
  height: 100vh;
  min-width: 900px;
  background: var(--color-canvas-desk);
}

.readerStage {
  min-width: 0;
  overflow: auto;
  padding: clamp(18px, 3vw, 42px);
  background: var(--color-canvas-desk);
}

.readerPaper {
  box-sizing: border-box;
  width: min(100%, calc(var(--reader-measure) + 7rem));
  min-height: 100%;
  margin: 0 auto;
  padding: clamp(38px, 6vw, 72px);
  background: var(--color-surface-paper);
  box-shadow: var(--shadow-paper);
  font-family: var(--font-reading);
  font-size: 1.08rem;
  line-height: 1.95;
}

.readerPaper p {
  max-width: var(--reader-measure);
  margin: 0 auto 1.2em;
}
```

目录使用胡桃木降低后的结构色和次级文字；琥珀仅用于 active chapter、`::selection` 和临时原文高亮。不要加入纸张图片或纹理资源。

- [ ] **Step 5: 运行阅读器全部回归**

Run: `pnpm vitest run tests/renderer/ReaderPage.test.tsx`

Expected: 新语义测试和所有现有会话、定位、选区测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/pages/reader-page/ReaderPage.tsx src/renderer/pages/reader-page/ReaderPage.module.css tests/renderer/ReaderPage.test.tsx
git commit -m "feat(renderer): redesign reader workspace"
```

### Task 3: 重建设选区工具与 AI 辅助面板

**Files:**

- Modify: `src/renderer/features/reading-selection/SelectionMenu.tsx`
- Modify: `src/renderer/features/reading-selection/SelectionMenu.module.css`
- Modify: `src/renderer/features/conversation/RightAiPanel.tsx`
- Modify: `src/renderer/features/conversation/RightAiPanel.module.css`
- Modify: `src/renderer/features/conversation/TargetPicker.module.css`
- Modify: `tests/renderer/TargetPicker.test.tsx`
- Modify: `tests/renderer/RightAiPanel.test.tsx`

**Interfaces:**

- Consumes: Task 1 tokens、Task 2 三栏布局、现有 selection callbacks 与 `ConversationController`。
- Produces: 带 `role="toolbar"` 的选区操作区、带 `aria-label="书旁低语"` 的 AI aside；不改变任何回调签名。

- [ ] **Step 1: 增加语义和状态回归测试**

```tsx
it('选区操作以命名工具条呈现', () => {
  render(<SelectionMenu selectedText="一段原文" mode="thread" />);
  expect(screen.getByRole('toolbar', { name: '选区操作' })).toBeTruthy();
});

it('AI 面板以辅助区域呈现并保留现有入口', () => {
  renderPanel();
  expect(screen.getByRole('complementary', { name: '书旁低语' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '新建会话' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '历史' })).toBeTruthy();
});
```

- [ ] **Step 2: 运行两个测试文件并确认失败**

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/RightAiPanel.test.tsx`

Expected: FAIL，缺少 toolbar 和 complementary accessible name。

- [ ] **Step 3: 增加语义，不改变操作条件**

`SelectionMenu` 根节点改为：

```tsx
<div className={styles.menu} role="toolbar" aria-label="选区操作">
```

`RightAiPanel` 根节点与标题改为：

```tsx
<aside className={styles.panel} aria-label="书旁低语">
  <header className={styles.panelHeader}>
    <span>WHISPER</span>
    <strong>书旁低语</strong>
  </header>
</aside>
```

这里只在现有 `<aside>` 开始标签后插入 `panelHeader`；紧随其后的 `ThreadTabs` 和 draft/thread/history 条件分支保持原代码与顺序，不包入新的交互容器。

- [ ] **Step 4: 完成 AI 面板、消息与选区视觉**

使用 tokens 重写三个 CSS Modules，满足：

- AI 面板背景接近工作台而不是纸张，边界低对比；
- active tab 使用胡桃木结构色，streaming 通过文字和轻量状态点表达；
- assistant 消息不套聊天气泡，保持研究笔记式连续排版；
- user 消息使用轻量边界区分；
- pending reference 使用琥珀左边线；
- composer 固定在面板底部，输入框和发送按钮有清晰 focus/disabled；
- 选区 toolbar 为深胡桃木紧凑浮条，摘要截断但按钮名称完整；
- `TargetPicker` 的 breadcrumb、技能 pressed 状态、fieldset 和 select 层级清晰。

- [ ] **Step 5: 验证会话和选区行为未回归**

Run: `pnpm vitest run tests/renderer/TargetPicker.test.tsx tests/renderer/RightAiPanel.test.tsx tests/renderer/ReaderPage.test.tsx`

Expected: 全部 PASS，包括 Enter 发送、失败保留草稿、引用、首次发送和流式内容。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/features/reading-selection src/renderer/features/conversation/RightAiPanel.tsx src/renderer/features/conversation/RightAiPanel.module.css src/renderer/features/conversation/TargetPicker.module.css tests/renderer/TargetPicker.test.tsx tests/renderer/RightAiPanel.test.tsx
git commit -m "feat(renderer): restyle reading companion"
```

### Task 4: 用 Base UI Dialog 重建历史删除确认与会话状态

**Files:**

- Modify: `src/renderer/features/conversation/ThreadHistory.tsx`
- Modify: `src/renderer/features/conversation/ThreadHistory.module.css`
- Modify: `tests/renderer/ThreadHistory.test.tsx`
- Modify: `tests/renderer/RightAiPanel.test.tsx`

**Interfaces:**

- Consumes: `@base-ui/react/dialog`；现有 `ThreadHistoryProps`。
- Produces: Base UI `Dialog.Root` 控制的删除确认；`onDelete(threadId)` 仍只在确认时调用。

- [ ] **Step 1: 增加取消和对话框关闭回归测试**

```tsx
it('取消删除会关闭确认框且不调用 callback', async () => {
  const onDelete = vi.fn();
  render(
    <ThreadHistory
      threads={[thread('ready', '待删除', 'ready', '2026-07-12T10:00:00Z')]}
      onOpen={vi.fn()}
      onDelete={onDelete}
      onRetry={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '删除“待删除”' }));
  expect(screen.getByRole('dialog', { name: '确认删除会话' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog', { name: '确认删除会话' })).toBeNull();
  expect(onDelete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行历史测试并记录当前失败或行为基线**

Run: `pnpm vitest run tests/renderer/ThreadHistory.test.tsx`

Expected: 新测试若因当前同步 DOM 恰好通过，则继续实施并以 Base UI 后的完整测试作为保护；现有确认与重试测试必须保持 PASS。

- [ ] **Step 3: 使用 Base UI Dialog 替换手写 role dialog**

```tsx
import { Dialog } from '@base-ui/react/dialog';

<Dialog.Root
  open={Boolean(deleting)}
  onOpenChange={(open) => {
    if (!open) {
      setDeleting(null);
    }
  }}
>
  <Dialog.Portal>
    <Dialog.Backdrop className={styles.backdrop} />
    <Dialog.Popup className={styles.dialog} aria-label="确认删除会话">
      <Dialog.Title>删除会话</Dialog.Title>
      <Dialog.Description>确定删除“{deleting?.title}”吗？此操作无法撤销。</Dialog.Description>
      <div className={styles.dialogActions}>
        <Dialog.Close>取消</Dialog.Close>
        <button
          className={styles.dangerButton}
          onClick={() => {
            if (deleting) {
              onDelete(deleting.id);
              setDeleting(null);
            }
          }}
        >
          确认删除
        </button>
      </div>
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>;
```

`ThreadHistory.module.css` 必须覆盖 backdrop、popup starting/ending style、列表、streaming、retry、delete 和空历史状态；动画同时受全局 reduced-motion 约束。

- [ ] **Step 4: 验证 Dialog、历史和面板集成**

Run: `pnpm vitest run tests/renderer/ThreadHistory.test.tsx tests/renderer/RightAiPanel.test.tsx`

Expected: 删除只在确认后发生；取消关闭；生成中不可删除；失败会话仍可重试；全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/features/conversation/ThreadHistory.tsx src/renderer/features/conversation/ThreadHistory.module.css tests/renderer/ThreadHistory.test.tsx tests/renderer/RightAiPanel.test.tsx
git commit -m "feat(renderer): redesign conversation history dialog"
```

### Task 5: 重建书库工作台并补齐回归测试

**Files:**

- Modify: `src/renderer/pages/library-page/LibraryPage.tsx`
- Modify: `src/renderer/pages/library-page/LibraryPage.module.css`
- Create: `tests/renderer/LibraryPage.test.tsx`

**Interfaces:**

- Consumes: `whisper.books.list()`、`importMarkdown()`、`importEpub()` 和 `LibraryPageProps.onOpenBook`。
- Produces: 命名为“我的书房”的书库区域、现有路径导入控件、排版封面式书籍按钮和空状态；不新增封面字段或阅读进度数据。

- [ ] **Step 1: 写入书库行为测试**

使用 `vi.mock('../../src/renderer/api/whisper', ...)` 提供 `books.list`、`importMarkdown`、`importEpub`，并覆盖：

```tsx
it('加载书籍并从封面式按钮打开', async () => {
  api.books.list.mockResolvedValueOnce([book]);
  const onOpenBook = vi.fn();
  render(<LibraryPage onOpenBook={onOpenBook} />);
  fireEvent.click(await screen.findByRole('button', { name: '打开《局外人》' }));
  expect(onOpenBook).toHaveBeenCalledWith(book.id);
});

it('没有书时显示现有导入能力的空状态', async () => {
  api.books.list.mockResolvedValueOnce([]);
  render(<LibraryPage onOpenBook={vi.fn()} />);
  expect(await screen.findByText('书房还是空的')).toBeTruthy();
  expect(screen.getByPlaceholderText('输入本机书籍文件路径')).toBeTruthy();
});

it('书库加载完成前不提前显示空状态', () => {
  api.books.list.mockReturnValueOnce(new Promise(() => undefined));
  render(<LibraryPage onOpenBook={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('正在整理书房');
  expect(screen.queryByText('书房还是空的')).toBeNull();
});
```

另写两个测试确认 Markdown/EPUB 调用原 API、成功后清空路径并重新加载，失败时通过 `role="alert"` 展示错误文本。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run tests/renderer/LibraryPage.test.tsx`

Expected: FAIL，当前没有新 accessible name、统一 placeholder 或空状态。

- [ ] **Step 3: 实现书库语义结构**

新增 `const [isLoading, setIsLoading] = useState(true)`；`loadBooks()` 在请求前设为 true，并在 `finally` 中设为 false。保留两个导入命令，重组为：

```tsx
<section className={styles.page} aria-labelledby="library-title">
  <header className={styles.header}>
    <div>
      <span>YOUR READING ROOM</span>
      <h2 id="library-title">我的书房</h2>
    </div>
  </header>
  <div className={styles.importRow}>
    <input
      aria-label="本机书籍文件路径"
      placeholder="输入本机书籍文件路径"
      value={filePath}
      onChange={(event) => setFilePath(event.target.value)}
    />
    <button onClick={importMarkdown} disabled={!filePath.trim()}>
      导入 Markdown
    </button>
    <button onClick={importEpub} disabled={!filePath.trim()}>
      导入 EPUB
    </button>
  </div>
  {error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null}
  {isLoading ? (
    <div className={styles.loadingState} role="status">
      正在整理书房…
    </div>
  ) : books.length === 0 ? (
    <div className={styles.emptyState}>
      <h3>书房还是空的</h3>
      <p>输入本机 Markdown 或 EPUB 路径开始阅读。</p>
    </div>
  ) : (
    <div className={styles.bookList}>
      {books.map((book, index) => (
        <article className={styles.bookItem} key={book.id}>
          <button aria-label={`打开《${book.title}》`} onClick={() => onOpenBook(book.id)}>
            <span className={styles.cover} data-cover-variant={(index % 3) + 1}>
              {book.title}
            </span>
          </button>
          <strong>{book.title}</strong>
          <span>
            {book.author ?? '作者未知'} · {book.format.toUpperCase()}
          </span>
        </article>
      ))}
    </div>
  )}
</section>
```

不要展示不存在的阅读百分比，不新增封面抓取或生成逻辑。

- [ ] **Step 4: 实现工作台与排版封面视觉**

CSS 使用 responsive grid `repeat(auto-fill, minmax(150px, 1fr))`；封面用三种低饱和 token 组合、书脊边界和文字排版形成差异。按钮保持完整 focus ring，书籍元数据使用次级文本。

- [ ] **Step 5: 运行书库测试**

Run: `pnpm vitest run tests/renderer/LibraryPage.test.tsx`

Expected: 加载、空状态、打开、两种导入和错误测试全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/pages/library-page tests/renderer/LibraryPage.test.tsx
git commit -m "feat(renderer): redesign library workbench"
```

### Task 6: 重建设置抽屉与应用壳

**Files:**

- Modify: `src/renderer/features/settings/SettingsPanel.tsx`
- Modify: `src/renderer/features/settings/SettingsPanel.module.css`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.module.css`
- Create: `tests/renderer/SettingsPanel.test.tsx`

**Interfaces:**

- Consumes: `@base-ui/react/field`、现有 `AISettings`、`whisper.settings.get/save/testConnection` 与 `App` 的 `activeBookId` 状态。
- Produces: Base UI Field 语义、命名为“模型设置”的辅助区域、统一首页应用壳；API 调用输入不变。

- [ ] **Step 1: 写设置行为测试**

创建 API mock 并覆盖：加载已保存设置、保存完整对象、测试连接反馈、失败 `role="alert"`。核心断言：

```tsx
it('加载并保存模型设置', async () => {
  api.settings.get.mockResolvedValueOnce(savedSettings);
  render(<SettingsPanel />);
  const model = await screen.findByRole('textbox', { name: 'Model' });
  fireEvent.change(model, { target: { value: 'gpt-5-mini' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(api.settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-5-mini' }),
    ),
  );
});
```

- [ ] **Step 2: 运行设置测试并确认失败**

Run: `pnpm vitest run tests/renderer/SettingsPanel.test.tsx`

Expected: FAIL，当前 label 查询或 alert 语义不满足新测试。

- [ ] **Step 3: 用 Base UI Field 组织字段**

```tsx
import { Field } from '@base-ui/react/field';

<aside className={styles.panel} aria-labelledby="settings-title">
  <header>
    <span>WORKBENCH</span>
    <h2 id="settings-title">模型设置</h2>
  </header>
  <Field.Root className={styles.field}>
    <Field.Label>Base URL</Field.Label>
    <Field.Control
      value={settings.baseURL}
      onChange={(event) => setSettings({ ...settings, baseURL: event.target.value })}
    />
  </Field.Root>
  <Field.Root className={styles.field}>
    <Field.Label>API Key</Field.Label>
    <Field.Control
      type="password"
      value={settings.apiKey}
      onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
    />
  </Field.Root>
  <Field.Root className={styles.field}>
    <Field.Label>Model</Field.Label>
    <Field.Control
      value={settings.model}
      onChange={(event) => setSettings({ ...settings, model: event.target.value })}
    />
  </Field.Root>
  <Field.Root className={styles.field}>
    <Field.Label>Context Window</Field.Label>
    <Field.Control
      type="number"
      value={settings.contextWindow}
      onChange={(event) => setSettings({ ...settings, contextWindow: Number(event.target.value) })}
    />
  </Field.Root>
  <label className={styles.field}>
    默认上下文策略
    <select
      value={settings.defaultContextStrategy}
      onChange={(event) =>
        setSettings({
          ...settings,
          defaultContextStrategy: event.target.value as AISettings['defaultContextStrategy'],
        })
      }
    >
      <option value="full_book">完整全书</option>
      <option value="compressed_book">压缩全书</option>
      <option value="hybrid">混合</option>
    </select>
  </label>
  <div className={styles.buttonRow}>
    <button onClick={save}>保存</button>
    <button onClick={test}>测试连接</button>
  </div>
  {message ? (
    <p className="muted" role="status">
      {message}
    </p>
  ) : null}
  {error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null}
</aside>;
```

API Key 的 `type="password"` 必须保留；Context Window 使用 `type="number"`。

- [ ] **Step 4: 重建 App 首页壳与设置视觉**

`App.tsx` 保持 `activeBookId` 和错误分支，只把首页标题改为品牌眉题与“我的书房”组合，并为 `SettingsPanel` 提供桌边抽屉位置。`App.module.css` 使用：

```css
.shell {
  min-height: 100vh;
  padding: clamp(20px, 4vw, 48px);
  background: var(--color-surface-workbench);
}

.homeGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(280px, 28vw, 360px);
  gap: var(--space-6);
  max-width: 90rem;
  margin: 0 auto;
}

@media (max-width: 840px) {
  .homeGrid {
    grid-template-columns: 1fr;
  }
}
```

设置 CSS 将字段、select、按钮、status 和 error 组织成抽屉式面板，但不得隐藏任何现有字段。

- [ ] **Step 5: 验证设置与首页构建**

Run: `pnpm vitest run tests/renderer/SettingsPanel.test.tsx tests/renderer/LibraryPage.test.tsx && pnpm lint:types`

Expected: 全部 PASS，无 Base UI Field 类型错误。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/features/settings src/renderer/App.tsx src/renderer/App.module.css tests/renderer/SettingsPanel.test.tsx
git commit -m "feat(renderer): redesign settings and home shell"
```

### Task 7: 补齐响应式、可访问性、人工验收并完成规格生命周期

**Files:**

- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/pages/reader-page/ReaderPage.module.css`
- Modify: `src/renderer/features/conversation/RightAiPanel.module.css`
- Modify: `docs/MANUAL_TESTING.md`
- Move after all checks pass: `docs/specs/active/2026-07-15-visual-system-redesign.md` → `docs/specs/completed/2026-07-15-visual-system-redesign.md`
- Move after all checks pass: `docs/plans/active/2026-07-15-visual-system-redesign.md` → `docs/plans/completed/2026-07-15-visual-system-redesign.md`

**Interfaces:**

- Consumes: Tasks 1–6 的完整浅色视觉系统和所有回归测试。
- Produces: 窄窗口、reduced motion、键盘焦点和人工验收记录；完成后的 Spec/Plan 生命周期状态。

- [ ] **Step 1: 增加可机械验证的 CSS 约束**

扩展 `tests/renderer/visualTokens.test.ts`：

```ts
it('提供 reduced motion 和窄窗口策略', () => {
  expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).toContain(':focus-visible');
  expect(readFileSync('src/renderer/pages/reader-page/ReaderPage.module.css', 'utf8')).toMatch(
    /@media[^]*max-width/,
  );
});
```

- [ ] **Step 2: 运行测试并确认缺失约束会失败**

Run: `pnpm vitest run tests/renderer/visualTokens.test.ts`

Expected: 若前序任务尚未同时提供窄窗口 media query，则 FAIL；否则记录为已由前序实现满足并继续验证。

- [ ] **Step 3: 完成窄窗口和 reduced-motion 规则**

阅读器在小于约 1100px 时缩窄目录和 AI 面板、降低纸张 padding；不得隐藏返回书库、章节目录、AI 新建/历史或发送按钮。低于应用最小可用宽度时允许整体横向滚动，不用元素重叠换取“响应式”。所有 transition/animation 在 reduced motion 下设为接近零时长。

- [ ] **Step 4: 更新人工验收清单**

在 `docs/MANUAL_TESTING.md` 增加“视觉系统重建”章节：

```markdown
## 视觉系统重建

- [ ] 书库、设置、阅读器、选区菜单和 AI 会话不存在旧视觉残留。
- [ ] 阅读页第一视觉焦点是原书，目录和空闲 AI 面板不持续抢夺注意力。
- [ ] macOS 与 Windows 系统字体下，中英文标题、正文和控件无缺字、异常跳行或远程字体请求。
- [ ] 长标题、长章节、无作者、空书库、多会话和失败消息布局稳定。
- [ ] 键盘可访问所有按钮、链接、字段、Tabs 和 Dialog，focus ring 清晰可见。
- [ ] reduced motion 开启后，浮层和状态切换无明显位移动画。
- [ ] 常用窗口宽度与窄窗口下，返回书库、目录、新建会话、历史和发送操作均可达。
- [ ] 文本选择、回到原文和临时高亮使用一致的琥珀反馈，且不降低正文可读性。
```

- [ ] **Step 5: 运行完整自动检查**

Run: `pnpm check`

Expected: harness、format check、lint、类型检查、全部 Vitest 和 build 均 PASS。

- [ ] **Step 6: 执行真实 Electron 人工验收**

Run: `pnpm dev`

按 `docs/MANUAL_TESTING.md` 执行与本次相关的“启动与设置”“书籍导入与阅读”“AI 会话”“视觉系统重建”。至少记录：日期、commit、系统、结果、异常与未覆盖风险。若发现问题，修复后重新运行对应测试和 `pnpm check`。

- [ ] **Step 7: 移动完成文档并更新索引**

只有自动检查和人工验收都通过后，移动 Spec 与 Plan 到各自 `completed/`，并在 `docs/specs/completed/README.md` 和 `docs/plans/completed/README.md` 添加条目。不得在存在未说明视觉残留或验收失败时提前移动。

- [ ] **Step 8: 最终提交**

```bash
git add src/renderer tests/renderer docs/MANUAL_TESTING.md docs/specs docs/plans
git commit -m "feat(renderer): complete visual system redesign"
```

- [ ] **Step 9: 复核提交状态**

Run: `git status --short && git log -7 --oneline`

Expected: 工作树干净；提交历史包含每个独立任务的提交；active 目录不再包含本次已完成的 Spec/Plan。
