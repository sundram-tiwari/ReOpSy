"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const bibtex_1 = require("../bibtex");
function paper(over = {}) {
    return {
        id: 'arxiv:1706.03762',
        source: 'arxiv',
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
        year: 2017,
        venue: 'NeurIPS',
        topics: ['ml'],
        summary: 'A summary.',
        abstract: null,
        license: null,
        licenseOk: false,
        doi: null,
        arxivId: '1706.03762',
        url: 'https://arxiv.org/abs/1706.03762',
        pdfUrl: null,
        citedByCount: 90000,
        publishedAt: '2017-06-12',
        ...over,
    };
}
(0, node_test_1.default)('every TeX special character is escaped', () => {
    const out = (0, bibtex_1.escapeBibTeX)('R&D costs 50% of $5 #1 a_b {c} ~x ^y');
    for (const ch of ['\\&', '\\%', '\\$', '\\#', '\\_', '\\{', '\\}']) {
        strict_1.default.ok(out.includes(ch), `${ch} not escaped in: ${out}`);
    }
    strict_1.default.ok(out.includes('\\textasciitilde{}'));
    strict_1.default.ok(out.includes('\\textasciicircum{}'));
});
(0, node_test_1.default)('a backslash is escaped first, so escapes are not double-escaped', () => {
    strict_1.default.equal((0, bibtex_1.escapeBibTeX)('a\\b'), 'a\\textbackslash{}b');
    strict_1.default.ok(!(0, bibtex_1.escapeBibTeX)('50%').includes('\\\\'));
});
(0, node_test_1.default)('acronyms are brace-protected, ordinary words are not', () => {
    strict_1.default.equal((0, bibtex_1.protectCapitals)('BERT for NLP tasks'), '{BERT} for {NLP} tasks');
    strict_1.default.equal((0, bibtex_1.protectCapitals)('The state of things'), 'The state of things');
    strict_1.default.equal((0, bibtex_1.protectCapitals)('GPT4 results'), '{GPT4} results');
});
(0, node_test_1.default)('family names are found in both name orders', () => {
    strict_1.default.equal((0, bibtex_1.familyName)('Ada Lovelace'), 'Lovelace');
    strict_1.default.equal((0, bibtex_1.familyName)('Lovelace, Ada'), 'Lovelace');
    strict_1.default.equal((0, bibtex_1.familyName)('Plato'), 'Plato');
    strict_1.default.equal((0, bibtex_1.familyName)('  '), '');
});
(0, node_test_1.default)('authors are emitted as "Family, Given" joined by and', () => {
    strict_1.default.equal((0, bibtex_1.formatAuthors)(['Ada Lovelace', 'Alan Turing']), 'Lovelace, Ada and Turing, Alan');
    strict_1.default.equal((0, bibtex_1.formatAuthors)(['van der Berg, Jan']), 'van der Berg, Jan');
    strict_1.default.equal((0, bibtex_1.formatAuthors)([]), '');
});
(0, node_test_1.default)('cite keys are stable, lowercase and ASCII-only', () => {
    strict_1.default.equal((0, bibtex_1.citeKey)(paper()), 'vaswani2017attention');
    strict_1.default.equal((0, bibtex_1.citeKey)(paper({ authors: ['Paul Erdős'], year: 1959, title: 'On Random Graphs' })), 'erdos1959random');
    strict_1.default.match((0, bibtex_1.citeKey)(paper({ authors: [], year: null })), /^anon/);
    strict_1.default.match((0, bibtex_1.citeKey)(paper()), /^[a-z0-9]+$/);
});
(0, node_test_1.default)('a full entry has balanced braces and every field populated', () => {
    const bib = (0, bibtex_1.toBibTeX)(paper({ doi: '10.5555/x' }));
    strict_1.default.match(bib, /^@article\{vaswani2017attention,/);
    strict_1.default.ok(bib.includes('author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki}'));
    strict_1.default.ok(bib.includes('year = {2017}'));
    strict_1.default.ok(bib.includes('doi = {10.5555/x}'));
    strict_1.default.ok(bib.includes('eprint = {1706.03762}'));
    strict_1.default.ok(bib.includes('archivePrefix = {arXiv}'));
    strict_1.default.equal((bib.match(/\{/g) || []).length, (bib.match(/\}/g) || []).length, `unbalanced braces:\n${bib}`);
});
(0, node_test_1.default)('a preprint with no DOI is @misc, a published paper is @article', () => {
    strict_1.default.match((0, bibtex_1.toBibTeX)(paper()), /^@misc\{/);
    strict_1.default.match((0, bibtex_1.toBibTeX)(paper({ doi: '10.1/x' })), /^@article\{/);
});
(0, node_test_1.default)('missing fields are omitted, never emitted empty', () => {
    const bib = (0, bibtex_1.toBibTeX)(paper({ year: null, venue: null, doi: null, arxivId: null, authors: [] }));
    strict_1.default.ok(!bib.includes('year ='));
    strict_1.default.ok(!bib.includes('author ='));
    strict_1.default.ok(!bib.includes('journal ='));
    strict_1.default.ok(!/=\s*\{\}/.test(bib), `empty field in:\n${bib}`);
});
(0, node_test_1.default)('a title full of specials survives escaping intact', () => {
    const bib = (0, bibtex_1.toBibTeX)(paper({ title: 'Cost & Effect: 50% of $X in {Y}' }));
    strict_1.default.equal((bib.match(/\{/g) || []).length, (bib.match(/\}/g) || []).length);
    strict_1.default.ok(bib.includes('\\&') && bib.includes('\\%'));
});
(0, node_test_1.default)('duplicate cite keys are disambiguated so nothing is silently dropped', () => {
    const file = (0, bibtex_1.toBibTeXFile)([
        paper({ id: 'a' }),
        paper({ id: 'b' }),
        paper({ id: 'c' }),
    ]);
    const keys = [...file.matchAll(/@\w+\{([^,]+),/g)].map((m) => m[1]);
    strict_1.default.equal(keys.length, 3);
    strict_1.default.equal(new Set(keys).size, 3, `duplicate keys: ${keys.join(', ')}`);
    strict_1.default.deepEqual(keys, ['vaswani2017attention', 'vaswani2017attentiona', 'vaswani2017attentionb']);
});
(0, node_test_1.default)('an exported file has a header and one entry per paper', () => {
    const file = (0, bibtex_1.toBibTeXFile)([paper({ id: 'a' }), paper({ id: 'b', title: 'Another Paper' })]);
    strict_1.default.match(file, /^% ReOpSy library export — 2 entries/);
    strict_1.default.equal((file.match(/^@/gm) || []).length, 2);
    strict_1.default.ok(file.endsWith('\n'));
});
(0, node_test_1.default)('an empty library exports a valid, empty file', () => {
    const file = (0, bibtex_1.toBibTeXFile)([]);
    strict_1.default.match(file, /0 entries/);
    strict_1.default.ok(!file.includes('@'));
});
(0, node_test_1.default)('the plain citation is readable and ends with the link', () => {
    const cite = (0, bibtex_1.toPlainCitation)(paper());
    strict_1.default.equal(cite, 'Vaswani, Shazeer, Parmar (2017) Attention Is All You Need. NeurIPS. https://arxiv.org/abs/1706.03762');
    strict_1.default.ok((0, bibtex_1.toPlainCitation)(paper({ authors: ['A B', 'C D', 'E F', 'G H'] })).includes('et al.'));
    strict_1.default.ok((0, bibtex_1.toPlainCitation)(paper({ authors: [] })).startsWith('Unknown author'));
});
