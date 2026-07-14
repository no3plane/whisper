# Renderer 模块组织规格

## 背景

当前 `src/renderer` 同时使用 `pages/`、`components/`、`chat/` 和 `selection/` 组织代码。随着阅读选区和 AI 对话功能增长，业务相关的 UI、状态和纯逻辑分散在不同技术类型目录中；`components/` 也同时容纳阅读、对话和设置等不同职责。

本次变更只调整 renderer 内部模块边界和命名，不改变 UI、数据流、IPC 契约或用户行为。

## 目标

- 页面保留为顶层组合入口。
- 持续演进的用户能力按 feature 内聚 UI、状态和纯逻辑。
- 公共目录只容纳经过实际跨 feature 复用验证的代码。
- 用稳定的命名规则表达目录和文件的角色。
- 保持现有测试覆盖和所有架构不变量。

## 非目标

- 不拆分 `ReaderPage` 或 `RightAiPanel` 的内部实现。
- 不修改组件 API、状态模型、持久化方式或 IPC。
- 不引入 barrel export、路径别名、状态管理库或新的依赖。
- 不为尚未出现的复用提前创建 `shared/ui`。

## 目录结构

目标结构为：

```text
src/renderer/
├── api/
│   └── whisper.ts
├── features/
│   ├── conversation/
│   │   ├── RightAiPanel.module.css
│   │   ├── RightAiPanel.tsx
│   │   ├── TargetPicker.module.css
│   │   ├── TargetPicker.tsx
│   │   ├── ThreadHistory.module.css
│   │   ├── ThreadHistory.tsx
│   │   └── draftState.ts
│   ├── reading-selection/
│   │   ├── SelectionMenu.module.css
│   │   ├── SelectionMenu.tsx
│   │   └── selectionSnapshot.ts
│   └── settings/
│       ├── SettingsPanel.module.css
│       └── SettingsPanel.tsx
├── pages/
│   ├── library-page/
│   │   ├── LibraryPage.module.css
│   │   └── LibraryPage.tsx
│   └── reader-page/
│       ├── ReaderPage.module.css
│       └── ReaderPage.tsx
├── App.module.css
├── App.tsx
├── main.tsx
└── styles.css
```

`App.tsx` 暂时保留在 renderer 根目录，因为它是简短且唯一的应用组合入口；在出现路由、Provider 或更多 app 级模块前不创建 `app/`。

## 边界规则

- `pages/` 负责页面级组合和页面状态编排。
- `features/` 按用户能力组织实现；一个 feature 可同时包含组件、样式、状态和纯逻辑。
- `api/` 继续作为 renderer 到 preload API 的最小适配层。
- feature 可以依赖 renderer `api/` 和 `src/shared/`，但不得依赖其他页面。
- 页面可以组合多个 feature。
- 只有被多个无关 feature 实际复用的 renderer 代码才能提升到未来的 `shared/` 目录。

## 命名规则

- 目录使用 `kebab-case`。
- React 组件文件使用 `PascalCase.tsx`。
- 组件 CSS Module 与组件同名，使用 `PascalCase.module.css`。
- 普通 TypeScript 模块使用 `camelCase.ts`。
- Hook 使用 `useXxx.ts`。
- 测试文件沿用被测源码名称，并添加 `.test.ts` 或 `.test.tsx`；本次继续保留在 `tests/renderer/`。

## 长期治理

本 Spec 在迁移完成后会进入 `docs/specs/completed/`，因此不作为长期规范的唯一载体。

- `ARCHITECTURE.md` 记录 renderer 的长期模块边界、依赖方向和命名规则，供开发者理解与评审。
- `scripts/check-harness.mjs` 对稳定且能够低误报判断的规则执行阻断检查。
- `pnpm check` 已包含 `pnpm harness:check`，无需增加新的质量入口。

Harness 本次强制以下规则：

- 禁止重新创建 `src/renderer/components/`、`src/renderer/chat/` 和 `src/renderer/selection/`。
- `src/renderer/pages/` 和 `src/renderer/features/` 的直接子目录必须使用 `kebab-case`。
- page 不得互相导入；feature 不得导入 page。
- React 组件 `.tsx` 文件使用 `PascalCase`，但保留约定入口 `main.tsx`。
- CSS Module 必须使用 `PascalCase.module.css`，并与同目录的同名组件文件配对。

“代码是否属于正确 feature”“是否已经值得提升为共享代码”等需要业务语义的判断继续由评审负责，不写成容易误报的路径猜测规则。

## 迁移与兼容性

迁移只移动文件并更新静态 import。不会保留旧路径的转发文件，因为仓库内部引用可以原子更新，且不存在对 renderer 源码路径的外部兼容承诺。

测试文件继续位于 `tests/renderer/`，本次仅更新其 import 路径，不同时重组测试目录，避免把无关变化混入结构迁移。

## 验收条件

- `src/renderer/components/`、`src/renderer/chat/` 和 `src/renderer/selection/` 不再存在。
- 页面和 feature 文件全部位于目标目录，所有 import 指向新路径。
- 运行时行为和渲染结果不变。
- 不新增依赖、barrel export 或兼容转发文件。
- `ARCHITECTURE.md` 已同步长期规则，Harness 能阻止明确的结构回退。
- `pnpm check` 通过。
