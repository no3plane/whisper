# Markdown-only Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除 EPUB，并用原始 Markdown + 标准 mdast 重建正文渲染、目录、选区定位和 AI 上下文链路。

**Architecture:** 书库中的 Markdown 副本是正文唯一事实来源。Main Process 和 Renderer 复用 `src/shared/markdown/` 中的解析与稳定 ID 规则；章节索引和顶层 block 元数据按需派生，Renderer 使用 `react-markdown` 渲染，AI 直接消费由 Markdown 派生的结构化文本单元。

**Tech Stack:** TypeScript 5.8、Electron 43、React 19、react-markdown 10、unified 11、remark-parse 11、remark-gfm 4、Zod 3、SQLite、Vitest 3、Testing Library。

## Global Constraints

- 面向用户的沟通、文案和错误默认使用中文；代码标识符、API、命令和路径保留英文。
- Renderer 只能通过 preload 白名单 API 与 Main Process 通信，不得导入 Electron、Node 或 `src/main/`。
- 原始 Markdown 是正文唯一事实来源；不得保留持久化 passage 正文副本或自定义 AST。
- 只支持大小写不敏感的 `.md`；EPUB、`.markdown` 和其他扩展名均不兼容。
- 原始 HTML、脚本、iframe 和事件属性不得执行；远程图片不得自动请求。
- 本次是开发期破坏性 schema 变更，不迁移旧库，不自动删除旧库；版本不匹配必须明确提示手动删除。
- 所有控制语句必须使用花括号。
- 每个行为变更严格执行 TDD：先写测试并观察预期失败，再写最小实现。
- 完成前运行 `pnpm check`；真实链接、图片、选区和目录跳转按 `docs/MANUAL_TESTING.md` 验收。

---

## 文件结构

- `src/shared/markdown/parseMarkdown.ts`：唯一 Markdown 解析配置和 mdast `Root` 生成入口。
- `src/shared/markdown/analyzeMarkdown.ts`：从 mdast 派生稳定 block、章节索引、纯文本与结构化 Markdown 单元。
- `src/shared/markdown/nodeId.ts`：基于 `bookId + node type + source offset` 的确定性 ID。
- `src/renderer/features/markdown-reading/MarkdownDocument.tsx`：安全渲染 Markdown，并给顶层 block 注入 DOM 锚点。
- `src/renderer/features/markdown-reading/MarkdownDocument.module.css`：Markdown 语义元素的阅读排版。
- `src/main/library/MarkdownResourceService.ts`：解析、复制并读取允许的书内图片资源。
- 删除 `src/main/library/EpubParser.ts`；不新增通用 format adapter。

---

### Task 1: 硬移除 EPUB 与格式分支

**Files:**

- Delete: `src/main/library/EpubParser.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/whisperApi.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/ipc/importBookFiles.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/library/LibraryService.ts`
- Modify: `src/renderer/pages/library-page/LibraryPage.tsx`
- Test: `tests/main/importBookFiles.test.ts`
- Test: `tests/shared/ipcSchemas.test.ts`
- Test: `tests/renderer/LibraryPage.test.tsx`

**Interfaces:**

- Produces: `Book` 不含 `format`；`importBookFiles()` 只接受 `.md`；`WhisperApi.books` 不含 `importEpub`。

- [ ] **Step 1: 写只允许 `.md` 的失败测试**

```ts
it('只导入 .md 并拒绝 EPUB 与 .markdown', () => {
  const library = { importMarkdown: vi.fn(() => book) };
  const result = importBookFiles(['/books/a.md', '/books/b.epub', '/books/c.markdown'], library);
  expect(library.importMarkdown).toHaveBeenCalledOnce();
  expect(result.imported).toEqual([book]);
  expect(result.failed.map(({ fileName }) => fileName)).toEqual(['b.epub', 'c.markdown']);
  expect(result.failed[0].reason).toBe('不支持的文件格式，仅支持 .md。');
});
```

- [ ] **Step 2: 运行测试并确认因 EPUB 仍被接受而失败**

Run: `pnpm vitest run tests/main/importBookFiles.test.ts tests/shared/ipcSchemas.test.ts tests/renderer/LibraryPage.test.tsx`

