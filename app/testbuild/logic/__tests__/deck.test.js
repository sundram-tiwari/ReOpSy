"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const deck_1 = require("../deck");
function paper(id, topics, over = {}) {
    return {
        id,
        source: 'demo',
        title: `Paper ${id}`,
        authors: ['A Author'],
        year: 2025,
        venue: 'Venue',
        topics,
        summary: 'A short summary.',
        abstract: null,
        license: null,
        licenseOk: false,
        doi: null,
        arxivId: null,
        url: 'https://example.org/' + id,
        pdfUrl: null,
        citedByCount: null,
        publishedAt: '2025-01-01',
        ...over,
    };
}
const TOPICS = ['ml', 'nlp', 'cv'];
const CORPUS = [
    ...Array.from({ length: 10 }, (_, i) => paper(`ml${i}`, ['ml'])),
    ...Array.from({ length: 10 }, (_, i) => paper(`nlp${i}`, ['nlp'])),
    ...Array.from({ length: 10 }, (_, i) => paper(`cv${i}`, ['cv'])),
    ...Array.from({ length: 5 }, (_, i) => paper(`hci${i}`, ['hci'])),
];
(0, node_test_1.default)('the deck is deterministic for a given day', () => {
    const opts = { day: '2026-03-01', topics: TOPICS, seen: new Set(), size: 9 };
    const a = (0, deck_1.buildDailyDeck)(CORPUS, opts).map((p) => p.id);
    const b = (0, deck_1.buildDailyDeck)(CORPUS, opts).map((p) => p.id);
    strict_1.default.deepEqual(a, b, 'reopening the app must not reshuffle');
});
(0, node_test_1.default)('a different day gives a different deck', () => {
    const base = { topics: TOPICS, seen: new Set(), size: 9 };
    const a = (0, deck_1.buildDailyDeck)(CORPUS, { ...base, day: '2026-03-01' }).map((p) => p.id);
    const b = (0, deck_1.buildDailyDeck)(CORPUS, { ...base, day: '2026-03-02' }).map((p) => p.id);
    strict_1.default.notDeepEqual(a, b);
});
(0, node_test_1.default)('already-judged papers never come back', () => {
    const seen = new Set(CORPUS.slice(0, 20).map((p) => p.id));
    const deck = (0, deck_1.buildDailyDeck)(CORPUS, { day: '2026-03-01', topics: TOPICS, seen, size: 20 });
    for (const p of deck)
        strict_1.default.ok(!seen.has(p.id), `${p.id} was already judged`);
});
(0, node_test_1.default)('topics round-robin, so no topic dominates the front of the deck', () => {
    const deck = (0, deck_1.buildDailyDeck)(CORPUS, {
        day: '2026-03-01', topics: TOPICS, seen: new Set(), size: 9,
    });
    const firstThree = new Set(deck.slice(0, 3).map((p) => p.topics[0]));
    strict_1.default.equal(firstThree.size, 3, `first three were ${[...firstThree].join(', ')}`);
});
(0, node_test_1.default)('unselected topics are excluded entirely', () => {
    const deck = (0, deck_1.buildDailyDeck)(CORPUS, {
        day: '2026-03-01', topics: ['ml'], seen: new Set(), size: 30,
    });
    strict_1.default.ok(deck.length > 0);
    for (const p of deck)
        strict_1.default.ok(p.topics.includes('ml'), `${p.id} is not ml`);
});
(0, node_test_1.default)('no topic selection means the whole corpus is eligible', () => {
    const deck = (0, deck_1.buildDailyDeck)(CORPUS, {
        day: '2026-03-01', topics: [], seen: new Set(), size: 35,
    });
    strict_1.default.equal(deck.length, CORPUS.length);
});
(0, node_test_1.default)('the deck never contains a duplicate', () => {
    const deck = (0, deck_1.buildDailyDeck)(CORPUS, {
        day: '2026-03-01', topics: TOPICS, seen: new Set(), size: 30,
    });
    strict_1.default.equal(new Set(deck.map((p) => p.id)).size, deck.length);
});
(0, node_test_1.default)('a cross-listed paper is offered once, not once per topic', () => {
    const corpus = [paper('both', ['ml', 'nlp']), paper('ml1', ['ml']), paper('nlp1', ['nlp'])];
    const deck = (0, deck_1.buildDailyDeck)(corpus, {
        day: '2026-03-01', topics: ['ml', 'nlp'], seen: new Set(), size: 10,
    });
    strict_1.default.equal(deck.filter((p) => p.id === 'both').length, 1);
    strict_1.default.equal(deck.length, 3);
});
(0, node_test_1.default)('a short pool returns short rather than repeating', () => {
    const deck = (0, deck_1.buildDailyDeck)(CORPUS.slice(0, 3), {
        day: '2026-03-01', topics: TOPICS, seen: new Set(), size: 12,
    });
    strict_1.default.equal(deck.length, 3);
});
(0, node_test_1.default)('an exhausted pool returns an empty deck, not a crash', () => {
    const seen = new Set(CORPUS.map((p) => p.id));
    strict_1.default.deepEqual((0, deck_1.buildDailyDeck)(CORPUS, { day: '2026-03-01', topics: TOPICS, seen, size: 5 }), []);
    strict_1.default.deepEqual((0, deck_1.buildDailyDeck)([], { day: '2026-03-01', topics: TOPICS, seen: new Set(), size: 5 }), []);
    strict_1.default.deepEqual((0, deck_1.buildDailyDeck)(CORPUS, { day: '2026-03-01', topics: TOPICS, seen: new Set(), size: 0 }), []);
});
(0, node_test_1.default)('recent and well-cited work is nudged forward without dominating', () => {
    const corpus = [
        ...Array.from({ length: 8 }, (_, i) => paper(`old${i}`, ['ml'], { year: 2005, citedByCount: 0 })),
        paper('star', ['ml'], { year: new Date().getFullYear(), citedByCount: 5000 }),
    ];
    const deck = (0, deck_1.buildDailyDeck)(corpus, {
        day: '2026-03-01', topics: ['ml'], seen: new Set(), size: 9,
    });
    strict_1.default.ok(deck.findIndex((p) => p.id === 'star') < 4, 'strong paper should surface early');
});
(0, node_test_1.default)('resolveDeck restores order and silently drops vanished ids', () => {
    const restored = (0, deck_1.resolveDeck)(['ml3', 'gone', 'nlp1'], CORPUS);
    strict_1.default.deepEqual(restored.map((p) => p.id), ['ml3', 'nlp1']);
});
(0, node_test_1.default)('remainingCount respects both the topic filter and the seen set', () => {
    strict_1.default.equal((0, deck_1.remainingCount)(CORPUS, ['ml'], new Set()), 10);
    strict_1.default.equal((0, deck_1.remainingCount)(CORPUS, ['ml'], new Set(['ml0', 'ml1'])), 8);
    strict_1.default.equal((0, deck_1.remainingCount)(CORPUS, [], new Set()), 35);
});
(0, node_test_1.default)('the PRNG is seeded, uniform-ish and reproducible', () => {
    const a = (0, deck_1.makeRng)((0, deck_1.hashString)('2026-03-01'));
    const b = (0, deck_1.makeRng)((0, deck_1.hashString)('2026-03-01'));
    const draws = Array.from({ length: 500 }, () => a());
    strict_1.default.deepEqual(draws.slice(0, 5), Array.from({ length: 5 }, () => b()));
    strict_1.default.ok(draws.every((x) => x >= 0 && x < 1));
    const mean = draws.reduce((s, x) => s + x, 0) / draws.length;
    strict_1.default.ok(Math.abs(mean - 0.5) < 0.06, `mean ${mean}`);
});
(0, node_test_1.default)('shuffle is a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = (0, deck_1.shuffle)(input, (0, deck_1.makeRng)(42));
    strict_1.default.deepEqual([...out].sort((x, y) => x - y), input);
    strict_1.default.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
});
