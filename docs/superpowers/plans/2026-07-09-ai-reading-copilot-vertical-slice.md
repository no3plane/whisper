# AI 阅读伴侣纵向切片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出第一条可运行的 AI 阅读伴侣闭环：独立 Electron 客户端、React 阅读器、Markdown 导入、模型设置、选中文本、右侧独立 tab、一次 `full_book` 白话解释请求。

**Architecture:** 使用 Electron Main Process 承载本地能力，Renderer 使用 React/Vite/TypeScript 构建界面，Preload 暴露受控的 `window.whisper` IPC API。第一版先实现 Markdown 导入和一个阅读动作，SQLite 保存书籍、passage、设置和 thread，AI 调用通过 OpenAI-compatible provider 走 Vercel AI SDK。

**Tech Stack:** Electron、React、Vite、TypeScript、Vitest、SQLite better-sqlite3、Vercel AI SDK、remark、unified、zod。

---

## 范围说明

本计划只实现设计文档中的第一条纵向切片：

- Electron + React/Vite/TypeScript 应用骨架。
- 本地 SQLite 数据库。
- OpenAI-compatible 设置保存与测试连接。
- Markdown 导入、章节和 passage 解析。
- 书库页和阅读器页。
- 选中文本后创建右侧 AI tab。
- `full_book` 上下文策略。
- 一个阅读动作：白话解释。
- 当前 tab 内追问。

暂不实现：

- EPUB 导入。
- 问题地图预处理。
- `compressed_book` 和 `hybrid`。
- 结构定位、概念解释、背景补全、举例 / 类比。
- 打包发布。

这些功能在纵向切片跑通后单独写后续计划。

## 文件结构

```text
package.json
tsconfig.json
tsconfig.node.json
vite.config.ts
vitest.config.ts
electron.vite.config.ts
index.html
src/
  shared/
    types.ts
    ipc.ts
  main/
    index.ts
    ipc/registerIpc.ts
    storage/database.ts
    storage/schema.ts
    settings/SettingsService.ts
    library/MarkdownParser.ts
    library/LibraryService.ts
    ai/ContextAssembler.ts
    ai/AIProvider.ts
    ai/ReadingActionService.ts
    threads/ThreadStore.ts
  preload/
    index.ts
  renderer/
    main.tsx
    App.tsx
    styles.css
    api/whisper.ts
    pages/LibraryPage.tsx
    pages/ReaderPage.tsx
    components/SettingsPanel.tsx
    components/RightAiPanel.tsx
    components/SelectionMenu.tsx
tests/
  main/
    MarkdownParser.test.ts
    ContextAssembler.test.ts
    ThreadStore.test.ts
```

职责边界：

- `shared/`：Renderer、Preload、Main 共用类型和 IPC channel 常量。
- `main/storage/`：SQLite 连接和 schema 初始化。
- `main/settings/`：模型配置保存、读取、校验。
- `main/library/`：导入文件、解析 Markdown、保存书籍和 passage。
- `main/ai/`：上下文组装、模型调用、阅读动作。
- `main/threads/`：右侧 AI tab/thread 的持久化。
- `preload/`：只暴露安全的 `window.whisper` API。
- `renderer/`：React UI。

---

### Task 1: 初始化 Electron + React + TypeScript 工程

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `electron.vite.config.ts`
- Create: `index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles.css`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`

- [ ] **Step 1: 创建 package.json**

写入：

```json
{
  "name": "whisper-reading-copilot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc --noEmit && electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint:types": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/openai": "^1.3.22",
    "@vitejs/plugin-react": "^4.3.4",
    "ai": "^4.3.16",
    "better-sqlite3": "^11.10.0",
    "electron": "^35.2.0",
    "electron-vite": "^3.1.0",
    "github-slugger": "^2.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "remark": "^15.0.1",
    "remark-parse": "^11.0.0",
    "typescript": "^5.8.3",
    "unified": "^11.0.5",
    "unist-util-visit": "^5.0.0",
    "zod": "^3.24.3"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.14.1",
    "@types/react": "^19.0.12",
    "@types/react-dom": "^19.0.4",
    "jsdom": "^26.0.0",
    "vite": "^6.2.6",
    "vitest": "^3.1.1"
  }
}
```

- [ ] **Step 2: 创建 TypeScript 配置**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "electron.vite.config.ts"]
}
```

`tsconfig.node.json`：

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "electron.vite.config.ts"]
}
```

- [ ] **Step 3: 创建 Vite 与 Electron Vite 配置**

`vite.config.ts`：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
});
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

`electron.vite.config.ts`：

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: 'src/preload/index.ts',
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
```

- [ ] **Step 4: 创建最小 UI 和 Electron 入口**

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Whisper Reading Copilot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx`：

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/renderer/App.tsx`：

```tsx
export function App() {
  return (
    <main className="app-shell">
      <h1>Whisper Reading Copilot</h1>
      <p>AI 阅读伴侣正在启动。</p>
    </main>
  );
}
```

`src/renderer/styles.css`：

```css
:root {
  color: #1f2933;
  background: #f7f4ee;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  padding: 32px;
}
```

`src/main/index.ts`：

```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

`src/preload/index.ts`：

```ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('whisper', {
  version: '0.1.0',
});
```

- [ ] **Step 5: 安装依赖**

Run:

```bash
npm install
```

Expected: `package-lock.json` 被创建，依赖安装成功。

- [ ] **Step 6: 验证类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0.

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts electron.vite.config.ts index.html src
git commit -m "feat: scaffold electron react app"
```

---

### Task 2: 定义共享类型与 IPC API

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/api/whisper.ts`

- [ ] **Step 1: 创建共享类型**

`src/shared/types.ts`：

```ts
export type BookFormat = 'markdown' | 'epub';
export type PreprocessStatus = 'not_started' | 'running' | 'ready' | 'failed';
export type ContextStrategy = 'full_book' | 'compressed_book' | 'hybrid';
export type ReadingActionType = 'plain_explanation';

export interface Book {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  originalFilePath: string;
  libraryFilePath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  preprocessStatus: PreprocessStatus;
  tokenEstimate: number;
  defaultContextStrategy: ContextStrategy;
}

export interface Chapter {
  id: string;
  bookId: string;
  parentChapterId: string | null;
  title: string;
  level: number;
  order: number;
  startPassageId: string;
  endPassageId: string;
  summary: string | null;
}

export interface Passage {
  id: string;
  bookId: string;
  chapterId: string | null;
  order: number;
  text: string;
  sourceHref: string | null;
  sourceOffset: number;
}

export interface BookDocument {
  book: Book;
  chapters: Chapter[];
  passages: Passage[];
  fullText: string;
}

export interface AISettings {
  baseURL: string;
  apiKey: string;
  model: string;
  contextWindow: number;
  defaultContextStrategy: ContextStrategy;
}

