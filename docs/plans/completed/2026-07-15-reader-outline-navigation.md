# 阅读器层级目录实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将阅读器左侧扁平章节列表改造成最多四层、可折叠、随正文位置更新的通用层级目录。

**Architecture:** 在 renderer 内用纯函数把线性 `Chapter[]` 转成有序目录树和章节到可见路径的映射，再由独立 `BookOutline` 组件负责递归渲染、展开状态和手动折叠优先规则。`ReaderPage` 只负责从滚动容器的阅读基准线确定当前 passage，并把当前章节与导航回调连接到目录组件；不修改解析器、数据库、IPC 或 preload。

**Tech Stack:** React 19、TypeScript、CSS Modules、Vitest、Testing Library、Electron renderer。

## Global Constraints

- 所有控制语句必须使用花括号。
- 目录只依据 `parentChapterId` 和 `order`，不得根据 Part、章、节、前言等标题文字推断语义。
- 目录按树的相对深度展示最多四层；更深章节保留在正文和数据中。
- renderer 不得导入 main、Electron 或 Node API。
- 不修改数据库 schema、IPC 契约、preload API 或主进程服务。
- 箭头只控制折叠，标题只控制正文定位。
- 用户手动折叠优先于自动展开；自动跟随不得关闭用户手动展开的其他分支。
- 最终必须运行 `pnpm check`。

## 文件结构

- 新建 `src/renderer/features/book-outline/outlineModel.ts`：构建最多四层的目录树、处理异常父子关系，并提供所有章节到可见路径的映射。
- 新建 `src/renderer/features/book-outline/BookOutline.tsx`：递归目录、展开/折叠状态、当前位置承接和无障碍语义。
- 新建 `src/renderer/features/book-outline/BookOutline.module.css`：四层缩进、连续祖先线、当前/hover/focus 状态。
- 新建 `src/renderer/features/book-outline/useReadingPosition.ts`：根据滚动容器阅读基准线计算当前 passage 的章节。
- 新建 `tests/renderer/outlineModel.test.ts`：目录模型的纯函数回归测试。
- 新建 `tests/renderer/BookOutline.test.tsx`：目录递归结构、交互和无障碍测试。
- 新建 `tests/renderer/useReadingPosition.test.tsx`：阅读基准线和滚动更新测试。
- 修改 `src/renderer/pages/reader-page/ReaderPage.tsx`：接入目录模型、目录组件和阅读位置 hook。
- 修改 `src/renderer/pages/reader-page/ReaderPage.module.css`：删除旧扁平目录规则，保留侧栏容器职责。
- 修改 `tests/renderer/ReaderPage.test.tsx`：增加阅读页集成回归。
- 修改 `tests/renderer/visualTokens.test.ts`：验证层级目录视觉约束与窄窗口可读性。

---

### Task 1: 建立通用目录模型

**Files:**

- Create: `src/renderer/features/book-outline/outlineModel.ts`
- Create: `tests/renderer/outlineModel.test.ts`

**Interfaces:**

- Consumes: `Chapter[]` from `src/shared/types.ts`。
- Produces: `buildOutlineModel(chapters: Chapter[], maxDepth?: number): OutlineModel`。
- Produces: `OutlineNode { chapter: Chapter; depth: number; children: OutlineNode[] }`。
- Produces: `OutlineModel { roots: OutlineNode[]; visiblePathByChapterId: ReadonlyMap<string, readonly string[]> }`，其中路径从可见根节点到最近可见章节。

- [ ] **Step 1: 写目录层级、截断和映射的失败测试**