Expected: FAIL，现有代码仍调用 `importEpub`，schema 和 UI 仍声明支持 EPUB。

- [ ] **Step 3: 收紧共享契约与导入入口**

```ts
export interface Book {
  id: string;
  title: string;
  author: string | null;
  originalFilePath: string;
  libraryFilePath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  preprocessStatus: PreprocessStatus;
  tokenEstimate: number;
  defaultContextStrategy: ContextStrategy;
  activeThreadId: string | null;
}

export function importBookFiles(filePaths: string[], library: BookImporter): ImportBooksResult {
  const result: ImportBooksResult = { imported: [], failed: [] };
  for (const filePath of filePaths) {
    if (extname(filePath).toLowerCase() !== '.md') {
      result.failed.push({
        fileName: basename(filePath),
        reason: '不支持的文件格式，仅支持 .md。',
      });
      continue;
    }
    try {
      result.imported.push(library.importMarkdown(filePath));
    } catch (error) {
      result.failed.push({ fileName: basename(filePath), reason: messageOf(error) });
    }
  }
  return result;
}
```

同步删除 `booksImportEpub` channel、preload 方法、`LibraryService.importEpub()`、UI 的 EPUB 文案与 `BookFormat`。

- [ ] **Step 4: 删除 EPUB 文件并证明代码库没有功能残留**

Run: `rg -n "epub|EPUB|importEpub|BookFormat" src tests`

Expected: 无输出；若测试 fixture 文本确有必要保留，必须删除而不是豁免，因为本任务要求硬移除。

- [ ] **Step 5: 运行聚焦测试**

Run: `pnpm vitest run tests/main/importBookFiles.test.ts tests/shared/ipcSchemas.test.ts tests/renderer/LibraryPage.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src tests
git commit -m "refactor: remove epub support"
```

---

### Task 2: 建立共享 Markdown 分析与稳定锚点

**Files:**

- Create: `src/shared/markdown/parseMarkdown.ts`
- Create: `src/shared/markdown/nodeId.ts`
- Create: `src/shared/markdown/analyzeMarkdown.ts`
- Modify: `src/shared/types.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Replace Test: `tests/main/MarkdownParser.test.ts` → `tests/shared/analyzeMarkdown.test.ts`

**Interfaces:**

- Produces: `parseMarkdown(markdown: string): Root`。
- Produces: `markdownNodeId(bookId: string, type: string, sourceStart: number): string`。
- Produces: `analyzeMarkdown(input: { bookId: string; markdown: string }): MarkdownAnalysis`。
- Produces types: `MarkdownBlock`, `Chapter`, `MarkdownAnalysis`, `BookDocument`。

- [ ] **Step 1: 增加直接依赖和类型依赖**

Run: `pnpm add mdast-util-to-string && pnpm add -D @types/mdast`

Expected: `package.json` 和 lockfile 更新；不引入第二套 Markdown parser。

- [ ] **Step 2: 写完整结构分析的失败测试**

````ts
it('从 CommonMark/GFM 派生有序 block、章节树和结构化文本', () => {
  const markdown =
    '# 第一章\n\n正文 **重点**。\n\n- A\n- B\n\n```ts\nconst x = 1\n```\n\n## 小节\n\n| A | B |\n| - | - |\n| 1 | 2 |';
  const result = analyzeMarkdown({ bookId: 'b1', markdown });
  expect(result.chapters.map(({ title, level }) => [title, level])).toEqual([
    ['第一章', 1],
    ['小节', 2],
  ]);
  expect(result.blocks.map(({ type }) => type)).toEqual([
    'heading',
    'paragraph',
    'list',
    'code',
    'heading',
    'table',
  ]);
  expect(result.blocks[0].id).toBe(markdownNodeId('b1', 'heading', 0));
  expect(result.blocks[1].chapterId).toBe(result.chapters[0].id);
  expect(result.structuredText).toContain('```ts\nconst x = 1\n```');
  expect(result.structuredText).toContain('| A | B |');
});

it('对同名、空章节、标题跳级和无标题文档生成确定结果', () => {
  const input = { bookId: 'b1', markdown: '# 重复\n## 重复\n#### 跳级\n# 空章节' };
  expect(analyzeMarkdown(input)).toEqual(analyzeMarkdown(input));
  expect(analyzeMarkdown(input).chapters).toHaveLength(4);
  expect(analyzeMarkdown({ bookId: 'b1', markdown: '只有正文' }).chapters).toEqual([]);
});
````

- [ ] **Step 3: 运行测试并确认模块缺失**

Run: `pnpm vitest run tests/shared/analyzeMarkdown.test.ts`

Expected: FAIL，`analyzeMarkdown` 尚不存在。

- [ ] **Step 4: 定义派生数据契约**

```ts
export interface MarkdownBlock {
  id: string;
  type: string;
  chapterId: string | null;
  order: number;
  sourceStart: number;
  sourceEnd: number;
  markdown: string;
  plainText: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  parentChapterId: string | null;
  headingBlockId: string;
  title: string;
  level: number;
  order: number;
  sourceStart: number;
  sourceEnd: number;
}

