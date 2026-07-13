# AI 阅读伴侣设计文档

日期：2026-07-09

## 目标

做一个独立的桌面阅读应用，帮助用户在 gap year 里更快、更深地阅读各领域经典书籍。

这个产品不是「把一本书丢给 AI，然后拿一份总结」的工具。原书始终是主要阅读对象。AI 是伴读 copilot：当读者遇到难句、陌生概念、背景缺失，或者不知道某段在全书论证中起什么作用时，主动召唤 AI 来扫清障碍。

第一版的核心目标是：在不牺牲结构性理解的前提下，提高阅读经典书的速度。

## MVP 范围

第一版支持：

- 基于 Electron 的桌面应用。
- React / Vite / TypeScript 渲染层。
- Renderer 与 Main Process 之间通过 Electron IPC 通信。
- 本地文件书库。
- 使用 SQLite 保存元数据、设置、问题地图和阅读线程。
- 导入 `md` 和 `epub` 书籍。
- 将导入的书转换成统一的内部书籍模型。
- 导入后生成全书问题地图。
- 在专用阅读器里阅读原文。
- 选中原文后调用 5 个阅读动作：
  - 白话解释。
  - 结构定位。
  - 概念解释。
  - 背景补全。
  - 举例 / 类比。
- AI 结果显示在右侧独立 tab 中。
- 每个 AI 结果 tab 都可以继续追问。
- 支持切换上下文策略：
  - `full_book`
  - `compressed_book`
  - `hybrid`
- 支持用户自己填写 OpenAI-compatible 模型配置：
  - `baseURL`
  - `apiKey`
  - `model`
  - `contextWindow`

第一版不做：

- PDF / OCR 解析。
- 自动测验。
- 阅读进度游戏化。
- 重型笔记系统。
- OpenAI-compatible API 之外的多厂商原生集成。
- 完整的阅读技巧插件市场。

PDF 可以先走用户已有的外部转换 workflow，转成 markdown 后再导入。

## 产品形态

应用有 4 个主要区域：

- 书库页。
- 阅读器页。
- 右侧 AI 面板。
- 设置页。

在书库页，用户导入 markdown 或 EPUB 书籍。应用会把原始文件复制到自己的书库目录，解析文件，生成标准化的 `BookDocument`，估算 token 长度，并启动全书预处理。

预处理阶段，应用会尽量让模型看到整本书，然后生成问题地图。问题地图是全局理解层，不是原书的替代品。它回答：

- 这本书是为了解决什么核心问题而存在？
- 作者给出的主要回答是什么？
- 支撑这个回答的论证主干是什么？
- 哪些概念最重要？
- 各章节如何服务于核心问题？
- 哪些关键论点有原文锚点？

在阅读器页，中间区域始终显示原文。用户选中一段文字后，会出现一个小的动作菜单。每个动作都会在右侧创建一个新的结果 tab。这个 tab 会流式显示回答、保存结果，并支持继续追问。

右侧面板有一个常驻的问题地图 tab，也有动态创建的阅读线程 tab。用户可以在这些 tab 之间切换，同时保持原文阅读位置。

## 架构

应用使用 Electron 作为桌面壳和本地运行时。

```text
Electron App
├─ Renderer
│  └─ React / Vite / TypeScript UI
├─ Preload
│  └─ 安全暴露 window.whisper API
├─ Main Process
│  ├─ LibraryService
│  ├─ BookParser
│  ├─ PreprocessService
│  ├─ ContextAssembler
│  ├─ AIProvider
│  ├─ ReadingActionService
│  ├─ ThreadStore
│  ├─ HistoryService
│  └─ SettingsService
└─ Storage
   ├─ SQLite database
   └─ Local book library files
```

Renderer 不能直接访问 Node API、文件系统或 API key。它只能调用 preload 暴露出来的类型化 API，再由 preload 转发给 main process 的 IPC handler。

示例 IPC 接口：