```ts
import { describe, expect, it } from 'vitest';
import type { Chapter } from '../../src/shared/types';
import { buildOutlineModel } from '../../src/renderer/features/book-outline/outlineModel';

function chapter(id: string, parentChapterId: string | null, order: number): Chapter {
  return {
    id,
    bookId: 'book',
    parentChapterId,
    title: id,
    level: order + 2,
    order,
    startPassageId: `p-${id}`,
    endPassageId: `p-${id}`,
    summary: null,
  };
}

describe('buildOutlineModel', () => {
  it('按父子关系和 order 构建相对层级，不依赖 level', () => {
    const model = buildOutlineModel([
      chapter('child-2', 'root', 2),
      chapter('root', null, 0),
      chapter('child-1', 'root', 1),
    ]);
    expect(model.roots.map((node) => node.chapter.id)).toEqual(['root']);
    expect(model.roots[0].children.map((node) => node.chapter.id)).toEqual(['child-1', 'child-2']);
    expect(model.roots[0].children[0].depth).toBe(2);
  });

  it('最多展示四层并把深层章节映射到最近可见祖先', () => {
    const chapters = [
      chapter('l1', null, 0),
      chapter('l2', 'l1', 1),
      chapter('l3', 'l2', 2),
      chapter('l4', 'l3', 3),
      chapter('l5', 'l4', 4),
      chapter('l6', 'l5', 5),
    ];
    const model = buildOutlineModel(chapters);
    expect(model.roots[0].children[0].children[0].children[0].chapter.id).toBe('l4');
    expect(model.roots[0].children[0].children[0].children[0].children).toEqual([]);
    expect(model.visiblePathByChapterId.get('l6')).toEqual(['l1', 'l2', 'l3', 'l4']);
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `pnpm vitest run tests/renderer/outlineModel.test.ts`

Expected: FAIL，包含 `Failed to resolve import .../outlineModel`。

- [ ] **Step 3: 实现有序树、四层上限和可见路径映射**

```ts
import type { Chapter } from '../../../shared/types';

export interface OutlineNode {
  chapter: Chapter;
  depth: number;
  children: OutlineNode[];
}

export interface OutlineModel {
  roots: OutlineNode[];
  visiblePathByChapterId: ReadonlyMap<string, readonly string[]>;
}

export function buildOutlineModel(chapters: Chapter[], maxDepth = 4): OutlineModel {
  const ordered = [...chapters].sort((left, right) => left.order - right.order);
  const byId = new Map(ordered.map((item) => [item.id, item]));
  const childrenByParent = new Map<string | null, Chapter[]>();

  for (const item of ordered) {
    const parentId =
      item.parentChapterId && item.parentChapterId !== item.id && byId.has(item.parentChapterId)
        ? item.parentChapterId
        : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(item);
    childrenByParent.set(parentId, siblings);
  }

  const visiblePathByChapterId = new Map<string, readonly string[]>();
  const visited = new Set<string>();

  function visit(item: Chapter, depth: number, path: readonly string[], ancestry: Set<string>) {
    if (ancestry.has(item.id)) {
      return null;
    }
    visited.add(item.id);
    const nextAncestry = new Set(ancestry).add(item.id);
    const visiblePath = depth <= maxDepth ? [...path, item.id] : path;
    visiblePathByChapterId.set(item.id, visiblePath);
    const descendants = childrenByParent.get(item.id) ?? [];

    if (depth > maxDepth) {
      for (const child of descendants) {
        visit(child, depth + 1, visiblePath, nextAncestry);
      }
      return null;
    }

    const children: OutlineNode[] = [];
    for (const child of descendants) {
      const node = visit(child, depth + 1, visiblePath, nextAncestry);
      if (node) {
        children.push(node);
      }
    }
    return { chapter: item, depth, children } satisfies OutlineNode;
  }

  const roots: OutlineNode[] = [];
  for (const item of childrenByParent.get(null) ?? []) {
    const node = visit(item, 1, [], new Set());
    if (node) {
      roots.push(node);
    }
  }
  for (const item of ordered) {
    if (!visited.has(item.id)) {
      const node = visit(item, 1, [], new Set());
      if (node) {
        roots.push(node);
      }
    }
  }
  return { roots, visiblePathByChapterId };
}
```

- [ ] **Step 4: 补齐孤儿、循环、空数组和重复 order 测试**

```ts
it('把孤儿和循环中未从正常根可达的节点降级为根且不无限递归', () => {
  const model = buildOutlineModel([
    chapter('orphan', 'missing', 0),
    chapter('a', 'b', 1),
    chapter('b', 'a', 2),
  ]);
  expect(model.roots.map((node) => node.chapter.id)).toContain('orphan');
  expect(model.visiblePathByChapterId.has('a')).toBe(true);
  expect(model.visiblePathByChapterId.has('b')).toBe(true);
});

