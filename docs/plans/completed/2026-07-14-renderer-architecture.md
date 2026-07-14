# Renderer 架构收敛计划

对应规格：[Renderer 架构收敛规格](../../specs/completed/2026-07-14-renderer-architecture.md)

1. [x] 为跨书流隔离和会话状态转换补充失败测试。
2. [x] 实现纯 workspace reducer，并由 feature Hook 统一执行会话副作用。
3. [x] 提取原文定位 Hook，简化页面组合和面板 props。
4. [x] 将 preload API 类型迁入 shared，加强 Harness 边界检查。
5. [x] 补齐关键异步错误处理，运行 `pnpm check`。
6. [x] 验收通过后把本 Spec 和 Plan 移入各自的 `completed/`。

## 验证结果

- `pnpm check` 通过。
- Vitest：15 个测试文件、103 个测试通过。
- TypeScript、Oxlint、格式检查和 Electron 生产构建通过。