- `books.import`
- `books.list`
- `books.open`
- `preprocess.start`
- `preprocess.status`
- `ai.runReadingAction`
- `ai.followUp`
- `threads.listByBook`
- `threads.get`
- `threads.close`
- `settings.get`
- `settings.save`
- `settings.testConnection`

## 主要服务

### LibraryService

管理应用书库。

职责：

- 将导入的 `md` 和 `epub` 文件复制到应用书库目录。
- 创建 `Book` 记录。
- 追踪导入状态和预处理状态。
- 返回书籍列表和最近打开的书。

### BookParser

将不同格式的书转换成统一的内部结构。

对于 markdown：

- 将标题解析成章节。
- 将文本切成稳定 passage。
- 保留原始顺序。
- 创建章节和 passage 锚点。

对于 EPUB：

- 解包 EPUB。
- 读取 manifest、spine 和 navigation / toc。
- 按阅读顺序提取章节 HTML。
- 将章节 HTML 转成清洗后的阅读内容和纯文本。
- 尽量保留标题、段落、引用、列表、脚注等基本结构。

MVP 不追求 100% 还原出版社排版样式。第一目标是保留可读文本结构和稳定锚点。

### PreprocessService

导入后运行。

职责：

- 估算全书 token 数。
- 和配置的 `contextWindow` 比较。
- 生成 `ProblemMap`。
- 必要时生成章节摘要和概念锚点。
- 标记预处理是使用了完整全书上下文，还是使用了降级策略。

### ContextAssembler

负责为预处理、阅读动作、追问组装最终发给模型的输入。

这是产品的核心组件，应该由我们自己掌控，而不是完全藏在通用 agent 框架里。

职责：

- 应用当前选中的 `ContextStrategy`。
- 当策略和模型窗口允许时，包含完整书籍文本。
- 必要时包含压缩后的全书表示。
- 包含选中文本、附近 passage、当前章节信息、问题地图和动作 prompt。
- 追问时只包含当前 thread 的消息历史。
- 防止一个 tab 的历史泄漏到另一个 tab。
- 检测 token 超限，并返回清晰的降级或错误。

### AIProvider

第一版只实现 OpenAI-compatible provider。

设置项：

- `baseURL`
- `apiKey`
- `model`
- `contextWindow`
- 默认上下文策略

实现时不要手写一堆临时 HTTP 调用，而应使用稳定的模型调用抽象。第一候选是 Vercel AI SDK，因为它提供统一模型接口、流式输出、消息格式和 provider 抽象，同时仍然允许我们自己的 `ContextAssembler` 控制 prompt。

后续可以再增加 Anthropic、Gemini 等原生 provider adapter。

### ReadingActionService

运行第一版的 5 个阅读动作。

动作：

- 白话解释：用直接、好懂的话解释选中段落。
- 结构定位：解释这段如何服务于全书核心问题、主张或论证主干。
- 概念解释：识别并解释段落中的关键概念。
- 背景补全：补充必要的历史、人物、学派、术语或上下文背景。
- 举例 / 类比：给出现代例子或类比；有帮助时可以使用程序员能懂的类比。

每个动作使用同一套上下文机制，但使用不同的 prompt 模板和输出约定。

### ThreadStore

每个 AI 结果 tab 都是一个阅读 thread。

职责：

- 用户从选中文本触发阅读动作时，创建新 thread。
- 保存初始选中文本、动作类型、来源 passage、上下文策略和回答。
- 将追问消息保存到同一个 thread。
- 保持不同 thread 彼此隔离。
- 支持恢复某本书之前的 thread。

### SettingsService

保存本地模型设置和应用偏好。

MVP 阶段，API key 可以保存在本地应用配置或 SQLite 中。后续版本应支持系统 keychain。

## 数据模型

### Book

表示一本已导入书。

字段：

