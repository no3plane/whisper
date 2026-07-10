import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import type { Chapter, Passage } from '../../shared/types';

function entries(buffer: Buffer): Map<string, Buffer> {
  const output = new Map<string, Buffer>();
  let offset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (offset < 0) throw new Error('EPUB 不是有效的 ZIP 文件：缺少 central directory。');
  const count = buffer.readUInt16LE(offset + 10);
  offset = buffer.readUInt32LE(offset + 16);
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('EPUB central directory 损坏。');
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + size);
    if (!name.endsWith('/')) {
      if (method === 0) output.set(name, compressed);
      else if (method === 8) output.set(name, inflateRawSync(compressed));
      else throw new Error(`EPUB 使用了不支持的压缩算法：${method}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return output;
}

const decode = (value: string) => value
  .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

export class EpubParser {
  parse(input: { bookId: string; buffer: Buffer }) {
    const files = entries(input.buffer);
    const container = files.get('META-INF/container.xml')?.toString('utf8');
    const opfPath = container?.match(/full-path=["']([^"']+)["']/i)?.[1];
    if (!opfPath) throw new Error('EPUB 缺少 container.xml 或 OPF rootfile。');
    const opf = files.get(opfPath)?.toString('utf8');
    if (!opf) throw new Error(`EPUB 无法读取 manifest：${opfPath}`);
    const manifest = new Map<string, string>();
    for (const match of opf.matchAll(/<item\b[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) manifest.set(match[1], match[2]);
    const spine = [...opf.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
    if (manifest.size === 0) throw new Error('EPUB manifest 为空。');
    if (spine.length === 0) throw new Error('EPUB spine 为空。');
    const base = path.posix.dirname(opfPath);
    const chapters: Chapter[] = [];
    const passages: Passage[] = [];
    for (const [chapterOrder, idref] of spine.entries()) {
      const href = manifest.get(idref);
      if (!href) throw new Error(`EPUB spine 引用了不存在的 manifest item：${idref}`);
      const filePath = path.posix.normalize(path.posix.join(base, decodeURIComponent(href.split('#')[0])));
      const html = files.get(filePath)?.toString('utf8');
      if (!html) throw new Error(`EPUB 章节文件不可读：${filePath}`);
      const title = decode(html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? `第 ${chapterOrder + 1} 章`);
      const blocks = decode(html).split(/\n\n+/).map((value) => value.trim()).filter(Boolean);
      const chapterId = `${input.bookId}-chapter-${chapterOrder}`;
      const start = passages.length;
      for (const text of blocks) passages.push({ id: `${input.bookId}-passage-${passages.length}`, bookId: input.bookId, chapterId, order: passages.length, text, sourceHref: href, sourceOffset: html.indexOf(text) });
      if (passages.length > start) chapters.push({ id: chapterId, bookId: input.bookId, parentChapterId: null, title, level: 1, order: chapterOrder, startPassageId: passages[start].id, endPassageId: passages[passages.length - 1].id, summary: null });
    }
    return { chapters, passages, fullText: passages.map((passage) => passage.text).join('\n\n') };
  }
}