export interface MarkdownAnalysis {
  chapters: Chapter[];
  blocks: MarkdownBlock[];
  structuredText: string;
  plainText: string;
}

export interface BookDocument {
  book: Book;
  markdown: string;
  chapters: Chapter[];
  blocks: MarkdownBlock[];
  fullText: string;
}
```

- [ ] **Step 5: 实现唯一解析入口与确定性分析**

```ts
export function parseMarkdown(markdown: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
}

export function markdownNodeId(bookId: string, type: string, sourceStart: number): string {
  return `${bookId}-md-${type}-${sourceStart}`;
}

export function analyzeMarkdown({ bookId, markdown }: AnalyzeMarkdownInput): MarkdownAnalysis {
  const root = parseMarkdown(markdown);
  const topLevel = root.children.filter(hasPosition);
  const blocks = topLevel.map((node, order) => projectBlock(bookId, markdown, node, order));
  const chapters = buildChapterIndex(bookId, root, markdown.length);
  assignChapters(blocks, chapters);
  return {
    chapters,
    blocks,
    structuredText: blocks.map((block) => block.markdown).join('\n\n'),
    plainText: blocks
      .map((block) => block.plainText)
      .filter(Boolean)
      .join('\n\n'),
  };
}
```

`projectBlock()` 必须使用源码 slice 保存 GFM 结构，使用 `mdast-util-to-string` 生成可读纯文本；`buildChapterIndex()` 使用 heading stack 建立父子关系，chapter ID 等于 heading block ID。

- [ ] **Step 6: 运行分析测试和类型检查**

Run: `pnpm vitest run tests/shared/analyzeMarkdown.test.ts && pnpm lint:types`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml src/shared tests/shared tests/main/MarkdownParser.test.ts
git commit -m "feat: derive reading metadata from markdown"
```

---

### Task 3: 以 Markdown 文件重建书库与破坏性 schema

**Files:**

- Modify: `src/main/storage/schema.ts`
- Modify: `src/main/storage/database.ts`
- Modify: `src/main/library/LibraryService.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/main/databaseSchema.test.ts`
- Create Test: `tests/main/LibraryService.test.ts`

**Interfaces:**

- Consumes: `analyzeMarkdown()`。
- Produces: `SCHEMA_VERSION = 2`、`assertSchemaVersion(db)`。
- Produces: `BookDocument { book, markdown, chapters, blocks, fullText }`。

- [ ] **Step 1: 写新库和旧库拒绝测试**

```ts
it('新 schema 不保存 format、chapters 或 passages', () => {
  const db = createDatabase(':memory:');
  expect(tableNames(db)).not.toContain('chapters');
  expect(tableNames(db)).not.toContain('passages');
  expect(columnNames(db, 'books')).not.toContain('format');
  expect(readSchemaVersion(db)).toBe(2);
});

it('拒绝没有 schema version 的旧数据库且不删除数据', () => {
  const db = openDatabase(tempDbPath);
  db.exec("CREATE TABLE books (id TEXT PRIMARY KEY); INSERT INTO books VALUES ('legacy')");
  db.close();
  expect(() => createDatabase(tempDbPath)).toThrow('数据库版本不兼容，请手动删除');
  expect(openDatabase(tempDbPath).prepare('SELECT id FROM books').get()).toEqual({ id: 'legacy' });
});
```

