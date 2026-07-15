import type { MarkdownNode } from './analyzeMarkdown';

export function remarkVisibleHtml() {
  return (root: MarkdownNode) => {
    const replaceHtml = (node: MarkdownNode) => {
      node.children?.forEach((child, index) => {
        if (child.type === 'html') {
          node.children![index] = {
            type: 'paragraph',
            children: [{ type: 'text', value: `[不支持的 HTML] ${child.value ?? ''}` }],
          };
        } else {
          replaceHtml(child);
        }
      });
    };
    replaceHtml(root);
  };
}