- `id`
- `title`
- `author`
- `format`
- `originalFilePath`
- `libraryFilePath`
- `createdAt`
- `updatedAt`
- `lastOpenedAt`
- `preprocessStatus`
- `tokenEstimate`
- `defaultContextStrategy`

### BookDocument

解析后的标准化表示。

字段：

- `bookId`
- `chapters`
- `passages`
- `fullText`
- `sourceMap`

### Chapter

字段：

- `id`
- `bookId`
- `parentChapterId`
- `title`
- `level`
- `order`
- `startPassageId`
- `endPassageId`
- `summary`

### Passage

最小稳定阅读单元。

字段：

- `id`
- `bookId`
- `chapterId`
- `order`
- `text`
- `sourceHref`
- `sourceOffset`

### ProblemMap

字段：

- `bookId`
- `coreProblem`
- `authorAnswer`
- `argumentSpine`
- `keyConcepts`
- `chapterRoles`
- `anchors`
- `generationStrategy`
- `confidenceNotes`
- `createdAt`

重要论点和争议点应带有章节或 passage 锚点，方便回到原文。

### ReadingThread

表示右侧面板中的一个 AI tab。

字段：

- `id`
- `bookId`
- `chapterId`
- `passageId`
- `title`
- `actionType`
- `selectedText`
- `contextStrategy`
- `createdAt`
- `updatedAt`
- `status`

### ThreadMessage

字段：

- `id`
- `threadId`
- `role`
- `content`
- `createdAt`
- `model`
- `tokenUsage`
- `contextStrategy`

## 上下文策略

核心质量原则：**尽量让全书在场**。

### full_book

每次阅读动作请求都包含：

- 完整书籍文本。
- 问题地图。
- 选中文本。
- 附近 passage。
- 当前章节信息。
- 动作 prompt。
- 追问时包含当前 thread 历史。

这种策略最接近「同一个读完整本书的老师在陪你读」的体验。如果完整书籍能放进配置的模型上下文窗口，应默认使用该策略。

应用应组织 prompt，让完整书籍和问题地图成为稳定前缀。部分 provider 可能会缓存这个前缀，但应用不能把缓存命中当作必然存在或稳定可靠的能力。

如果完整书籍放不进上下文窗口，该策略应不可用，除非用户明确覆盖并接受失败风险。

### compressed_book

每次阅读动作请求都包含：

- 问题地图。
- 论证主干。
- 章节摘要。
- 关键概念。
- 重要锚点。
- 选中文本。
- 附近 passage。
- 追问时包含当前 thread 历史。

这种策略更便宜、更快，但对原文细节的保真度更弱。

### hybrid

每次阅读动作请求都包含：

- 压缩后的全书表示。
- 当前章节或较大的局部阅读窗口。
- 根据锚点或搜索选出的相关 passage / 章节。
- 选中文本。
- 追问时包含当前 thread 历史。

当 `full_book` 不可用时，默认降级到 `hybrid`。用户想降低成本或加快速度时，也可以主动选择 `hybrid`。

## Thread 与追问行为

每次新的阅读动作都会创建一个独立 tab 和 thread。

示例：

```text
Tab 1: passage A 的白话解释
Tab 2: passage B 的结构定位
Tab 3: passage C 的背景补全
```

用户可以在这些 tab 之间切换。每个 tab 都保留自己的消息。

追问发生在当前 tab 内。追问上下文包括：

- 当前 tab 最初选中的文本。
- 当前 tab 之前的消息。
- 当前问题。
- 当前上下文策略对应的书籍背景。

Tab 1 的追问不会污染 Tab 2。新的阅读动作也不会自动包含其他 tab 的历史。

## UI 细节

### 书库页

显示：

- 书名和作者。
- 格式。
- 预处理状态。
- token 估算。
- 上下文策略。
- 最近打开时间。

动作：

- 导入 `md`。
- 导入 `epub`。
- 打开书籍。
- 重试预处理。
- 修改某本书的默认上下文策略。