- [ ] **Step 2: 运行测试并确认旧 schema 行为失败**

Run: `pnpm vitest run tests/main/databaseSchema.test.ts tests/main/LibraryService.test.ts`

Expected: FAIL，现有 schema 仍创建 `format`、`chapters`、`passages` 且无版本门禁。

- [ ] **Step 3: 实现空库初始化和严格版本门禁**

```ts
export const SCHEMA_VERSION = 2;

export function initializeSchema(db: AppDatabase): void {
  const tables = existingUserTables(db);
  if (tables.length === 0) {
    db.exec(schemaSql);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    return;
  }
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `数据库版本不兼容，请手动删除旧数据库后重试（当前 ${version}，需要 ${SCHEMA_VERSION}）。`,
    );
  }
}
```

新 `books` 表删除 `format`；新 `reading_threads` 与 `thread_messages` 暂时保留现有 target/reference JSON 列，Task 5 再一次性改为 block anchor，避免无测试的跨任务契约跳跃。

- [ ] **Step 4: 让 LibraryService 只持久化书籍元数据并从文件派生文档**

```ts
openBook(bookId: string): BookDocument {
  const book = this.requireBook(bookId);
  const markdown = fs.readFileSync(book.libraryFilePath, 'utf8');
  const analysis = analyzeMarkdown({ bookId, markdown });
  return {
    book: this.touchOpenedAt(book),
    markdown,
    chapters: analysis.chapters,
    blocks: analysis.blocks,
    fullText: analysis.structuredText,
  };
}
```

导入事务只插入 `books`；token estimate 使用 `analysis.structuredText`，解析失败不得留下记录。

- [ ] **Step 5: 运行数据库、LibraryService 和现有主进程测试**

Run: `pnpm vitest run tests/main/databaseSchema.test.ts tests/main/LibraryService.test.ts tests/main/ReadingActionService.test.ts tests/main/ThreadStore.test.ts`

Expected: PASS；若后两组因旧 fixture 字段失败，只更新 fixture 到新的 `BookDocument`，不得加入兼容分支。

- [ ] **Step 6: 提交**

```bash
git add src/main/storage src/main/library src/shared/types.ts tests/main
git commit -m "refactor: make markdown the reading source of truth"
```

---

### Task 4: 用语义化 Markdown Renderer 替换 passage 正文

**Files:**

- Create: `src/renderer/features/markdown-reading/MarkdownDocument.tsx`
- Create: `src/renderer/features/markdown-reading/MarkdownDocument.module.css`
- Create: `src/renderer/features/markdown-reading/remarkVisibleHtml.ts`
- Modify: `src/renderer/pages/reader-page/ReaderPage.tsx`
- Modify: `src/renderer/pages/reader-page/ReaderPage.module.css`
- Modify: `src/renderer/features/book-outline/BookOutline.tsx`
- Modify: `src/renderer/features/book-outline/useReadingPosition.ts`
- Test: `tests/renderer/MarkdownDocument.test.tsx`
- Test: `tests/renderer/ReaderPage.test.tsx`
- Test: `tests/renderer/useReadingPosition.test.ts`

**Interfaces:**

- Consumes: `BookDocument.markdown`, `.blocks`, `.chapters` 和 `markdownNodeId()`。
- Produces: `<MarkdownDocument bookId markdown blocks />`，DOM 上使用 `id={block.id}` 与 `data-block-id={block.id}`。

- [ ] **Step 1: 写语义与安全失败测试**

