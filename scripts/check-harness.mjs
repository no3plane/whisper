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
for (const file of sourceFiles) {
  const name = relative(file);
  const content = fs.readFileSync(file, 'utf8');

  if (name.startsWith('src/renderer/') && /from\s+['"]\.\.\/\.\.\/main\//.test(content)) {
    fail(`${name}：renderer 不得直接依赖 main；请通过 shared 契约和 preload IPC。`);
  }
  if (name.startsWith('src/shared/') && /from\s+['"](?:electron|node:)/.test(content)) {
    fail(`${name}：shared 不得依赖 Electron 或 Node 运行时。`);
  }
  if (name.startsWith('src/preload/') && /from\s+['"]\.\.\/main\//.test(content)) {
    fail(`${name}：preload 不得依赖 main 实现；只允许依赖 shared 契约。`);
  }
  if (!name.endsWith('src/main/logging/logger.ts') && /console\.(log|debug|info|warn|error)\s*\(/.test(content)) {
    fail(`${name}：生产代码禁止直接使用 console；主进程请使用统一 logger。`);
  }
}

const markdownFiles = walk(root).filter((file) => {
  const name = relative(file);
  return name.endsWith('.md')
    && !name.startsWith('node_modules/')
    && !name.startsWith('.git/')
    && !name.startsWith('.worktrees/')
    && !name.startsWith('.superpowers/');
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

console.log(`Harness 检查通过：${sourceFiles.length} 个源码文件，${markdownFiles.length} 个文档文件。`);