export interface ReadingThread {
  id: string;
  bookId: string;
  chapterId: string | null;
  passageId: string | null;
  title: string;
  actionType: ReadingActionType;
  selectedText: string;
  contextStrategy: ContextStrategy;
  createdAt: string;
  updatedAt: string;
  status: 'streaming' | 'ready' | 'failed';
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model: string | null;
  tokenUsage: number | null;
  contextStrategy: ContextStrategy | null;
}

export interface ImportBookInput {
  filePath: string;
}

export interface RunReadingActionInput {
  bookId: string;
  selectedText: string;
  passageId: string | null;
  actionType: ReadingActionType;
  contextStrategy: ContextStrategy;
}

export interface FollowUpInput {
  threadId: string;
  question: string;
}
```

- [ ] **Step 2: 创建 IPC channel 常量**

`src/shared/ipc.ts`：

```ts
export const ipcChannels = {
  settingsGet: 'settings.get',
  settingsSave: 'settings.save',
  settingsTestConnection: 'settings.testConnection',
  booksImportMarkdown: 'books.importMarkdown',
  booksList: 'books.list',
  booksOpen: 'books.open',
  aiRunReadingAction: 'ai.runReadingAction',
  aiFollowUp: 'ai.followUp',
  threadsListByBook: 'threads.listByBook',
} as const;
```

- [ ] **Step 3: 扩展 preload 类型与 API**

`src/preload/index.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels } from '../shared/ipc';
import type {
  AISettings,
  Book,
  BookDocument,
  FollowUpInput,
  ImportBookInput,
  ReadingThread,
  RunReadingActionInput,
  ThreadMessage,
} from '../shared/types';

const whisper = {
  settings: {
    get: () => ipcRenderer.invoke(ipcChannels.settingsGet) as Promise<AISettings | null>,
    save: (settings: AISettings) => ipcRenderer.invoke(ipcChannels.settingsSave, settings) as Promise<void>,
    testConnection: (settings: AISettings) =>
      ipcRenderer.invoke(ipcChannels.settingsTestConnection, settings) as Promise<{ ok: boolean; message: string }>,
  },
  books: {
    importMarkdown: (input: ImportBookInput) =>
      ipcRenderer.invoke(ipcChannels.booksImportMarkdown, input) as Promise<Book>,
    list: () => ipcRenderer.invoke(ipcChannels.booksList) as Promise<Book[]>,
    open: (bookId: string) => ipcRenderer.invoke(ipcChannels.booksOpen, bookId) as Promise<BookDocument>,
  },
  ai: {
    runReadingAction: (input: RunReadingActionInput) =>
      ipcRenderer.invoke(ipcChannels.aiRunReadingAction, input) as Promise<{ thread: ReadingThread; messages: ThreadMessage[] }>,
    followUp: (input: FollowUpInput) =>
      ipcRenderer.invoke(ipcChannels.aiFollowUp, input) as Promise<{ thread: ReadingThread; messages: ThreadMessage[] }>,
  },
  threads: {
    listByBook: (bookId: string) =>
      ipcRenderer.invoke(ipcChannels.threadsListByBook, bookId) as Promise<ReadingThread[]>,
  },
};

contextBridge.exposeInMainWorld('whisper', whisper);

export type WhisperApi = typeof whisper;
```

- [ ] **Step 4: 创建 Renderer 侧类型声明**

`src/renderer/api/whisper.ts`：

```ts
import type { WhisperApi } from '../../preload';

declare global {
  interface Window {
    whisper: WhisperApi;
  }
}

export const whisper = window.whisper;
```

- [ ] **Step 5: 类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0.

- [ ] **Step 6: 提交**

```bash
git add src/shared src/preload/index.ts src/renderer/api/whisper.ts
git commit -m "feat: define shared ipc api"
```

---

### Task 3: SQLite 数据库与 SettingsService

**Files:**
- Create: `src/main/storage/schema.ts`
- Create: `src/main/storage/database.ts`
- Create: `src/main/settings/SettingsService.ts`
- Create: `src/main/ipc/registerIpc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 创建 schema**

`src/main/storage/schema.ts`：

```ts
export const schemaSql = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  library_file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT,
  preprocess_status TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  default_context_strategy TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  parent_chapter_id TEXT,
  title TEXT NOT NULL,
  level INTEGER NOT NULL,
  chapter_order INTEGER NOT NULL,
  start_passage_id TEXT NOT NULL,
  end_passage_id TEXT NOT NULL,
  summary TEXT,
  FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter_id TEXT,
  passage_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  source_href TEXT,
  source_offset INTEGER NOT NULL,
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(chapter_id) REFERENCES chapters(id)
);

CREATE TABLE IF NOT EXISTS reading_threads (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter_id TEXT,
  passage_id TEXT,
  title TEXT NOT NULL,
  action_type TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  context_strategy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY(book_id) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS thread_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model TEXT,
  token_usage INTEGER,
  context_strategy TEXT,
  FOREIGN KEY(thread_id) REFERENCES reading_threads(id)
);
`;
```

- [ ] **Step 2: 创建数据库连接**

`src/main/storage/database.ts`：

```ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { schemaSql } from './schema';

export type AppDatabase = Database.Database;