```tsx
it('按 Markdown 语义渲染标题、列表、代码、表格和链接', () => {
  render(<MarkdownDocument bookId="b1" markdown={fixture} blocks={analysis.blocks} />);
  expect(screen.getByRole('heading', { level: 1, name: '第一章' })).toHaveAttribute(
    'id',
    analysis.blocks[0].id,
  );
  expect(screen.getByRole('list')).toBeTruthy();
  expect(screen.getByText('const x = 1').closest('pre')).toBeTruthy();
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.getByRole('link', { name: '官网' })).toHaveAttribute('href', 'https://example.com');
});

it('不执行原始 HTML 或加载远程图片', () => {
  render(
    <MarkdownDocument
      bookId="b1"
      markdown={'<script>alert(1)</script>\n\n![远程](https://x.test/a.png)'}
      blocks={blocks}
    />,
  );
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('img[src^="http"]')).toBeNull();
  expect(screen.getByText(/不支持的 HTML|script/)).toBeTruthy();
  expect(screen.getByText('远程')).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试并确认组件缺失**

Run: `pnpm vitest run tests/renderer/MarkdownDocument.test.tsx tests/renderer/ReaderPage.test.tsx`

Expected: FAIL，`MarkdownDocument` 尚不存在，ReaderPage 仍遍历 passages。

- [ ] **Step 3: 实现受控组件映射**

```tsx
export function MarkdownDocument({ bookId, markdown, blocks }: Props) {
  const blockByStart = useMemo(
    () => new Map(blocks.map((block) => [block.sourceStart, block])),
    [blocks],
  );
  const propsFor = (node: RootContent) => {
    const block = node.position ? blockByStart.get(node.position.start.offset) : undefined;
    return block ? { id: block.id, 'data-block-id': block.id } : {};
  };
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkVisibleHtml]}
      skipHtml
      components={safeMarkdownComponents({ bookId, propsFor })}
    >
      {markdown}
    </ReactMarkdown>
  );
}
```

`remarkVisibleHtml` 在 mdast 阶段把每个 `html` 节点替换为普通 paragraph/text 节点，文本格式为 `[不支持的 HTML] ${node.value}`；随后 `skipHtml` 构成第二道防线。`safeMarkdownComponents()` 必须显式处理 `h1`–`h6`、`p`、`blockquote`、`ul`、`ol`、`li`、`code`、`pre`、`hr`、`table`、`a` 和 `img`；禁止 `rehype-raw` 和 `dangerouslySetInnerHTML`。外部链接点击先 `preventDefault()`，受控打开能力在 Task 7 接线。

```ts
export const remarkVisibleHtml: Plugin<[], Root> = () => (root) => {
  visit(root, 'html', (node, index, parent) => {
    if (parent && index !== undefined) {
      parent.children[index] = {
        type: 'paragraph',
        children: [{ type: 'text', value: `[不支持的 HTML] ${node.value}` }],
      };
    }
  });
};
```

- [ ] **Step 4: ReaderPage 改为渲染 Markdown 并导航 heading**

```tsx
<MarkdownDocument bookId={document.book.id} markdown={document.markdown} blocks={document.blocks} />
```

`navigateToChapter()` 使用 `chapter.headingBlockId`；`useReadingPosition()` 输入按 order 排序的 blocks 与 heading block ID，不再输入 passage。

- [ ] **Step 5: 增加语义排版 CSS 并运行聚焦测试**

Run: `pnpm vitest run tests/renderer/MarkdownDocument.test.tsx tests/renderer/ReaderPage.test.tsx tests/renderer/BookOutline.test.tsx tests/renderer/useReadingPosition.test.ts`

Expected: PASS；正文中标题只渲染一次，目录链接与正文 heading ID 一致。

- [ ] **Step 6: 提交**

```bash
git add src/renderer tests/renderer
git commit -m "feat: render complete markdown documents"
```

---

### Task 5: 将选区、引用和线程目标迁移到 block anchor

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/storage/schema.ts`
- Modify: `src/main/threads/ThreadStore.ts`
- Modify: `src/main/ai/ReadingActionService.ts`
- Modify: `src/renderer/features/reading-selection/renderedTextSelection.ts`
- Modify: `src/renderer/features/reading-selection/useReadingTargetNavigation.ts`
- Modify: `src/renderer/features/conversation/draftState.ts`
- Test: `tests/shared/ipcSchemas.test.ts`
- Test: `tests/main/ThreadStore.test.ts`
- Test: `tests/main/ReadingActionService.test.ts`
- Test: `tests/renderer/renderedTextSelection.test.ts`

**Interfaces:**

- Produces: `RenderedTextPosition { blockId: string; offsetInBlock: number }`。
- `RenderedTextSelection` 产生 `start: RenderedTextPosition` 与 `end: RenderedTextPosition`。
- `ReadingTarget`/`MessageReference` 删除 passage ID 与散落 offset 字段，改用 nullable `start`/`end`。