### 阅读器页

布局：

- 可选左侧章节导航。
- 中间阅读区域。
- 右侧 AI 面板。

阅读区域应安静、以文本为主。AI 不应自动打断阅读。

### 选中文本菜单

用户在阅读器中选中文本后出现。

命令：

- 解释。
- 定位。
- 概念。
- 背景。
- 例子。

每个命令都会创建一个右侧 tab，并开始流式输出回答。

### 右侧 AI 面板

包含：

- 常驻问题地图 tab。
- 动态阅读 thread tab。
- 每个 thread tab 内的追问输入框。
- 每个 AI 回答的上下文策略标识。
- 错误和重试状态。

### 设置页

包含：

- Provider base URL。
- API key。
- 模型名。
- 上下文窗口。
- 默认上下文策略。
- 测试连接按钮。

## 错误处理

导入错误：

- 保留原始文件。
- 显示解析失败原因。
- 允许重试。

预处理错误：

- 显示模型错误或上下文窗口错误。
- 允许重试。
- 允许切换上下文策略。

上下文超限：

- 如果 `full_book` 超限，建议使用 `hybrid`。
- 如果 `hybrid` 超限，减少局部上下文或相关 passage。
- 如果仍然超限，返回明确错误，不要静默丢弃重要上下文。

AI 错误：

- 在 tab 中显示失败状态。
- 保留选中文本和 prompt。
- 允许重试。

EPUB 解析错误：

- 报告缺失 spine / toc / manifest，或章节文件不可读。
- 避免丢失已导入的原始文件。

## 测试计划

### 单元测试

`BookParser`：

- 将 markdown heading 解析成章节。
- 将 markdown 切成稳定 passage。
- 解析 EPUB manifest / spine / toc。
- 将 EPUB 章节 HTML 转成可读内容和纯文本。

`ContextAssembler`：

- `full_book` 包含完整书籍文本。
- `compressed_book` 包含问题地图、章节摘要、概念和选中 passage。
- `hybrid` 包含压缩书籍表示和当前章节上下文。
- 追问只包含当前 thread 历史。
- token 超限时产生降级或明确错误。

`ThreadStore`：

- 新阅读动作会创建新 thread。
- 追问会追加到当前 thread。
- thread 之间保持隔离。
- 可以恢复某本书的 thread。

`AIProvider`：

- 读取 OpenAI-compatible 设置。
- 测试连接。
- 流式输出文本。
- 暴露 provider 错误。

### 集成测试

- 导入一本 markdown 书。
- 生成问题地图。
- 打开阅读器。
- 选中文本。
- 执行白话解释。
- 在生成的 tab 中追问。
- 切换到问题地图 tab。
- 切回阅读 thread，确认历史被保留。

### 安全测试

- Renderer 不能直接读取 API key。
- Renderer 不能访问任意文件系统 API。
- 所有高权限操作都通过 preload 和 IPC。

## 后续开放决策

- 是否使用系统 keychain 保存 API key。
- 是否增加 Anthropic / Gemini 原生 provider。
- 阅读动作是否变成用户可编辑 prompt 模板。
- 是否增加认知心理学阅读技巧插件系统。
- `hybrid` 策略是否使用 embedding 检索相关 passage。
- 打包方案选择 Electron Builder 还是 Forge。

## 实现建议

从一条很薄的纵向切片开始：

1. Electron + React / Vite / TypeScript shell。
2. SQLite 和本地书库目录。
3. 设置页：支持 OpenAI-compatible provider 测试连接。
4. Markdown 导入与解析。
5. 阅读器页：支持选中文本。
6. 右侧 tab 和 thread store。
7. 先做一个使用 `full_book` 的阅读动作。
8. 加入问题地图预处理。
9. 加入 EPUB 导入。
10. 加入剩余阅读动作和上下文策略。

这个顺序能尽早验证核心阅读闭环，同时保留长期架构。