it('空章节返回空树', () => {
  expect(buildOutlineModel([])).toEqual({
    roots: [],
    visiblePathByChapterId: new Map(),
  });
});
```

- [ ] **Step 5: 运行模型测试和格式检查**

Run: `pnpm vitest run tests/renderer/outlineModel.test.ts && pnpm format:check`

Expected: 两个命令均 PASS。

- [ ] **Step 6: 提交目录模型**

```bash
git add src/renderer/features/book-outline/outlineModel.ts tests/renderer/outlineModel.test.ts
git commit -m "feat: add hierarchical book outline model"
```

---

### Task 2: 实现递归目录及手动折叠优先规则

**Files:**

- Create: `src/renderer/features/book-outline/BookOutline.tsx`
- Create: `src/renderer/features/book-outline/BookOutline.module.css`
- Create: `tests/renderer/BookOutline.test.tsx`

**Interfaces:**

- Consumes: `OutlineModel` from Task 1。
- Consumes: `activeChapterId: string | null`，可以是被四层上限省略的章节。
- Produces: `BookOutline({ model, activeChapterId, onNavigate }): JSX.Element`。
- Calls: `onNavigate(chapter: Chapter)` only when a chapter has a non-empty `startPassageId`。

- [ ] **Step 1: 写递归结构、按钮与标题导航的失败测试**

```tsx
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookOutline } from '../../src/renderer/features/book-outline/BookOutline';
import { buildOutlineModel } from '../../src/renderer/features/book-outline/outlineModel';

afterEach(cleanup);