- [ ] **Step 1: 写跨 block 选区与 IPC 失败测试**

```ts
it('把跨 block DOM Range 保存为渲染文本位置', () => {
  const snapshot = createSelectionTargetFromDOMSelection(
    selectionForRange('block-a', 2, 'block-b', 3),
    chapters,
    blocks,
  );
  expect(snapshot).toMatchObject({
    start: { blockId: 'block-a', offsetInBlock: 2 },
    end: { blockId: 'block-b', offsetInBlock: 3 },
  });
});

it('拒绝旧 passage 引用契约', () => {
  expect(() => parseIpcInput('ai:create', schema, legacyPassageTarget)).toThrow('IPC 参数无效');
});
```

- [ ] **Step 2: 运行测试并确认旧契约失败原因正确**

Run: `pnpm vitest run tests/renderer/renderedTextSelection.test.ts tests/shared/ipcSchemas.test.ts tests/main/ThreadStore.test.ts`

Expected: FAIL，类型和 store 仍要求 `startPassageId/endPassageId`。

- [ ] **Step 3: 一次性替换共享与数据库契约**

```ts
export interface RenderedTextPosition {
  blockId: string;
  offsetInBlock: number;
}

export interface RenderedTextSelection {
  selectedText: string;
  start: RenderedTextPosition;
  end: RenderedTextPosition;
}
```

`reading_threads` 使用 `target_start_block_id/target_start_offset/target_end_block_id/target_end_offset`；`thread_messages.reference_json` 保存同一结构。因为旧库不兼容，不保留旧列读取 fallback。

- [ ] **Step 4: 更新 DOM 选区与渲染文本位置的双向转换**

```ts
function renderedTextPositionFromDOMBoundary(
  node: Node,
  offset: number,
): RenderedTextPosition | null {
  const element = parentElement(node)?.closest<HTMLElement>('[data-block-id]');
  if (!element?.dataset.blockId) {
    return null;
  }
  return {
    blockId: element.dataset.blockId,
    offsetInBlock: textOffsetWithin(element, node, offset),
  };
}
```

`useReadingTargetNavigation` 通过 `blockId` 定位 DOM block，再用 TreeWalker 按 `offsetInBlock` 恢复 Range；找不到 block 时显示现有 notice，不猜测相邻节点。

- [ ] **Step 5: 更新 ThreadStore、ReadingActionService 和 fixture**

所有 `startPassageId/endPassageId` 查找改为 `start.blockId/end.blockId`；验证 chapter target 必须有 `chapterId`，selection target 必须有完整 start/end 且 offset 非负。

- [ ] **Step 6: 运行契约、存储和 renderer 测试**

Run: `pnpm vitest run tests/shared/ipcSchemas.test.ts tests/main/ThreadStore.test.ts tests/main/ReadingActionService.test.ts tests/renderer/renderedTextSelection.test.ts tests/renderer/draftState.test.ts tests/renderer/ReaderPage.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/shared src/main src/renderer tests
git commit -m "refactor: anchor reading references to markdown blocks"
```

---

### Task 6: 让 AI 上下文消费 Markdown block

**Files:**

- Modify: `src/main/ai/ContextAssembler.ts`
- Modify: `src/main/ai/ReadingActionService.ts`
- Test: `tests/main/ContextAssembler.test.ts`
- Test: `tests/main/ReadingActionService.test.ts`

**Interfaces:**

- Consumes: `BookDocument.blocks`、`Chapter.sourceStart/sourceEnd`、block anchors。
- Produces: `blocksInChapter(document, chapterId)` 和按 token 预算压缩的结构化 Markdown。

- [ ] **Step 1: 写结构保留和去重失败测试**

````ts
it('完整上下文保留标题、列表、引用、代码、表格和脚注', () => {
  const result = assembleContext(inputWithRichMarkdown);
  const content = result.messages[0].content;
  expect(content).toContain('# 第一章');
  expect(content).toContain('- 第一项');
  expect(content).toContain('> 引用');
  expect(content).toContain('```ts');
  expect(content).toContain('| A | B |');
  expect(content).toContain('[^1]: 注释');
});

