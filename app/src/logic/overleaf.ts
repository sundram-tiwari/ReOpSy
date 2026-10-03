import { LibraryEntry } from '../types';
import { cleanText } from './cardView';
import { EMPTY_MATRIX, MATRIX_COLUMNS, citationKeys, escapeLatex, toBibTeX } from './exporters';

/**
 * Builds a ready-to-compile survey skeleton for Overleaf.
 *
 * Overleaf's "Open in Overleaf" endpoint (POST https://www.overleaf.com/docs)
 * creates a project from a snippet without any API key. We send one file:
 * main.tex embeds references.bib through the LaTeX kernel's filecontents
 * environment, so the bibliography travels inside the single snippet.
 */
export const OVERLEAF_ENDPOINT = 'https://www.overleaf.com/docs';

export interface SurveyOptions {
  title: string;
  author?: string;
}

function cell(s: string): string {
  return escapeLatex(cleanText(s));
}

export function buildSurveyTex(entries: LibraryEntry[], opts: SurveyOptions): string {
  const papers = entries.map((e) => e.paper);
  const keys = citationKeys(papers);
  const bib = toBibTeX(papers);
  const withMatrix = entries.filter((e) => {
    const m = e.matrix || e.paper.matrixRow;
    return m && Object.values(m).some(Boolean);
  });

  const rows = withMatrix
    .map((e) => {
      const m = e.matrix || e.paper.matrixRow || EMPTY_MATRIX;
      const cite = `\\cite{${keys.get(e.paper.id)}}`;
      return `${cite} & ${MATRIX_COLUMNS.map((c) => cell(m[c.key] || '')).join(' & ')} \\\\`;
    })
    .join('\n\\midrule\n');

  const table = withMatrix.length
    ? [
        '\\begin{table*}[t]',
        '\\centering\\small',
        `\\begin{tabularx}{\\textwidth}{l${'X'.repeat(MATRIX_COLUMNS.length)}}`,
        '\\toprule',
        `Paper & ${MATRIX_COLUMNS.map((c) => `\\textbf{${c.label}}`).join(' & ')} \\\\`,
        '\\midrule',
        rows,
        '\\bottomrule',
        '\\end{tabularx}',
        '\\caption{Literature matrix exported from ReOpSy.}',
        '\\label{tab:matrix}',
        '\\end{table*}',
      ].join('\n')
    : '% Add matrix rows in ReOpSy (Library > Survey) to generate a comparison table here.';

  const notes = entries
    .filter((e) => e.note)
    .map((e) => `% ${keys.get(e.paper.id)}: ${cleanText(e.note || '').replace(/\n/g, ' ')}`)
    .join('\n');

  return [
    '\\begin{filecontents*}[overwrite]{references.bib}',
    bib.trimEnd(),
    '\\end{filecontents*}',
    '\\documentclass[11pt]{article}',
    '\\usepackage[margin=1in]{geometry}',
    '\\usepackage{booktabs,tabularx}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\usepackage[numbers]{natbib}',
    `\\title{${escapeLatex(opts.title)}}`,
    `\\author{${escapeLatex(opts.author || 'Your Name')}}`,
    '\\date{\\today}',
    '\\begin{document}',
    '\\maketitle',
    '',
    '\\section{Introduction}',
    '% State the research question this survey answers.',
    '',
    '\\section{Related work}',
    `This survey covers ${entries.length} paper${entries.length === 1 ? '' : 's'} collected in ReOpSy.`,
    '',
    table,
    '',
    notes,
    '',
    '\\section{Open problems}',
    '% What the matrix shows is missing.',
    '',
    '\\nocite{*}',
    '\\bibliographystyle{plainnat}',
    '\\bibliography{references}',
    '\\end{document}',
    '',
  ].join('\n');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** UTF-8 safe base64url, with no dependency on btoa or Buffer. */
export function base64UrlEncode(text: string): string {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else {
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}