it('用嵌套列表渲染层级，箭头和标题执行独立动作', () => {
  const model = buildOutlineModel([chapter('root', null, 0), chapter('child', 'root', 1)]);
  const navigate = vi.fn();
  render(<BookOutline model={model} activeChapterId="child" onNavigate={navigate} />);

  const toggle = screen.getByRole('button', { name: '折叠“root”' });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('link', { name: 'root' }));
  expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'root' }));
  expect(toggle.getAttribute('aria-expanded')).toBe('true');

  fireEvent.click(toggle);
  expect(screen.queryByRole('link', { name: 'child' })).toBeNull();
  expect(navigate).toHaveBeenCalledOnce();
});
```

测试文件中的 `chapter` helper 与 Task 1 保持相同字段，并将 `title` 设为 `id`。

- [ ] **Step 2: 运行组件测试并确认失败**

Run: `pnpm vitest run tests/renderer/BookOutline.test.tsx`

Expected: FAIL，包含 `Failed to resolve import .../BookOutline`。

- [ ] **Step 3: 实现递归列表、展开集合与独立操作目标**

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { Chapter } from '../../../shared/types';
import type { OutlineModel, OutlineNode } from './outlineModel';
import styles from './BookOutline.module.css';

interface BookOutlineProps {
  model: OutlineModel;
  activeChapterId: string | null;
  onNavigate: (chapter: Chapter) => void;
}

export function BookOutline({ model, activeChapterId, onNavigate }: BookOutlineProps) {
  const activePath = activeChapterId
    ? (model.visiblePathByChapterId.get(activeChapterId) ?? [])
    : [];
  const [expanded, setExpanded] = useState(() => new Set(activePath.slice(0, -1)));
  const [collapsedByUser, setCollapsedByUser] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of activePath.slice(0, -1)) {
        if (!collapsedByUser.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [activePath.join('/'), collapsedByUser]);

  const displayedActiveId = useMemo(() => {
    for (const id of activePath) {
      if (collapsedByUser.has(id)) {
        return id;
      }
    }
    return activePath.at(-1) ?? null;
  }, [activePath.join('/'), collapsedByUser]);

  function toggle(node: OutlineNode) {
    const id = node.chapter.id;
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setCollapsedByUser((collapsed) => new Set(collapsed).add(id));
      } else {
        next.add(id);
        setCollapsedByUser((collapsed) => {
          const updated = new Set(collapsed);
          updated.delete(id);
          return updated;
        });
      }
      return next;
    });
  }

  function renderNode(node: OutlineNode) {
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && expanded.has(node.chapter.id);
    const isCurrent = displayedActiveId === node.chapter.id;
    return (
      <li className={styles.item} key={node.chapter.id} data-depth={node.depth}>
        <div className={styles.row} data-current={isCurrent || undefined}>
          {hasChildren ? (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? '折叠' : '展开'}“${node.chapter.title}”`}
              onClick={() => toggle(node)}
            >
              <span aria-hidden="true">{isExpanded ? '⌄' : '›'}</span>
            </button>
          ) : (
            <span className={styles.togglePlaceholder} aria-hidden="true" />
          )}
          {node.chapter.startPassageId ? (
            <a
              href={`#${node.chapter.startPassageId}`}
              className={styles.title}
              aria-current={isCurrent ? 'location' : undefined}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(node.chapter);
              }}
            >
              {node.chapter.title}
            </a>
          ) : (
            <span className={styles.title}>{node.chapter.title}</span>
          )}
        </div>
        {isExpanded ? <ul className={styles.children}>{node.children.map(renderNode)}</ul> : null}
      </li>
    );
  }

  return <ul className={styles.root}>{model.roots.map(renderNode)}</ul>;
}
```

- [ ] **Step 4: 增加当前分支手动折叠和其他分支状态保留测试**

```tsx
it('手动折叠当前分支后由父节点承接当前位置且不会自行弹开', () => {
  const model = buildOutlineModel([
    chapter('root', null, 0),
    chapter('child', 'root', 1),
    chapter('other', null, 2),
    chapter('other-child', 'other', 3),
  ]);
  const { rerender } = render(
    <BookOutline model={model} activeChapterId="child" onNavigate={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: '折叠“root”' }));
  expect(screen.getByRole('link', { name: 'root' }).getAttribute('aria-current')).toBe('location');
  rerender(<BookOutline model={model} activeChapterId="child" onNavigate={vi.fn()} />);
  expect(screen.queryByRole('link', { name: 'child' })).toBeNull();
  rerender(<BookOutline model={model} activeChapterId="other-child" onNavigate={vi.fn()} />);
  expect(screen.getByRole('link', { name: 'other-child' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'child' })).toBeNull();
});
```

- [ ] **Step 5: 编写连续祖先线、四层缩进和状态样式**

```css
.root,
.children {
  margin: 0;
  padding: 0;
  list-style: none;
}

.children {
  margin-left: var(--space-2);
  padding-left: var(--space-3);
  border-left: 1px solid rgb(245 236 223 / 18%);
}

.row {
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr);
  align-items: start;
  border-radius: 4px;
}

.row[data-current='true'] {
  color: var(--color-text-inverse);
  background: color-mix(in srgb, var(--color-accent-amber) 20%, transparent);
  box-shadow: inset 2px 0 var(--color-accent-amber);
}

.toggle,
.togglePlaceholder {
  width: 1rem;
  min-height: 2rem;
}

.toggle {
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
}

