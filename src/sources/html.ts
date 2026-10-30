import { Parser } from 'htmlparser2';
import type { TextBlock } from './types.js';

const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'br', 'tr', 'blockquote', 'pre', 'ul', 'ol', 'table']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Content inside these is never text the candidate should see.
const DROP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'head', 'title']);

const MAX_BLOCKS = 400;
const MAX_TEXT = 4000;

/**
 * Convert untrusted posting HTML into plain text blocks. No markup, attributes or URLs survive:
 * the dashboard renders blocks as text, so injected script or handlers cannot execute.
 */
export function htmlToBlocks(html: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let current: TextBlock['type'] = 'paragraph';
  let buffer = '';
  let dropDepth = 0;

  const flush = (): void => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    buffer = '';
    if (text && blocks.length < MAX_BLOCKS) blocks.push({ type: current, text: text.slice(0, MAX_TEXT) });
    current = 'paragraph';
  };

  const parser = new Parser(
    {
      onopentag(name) {
        if (DROP_TAGS.has(name)) {
          dropDepth += 1;
          return;
        }
        if (dropDepth > 0) return;
        if (HEADING_TAGS.has(name)) {
          flush();
          current = 'heading';
        } else if (name === 'li') {
          flush();
          current = 'item';
        } else if (BLOCK_TAGS.has(name)) {
          flush();
        }
      },
      ontext(text) {
        if (dropDepth === 0) buffer += text;
      },
      onclosetag(name) {
        if (DROP_TAGS.has(name)) {
          dropDepth = Math.max(0, dropDepth - 1);
          return;
        }
        if (dropDepth > 0) return;
        if (HEADING_TAGS.has(name) || name === 'li' || BLOCK_TAGS.has(name)) flush();
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();
  flush();
  return blocks;
}

export function blocksToText(blocks: TextBlock[]): string {
  return blocks.map((b) => b.text).join('\n');
}

/** Plain text (e.g. pasted by the user) to blocks, one paragraph per blank-line-separated chunk. */
export function textToBlocks(text: string): TextBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAX_BLOCKS)
    .map((chunk) => ({ type: /^[-*•]\s/.test(chunk) ? 'item' : 'paragraph', text: chunk.replace(/^[-*•]\s+/, '').slice(0, MAX_TEXT) }));
}
