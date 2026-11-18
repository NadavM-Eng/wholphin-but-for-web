// The project's additional permission (root file LICENSE-EXCEPTION.md), shown on the License page. The text is
// imported from that file at build time, so the page can never drift from the file that ships with the source.
import source from '../../../LICENSE-EXCEPTION.md?raw'

export type ExceptionBlock = { kind: 'heading' | 'paragraph'; text: string }

/** Markdown reduced to what the file uses: `#` headings, paragraphs, inline code marks. */
export function parseExceptionText(markdown: string): ExceptionBlock[] {
  const plain = (s: string) => s.replace(/`([^`]*)`/g, '$1').replace(/\s*\r?\n\s*/g, ' ').trim()
  return markdown
    .split(/\r?\n[ \t]*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block): ExceptionBlock[] => {
      const heading = /^(#{1,6})\s+(.+)$/.exec(block)
      // the file's own title: the page's section heading (a translated string) stands in for it
      if (heading?.[1] === '#') return []
      return [heading ? { kind: 'heading', text: plain(heading[2]) } : { kind: 'paragraph', text: plain(block) }]
    })
}

export const LICENSE_EXCEPTION: readonly ExceptionBlock[] = parseExceptionText(source)