export function getAppDataDir() {
  const dir = path.join(app.getPath('userData'), 'whisper-data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createDatabase(dbPath = path.join(getAppDataDir(), 'whisper.sqlite')) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(schemaSql);
  return db;
}
```

- [ ] **Step 3: 创建 SettingsService**

`src/main/settings/SettingsService.ts`：

```ts
import type { AppDatabase } from '../storage/database';
import type { AISettings } from '../../shared/types';

const SETTINGS_KEY = 'ai';

export class SettingsService {
  constructor(private readonly db: AppDatabase) {}

  getAISettings(): AISettings | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as { value: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as AISettings;
  }

  saveAISettings(settings: AISettings): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(SETTINGS_KEY, JSON.stringify(settings));
  }
}
```

- [ ] **Step 4: 创建 IPC 注册**

`src/main/ipc/registerIpc.ts`：

```ts
import { ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import type { AISettings } from '../../shared/types';
import type { SettingsService } from '../settings/SettingsService';

export interface IpcServices {
  settings: SettingsService;
}

export function registerIpc(services: IpcServices) {
  ipcMain.handle(ipcChannels.settingsGet, () => services.settings.getAISettings());

  ipcMain.handle(ipcChannels.settingsSave, (_event, settings: AISettings) => {
    services.settings.saveAISettings(settings);
  });

  ipcMain.handle(ipcChannels.settingsTestConnection, () => ({
    ok: true,
    message: '设置 API 已连通；模型连接将在 AIProvider 任务中实现。',
  }));
}
```

- [ ] **Step 5: 在 main 入口初始化数据库与 IPC**

将 `src/main/index.ts` 改为：

```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc } from './ipc/registerIpc';
import { SettingsService } from './settings/SettingsService';
import { createDatabase } from './storage/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const db = createDatabase();
  registerIpc({
    settings: new SettingsService(db),
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 6: 类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0.

- [ ] **Step 7: 提交**

```bash
git add src/main
git commit -m "feat: add sqlite settings service"
```

---

### Task 4: MarkdownParser

**Files:**
- Create: `src/main/library/MarkdownParser.ts`
- Create: `tests/main/MarkdownParser.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/main/MarkdownParser.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { MarkdownParser } from '../../src/main/library/MarkdownParser';

describe('MarkdownParser', () => {
  it('把 markdown 标题解析成章节并生成 passage', () => {
    const parser = new MarkdownParser();
    const result = parser.parse({
      bookId: 'book-1',
      markdown: '# 第一章\n\n这是第一段。\n\n这是第二段。\n\n## 小节\n\n这是第三段。',
    });

    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]).toMatchObject({
      bookId: 'book-1',
      title: '第一章',
      level: 1,
      order: 0,
    });
    expect(result.chapters[1]).toMatchObject({
      title: '小节',
      level: 2,
      order: 1,
    });
    expect(result.passages.map((passage) => passage.text)).toEqual(['这是第一段。', '这是第二段。', '这是第三段。']);
    expect(result.fullText).toContain('这是第三段。');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/main/MarkdownParser.test.ts
```

Expected: FAIL because `MarkdownParser` does not exist.

- [ ] **Step 3: 实现 MarkdownParser**

`src/main/library/MarkdownParser.ts`：

```ts
import GithubSlugger from 'github-slugger';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Chapter, Passage } from '../../shared/types';

interface ParseInput {
  bookId: string;
  markdown: string;
}

interface ParseResult {
  chapters: Chapter[];
  passages: Passage[];
  fullText: string;
}

interface HeadingNode {
  type: 'heading';
  depth: number;
  children?: Array<{ type: string; value?: string }>;
}

interface ParagraphNode {
  type: 'paragraph';
  children?: Array<{ type: string; value?: string }>;
}

function textFromChildren(children: Array<{ type: string; value?: string }> | undefined) {
  return (children ?? [])
    .map((child) => child.value ?? '')
    .join('')
    .trim();
}

export class MarkdownParser {
  parse(input: ParseInput): ParseResult {
    const tree = unified().use(remarkParse).parse(input.markdown);
    const slugger = new GithubSlugger();
    const chapters: Chapter[] = [];
    const passages: Passage[] = [];
    let currentChapterId: string | null = null;

    visit(tree, (node) => {
      if (node.type === 'heading') {
        const heading = node as HeadingNode;
        const title = textFromChildren(heading.children);
        const id = `${input.bookId}-chapter-${slugger.slug(title || `chapter-${chapters.length}`)}`;
        currentChapterId = id;
        chapters.push({
          id,
          bookId: input.bookId,
          parentChapterId: null,
          title: title || `未命名章节 ${chapters.length + 1}`,
          level: heading.depth,
          order: chapters.length,
          startPassageId: '',
          endPassageId: '',
          summary: null,
        });
      }

      if (node.type === 'paragraph') {
        const paragraph = node as ParagraphNode;
        const text = textFromChildren(paragraph.children);
        if (!text) return;
        const passage: Passage = {
          id: `${input.bookId}-passage-${passages.length}`,
          bookId: input.bookId,
          chapterId: currentChapterId,
          order: passages.length,
          text,
          sourceHref: null,
          sourceOffset: passages.length,
        };
        passages.push(passage);
      }
    });

    for (const chapter of chapters) {
      const chapterPassages = passages.filter((passage) => passage.chapterId === chapter.id);
      chapter.startPassageId = chapterPassages[0]?.id ?? '';
      chapter.endPassageId = chapterPassages.at(-1)?.id ?? '';
    }

    return {
      chapters,
      passages,
      fullText: passages.map((passage) => passage.text).join('\n\n'),
    };
  }
}
```

- [ ] **Step 4: 测试通过**

Run:

```bash
npm test -- tests/main/MarkdownParser.test.ts
```

Expected: PASS.

- [ ] **Step 5: 类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0.

- [ ] **Step 6: 提交**

```bash
git add src/main/library/MarkdownParser.ts tests/main/MarkdownParser.test.ts
git commit -m "feat: parse markdown books"
```

---

### Task 5: LibraryService 与 Markdown 导入 IPC

**Files:**
- Create: `src/main/library/LibraryService.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 实现 LibraryService**

`src/main/library/LibraryService.ts`：

```ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AppDatabase } from '../storage/database';
import { getAppDataDir } from '../storage/database';
import { MarkdownParser } from './MarkdownParser';
import type { Book, BookDocument, ContextStrategy } from '../../shared/types';

function now() {
  return new Date().toISOString();
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}

export class LibraryService {
  private readonly parser = new MarkdownParser();

  constructor(private readonly db: AppDatabase) {}

  importMarkdown(filePath: string): Book {
    const id = crypto.randomUUID();
    const title = path.basename(filePath, path.extname(filePath));
    const libraryDir = path.join(getAppDataDir(), 'books', id);
    fs.mkdirSync(libraryDir, { recursive: true });
    const libraryFilePath = path.join(libraryDir, path.basename(filePath));
    fs.copyFileSync(filePath, libraryFilePath);

    const markdown = fs.readFileSync(libraryFilePath, 'utf8');
    const parsed = this.parser.parse({ bookId: id, markdown });
    const timestamp = now();
    const strategy: ContextStrategy = 'full_book';

    const book: Book = {
      id,
      title,
      author: null,
      format: 'markdown',
      originalFilePath: filePath,
      libraryFilePath,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
      preprocessStatus: 'not_started',
      tokenEstimate: estimateTokens(parsed.fullText),
      defaultContextStrategy: strategy,
    };

    const insertBook = this.db.prepare(`
      INSERT INTO books (
        id, title, author, format, original_file_path, library_file_path, created_at, updated_at,
        last_opened_at, preprocess_status, token_estimate, default_context_strategy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertChapter = this.db.prepare(`
      INSERT INTO chapters (
        id, book_id, parent_chapter_id, title, level, chapter_order, start_passage_id, end_passage_id, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPassage = this.db.prepare(`
      INSERT INTO passages (
        id, book_id, chapter_id, passage_order, text, source_href, source_offset
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertBook.run(
        book.id,
        book.title,
        book.author,
        book.format,
        book.originalFilePath,
        book.libraryFilePath,
        book.createdAt,
        book.updatedAt,
        book.lastOpenedAt,
        book.preprocessStatus,
        book.tokenEstimate,
        book.defaultContextStrategy,
      );

      for (const chapter of parsed.chapters) {
        insertChapter.run(
          chapter.id,
          chapter.bookId,
          chapter.parentChapterId,
          chapter.title,
          chapter.level,
          chapter.order,
          chapter.startPassageId,
          chapter.endPassageId,
          chapter.summary,
        );
      }

      for (const passage of parsed.passages) {
        insertPassage.run(
          passage.id,
          passage.bookId,
          passage.chapterId,
          passage.order,
          passage.text,
          passage.sourceHref,
          passage.sourceOffset,
        );
      }
    });

    tx();
    return book;
  }

  listBooks(): Book[] {
    const rows = this.db.prepare('SELECT * FROM books ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
    return rows.map(this.mapBookRow);
  }

  openBook(bookId: string): BookDocument {
    const bookRow = this.db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as Record<string, unknown> | undefined;
    if (!bookRow) throw new Error(`找不到书籍：${bookId}`);

    const chapters = this.db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_order ASC').all(bookId) as Array<Record<string, unknown>>;
    const passages = this.db.prepare('SELECT * FROM passages WHERE book_id = ? ORDER BY passage_order ASC').all(bookId) as Array<Record<string, unknown>>;

    this.db.prepare('UPDATE books SET last_opened_at = ? WHERE id = ?').run(now(), bookId);

    return {
      book: this.mapBookRow(bookRow),
      chapters: chapters.map((row) => ({
        id: row.id as string,
        bookId: row.book_id as string,
        parentChapterId: row.parent_chapter_id as string | null,
        title: row.title as string,
        level: row.level as number,
        order: row.chapter_order as number,
        startPassageId: row.start_passage_id as string,
        endPassageId: row.end_passage_id as string,
        summary: row.summary as string | null,
      })),
      passages: passages.map((row) => ({
        id: row.id as string,
        bookId: row.book_id as string,
        chapterId: row.chapter_id as string | null,
        order: row.passage_order as number,
        text: row.text as string,
        sourceHref: row.source_href as string | null,
        sourceOffset: row.source_offset as number,
      })),
      fullText: passages.map((row) => row.text as string).join('\n\n'),
    };
  }

  private mapBookRow(row: Record<string, unknown>): Book {
    return {
      id: row.id as string,
      title: row.title as string,
      author: row.author as string | null,
      format: row.format as Book['format'],
      originalFilePath: row.original_file_path as string,
      libraryFilePath: row.library_file_path as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastOpenedAt: row.last_opened_at as string | null,
      preprocessStatus: row.preprocess_status as Book['preprocessStatus'],
      tokenEstimate: row.token_estimate as number,
      defaultContextStrategy: row.default_context_strategy as Book['defaultContextStrategy'],
    };
  }
}
```

- [ ] **Step 2: 修改 IPC 注册**

将 `src/main/ipc/registerIpc.ts` 改为：

```ts
import { ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc';
import type { AISettings, ImportBookInput } from '../../shared/types';
import type { LibraryService } from '../library/LibraryService';
import type { SettingsService } from '../settings/SettingsService';

export interface IpcServices {
  settings: SettingsService;
  library: LibraryService;
}

export function registerIpc(services: IpcServices) {
  ipcMain.handle(ipcChannels.settingsGet, () => services.settings.getAISettings());

  ipcMain.handle(ipcChannels.settingsSave, (_event, settings: AISettings) => {
    services.settings.saveAISettings(settings);
  });

  ipcMain.handle(ipcChannels.settingsTestConnection, () => ({
    ok: true,
    message: '设置 API 已连通；模型连接将在 AIProvider 任务中实现。',
  }));

  ipcMain.handle(ipcChannels.booksImportMarkdown, (_event, input: ImportBookInput) =>
    services.library.importMarkdown(input.filePath),
  );

  ipcMain.handle(ipcChannels.booksList, () => services.library.listBooks());

  ipcMain.handle(ipcChannels.booksOpen, (_event, bookId: string) => services.library.openBook(bookId));
}
```

- [ ] **Step 3: main 入口注入 LibraryService**

修改 `src/main/index.ts` 的 imports 和 `registerIpc` 调用：

```ts
import { LibraryService } from './library/LibraryService';
```

并将 `registerIpc` 部分改为：

```ts
const db = createDatabase();
registerIpc({
  settings: new SettingsService(db),
  library: new LibraryService(db),
});
```

- [ ] **Step 4: 类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0.

- [ ] **Step 5: 提交**

```bash
git add src/main/library/LibraryService.ts src/main/ipc/registerIpc.ts src/main/index.ts
git commit -m "feat: import markdown books"
```

---

### Task 6: ThreadStore

**Files:**
- Create: `src/main/threads/ThreadStore.ts`
- Create: `tests/main/ThreadStore.test.ts`

- [ ] **Step 1: 写 ThreadStore 测试**

`tests/main/ThreadStore.test.ts`：

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { schemaSql } from '../../src/main/storage/schema';
import { ThreadStore } from '../../src/main/threads/ThreadStore';

describe('ThreadStore', () => {
  it('创建独立 thread，并只把追问追加到当前 thread', () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const store = new ThreadStore(db);

    const first = store.createThread({
      bookId: 'book-1',
      chapterId: null,
      passageId: 'p1',
      title: '白话解释',
      actionType: 'plain_explanation',
      selectedText: '第一段',
      contextStrategy: 'full_book',
    });

    const second = store.createThread({
      bookId: 'book-1',
      chapterId: null,
      passageId: 'p2',
      title: '白话解释',
      actionType: 'plain_explanation',
      selectedText: '第二段',
      contextStrategy: 'full_book',
    });

    store.addMessage({
      threadId: first.id,
      role: 'assistant',
      content: '第一段解释',
      model: 'test-model',
      tokenUsage: 10,
      contextStrategy: 'full_book',
    });

    expect(store.listMessages(first.id)).toHaveLength(1);
    expect(store.listMessages(second.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/main/ThreadStore.test.ts
```

Expected: FAIL because `ThreadStore` does not exist.

- [ ] **Step 3: 实现 ThreadStore**

`src/main/threads/ThreadStore.ts`：

```ts
import crypto from 'node:crypto';
import type { AppDatabase } from '../storage/database';
import type { ContextStrategy, ReadingActionType, ReadingThread, ThreadMessage } from '../../shared/types';

function now() {
  return new Date().toISOString();
}

interface CreateThreadInput {
  bookId: string;
  chapterId: string | null;
  passageId: string | null;
  title: string;
  actionType: ReadingActionType;
  selectedText: string;
  contextStrategy: ContextStrategy;
}

interface AddMessageInput {
  threadId: string;
  role: ThreadMessage['role'];
  content: string;
  model: string | null;
  tokenUsage: number | null;
  contextStrategy: ContextStrategy | null;
}

export class ThreadStore {
  constructor(private readonly db: AppDatabase) {}

  createThread(input: CreateThreadInput): ReadingThread {
    const timestamp = now();
    const thread: ReadingThread = {
      id: crypto.randomUUID(),
      bookId: input.bookId,
      chapterId: input.chapterId,
      passageId: input.passageId,
      title: input.title,
      actionType: input.actionType,
      selectedText: input.selectedText,
      contextStrategy: input.contextStrategy,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'ready',
    };

    this.db
      .prepare(`
        INSERT INTO reading_threads (
          id, book_id, chapter_id, passage_id, title, action_type, selected_text,
          context_strategy, created_at, updated_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        thread.id,
        thread.bookId,
        thread.chapterId,
        thread.passageId,
        thread.title,
        thread.actionType,
        thread.selectedText,
        thread.contextStrategy,
        thread.createdAt,
        thread.updatedAt,
        thread.status,
      );

    return thread;
  }

  addMessage(input: AddMessageInput): ThreadMessage {
    const message: ThreadMessage = {
      id: crypto.randomUUID(),
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: now(),
      model: input.model,
      tokenUsage: input.tokenUsage,
      contextStrategy: input.contextStrategy,
    };

    this.db
      .prepare(`
        INSERT INTO thread_messages (
          id, thread_id, role, content, created_at, model, token_usage, context_strategy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        message.id,
        message.threadId,
        message.role,
        message.content,
        message.createdAt,
        message.model,
        message.tokenUsage,
        message.contextStrategy,
      );

    this.db.prepare('UPDATE reading_threads SET updated_at = ? WHERE id = ?').run(now(), input.threadId);
    return message;
  }

  listMessages(threadId: string): ThreadMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY created_at ASC')
      .all(threadId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: row.id as string,
      threadId: row.thread_id as string,
      role: row.role as ThreadMessage['role'],
      content: row.content as string,
      createdAt: row.created_at as string,
      model: row.model as string | null,
      tokenUsage: row.token_usage as number | null,
      contextStrategy: row.context_strategy as ContextStrategy | null,
    }));
  }

  listThreadsByBook(bookId: string): ReadingThread[] {
    const rows = this.db
      .prepare('SELECT * FROM reading_threads WHERE book_id = ? ORDER BY updated_at DESC')
      .all(bookId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: row.id as string,
      bookId: row.book_id as string,
      chapterId: row.chapter_id as string | null,
      passageId: row.passage_id as string | null,
      title: row.title as string,
      actionType: row.action_type as ReadingActionType,
      selectedText: row.selected_text as string,
      contextStrategy: row.context_strategy as ContextStrategy,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      status: row.status as ReadingThread['status'],
    }));
  }
}
```

- [ ] **Step 4: 测试通过**

Run:

```bash
npm test -- tests/main/ThreadStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: 提交**

```bash
git add src/main/threads/ThreadStore.ts tests/main/ThreadStore.test.ts
git commit -m "feat: store reading threads"
```

---

### Task 7: ContextAssembler full_book 策略

**Files:**
- Create: `src/main/ai/ContextAssembler.ts`
- Create: `tests/main/ContextAssembler.test.ts`

- [ ] **Step 1: 写 ContextAssembler 测试**

`tests/main/ContextAssembler.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { ContextAssembler } from '../../src/main/ai/ContextAssembler';

describe('ContextAssembler', () => {
  it('full_book 策略包含完整书籍、选中文本和当前 thread 历史', () => {
    const assembler = new ContextAssembler();
    const result = assembler.forReadingAction({
      strategy: 'full_book',
      bookTitle: '测试书',
      fullText: '第一章全文\n\n第二章全文',
      selectedText: '第一章全文',
      nearbyText: '第一章全文',
      actionInstruction: '请白话解释这段。',
      threadMessages: [{ role: 'user', content: '之前的问题' }],
    });

    expect(result.system).toContain('尽量让全书在场');
    expect(result.user).toContain('第一章全文\n\n第二章全文');
    expect(result.user).toContain('请白话解释这段。');
    expect(result.user).toContain('之前的问题');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
npm test -- tests/main/ContextAssembler.test.ts
```

Expected: FAIL because `ContextAssembler` does not exist.

- [ ] **Step 3: 实现 ContextAssembler**

`src/main/ai/ContextAssembler.ts`：

```ts
import type { ContextStrategy } from '../../shared/types';

interface ThreadMessageLike {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ReadingActionContextInput {
  strategy: ContextStrategy;
  bookTitle: string;
  fullText: string;
  selectedText: string;
  nearbyText: string;
  actionInstruction: string;
  threadMessages: ThreadMessageLike[];
}

export interface AssembledContext {
  system: string;
  user: string;
}

export class ContextAssembler {
  forReadingAction(input: ReadingActionContextInput): AssembledContext {
    if (input.strategy !== 'full_book') {
      throw new Error(`当前纵向切片只支持 full_book 策略，收到：${input.strategy}`);
    }

    const history = input.threadMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n\n');

    return {
      system: [
        '你是一个 AI 阅读伴侣。',
        '你的任务不是替代原书，而是在读者主动召唤时帮助理解。',
        '回答时尽量让全书在场：结合完整书籍、选中文本、附近上下文和当前追问历史。',
        '优先使用中文回答。',
      ].join('\n'),
      user: [
        `书名：${input.bookTitle}`,
        '完整书籍内容：',
        input.fullText,
        '当前选中文本：',
        input.selectedText,
        '附近上下文：',
        input.nearbyText,
        history ? `当前 tab 历史：\n${history}` : '当前 tab 历史：无',
        '动作要求：',
        input.actionInstruction,
      ].join('\n\n'),
    };
  }
}
```

- [ ] **Step 4: 测试通过**

Run:

```bash
npm test -- tests/main/ContextAssembler.test.ts
```

Expected: PASS.

- [ ] **Step 5: 提交**

```bash
git add src/main/ai/ContextAssembler.ts tests/main/ContextAssembler.test.ts
git commit -m "feat: assemble full book context"
```

---

### Task 8: AIProvider 与白话解释动作

**Files:**
- Create: `src/main/ai/AIProvider.ts`
- Create: `src/main/ai/ReadingActionService.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 创建 AIProvider**

`src/main/ai/AIProvider.ts`：

```ts
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { AISettings } from '../../shared/types';

export class AIProvider {
  async generate(settings: AISettings, input: { system: string; user: string }) {
    const openai = createOpenAI({
      baseURL: settings.baseURL,
      apiKey: settings.apiKey,
    });

    const result = await generateText({
      model: openai(settings.model),
      system: input.system,
      prompt: input.user,
    });

    return {
      text: result.text,
      usage: result.usage.totalTokens ?? null,
    };
  }

  async testConnection(settings: AISettings) {
    const result = await this.generate(settings, {
      system: '你只需要回答 OK。',
      user: '请回答 OK。',
    });
    return {
      ok: result.text.trim().length > 0,
      message: '模型连接成功。',
    };
  }
}
```

- [ ] **Step 2: 创建 ReadingActionService**

`src/main/ai/ReadingActionService.ts`：

```ts
import type { LibraryService } from '../library/LibraryService';
import type { SettingsService } from '../settings/SettingsService';
import type { ThreadStore } from '../threads/ThreadStore';
import type { RunReadingActionInput, FollowUpInput } from '../../shared/types';
import { ContextAssembler } from './ContextAssembler';
import { AIProvider } from './AIProvider';

const plainExplanationInstruction = '请用白话解释当前选中文本。要求：先用 1-2 句话说清楚这段在讲什么，再列出最容易卡住的点。不要替代原文，不要输出长篇总结。';

export class ReadingActionService {
  private readonly assembler = new ContextAssembler();
  private readonly provider = new AIProvider();

  constructor(
    private readonly settings: SettingsService,
    private readonly library: LibraryService,
    private readonly threads: ThreadStore,
  ) {}

  async runReadingAction(input: RunReadingActionInput) {
    if (input.actionType !== 'plain_explanation') {
      throw new Error(`当前纵向切片只支持 plain_explanation，收到：${input.actionType}`);
    }

    const aiSettings = this.settings.getAISettings();
    if (!aiSettings) throw new Error('请先在设置页填写模型配置。');

    const document = this.library.openBook(input.bookId);
    const nearbyText = this.getNearbyText(document.passages, input.passageId, input.selectedText);

    const thread = this.threads.createThread({
      bookId: input.bookId,
      chapterId: document.passages.find((passage) => passage.id === input.passageId)?.chapterId ?? null,
      passageId: input.passageId,
      title: '白话解释',
      actionType: input.actionType,
      selectedText: input.selectedText,
      contextStrategy: input.contextStrategy,
    });

    this.threads.addMessage({
      threadId: thread.id,
      role: 'user',
      content: input.selectedText,
      model: null,
      tokenUsage: null,
      contextStrategy: input.contextStrategy,
    });

    const context = this.assembler.forReadingAction({
      strategy: input.contextStrategy,
      bookTitle: document.book.title,
      fullText: document.fullText,
      selectedText: input.selectedText,
      nearbyText,
      actionInstruction: plainExplanationInstruction,
      threadMessages: [],
    });

    const output = await this.provider.generate(aiSettings, context);
    this.threads.addMessage({
      threadId: thread.id,
      role: 'assistant',
      content: output.text,
      model: aiSettings.model,
      tokenUsage: output.usage,
      contextStrategy: input.contextStrategy,
    });

    return {
      thread,
      messages: this.threads.listMessages(thread.id),
    };
  }

  async followUp(input: FollowUpInput) {
    const aiSettings = this.settings.getAISettings();
    if (!aiSettings) throw new Error('请先在设置页填写模型配置。');

    this.threads.addMessage({
      threadId: input.threadId,
      role: 'user',
      content: input.question,
      model: null,
      tokenUsage: null,
      contextStrategy: null,
    });

    const messages = this.threads.listMessages(input.threadId);
    const assistantText = '纵向切片阶段的追问已记录。下一步实现会把 thread 对应书籍上下文重新组装后发给模型。';
    this.threads.addMessage({
      threadId: input.threadId,
      role: 'assistant',
      content: assistantText,
      model: aiSettings.model,
      tokenUsage: null,
      contextStrategy: null,
    });

    return {
      thread: this.threads.listThreadsByBook(messages[0]?.threadId ?? '')[0],
      messages: this.threads.listMessages(input.threadId),
    };
  }

  private getNearbyText(passages: Array<{ id: string; text: string }>, passageId: string | null, selectedText: string) {
    if (!passageId) return selectedText;
    const index = passages.findIndex((passage) => passage.id === passageId);
    if (index < 0) return selectedText;
    return passages
      .slice(Math.max(0, index - 2), index + 3)
      .map((passage) => passage.text)
      .join('\n\n');
  }
}
```

- [ ] **Step 3: 修正 followUp 需要 thread 查询的问题**

在 `ThreadStore` 增加方法：

```ts
getThread(threadId: string) {
  const row = this.db.prepare('SELECT * FROM reading_threads WHERE id = ?').get(threadId) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`找不到 thread：${threadId}`);
  return {
    id: row.id as string,
    bookId: row.book_id as string,
    chapterId: row.chapter_id as string | null,
    passageId: row.passage_id as string | null,
    title: row.title as string,
    actionType: row.action_type as import('../../shared/types').ReadingActionType,
    selectedText: row.selected_text as string,
    contextStrategy: row.context_strategy as import('../../shared/types').ContextStrategy,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    status: row.status as import('../../shared/types').ReadingThread['status'],
  };
}
```

然后将 `ReadingActionService.followUp` 的 return 改为：

```ts
return {
  thread: this.threads.getThread(input.threadId),
  messages: this.threads.listMessages(input.threadId),
};
```

- [ ] **Step 4: 修改 IPC 注册**

在 `src/main/ipc/registerIpc.ts` 添加 imports：

```ts
import type { FollowUpInput, RunReadingActionInput } from '../../shared/types';
import type { ReadingActionService } from '../ai/ReadingActionService';
import type { ThreadStore } from '../threads/ThreadStore';
```

扩展 `IpcServices`：

```ts
readingActions: ReadingActionService;
threads: ThreadStore;
```

注册 handlers：

```ts
ipcMain.handle(ipcChannels.aiRunReadingAction, (_event, input: RunReadingActionInput) =>
  services.readingActions.runReadingAction(input),
);

ipcMain.handle(ipcChannels.aiFollowUp, (_event, input: FollowUpInput) =>
  services.readingActions.followUp(input),
);

ipcMain.handle(ipcChannels.threadsListByBook, (_event, bookId: string) =>
  services.threads.listThreadsByBook(bookId),
);
```

将 `settingsTestConnection` handler 改为调用 `AIProvider.testConnection`。先在文件顶部添加：

```ts
import { AIProvider } from '../ai/AIProvider';
const aiProvider = new AIProvider();
```

handler：

```ts
ipcMain.handle(ipcChannels.settingsTestConnection, (_event, settings: AISettings) =>
  aiProvider.testConnection(settings),
);
```

- [ ] **Step 5: main 入口注入服务**

在 `src/main/index.ts` 添加 imports：

```ts
import { ReadingActionService } from './ai/ReadingActionService';
import { ThreadStore } from './threads/ThreadStore';
```

在 `app.whenReady()` 中创建服务：

```ts
const db = createDatabase();
const settings = new SettingsService(db);
const library = new LibraryService(db);
const threads = new ThreadStore(db);
registerIpc({
  settings,
  library,
  threads,
  readingActions: new ReadingActionService(settings, library, threads),
});
```

- [ ] **Step 6: 类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0. If Vercel AI SDK usage has version-specific typing differences, adjust only `AIProvider.ts` while preserving its public `generate(settings, input)` method.

- [ ] **Step 7: 提交**

```bash
git add src/main/ai src/main/ipc/registerIpc.ts src/main/index.ts src/main/threads/ThreadStore.ts
git commit -m "feat: run plain explanation action"
```

---

### Task 9: React UI 书库、设置与阅读器

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/pages/LibraryPage.tsx`
- Create: `src/renderer/pages/ReaderPage.tsx`
- Create: `src/renderer/components/SettingsPanel.tsx`
- Create: `src/renderer/components/RightAiPanel.tsx`
- Create: `src/renderer/components/SelectionMenu.tsx`

- [ ] **Step 1: 创建 SettingsPanel**

`src/renderer/components/SettingsPanel.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { whisper } from '../api/whisper';
import type { AISettings } from '../../shared/types';

const defaultSettings: AISettings = {
  baseURL: '',
  apiKey: '',
  model: '',
  contextWindow: 128000,
  defaultContextStrategy: 'full_book',
};

export function SettingsPanel() {
  const [settings, setSettings] = useState<AISettings>(defaultSettings);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void whisper.settings.get().then((saved) => {
      if (saved) setSettings(saved);
    });
  }, []);

  async function save() {
    await whisper.settings.save(settings);
    setMessage('已保存设置。');
  }

  async function test() {
    const result = await whisper.settings.testConnection(settings);
    setMessage(result.message);
  }

  return (
    <section className="settings-panel">
      <h2>模型设置</h2>
      <label>
        Base URL
        <input value={settings.baseURL} onChange={(event) => setSettings({ ...settings, baseURL: event.target.value })} />
      </label>
      <label>
        API Key
        <input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} />
      </label>
      <label>
        Model
        <input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} />
      </label>
      <label>
        Context Window
        <input
          type="number"
          value={settings.contextWindow}
          onChange={(event) => setSettings({ ...settings, contextWindow: Number(event.target.value) })}
        />
      </label>
      <div className="button-row">
        <button onClick={save}>保存</button>
        <button onClick={test}>测试连接</button>
      </div>
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
```

- [ ] **Step 2: 创建 LibraryPage**

`src/renderer/pages/LibraryPage.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { whisper } from '../api/whisper';
import type { Book } from '../../shared/types';

interface LibraryPageProps {
  onOpenBook: (bookId: string) => void;
}

export function LibraryPage({ onOpenBook }: LibraryPageProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState('');

  async function loadBooks() {
    setBooks(await whisper.books.list());
  }

  useEffect(() => {
    void loadBooks();
  }, []);

  async function importMarkdown() {
    try {
      setError('');
      await whisper.books.importMarkdown({ filePath });
      setFilePath('');
      await loadBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="library-page">
      <div className="page-header">
        <h2>书库</h2>
      </div>
      <div className="import-row">
        <input placeholder="输入本机 markdown 文件路径" value={filePath} onChange={(event) => setFilePath(event.target.value)} />
        <button onClick={importMarkdown} disabled={!filePath.trim()}>
          导入 Markdown
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="book-list">
        {books.map((book) => (
          <button className="book-item" key={book.id} onClick={() => onOpenBook(book.id)}>
            <strong>{book.title}</strong>
            <span>{book.format} · {book.tokenEstimate} tokens 估算 · {book.defaultContextStrategy}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 创建 RightAiPanel**

`src/renderer/components/RightAiPanel.tsx`：

```tsx
import type { ReadingThread, ThreadMessage } from '../../shared/types';

interface RightAiPanelProps {
  threads: Array<{ thread: ReadingThread; messages: ThreadMessage[] }>;
  activeThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onFollowUp: (threadId: string, question: string) => Promise<void>;
}

export function RightAiPanel({ threads, activeThreadId, onSelectThread, onFollowUp }: RightAiPanelProps) {
  const active = threads.find((item) => item.thread.id === activeThreadId) ?? null;

  return (
    <aside className="right-panel">
      <div className="tabs">
        <button className={activeThreadId === null ? 'active' : ''} onClick={() => onSelectThread(null)}>
          问题地图
        </button>
        {threads.map((item) => (
          <button
            key={item.thread.id}
            className={activeThreadId === item.thread.id ? 'active' : ''}
            onClick={() => onSelectThread(item.thread.id)}
          >
            {item.thread.title}
          </button>
        ))}
      </div>
      {active ? (
        <ThreadView item={active} onFollowUp={onFollowUp} />
      ) : (
        <div className="panel-body">
          <h3>问题地图</h3>
          <p className="muted">纵向切片阶段暂未生成问题地图。下一阶段会在导入后生成全书问题地图。</p>
        </div>
      )}
    </aside>
  );
}

function ThreadView({
  item,
  onFollowUp,
}: {
  item: { thread: ReadingThread; messages: ThreadMessage[] };
  onFollowUp: (threadId: string, question: string) => Promise<void>;
}) {
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const question = String(data.get('question') ?? '').trim();
    if (!question) return;
    event.currentTarget.reset();
    await onFollowUp(item.thread.id, question);
  }

  return (
    <div className="panel-body">
      <p className="muted">上下文策略：{item.thread.contextStrategy}</p>
      <blockquote>{item.thread.selectedText}</blockquote>
      <div className="messages">
        {item.messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            <strong>{message.role}</strong>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="follow-up">
        <input name="question" placeholder="继续追问这个回答" />
        <button>发送</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: 创建 SelectionMenu**

`src/renderer/components/SelectionMenu.tsx`：

```tsx
interface SelectionMenuProps {
  selectedText: string;
  onExplain: () => void;
}

export function SelectionMenu({ selectedText, onExplain }: SelectionMenuProps) {
  if (!selectedText.trim()) return null;
  return (
    <div className="selection-menu">
      <span>{selectedText.slice(0, 24)}{selectedText.length > 24 ? '...' : ''}</span>
      <button onClick={onExplain}>白话解释</button>
    </div>
  );
}
```

- [ ] **Step 5: 创建 ReaderPage**

`src/renderer/pages/ReaderPage.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { whisper } from '../api/whisper';
import { RightAiPanel } from '../components/RightAiPanel';
import { SelectionMenu } from '../components/SelectionMenu';
import type { BookDocument, ReadingThread, ThreadMessage } from '../../shared/types';

interface ReaderPageProps {
  bookId: string;
  onBack: () => void;
}

export function ReaderPage({ bookId, onBack }: ReaderPageProps) {
  const [document, setDocument] = useState<BookDocument | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Array<{ thread: ReadingThread; messages: ThreadMessage[] }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void whisper.books.open(bookId).then(setDocument);
  }, [bookId]);

  const passageId = useMemo(() => {
    if (!document || !selectedText) return null;
    return document.passages.find((passage) => passage.text.includes(selectedText))?.id ?? null;
  }, [document, selectedText]);

  function updateSelection() {
    setSelectedText(window.getSelection()?.toString() ?? '');
  }

  async function explain() {
    if (!document || !selectedText.trim()) return;
    try {
      setError('');
      const result = await whisper.ai.runReadingAction({
        bookId: document.book.id,
        selectedText,
        passageId,
        actionType: 'plain_explanation',
        contextStrategy: 'full_book',
      });
      setThreads((current) => [...current, result]);
      setActiveThreadId(result.thread.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function followUp(threadId: string, question: string) {
    const result = await whisper.ai.followUp({ threadId, question });
    setThreads((current) => current.map((item) => (item.thread.id === threadId ? result : item)));
  }

  if (!document) return <p className="app-shell">正在打开书籍...</p>;

  return (
    <section className="reader-layout">
      <nav className="left-nav">
        <button onClick={onBack}>返回书库</button>
        <h2>{document.book.title}</h2>
        {document.chapters.map((chapter) => (
          <a key={chapter.id} href={`#${chapter.startPassageId}`}>{chapter.title}</a>
        ))}
      </nav>
      <article className="reader" onMouseUp={updateSelection} onKeyUp={updateSelection}>
        <SelectionMenu selectedText={selectedText} onExplain={explain} />
        {error && <p className="error">{error}</p>}
        {document.passages.map((passage) => (
          <p id={passage.id} key={passage.id}>{passage.text}</p>
        ))}
      </article>
      <RightAiPanel
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
        onFollowUp={followUp}
      />
    </section>
  );
}
```

- [ ] **Step 6: 修改 App**

`src/renderer/App.tsx`：

```tsx
import { useState } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';

export function App() {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  if (activeBookId) {
    return <ReaderPage bookId={activeBookId} onBack={() => setActiveBookId(null)} />;
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <h1>Whisper Reading Copilot</h1>
      </header>
      <div className="home-grid">
        <LibraryPage onOpenBook={setActiveBookId} />
        <SettingsPanel />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: 更新 CSS**

`src/renderer/styles.css`：

```css
:root {
  color: #1f2933;
  background: #f7f4ee;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

button,
input {
  font: inherit;
}

button {
  border: 1px solid #c9c1b2;
  background: #fffaf2;
  color: #1f2933;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
}

input {
  border: 1px solid #c9c1b2;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fffdf8;
}

.app-shell {
  padding: 24px;
}

.top-bar {
  margin-bottom: 18px;
}

.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.6fr);
  gap: 20px;
}

.settings-panel,
.library-page {
  border: 1px solid #ded5c6;
  background: #fffdf8;
  border-radius: 8px;
  padding: 16px;
}

.settings-panel label,
.import-row {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.button-row,
.import-row {
  display: flex;
  gap: 8px;
}

.book-list {
  display: grid;
  gap: 10px;
}

.book-item {
  display: grid;
  gap: 4px;
  text-align: left;
}

.reader-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 380px;
  height: 100vh;
}

.left-nav,
.right-panel {
  border-right: 1px solid #ded5c6;
  background: #fffaf2;
  padding: 14px;
  overflow: auto;
}

.right-panel {
  border-right: none;
  border-left: 1px solid #ded5c6;
}

.left-nav a {
  display: block;
  color: #425466;
  margin: 8px 0;
  text-decoration: none;
}

.reader {
  position: relative;
  padding: 42px 64px;
  overflow: auto;
  font-size: 18px;
  line-height: 1.85;
  background: #fffdf8;
}

.reader p {
  max-width: 760px;
}

.selection-menu {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #d7c8ac;
  background: #fffaf2;
  border-radius: 8px;
  z-index: 1;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.tabs .active {
  background: #1f2933;
  color: #fff;
}

.panel-body {
  display: grid;
  gap: 12px;
}

.message {
  border-top: 1px solid #ded5c6;
  padding-top: 10px;
}

.follow-up {
  display: flex;
  gap: 8px;
}

.muted {
  color: #687789;
}

.error {
  color: #a33a2b;
}
```

- [ ] **Step 8: 类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0.

- [ ] **Step 9: 提交**

```bash
git add src/renderer
git commit -m "feat: add reading copilot ui"
```

---

### Task 10: 验证纵向切片

**Files:**
- No planned source changes unless verification exposes a defect.

- [ ] **Step 1: 运行单元测试**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: 运行类型检查**

Run:

```bash
npm run lint:types
```

Expected: TypeScript exits with code 0.

- [ ] **Step 3: 构建**

Run:

```bash
npm run build
```

Expected: Electron Vite build succeeds.

- [ ] **Step 4: 启动开发应用**

Run:

```bash
npm run dev
```

Expected: Electron window opens and shows library/settings view.

- [ ] **Step 5: 准备一本测试 Markdown**

Create local file outside the repo, for example `/tmp/whisper-test-book.md`:

```markdown
# 第一章 问题

这本书先提出一个问题：人为什么会误解自己正在经历的时代。

第二段继续说明，这种误解不是因为信息太少，而是因为解释框架太旧。

## 一个小节

作者在这里引入第一个关键概念：框架会决定我们看见什么。
```

- [ ] **Step 6: 手动验证导入**

在应用书库页输入 `/tmp/whisper-test-book.md`，点击导入。

Expected:

- 书库出现 `whisper-test-book`。
- token 估算显示为正数。
- 格式显示 `markdown`。

- [ ] **Step 7: 手动验证阅读器**

打开测试书。

Expected:

- 中间显示 3 个段落。
- 左侧显示章节导航。
- 右侧显示问题地图占位 tab。

- [ ] **Step 8: 手动验证白话解释**

选中第一段，点击“白话解释”。

Expected:

- 如果模型设置正确，右侧创建新 tab。
- tab 内显示 user 选中文本和 assistant 回答。
- tab 标记上下文策略为 `full_book`。

- [ ] **Step 9: 手动验证追问**

在当前 tab 输入追问：“这和第二段有什么关系？”

Expected:

- 当前 tab 增加 user 追问消息。
- 当前 tab 增加 assistant 回复。
- 其他 tab 不受影响。

- [ ] **Step 10: 提交验证修复**

如果验证中做了修复：

```bash
git add <changed-files>
git commit -m "fix: stabilize reading copilot vertical slice"
```

如果没有修复，不提交。

---

## 自检清单

- 设计文档中的 Electron + React + IPC 方向由 Task 1-3 覆盖。
- Markdown 导入和统一书籍模型由 Task 4-5 覆盖。
- 右侧独立 tab 和追问由 Task 6、Task 9 覆盖。
- `full_book` 上下文策略由 Task 7 覆盖。
- OpenAI-compatible provider 和白话解释动作由 Task 8 覆盖。
- 基础 UI 和人工验证由 Task 9-10 覆盖。
- EPUB、问题地图、多动作、多上下文策略已明确排到后续计划，避免第一条切片失控。