it('hybrid 已包含目标章节时不重复相同 block', () => {
  const result = assembleContext(hybridInput);
  expect(result.coveredBlockIds).toEqual(expect.arrayContaining(chapterBlockIds));
  expect(result.messages[0].content.split('唯一代码片段')).toHaveLength(2);
});
````

- [ ] **Step 2: 运行测试并确认 assembler 仍依赖 passages**

Run: `pnpm vitest run tests/main/ContextAssembler.test.ts tests/main/ReadingActionService.test.ts`

Expected: FAIL，当前实现按 `passage.chapterId` 取正文。

- [ ] **Step 3: 按源码范围选择 block 并保留 Markdown**

```ts
function blocksInChapter(document: BookDocument, chapterId: string | null): MarkdownBlock[] {
  if (!chapterId) {
    return [];
  }
  return document.blocks.filter((block) => block.chapterId === chapterId);
}

function renderBlocks(blocks: MarkdownBlock[]): string {
  return blocks.map((block) => block.markdown).join('\n\n');
}
```

compressed/hybrid 的抽样、预算与 `coveredPassageIds` 全部改为 block 语义；对 list/table/code 等单个 block 不从中间截断，超预算时按现有降级原因返回明确结果。

- [ ] **Step 4: 运行 AI 测试**

Run: `pnpm vitest run tests/main/ContextAssembler.test.ts tests/main/ReadingActionService.test.ts`

Expected: PASS，输出中结构存在且目标 block 不重复。

- [ ] **Step 5: 提交**

```bash
git add src/main/ai tests/main
git commit -m "refactor: assemble ai context from markdown blocks"
```

---

### Task 7: 安全处理链接与 Markdown 图片资源

**Files:**

- Create: `src/main/library/MarkdownResourceService.ts`
- Modify: `src/main/library/LibraryService.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/whisperApi.ts`
- Modify: `src/shared/ipcSchemas.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/features/markdown-reading/MarkdownDocument.tsx`
- Test: `tests/main/MarkdownResourceService.test.ts`
- Test: `tests/renderer/MarkdownDocument.test.tsx`

**Interfaces:**

- Produces: `copyMarkdownResources({ markdownPath, bookDir, root }): ResourceManifest`。
- Produces preload APIs: `books.readResource({ bookId, resourceId })` 与 `shell.openExternal({ url })`，均有严格 schema。

- [ ] **Step 1: 写路径越界、远程资源和安全链接失败测试**

```ts
it('只复制 Markdown 同目录树内被引用的本地图片', () => {
  const allowedImage = 'images/' + 'a.png';
  const escapedImage = '..' + '/secret.png';
  const remoteImage = 'https://' + 'x.test/a.png';
  const manifest = service.copyMarkdownResources({
    markdownPath: '/books/a/book.md',
    bookDir,
    root: parseMarkdown(
      [
        markdownImage('ok', allowedImage),
        markdownImage('bad', escapedImage),
        markdownImage('remote', remoteImage),
      ].join('\n'),
    ),
  });
  expect(manifest.entries).toHaveLength(1);
  expect(manifest.blocked).toEqual(expect.arrayContaining([escapedImage, remoteImage]));
});

it.each(['javascript:alert(1)', 'file:///etc/passwd'])('阻止危险链接 %s', (url) => {
  renderDocumentWithLink(url);
  fireEvent.click(screen.getByRole('link'));
  expect(api.shell.openExternal).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试并确认资源服务和白名单 API 缺失**

Run: `pnpm vitest run tests/main/MarkdownResourceService.test.ts tests/renderer/MarkdownDocument.test.tsx tests/shared/ipcSchemas.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现资源清单和路径验证**

```ts
function resolveAllowedLocalResource(markdownDir: string, reference: string): string | null {
  const root = path.resolve(markdownDir);
  const candidate = path.resolve(root, decodeURIComponent(reference));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return candidate;
}
```

仅处理 mdast `image` 的相对路径；复制到 `bookDir/resources/<resourceId>`，manifest 保存原引用、MIME 和受控 ID。缺失或越界资源记录降级结果，不阻断正文导入。

