import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

const requiredFiles = [
  'AGENTS.md',
  'README.md',
  'ARCHITECTURE.md',
  'docs/MANUAL_TESTING.md',
  'docs/quality/README.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) fail(`缺少 Harness 必需文件：${file}`);
}

const sourceFiles = walk(path.join(root, 'src')).filter((file) => /\.(ts|tsx)$/.test(file));

const legacyRendererDirectories = ['components', 'chat', 'selection'];
for (const directory of legacyRendererDirectories) {
  const name = `src/renderer/${directory}`;
  if (fs.existsSync(path.join(root, name))) {
    fail(`${name}：renderer 应按页面和 feature 组织，不得恢复遗留的技术类型目录。`);
  }
}

for (const parent of ['src/renderer/pages', 'src/renderer/features']) {
  const directory = path.join(root, parent);
  if (!fs.existsSync(directory)) continue;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) {
      fail(`${parent}/${entry.name}：页面和 feature 目录必须使用 kebab-case。`);
    }
  }
}

for (const file of sourceFiles) {
  const name = relative(file);
  const content = fs.readFileSync(file, 'utf8');

  if (
    name.startsWith('src/renderer/') &&
    /from\s+['"](?:electron|node:|(?:\.\.\/)+(?:main|preload)(?:\/|['"]))/.test(content)
  ) {
    fail(
      `${name}：renderer 不得依赖 main、preload、Electron 或 Node；请通过 shared 契约和 preload IPC。`,
    );
  }
  if (name.startsWith('src/shared/') && /from\s+['"](?:electron|node:)/.test(content)) {
    fail(`${name}：shared 不得依赖 Electron 或 Node 运行时。`);
  }
  if (name.startsWith('src/preload/') && /from\s+['"]\.\.\/main\//.test(content)) {
    fail(`${name}：preload 不得依赖 main 实现；只允许依赖 shared 契约。`);
  }
  if (
    !name.endsWith('src/main/logging/logger.ts') &&
    /console\.(log|debug|info|warn|error)\s*\(/.test(content)
  ) {
    fail(`${name}：生产代码禁止直接使用 console；主进程请使用统一 logger。`);
  }

  if (name.startsWith('src/renderer/') && name.endsWith('.tsx')) {
    const stem = path.basename(name, '.tsx');
    if (stem !== 'main' && !/^[A-Z][A-Za-z0-9]*$/.test(stem)) {
      fail(`${name}：React 组件文件必须使用 PascalCase；renderer 入口 main.tsx 除外。`);
    }
  }

  if (name.startsWith('src/renderer/features/') || name.startsWith('src/renderer/pages/')) {
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const target = relative(path.resolve(path.dirname(file), specifier));

      if (name.startsWith('src/renderer/features/') && target.startsWith('src/renderer/pages/')) {
        fail(`${name}：feature 不得依赖 page（${specifier}）。`);
      }

      if (name.startsWith('src/renderer/pages/') && target.startsWith('src/renderer/pages/')) {
        const sourcePage = name.split('/')[3];
        const targetPage = target.split('/')[3];
        if (sourcePage !== targetPage) fail(`${name}：page 不得依赖其他 page（${specifier}）。`);
      }
    }
  }
}

const rendererCssModules = walk(path.join(root, 'src/renderer')).filter((file) =>
  file.endsWith('.module.css'),
);
for (const file of rendererCssModules) {
  const name = relative(file);
  const stem = path.basename(file, '.module.css');
  if (!/^[A-Z][A-Za-z0-9]*$/.test(stem)) {
    fail(`${name}：组件 CSS Module 必须使用 PascalCase.module.css。`);
  }
  if (!fs.existsSync(path.join(path.dirname(file), `${stem}.tsx`))) {
    fail(`${name}：组件 CSS Module 必须与同目录的 ${stem}.tsx 配对。`);
  }
}

const markdownFiles = walk(root).filter((file) => {
  const name = relative(file);
  return (
    name.endsWith('.md') &&
    !name.startsWith('node_modules/') &&
    !name.startsWith('.git/') &&
    !name.startsWith('.worktrees/') &&
    !name.startsWith('.superpowers/')
  );
});

for (const file of markdownFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]+\]\((?!https?:|mailto:|#)([^)]+)\)/g)) {
    const raw = match[1].split('#')[0];
    if (!raw || raw.startsWith('/')) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(raw));
    if (!fs.existsSync(target)) fail(`${relative(file)}：本地链接不存在：${match[1]}`);
  }
}

if (failures.length > 0) {
  console.error('Harness 检查失败：');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(
  `Harness 检查通过：${sourceFiles.length} 个源码文件，${markdownFiles.length} 个文档文件。`,
);
