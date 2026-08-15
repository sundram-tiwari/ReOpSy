"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashString = hashString;
exports.makeRng = makeRng;
exports.shuffle = shuffle;
exports.buildDailyDeck = buildDailyDeck;
exports.resolveDeck = resolveDeck;
exports.remainingCount = remainingCount;
function hashString(input) {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
function makeRng(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(items, rng) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const a = out[i];
        const b = out[j];
        out[i] = b;
        out[j] = a;
    }
    return out;
}
function buildDailyDeck(papers, opts) {
    const { day, topics, seen, size } = opts;
    if (size <= 0)
        return [];
    const wanted = new Set(topics);
    const eligible = papers.filter((p) => {
        if (seen.has(p.id))
            return false;
        if (wanted.size === 0)
            return true;
        return p.topics.some((t) => wanted.has(t));
    });
    if (eligible.length === 0)
        return [];
    const rng = makeRng(hashString(day));
    const order = wanted.size > 0
        ? shuffle([...wanted], rng)
        : shuffle(collectTopics(eligible), rng);
    const buckets = new Map();
    for (const t of order)
        buckets.set(t, []);
    const loose = [];
    for (const paper of eligible) {
        const home = order.find((t) => paper.topics.includes(t));
        if (home)
            buckets.get(home).push(paper);
        else
            loose.push(paper);
    }
    for (const t of order) {
        buckets.set(t, rankWithinTopic(buckets.get(t), rng));
    }
    const looseRanked = rankWithinTopic(loose, rng);
    const deck = [];
    const cursors = new Map(order.map((t) => [t, 0]));
    let looseCursor = 0;
    let exhausted = false;
    while (deck.length < size && !exhausted) {
        exhausted = true;
        for (const t of order) {
            if (deck.length >= size)
                break;
            const bucket = buckets.get(t);
            const i = cursors.get(t);
            if (i < bucket.length) {
                deck.push(bucket[i]);
                cursors.set(t, i + 1);
                exhausted = false;
            }
        }
        if (deck.length < size && looseCursor < looseRanked.length) {
            deck.push(looseRanked[looseCursor]);
            looseCursor += 1;
            exhausted = false;
        }
    }
    return deck;
}
function collectTopics(papers) {
    const set = new Set();
    for (const p of papers)
        for (const t of p.topics)
            set.add(t);
    return [...set];
}
function rankWithinTopic(papers, rng) {
    const thisYear = new Date().getFullYear();
    return shuffle(papers, rng)
        .map((paper, index) => {
        let score = -index * 0.1;
        if (paper.year)
            score += Math.max(0, 3 - (thisYear - paper.year)) * 0.25;
        if (paper.citedByCount)
            score += Math.min(Math.log10(paper.citedByCount + 1), 4) * 0.15;
        if (paper.licenseOk)
            score += 0.1;
        return { paper, score };
    })
        .sort((a, b) => b.score - a.score)
        .map((x) => x.paper);
}
function resolveDeck(ids, papers) {
    const byId = new Map(papers.map((p) => [p.id, p]));
    const out = [];
    for (const id of ids) {
        const p = byId.get(id);
        if (p)
            out.push(p);
    }
    return out;
}
function remainingCount(papers, topics, seen) {
    const wanted = new Set(topics);
    return papers.filter((p) => {
        if (seen.has(p.id))
            return false;
        if (wanted.size === 0)
            return true;
        return p.topics.some((t) => wanted.has(t));
    }).length;
}
