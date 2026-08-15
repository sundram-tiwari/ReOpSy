"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const streak_1 = require("../streak");
function state(over = {}) {
    return { ...streak_1.initialStreak, ...over };
}
/** Swipe on each of the given days in sequence, returning the final state. */
function run(days, start = streak_1.initialStreak) {
    return days.reduce((s, d) => (0, streak_1.recordActivity)(s, d).state, start);
}
(0, node_test_1.default)('the first ever day starts a streak at one', () => {
    const r = (0, streak_1.recordActivity)(streak_1.initialStreak, '2026-03-01');
    strict_1.default.equal(r.state.current, 1);
    strict_1.default.equal(r.state.longest, 1);
    strict_1.default.equal(r.state.totalDays, 1);
    strict_1.default.equal(r.outcome, 'started');
});
(0, node_test_1.default)('recording the same day twice changes nothing', () => {
    const first = (0, streak_1.recordActivity)(streak_1.initialStreak, '2026-03-01').state;
    const second = (0, streak_1.recordActivity)(first, '2026-03-01');
    strict_1.default.equal(second.outcome, 'unchanged');
    strict_1.default.deepEqual(second.state, first, 'state object must be untouched');
    strict_1.default.equal(second.state.totalDays, 1, 'opening twice must not inflate totals');
});
(0, node_test_1.default)('consecutive days extend the streak', () => {
    const s = run(['2026-03-01', '2026-03-02', '2026-03-03']);
    strict_1.default.equal(s.current, 3);
    strict_1.default.equal(s.longest, 3);
    strict_1.default.equal(s.totalDays, 3);
});
(0, node_test_1.default)('seven consecutive days earn exactly one freeze', () => {
    const days = Array.from({ length: 7 }, (_, i) => `2026-03-0${i + 1}`);
    const s = run(days);
    strict_1.default.equal(s.current, 7);
    strict_1.default.equal(s.freezes, 1);
    strict_1.default.equal(s.freezesEarned, 1);
});
(0, node_test_1.default)('a freeze covers exactly one missed day and the streak continues', () => {
    const before = state({ current: 9, longest: 9, lastActiveDay: '2026-03-09', freezes: 1, totalDays: 9 });
    const r = (0, streak_1.recordActivity)(before, '2026-03-11'); // 10th was missed
    strict_1.default.equal(r.outcome, 'freeze-used');
    strict_1.default.equal(r.state.current, 10, 'streak continues as if nothing happened');
    strict_1.default.equal(r.state.freezes, 0, 'the freeze is spent');
    strict_1.default.equal(r.daysCovered, 1);
});
(0, node_test_1.default)('a freeze does not cover two missed days', () => {
    const before = state({ current: 9, longest: 9, lastActiveDay: '2026-03-09', freezes: 1, totalDays: 9 });
    const r = (0, streak_1.recordActivity)(before, '2026-03-12'); // two days missed
    strict_1.default.equal(r.outcome, 'restarted');
    strict_1.default.equal(r.state.current, 1);
    strict_1.default.equal(r.state.freezes, 1, 'an unusable freeze must not be consumed');
});
(0, node_test_1.default)('a missed day with no freeze restarts at one, and the record survives', () => {
    const before = state({ current: 12, longest: 12, lastActiveDay: '2026-03-12', freezes: 0, totalDays: 12 });
    const r = (0, streak_1.recordActivity)(before, '2026-03-14');
    strict_1.default.equal(r.outcome, 'restarted');
    strict_1.default.equal(r.state.current, 1);
    strict_1.default.equal(r.state.longest, 12, 'longest is never reduced');
});
(0, node_test_1.default)('freezes are capped so they cannot be hoarded forever', () => {
    let s = streak_1.initialStreak;
    for (let i = 0; i < 40; i += 1) {
        const day = new Date(2026, 0, 1 + i);
        const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        s = (0, streak_1.recordActivity)(s, key).state;
    }
    strict_1.default.equal(s.current, 40);
    strict_1.default.ok(s.freezes <= streak_1.MAX_FREEZES, `held ${s.freezes} freezes`);
});
(0, node_test_1.default)('a clock that goes backwards does not destroy a streak', () => {
    const before = state({ current: 5, longest: 5, lastActiveDay: '2026-03-10', totalDays: 5 });
    const r = (0, streak_1.recordActivity)(before, '2026-03-08');
    strict_1.default.equal(r.outcome, 'unchanged');
    strict_1.default.equal(r.state.current, 5);
});
(0, node_test_1.default)('effectiveStreak reports zero once the run is actually over', () => {
    const s = state({ current: 6, longest: 6, lastActiveDay: '2026-03-10', freezes: 0 });
    strict_1.default.equal((0, streak_1.effectiveStreak)(s, '2026-03-10'), 6, 'today');
    strict_1.default.equal((0, streak_1.effectiveStreak)(s, '2026-03-11'), 6, 'yesterday, still live');
    strict_1.default.equal((0, streak_1.effectiveStreak)(s, '2026-03-12'), 0, 'no freeze, so it is over');
    strict_1.default.equal((0, streak_1.effectiveStreak)({ ...s, freezes: 1 }, '2026-03-12'), 6, 'a freeze can still save it');
    strict_1.default.equal((0, streak_1.effectiveStreak)(s, '2026-03-20'), 0);
    strict_1.default.equal((0, streak_1.effectiveStreak)(streak_1.initialStreak, '2026-03-20'), 0);
});
(0, node_test_1.default)('isAtRisk is true only when there is something left to lose', () => {
    const s = state({ current: 4, lastActiveDay: '2026-03-10', freezes: 0 });
    strict_1.default.equal((0, streak_1.isAtRisk)(s, '2026-03-10'), false, 'already swiped today');
    strict_1.default.equal((0, streak_1.isAtRisk)(s, '2026-03-11'), true);
    strict_1.default.equal((0, streak_1.isAtRisk)(s, '2026-03-15'), false, 'nothing left to lose');
    strict_1.default.equal((0, streak_1.isAtRisk)(streak_1.initialStreak, '2026-03-11'), false);
});
(0, node_test_1.default)('streak copy never scolds and never uses guilt', () => {
    const outcomes = [
        (0, streak_1.recordActivity)(streak_1.initialStreak, '2026-03-01'),
        (0, streak_1.recordActivity)(state({ current: 1, lastActiveDay: '2026-03-01' }), '2026-03-02'),
        (0, streak_1.recordActivity)(state({ current: 9, lastActiveDay: '2026-03-09', freezes: 1 }), '2026-03-11'),
        (0, streak_1.recordActivity)(state({ current: 9, lastActiveDay: '2026-03-09' }), '2026-03-20'),
    ];
    const banned = /don't|dont |failed|lost|broke|shame|you missed out|ruined/i;
    for (const r of outcomes) {
        const msg = (0, streak_1.streakMessage)(r);
        strict_1.default.ok(msg.length > 0);
        strict_1.default.ok(!banned.test(msg), `unkind copy: "${msg}"`);
    }
});
(0, node_test_1.default)('freeze messages appear exactly when a freeze changes hands', () => {
    const earned = (0, streak_1.recordActivity)(state({ current: 6, lastActiveDay: '2026-03-06', totalDays: 6 }), '2026-03-07');
    strict_1.default.equal(earned.earnedFreeze, true);
    strict_1.default.match(String((0, streak_1.freezeMessage)(earned)), /earned a streak freeze/i);
    const used = (0, streak_1.recordActivity)(state({ current: 3, lastActiveDay: '2026-03-03', freezes: 1 }), '2026-03-05');
    strict_1.default.match(String((0, streak_1.freezeMessage)(used)), /freeze/i);
    const ordinary = (0, streak_1.recordActivity)(state({ current: 2, lastActiveDay: '2026-03-02' }), '2026-03-03');
    strict_1.default.equal((0, streak_1.freezeMessage)(ordinary), null);
});
(0, node_test_1.default)('recordActivity rejects a malformed day key instead of corrupting state', () => {
    strict_1.default.throws(() => (0, streak_1.recordActivity)(streak_1.initialStreak, '3 March'), /YYYY-MM-DD/);
});
(0, node_test_1.default)('a streak survives a month boundary', () => {
    const s = run(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
    strict_1.default.equal(s.current, 4);
});
(0, node_test_1.default)('a streak survives a leap day', () => {
    const s = run(['2028-02-28', '2028-02-29', '2028-03-01']);
    strict_1.default.equal(s.current, 3);
});
