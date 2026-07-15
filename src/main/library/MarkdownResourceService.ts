import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown, type MarkdownNode } from '../../shared/markdown/analyzeMarkdown';

const mimeByExtension: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export class MarkdownResourceService {
  import(markdown: string, markdownPath: string, bookDir: string): void {
    const sourceRoot = path.dirname(path.resolve(markdownPath));
    const resourcesDir = path.join(bookDir, 'resources');
    const manifest: Record<string, string> = {};
    const importNode = (node: MarkdownNode) => {
      if (node.type !== 'image' || typeof node.url !== 'string') {
        node.children?.forEach(importNode);
        return;
      }
      if (/^[a-z][a-z\d+.-]*:/i.test(node.url)) {
        return;
      }
      const source = path.resolve(sourceRoot, decodeURIComponent(node.url.split('#')[0]));
      if (!source.startsWith(`${sourceRoot}${path.sep}`) || !fs.existsSync(source)) {
        return;
      }
      const extension = path.extname(source).toLowerCase();
      if (!mimeByExtension[extension]) {
        return;
      }
      fs.mkdirSync(resourcesDir, { recursive: true });
      const name = `${createHash('sha256').update(node.url).digest('hex')}${extension}`;
      fs.copyFileSync(source, path.join(resourcesDir, name));
      manifest[node.url] = name;
    };
    importNode(parseMarkdown(markdown));
    fs.writeFileSync(path.join(bookDir, 'resources.json'), JSON.stringify(manifest));
  }

  read(bookDir: string): Record<string, string> {
    const manifestPath = path.join(bookDir, 'resources.json');
    if (!fs.existsSync(manifestPath)) {
      return {};
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(manifest).flatMap(([reference, name]) => {
        const extension = path.extname(name).toLowerCase();
        const mime = mimeByExtension[extension];
        const file = path.join(bookDir, 'resources', path.basename(name));
        return mime && fs.existsSync(file)
          ? [[reference, `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`]]
          : [];
      }),
    );
  }
}
