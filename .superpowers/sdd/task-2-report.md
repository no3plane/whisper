# Task 2 实施报告

## 状态

已完成：Markdown 解析器现在会建立多级章节父子关系，并让父章节的 passage 范围覆盖其全部后代内容。

## 实现

- 解析标题时维护 heading 栈：遇到同级或更高层级标题时弹栈，剩余栈顶作为父章节。
- 记录每个章节标题出现时的 passage 起始索引。
- 解析结束后，以后续第一个 `level <= 当前章节 level` 的标题作为范围边界。
- 段落仍归属最近出现的标题，未改变既有 passage 归属语义。

## TDD 证据

- RED：任务接手前已由前序执行记录确认新增测试因 `parentChapterId` 为 `null` 失败。
- GREEN：完成实现后，目标测试通过。

## 验证

- `pnpm vitest run tests/main/MarkdownParser.test.ts`：2 tests passed。
- `pnpm test`：3 files、7 tests passed。
- `pnpm lint:types`：通过。

## 自审

- 改动仅限 Task 2 指定的解析器、测试与本报告。
- 父章节范围会包含自身标题之后、下一个同级或更高层级标题之前的全部 passage，包括子孙章节内容。
- 空章节仍保持空的 `startPassageId/endPassageId`；这与既有空章节语义一致。
- 未发现需要阻塞后续任务的问题。