.title {
  min-width: 0;
  padding: var(--space-2) var(--space-2);
  color: var(--color-border-subtle);
  line-height: 1.45;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.row:hover .title,
.title:focus-visible,
.toggle:focus-visible {
  color: var(--color-text-inverse);
}
```

- [ ] **Step 6: 运行组件测试并确认通过**

Run: `pnpm vitest run tests/renderer/BookOutline.test.tsx && pnpm lint:types`

Expected: 两个命令均 PASS。

- [ ] **Step 7: 提交层级目录组件**

```bash
git add src/renderer/features/book-outline/BookOutline.tsx src/renderer/features/book-outline/BookOutline.module.css tests/renderer/BookOutline.test.tsx
git commit -m "feat: add collapsible book outline"
```

---

### Task 3: 跟踪正文阅读位置

**Files:**

- Create: `src/renderer/features/book-outline/useReadingPosition.ts`
- Create: `tests/renderer/useReadingPosition.test.tsx`

**Interfaces:**

- Consumes: `containerRef: RefObject<HTMLElement | null>` and `passages: Passage[]`。
- Produces: `useReadingPosition(containerRef, passages): string | null`，返回阅读基准线处 passage 的原始 `chapterId`。
- Produces: `chapterAtReadingLine(passages, elementById, lineY): string | null` 供纯函数测试。

- [ ] **Step 1: 写阅读基准线选择规则的失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { chapterAtReadingLine } from '../../src/renderer/features/book-outline/useReadingPosition';

it('选择最后一个越过阅读基准线的 passage，并在基准线位于首段之前时选择首段', () => {
  const passages = [
    { id: 'p1', chapterId: 'c1' },
    { id: 'p2', chapterId: 'c2' },
    { id: 'p3', chapterId: 'c3' },
  ];
  const tops = new Map([
    ['p1', 100],
    ['p2', 300],
    ['p3', 500],
  ]);
  expect(chapterAtReadingLine(passages, (id) => tops.get(id) ?? null, 350)).toBe('c2');
  expect(chapterAtReadingLine(passages, (id) => tops.get(id) ?? null, 50)).toBe('c1');
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm vitest run tests/renderer/useReadingPosition.test.tsx`

Expected: FAIL，包含 `Failed to resolve import .../useReadingPosition`。

- [ ] **Step 3: 实现纯计算函数和带 requestAnimationFrame 节流的 hook**

```ts
import { useEffect, useState, type RefObject } from 'react';
import type { Passage } from '../../../shared/types';

interface PassageIdentity {
  id: string;
  chapterId: string | null;
}

export function chapterAtReadingLine(
  passages: PassageIdentity[],
  topById: (id: string) => number | null,
  lineY: number,
) {
  let candidate = passages[0]?.chapterId ?? null;
  for (const passage of passages) {
    const top = topById(passage.id);
    if (top === null) {
      continue;
    }
    if (top > lineY) {
      break;
    }
    candidate = passage.chapterId;
  }
  return candidate;
}

export function useReadingPosition(
  containerRef: RefObject<HTMLElement | null>,
  passages: Passage[],
) {
  const [chapterId, setChapterId] = useState<string | null>(passages[0]?.chapterId ?? null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let frame = 0;
    function update() {
      frame = 0;
      const containerRect = container.getBoundingClientRect();
      const lineY = containerRect.top + container.clientHeight * 0.3;
      setChapterId(
        chapterAtReadingLine(
          passages,
          (id) => document.getElementById(id)?.getBoundingClientRect().top ?? null,
          lineY,
        ),
      );
    }
    function schedule() {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    }
    update();
    container.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      container.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [containerRef, passages]);

  return chapterId;
}
```

- [ ] **Step 4: 增加 hook 滚动更新和清理监听测试**

创建测试 harness，将 `ref` 绑定到可滚动元素；mock `requestAnimationFrame` 为同步执行，并为 `p1`、`p2` 的 `getBoundingClientRect()` 返回跨过 30% 阅读基准线的不同 top。触发 `fireEvent.scroll(container)` 后断言 harness 从 `c1` 更新为 `c2`；unmount 后再次触发 scroll，断言没有状态更新警告。

```tsx
function Harness({ passages }: { passages: Passage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chapterId = useReadingPosition(ref, passages);
  return (
    <div ref={ref} data-testid="reader" style={{ height: 100 }}>
      <span>{chapterId}</span>
      {passages.map((passage) => (
        <p id={passage.id} key={passage.id}>
          {passage.text}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 运行阅读位置测试和类型检查**

Run: `pnpm vitest run tests/renderer/useReadingPosition.test.tsx && pnpm lint:types`

Expected: 两个命令均 PASS。

- [ ] **Step 6: 提交阅读位置跟踪**

```bash
git add src/renderer/features/book-outline/useReadingPosition.ts tests/renderer/useReadingPosition.test.tsx
git commit -m "feat: track active reading chapter"
```

---

### Task 4: 在 ReaderPage 接入层级目录

**Files:**

- Modify: `src/renderer/pages/reader-page/ReaderPage.tsx`
- Modify: `src/renderer/pages/reader-page/ReaderPage.module.css`
- Modify: `tests/renderer/ReaderPage.test.tsx`
- Modify: `tests/renderer/visualTokens.test.ts`

**Interfaces:**

- Consumes: `buildOutlineModel`, `BookOutline`, `useReadingPosition` from Tasks 1–3。
- Produces: 阅读页中真实章节树、标题导航和滚动高亮的端到端连接。

- [ ] **Step 1: 写 ReaderPage 层级目录和导航的失败测试**

将 `bookDocument.chapters` 临时替换为根、子、孙三层数据，并为每章增加对应 passage。测试当前路径默认展开、父节点按钮存在、点击标题调用目标 passage 的 `scrollIntoView`，且折叠按钮不会触发滚动。

```tsx
it('渲染层级目录并把标题导航到对应正文，折叠按钮不导航', async () => {
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  api.books.open.mockResolvedValueOnce(nestedBookDocument);
  render(<ReaderPage bookId="b1" onBack={vi.fn()} />);

  const toggle = await screen.findByRole('button', { name: '折叠“第一部”' });
  fireEvent.click(screen.getByRole('link', { name: '第一章' }));
  expect(scroll).toHaveBeenCalledOnce();
  fireEvent.click(toggle);
  expect(scroll).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: 运行 ReaderPage 测试并确认旧扁平目录不满足断言**

Run: `pnpm vitest run tests/renderer/ReaderPage.test.tsx`

Expected: FAIL，找不到 `折叠“第一部”` 按钮。

- [ ] **Step 3: 接入目录模型、滚动位置和导航回调**

在 `ReaderPage` 中增加 reader scroll container ref，并替换旧的 `document.chapters.map(...)`：

```tsx
const readerStageRef = useRef<HTMLElement>(null);
const outlineModel = useMemo(() => buildOutlineModel(document?.chapters ?? []), [document]);
const activeChapterId = useReadingPosition(readerStageRef, document?.passages ?? []);

function navigateToChapter(chapter: Chapter) {
  if (!chapter.startPassageId) {
    return;
  }
  globalThis.document.getElementById(chapter.startPassageId)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}
```

同时把 React import 补充为 `useEffect, useMemo, useRef, useState`。在 loading guard 之后渲染：

```tsx
<div className={styles.chapterList}>
  <BookOutline
    model={outlineModel}
    activeChapterId={activeChapterId}
    onNavigate={navigateToChapter}
  />
</div>
```

并把 `ref={readerStageRef}` 加到 `.readerStage`。同时为正文 passage 保留 `id`，增加 `data-chapter-id={passage.chapterId ?? undefined}` 方便人工调试，不引入跨进程状态。

- [ ] **Step 4: 删除扁平链接样式并保留侧栏容器边界**

从 `ReaderPage.module.css` 删除 `.chapterList a` 和 `.chapterList a:hover`，只保留：

```css
.chapterList {
  margin-top: var(--space-6);
}
```

具体目录行、祖先线和状态样式全部由 `BookOutline.module.css` 负责，避免页面样式越过 feature 边界。

- [ ] **Step 5: 增加深层章节回退和空目录集成测试**

```tsx
it('阅读位置进入第五层时由第四层目录项承接当前位置', async () => {
  api.books.open.mockResolvedValueOnce(deepBookDocument);
  render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
  expect(await screen.findByRole('link', { name: '第四层' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: '第五层' })).toBeNull();
  expect(screen.getByRole('link', { name: '第四层' }).getAttribute('aria-current')).toBe(
    'location',
  );
});

it('空目录仍显示正文且不生成目录项', async () => {
  api.books.open.mockResolvedValueOnce({ ...bookDocument, chapters: [] });
  render(<ReaderPage bookId="b1" onBack={vi.fn()} />);
  expect(await screen.findByRole('article', { name: '阅读正文' })).toBeTruthy();
  expect(
    within(screen.getByRole('navigation', { name: '书籍目录' })).queryAllByRole('link'),
  ).toEqual([]);
});
```

其中 `deepBookDocument` 只放置一个 `chapterId: 'level-5'` 的正文 passage，使 hook 初始阅读位置稳定落在第五层；章节树包含从“第一层”到“第五层”的完整父子链。

- [ ] **Step 6: 扩展视觉约束测试**

在 `visualTokens.test.ts` 读取 `BookOutline.module.css`，验证连续竖线、当前状态和长标题换行所需规则：

```ts
const outlineCss = readFileSync(
  'src/renderer/features/book-outline/BookOutline.module.css',
  'utf8',
);

it('层级目录提供连续祖先线、当前位置和长标题换行', () => {
  expect(outlineCss).toMatch(/\.children\s*{[^}]*border-left:/s);
  expect(outlineCss).toMatch(/\[data-current=['"]true['"]\]/);
  expect(outlineCss).toContain('overflow-wrap: anywhere');
});
```

- [ ] **Step 7: 运行受影响测试、格式化并复跑**

Run: `pnpm vitest run tests/renderer/outlineModel.test.ts tests/renderer/BookOutline.test.tsx tests/renderer/useReadingPosition.test.tsx tests/renderer/ReaderPage.test.tsx tests/renderer/visualTokens.test.ts`

Expected: 所有测试 PASS。

Run: `pnpm format && pnpm vitest run tests/renderer/outlineModel.test.ts tests/renderer/BookOutline.test.tsx tests/renderer/useReadingPosition.test.tsx tests/renderer/ReaderPage.test.tsx tests/renderer/visualTokens.test.ts`

Expected: 格式化完成，所有测试仍 PASS。

- [ ] **Step 8: 执行人工验收**

Run: `pnpm dev`

在《语言的魔力》中确认：CIP、译序、致谢、前言作为顶层叶节点；Part 作为可展开父节点；展开 Part 后竖线贯穿全部可见后代；标题点击定位正文；箭头点击不滚动；滚动正文更新高亮；手动折叠当前 Part 后目录不自行弹开。再用包含五层标题的 Markdown 确认目录只显示四层且正文完整。

Expected: 上述行为全部符合 Spec；常用窗口宽度下四层标题可读，目录没有持续抢夺正文焦点。

- [ ] **Step 9: 运行完整质量门禁**

Run: `pnpm check`

Expected: harness、format、lint、typecheck、tests 和 build 全部 PASS。

- [ ] **Step 10: 提交 ReaderPage 集成**

```bash
git add src/renderer/pages/reader-page/ReaderPage.tsx src/renderer/pages/reader-page/ReaderPage.module.css tests/renderer/ReaderPage.test.tsx tests/renderer/visualTokens.test.ts
git commit -m "feat: integrate hierarchical reader outline"
```

---

### Task 5: 收口文档生命周期与最终核验

**Files:**

- Move: `docs/specs/active/2026-07-15-reader-outline-navigation.md` → `docs/specs/completed/2026-07-15-reader-outline-navigation.md`
- Move: `docs/plans/active/2026-07-15-reader-outline-navigation.md` → `docs/plans/completed/2026-07-15-reader-outline-navigation.md`

**Interfaces:**

- Consumes: Tasks 1–4 已通过的实现、测试和人工验收结果。
- Produces: 完成态 Spec/Plan 和干净、可复核的最终提交。

- [ ] **Step 1: 再次运行完整质量门禁**

Run: `pnpm check`

Expected: 所有检查 PASS；若距离 Task 4 的检查期间没有代码变化，也必须保留本次新输出作为完成证据。

- [ ] **Step 2: 移动已完成文档**

```bash
mkdir -p docs/specs/completed docs/plans/completed
git mv docs/specs/active/2026-07-15-reader-outline-navigation.md docs/specs/completed/2026-07-15-reader-outline-navigation.md
git mv docs/plans/active/2026-07-15-reader-outline-navigation.md docs/plans/completed/2026-07-15-reader-outline-navigation.md
```

- [ ] **Step 3: 检查差异和工作树**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无输出；status 只包含两份文档的 rename。

- [ ] **Step 4: 提交文档生命周期变更**

```bash
git add docs/specs/completed/2026-07-15-reader-outline-navigation.md docs/plans/completed/2026-07-15-reader-outline-navigation.md
git commit -m "docs: complete reader outline plan"
```
