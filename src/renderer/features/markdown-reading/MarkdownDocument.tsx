// oxlint-disable react/no-unstable-nested-components -- react-markdown 的映射函数由 useMemo 稳定，仅在文档输入变化时重建。
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkVisibleHtml } from '../../../shared/markdown/remarkVisibleHtml';
import type { MarkdownBlock } from '../../../shared/types';
import { whisper } from '../../api/whisper';
import styles from './MarkdownDocument.module.css';

interface Props {
  markdown: string;
  blocks: MarkdownBlock[];
  resources: Record<string, string>;
}

export const MarkdownDocument = memo(function MarkdownDocument({
  markdown,
  blocks,
  resources,
}: Props) {
  const byStart = useMemo(
    () => new Map(blocks.map((block) => [block.sourceStart, block])),
    [blocks],
  );
  const components = useMemo<Components>(() => {
    const anchor = (node?: { position?: { start: { offset?: number } } }) => {
      const offset = node?.position?.start.offset;
      const block = offset == null ? undefined : byStart.get(offset);
      return block ? { id: block.id, 'data-block-id': block.id } : {};
    };
    return {
      h1: ({ node, children }) => <h1 {...anchor(node)}>{children}</h1>,
      h2: ({ node, children }) => <h2 {...anchor(node)}>{children}</h2>,
      h3: ({ node, children }) => <h3 {...anchor(node)}>{children}</h3>,
      h4: ({ node, children }) => <h4 {...anchor(node)}>{children}</h4>,
      h5: ({ node, children }) => <h5 {...anchor(node)}>{children}</h5>,
      h6: ({ node, children }) => <h6 {...anchor(node)}>{children}</h6>,
      p: ({ node, children }) => <p {...anchor(node)}>{children}</p>,
      blockquote: ({ node, children }) => <blockquote {...anchor(node)}>{children}</blockquote>,
      ul: ({ node, children, className }) => (
        <ul {...anchor(node)} className={className}>
          {children}
        </ul>
      ),
      ol: ({ node, children }) => <ol {...anchor(node)}>{children}</ol>,
      pre: ({ node, children }) => <pre {...anchor(node)}>{children}</pre>,
      table: ({ node, children }) => (
        <div className={styles.tableScroller}>
          <table {...anchor(node)}>{children}</table>
        </div>
      ),
      a: ({ href, children }) => {
        const safe = href && /^(https?:|mailto:|#)/i.test(href);
        return safe ? (
          <a
            href={href}
            onClick={(event) => {
              if (!href.startsWith('#')) {
                event.preventDefault();
                void whisper.shell.openExternal(href);
              }
            }}
          >
            {children}
          </a>
        ) : (
          <span>{children}</span>
        );
      },
      img: ({ src, alt }) => {
        if (!src || /^(https?:|data:|javascript:)/i.test(src)) {
          return <span className={styles.blockedImage}>图片未加载：{alt || '无说明'}</span>;
        }
        const safeSource = resources[src];
        return safeSource ? (
          <img src={safeSource} alt={alt ?? ''} />
        ) : (
          <span className={styles.blockedImage}>图片不可用：{alt || src}</span>
        );
      },
    };
  }, [byStart, resources]);
  return (
    <div className={styles.document}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkVisibleHtml]}
        skipHtml
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
});
