# Markdown-only 阅读链路重建设计

日期：2026-07-16

## 背景

当前阅读链路虽然接收 Markdown，但没有真正渲染 Markdown。`MarkdownParser` 只把标题提取为章节、把段落压成纯文本；Renderer 再把所有 passage 统一渲染成 `<p>`。因此标题不会出现在正文，代码块、图片和分隔线会丢失，列表、引用、链接及行内样式会降级。

项目同时支持 EPUB，使解析、资源加载和内容模型必须兼顾 Markdown 文本文件与 EPUB 出版物容器。产品现阶段不需要承担 EPUB 的 manifest、spine、XHTML、CSS、内部资源和安全隔离成本，决定彻底移除 EPUB，只支持 Markdown。

## 决策

Whisper 改为 Markdown-only 产品，并采用 mdast-first 阅读链路：

1. 原始 Markdown 是书籍正文的唯一事实来源。
2. 使用 `remark-parse` 与 `remark-gfm` 生成标准 mdast，不创建与 mdast 重复的 Whisper 自定义文档树。
3. 正文渲染、章节目录、AI 文本、选区锚点和原文定位都是原始 Markdown 的确定性派生结果。
4. EPUB 从共享类型、导入入口、主进程、Renderer、测试和文案中硬移除，不提供只读或兼容模式。
5. 本次允许开发期破坏性 schema 变更，不提供旧数据库迁移；应用不得自动删除数据库，由开发者手动删除旧数据库后重新导入书籍。

## 目标

- 正确呈现 CommonMark 与 GFM 的结构和行内语义。
- 让正文标题与目录来自同一 Markdown heading，消除两套内容来源。
- 为标题、段落、列表项、代码块等可引用内容提供稳定定位锚点。
- 让 AI 上下文保留标题、列表、引用和代码等有意义的文档结构。
- 删除 EPUB 及其带来的格式分支和无效统一抽象。
- 保持 `renderer -> preload API -> IPC -> main` 的进程边界。

## 非目标

- 不兼容或迁移现有数据库、EPUB 书籍、既有会话与既有引用。
- 不在应用内编辑 Markdown，也不监听原始文件的外部修改。
- 不执行 Markdown 中的脚本、iframe、事件属性或任意原始 HTML。
- 不承诺复现作者自定义 CSS；Whisper 继续使用统一阅读视觉系统。
- 不在缺少性能证据时持久化 mdast 缓存或建设全文搜索索引。
- 不引入面向未来未知格式的通用内容适配器框架。

## 内容与数据模型

### 原始 Markdown

导入时继续把 `.md` 文件复制到应用书库。复制后的 Markdown 文件是正文权威副本；数据库只保存书籍元数据与该文件路径，不再把正文拆分为 `chapters` 和 `passages` 两套持久化副本。

打开书籍时，Main Process 读取书库副本并在受控边界内校验、解析。Markdown 内容、章节索引和定位元数据通过现有白名单 IPC 返回 Renderer。

### 标准 mdast

解析配置统一使用 `remark-parse` 与 `remark-gfm`，覆盖：

- block：heading、paragraph、blockquote、list、listItem、code、thematicBreak、table、tableRow、tableCell、footnoteDefinition、html；
- inline：text、emphasis、strong、delete、inlineCode、link、image、break、footnoteReference。

Whisper 不复制这些节点定义。应用只补充确定性的派生元数据：节点 ID、源码 offset、章节归属和安全资源地址。

Main 与 Renderer 必须复用同一解析配置及节点 ID 规则，禁止分别维护容易漂移的 Markdown 方言或 slug 逻辑。

### 稳定 ID 与源码位置

导入后的 Markdown 不可编辑，因此节点可使用 `bookId + node type + source start offset` 生成稳定 ID。没有 position 的合成节点必须由父节点 ID、节点类型和同类序号确定性生成，不能使用随机 ID。

标题生成稳定 `chapterId`，同名标题使用确定性的重复序号消歧。章节索引记录 heading 节点 ID、标题、层级、父章节和源码范围；它由 mdast 派生，不作为独立正文来源。

### 选区与引用

现有 `Passage` 不再承担正文渲染和定位。选区端点改为：

```ts
interface ContentAnchor {
  blockId: string;
  offset: number;
}
```

选区快照保存起止 anchor、选中文本及派生 breadcrumb。可选择的 block 在 DOM 上暴露稳定 `data-block-id`；跨 block 选区由起止 anchor 表达。定位优先使用 block ID，文字高亮使用 block 内 offset。

### AI 文本投影

AI 不直接消费 Renderer DOM，也不复用视觉组件。Main Process 从同一 mdast 生成结构化 Markdown 文本单元：

- 标题保留 Markdown 层级；
- 列表保留顺序和嵌套；
- 引用保留引用标记；
- 代码保留 fenced code 与语言；
- 表格、脚注和链接保留可读语义；
- 图片至少保留 alt 与安全资源描述。

文本单元拥有与渲染 block 对应的 ID，供 token 预算、章节范围、选区引用和上下文压缩使用。它们是运行时派生数据，不持久化为正文副本。

## 渲染方案

Renderer 新增内聚的 Markdown 阅读 feature，页面只负责装配。该 feature 使用 `react-markdown`、`remark-gfm` 和共享元数据插件，将 Markdown 映射到受控 React 组件。

必须支持：

- `h1`–`h6`、段落、强调、粗体、删除线和行内代码；
- 有序列表、无序列表、嵌套列表和任务列表；
- 引用、代码块、分隔线、GFM 表格和脚注；
- 链接、图片、软换行与硬换行；
- 与当前阅读视觉系统一致的排版；
- heading 与主要 block 的稳定 DOM 锚点。