- [ ] **Step 4: 增加最小白名单能力**

`readResource` 只接受数据库中属于该 book 的 resource ID，返回 MIME 与 bytes/data URL；不得接受任意路径。`openExternal` 只接受 `https:`、`http:` 和 `mailto:`，Main Process 再校验一次后调用 Electron `shell.openExternal`。

- [ ] **Step 5: Renderer 接线与降级**

本地图片异步读取成功后展示；远程、越界、缺失和 SVG 主动内容展示包含 alt 的占位。链接点击统一走受控 API，失败时给出页面 notice。

- [ ] **Step 6: 运行资源、IPC 和 renderer 测试**

Run: `pnpm vitest run tests/main/MarkdownResourceService.test.ts tests/shared/ipcSchemas.test.ts tests/renderer/MarkdownDocument.test.tsx tests/renderer/ReaderPage.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/main/library src/main/ipc src/preload src/shared src/renderer tests
git commit -m "feat: load markdown resources through safe boundaries"
```

---

### Task 8: 清理旧模型、完成回归与人工验收

**Files:**

- Modify: all remaining files reported by the searches below
- Modify: `ARCHITECTURE.md`
- Modify: `docs/MANUAL_TESTING.md`
- Move after completion: `docs/specs/active/2026-07-16-markdown-only-reading.md` → `docs/specs/completed/2026-07-16-markdown-only-reading.md`
- Move after completion: `docs/plans/active/2026-07-16-markdown-only-reading.md` → `docs/plans/completed/2026-07-16-markdown-only-reading.md`

**Interfaces:**

- Consumes: all prior task contracts。
- Produces: Markdown-only repository with no old passage/EPUB runtime path。

- [ ] **Step 1: 运行残留扫描并逐项分类**

Run: `rg -n "epub|EPUB|importEpub|BookFormat|startPassageId|endPassageId|coveredPassageIds|document\.passages|passage_order|source_href" src tests`

Expected: 无输出；源码和测试无旧运行时标识符。文档中的历史背景不属于运行时残留。

- [ ] **Step 2: 删除旧实现并更新架构文档**

`ARCHITECTURE.md` 的导入与阅读数据流改为：

```text
Markdown file
  -> LibraryService copies authoritative source
  -> shared mdast analysis derives chapters and blocks
  -> Renderer renders Markdown semantically
  -> ContextAssembler projects blocks for AI
```

删除已无引用的 parser、mapper、类型、CSS 和 fixture，不保留 deprecated alias 或 fallback。

- [ ] **Step 3: 补充人工验收清单**

在 `docs/MANUAL_TESTING.md` 增加：标题与目录定位、CommonMark/GFM fixture、跨 block 选区、代码/宽表格、脚注、外部链接、远程/越界/缺失图片、原始 HTML、安全错误和旧数据库版本提示。

- [ ] **Step 4: 运行完整验证**

Run: `pnpm check`

Expected: harness、format、lint、types、全部 Vitest、build 全部 exit 0，无 warning。

- [ ] **Step 5: 执行人工验收并记录结果**

Run: `pnpm dev`

Expected: 使用包含标题、链接、图片、嵌套列表、引用、代码、表格和脚注的真实 `.md` 完成清单；确认目录定位标题、选区引用与 AI 上下文工作。把日期、平台、fixture 和结果写回 `docs/MANUAL_TESTING.md`。

- [ ] **Step 6: 移动完成文档并再次验证引用**

```bash
mkdir -p docs/specs/completed docs/plans/completed
git mv docs/specs/active/2026-07-16-markdown-only-reading.md docs/specs/completed/
git mv docs/plans/active/2026-07-16-markdown-only-reading.md docs/plans/completed/
rg -n "2026-07-16-markdown-only-reading" docs README.md ARCHITECTURE.md
```

Expected: 所有导航引用指向 `completed/`。

- [ ] **Step 7: 最终提交**

```bash
git add ARCHITECTURE.md docs src tests
git commit -m "docs: complete markdown reading rebuild"
```

- [ ] **Step 8: 提交后重新运行完成门禁**

Run: `pnpm check && git status --short`

Expected: `pnpm check` exit 0，`git status --short` 无输出。