目录点击直接定位 heading，不再定位章节第一段。当前阅读章节根据 heading/block 的阅读位置计算。

不支持的 Markdown 节点不得静默消失：安全情况下显示其文本内容；无法安全呈现时显示明确的“不支持内容”占位。

## 资源与安全

- 原始 HTML 不通过 `dangerouslySetInnerHTML` 执行。普通 HTML 源码以安全文本或不支持占位呈现。
- 链接只允许明确支持的协议；外部链接交给受控主进程能力打开，不能在 Renderer 任意导航。
- 远程图片默认不自动请求，避免隐私泄露；界面显示 alt 与受控占位。
- 相对图片路径在导入时解析并复制到书籍资源目录。路径必须规范化并验证位于 Markdown 原文件允许访问的目录内。
- 书内资源通过受控协议或白名单 IPC 读取，不向 Renderer 暴露任意文件读取能力。
- SVG 等主动内容必须经过安全策略；首版可将其降级为不可执行的图片或占位。

## EPUB 硬移除

实现必须完整删除：

- `BookFormat` 的 `epub` 分支；
- 只剩单一取值后不再表达业务差异的 `BookFormat` 类型与 `books.format` 字段；
- `EpubParser` 及 ZIP/XHTML 解析代码；
- EPUB 导入服务、扩展名判断、选择器过滤项和界面文案；
- EPUB 专属测试、fixture、错误处理和源地址兼容逻辑；
- 仅为 EPUB 存在的依赖或字段。

导入边界只接受大小写不敏感的 `.md`。其他扩展名返回明确的“不支持的文件格式”错误。

## 数据库策略

这是开发期破坏性更新。新 schema 不需要识别或迁移旧 `chapters`、`passages`、EPUB 书籍、会话引用字段。实施时可以直接重写 schema 与相关 store 契约。

新 schema 必须记录明确的 schema version。启动时若发现数据库没有版本或版本不匹配，立即返回清楚的开发期错误，说明需要手动删除数据库；不得继续使用 `CREATE TABLE IF NOT EXISTS` 把新旧结构混合，也不得通过捕获 schema 错误后自动删除数据库。实际删除由开发者执行。

新 schema 的数据库测试必须从空数据库验证创建、Markdown 导入、打开书籍、会话目标和引用持久化。

## 错误处理

- 空文件可以导入并呈现明确空状态。
- Markdown 语法局部不完整时尽量按 CommonMark 容错解析，不因单个节点拒绝整本书。
- 文件不可读、编码无效、资源越界或资源丢失时返回包含书籍与资源上下文的安全错误，不泄露敏感内容。
- 单个图片失败不阻断正文；正文解析失败不得留下半写入书籍记录。
- 不支持节点和被安全策略阻止的资源必须可见降级，不得静默遗漏。

## 测试策略

### 解析与投影

- 用覆盖 CommonMark/GFM 结构的 fixture 验证节点 ID、章节树、源码范围和 AI 文本投影。
- 验证重复标题、空章节、标题跳级、无标题文档、嵌套列表、代码、表格、脚注和图片。
- 验证 Main 与 Renderer 使用相同解析配置和 ID 规则。

### Renderer

- 验证标题和正文按源顺序渲染，语义元素与层级正确。
- 验证目录标题只出现一次正文内容，但目录与正文共享定位 ID。
- 验证链接、远程图片、原始 HTML 和不支持节点的安全行为。
- 验证跨 block 选区、引用、定位高亮和阅读位置。

### 数据库与服务

- 从空数据库验证 Markdown-only schema。
- 验证导入只接受 `.md`，不存在 EPUB 分支。
- 验证书籍打开时从权威 Markdown 副本派生文档。
- 验证新的 block anchor 能随会话和消息引用持久化。

### 回归与人工验收

- 保留全书、章节和选区 AI 目标的回归覆盖。
- 人工检查长文档、中英文混排、大型代码块、宽表格、损坏图片和长脚注。
- 人工确认目录跳转到标题、选区跨结构工作、被阻止资源有明确反馈。
- 完成前运行 `pnpm check`。

## 实施阶段

1. 硬移除 EPUB，收紧 Markdown-only 类型与导入边界。
2. 建立共享 Markdown 解析配置、稳定 ID、章节索引和 AI 文本投影。
3. 用 Markdown renderer 替换 passage 正文渲染，完成目录和阅读位置接线。
4. 将选区、引用、线程目标和原文定位迁移到 block anchor。
5. 重写破坏性 schema 及 LibraryService/ContextAssembler，删除旧章节与 passage 正文模型。
6. 补齐书内图片资源、安全降级、自动测试和人工验收。
7. 删除过渡代码，将 Spec 和 Plan 移入 `completed/`。

各阶段可以在开发分支内暂时不兼容，但最终提交不得同时保留新旧两套正文事实来源。

## 验收条件

- 产品只接受和展示 Markdown，代码库不存在 EPUB 功能分支。
- 原始 Markdown 是正文唯一事实来源，没有持久化的 passage 正文副本。
- CommonMark/GFM 主要结构与行内语义正确、安全地呈现，标题出现在正文。
- 目录、正文、阅读位置、选区引用和 AI 上下文来自同一解析规则。
- 目录跳转定位标题本身；同名、多级和空章节行为确定。
- AI 上下文不再遗漏标题、代码、列表、引用、表格和脚注的可读内容。
- 远程资源、原始 HTML、外部链接和本地路径遵守安全策略。
- 新 schema 可从空数据库完整工作；旧数据库只给出手动删除提示，不被应用自动删除。
- 相关自动测试通过，`pnpm check` 通过，必要人工验收有记录。
