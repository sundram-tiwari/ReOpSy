"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialStreak = exports.FREEZE_EVERY = exports.MAX_FREEZES = void 0;
exports.recordActivity = recordActivity;
exports.effectiveStreak = effectiveStreak;
exports.isAtRisk = isAtRisk;
exports.streakMessage = streakMessage;
exports.freezeMessage = freezeMessage;
exports.streakSummary = streakSummary;
const date_1 = require("./date");
exports.MAX_FREEZES = 3;
exports.FREEZE_EVERY = 7;
exports.initialStreak = {
    current: 0,
    longest: 0,
    lastActiveDay: null,
    freezes: 0,
    freezesEarned: 0,
    totalDays: 0,
};
function recordActivity(state, today = (0, date_1.dayKey)()) {
    if (!(0, date_1.isDayKey)(today)) {
        throw new Error(`recordActivity expects a YYYY-MM-DD day key, got: ${String(today)}`);
    }
    const last = state.lastActiveDay;
    if (last === today) {
        return { state, outcome: 'unchanged', earnedFreeze: false, daysCovered: 0 };
    }
    if (last && (0, date_1.isDayKey)(last) && (0, date_1.daysBetween)(last, today) < 0) {
        return { state, outcome: 'unchanged', earnedFreeze: false, daysCovered: 0 };
    }
    const gap = last && (0, date_1.isDayKey)(last) ? (0, date_1.daysBetween)(last, today) : Infinity;
    let current;
    let freezes = state.freezes;
    let outcome;
    let daysCovered = 0;
    if (!Number.isFinite(gap)) {
        current = 1;
        outcome = 'started';
    }
    else if (gap === 1) {
        current = state.current + 1;
        outcome = 'extended';
    }
    else if (gap === 2 && freezes > 0) {
        freezes -= 1;
        daysCovered = 1;
        current = state.current + 1;
        outcome = 'freeze-used';
    }
    else {
        current = 1;
        outcome = 'restarted';
    }
    let earnedFreeze = false;
    let freezesEarned = state.freezesEarned;
    if (current > 0 && current % exports.FREEZE_EVERY === 0 && freezes < exports.MAX_FREEZES) {
        freezes += 1;
        freezesEarned += 1;
        earnedFreeze = true;
    }
    const next = {
        current,
        longest: Math.max(state.longest, current),
        lastActiveDay: today,
        freezes,
        freezesEarned,
        totalDays: state.totalDays + 1,
    };
    return { state: next, outcome, earnedFreeze, daysCovered };
}
function effectiveStreak(state, today = (0, date_1.dayKey)()) {
    if (!state.lastActiveDay || !(0, date_1.isDayKey)(state.lastActiveDay))
        return 0;
    const gap = (0, date_1.daysBetween)(state.lastActiveDay, today);
    if (gap <= 0)
        return state.current;
    if (gap === 1)
        return state.current;
    if (gap === 2 && state.freezes > 0)
        return state.current;
    return 0;
}
function isAtRisk(state, today = (0, date_1.dayKey)()) {
    if (!state.lastActiveDay || !(0, date_1.isDayKey)(state.lastActiveDay))
        return false;
    const gap = (0, date_1.daysBetween)(state.lastActiveDay, today);
    return gap >= 1 && effectiveStreak(state, today) > 0;
}
function streakMessage(result) {
    const n = result.state.current;
    switch (result.outcome) {
        case 'unchanged':
            return `Day ${n} already counted. Read as much as you like.`;
        case 'started':
            return 'Day one. That is the hard one, and it is done.';
        case 'extended':
            if (n === 2)
                return 'Two days. A habit is starting to look like a habit.';
            if (n === 7)
                return 'A full week of reading.';
            if (n % 30 === 0)
                return `${n} days. That is a genuine practice now.`;
            if (n % 7 === 0)
                return `${n} days — ${n / 7} weeks running.`;
            return `Day ${n}.`;
        case 'freeze-used':
            return `You missed a day and a freeze covered it. Still day ${n}.`;
        case 'restarted':
            return 'Fresh start. Streaks are for momentum, not for guilt.';
        default:
            return `Day ${n}.`;
    }
}
function freezeMessage(result) {
    if (result.earnedFreeze) {
        const f = result.state.freezes;
        return `You earned a streak freeze — ${f} in reserve. It covers a missed day automatically.`;
    }
    if (result.outcome === 'freeze-used') {
        const left = result.state.freezes;
        return left > 0
            ? `${left} freeze${left === 1 ? '' : 's'} left.`
            : 'That was your last freeze. Another arrives after seven days.';
    }
    return null;
}
function streakSummary(state, today = (0, date_1.dayKey)()) {
    const live = effectiveStreak(state, today);
    if (live === 0 && state.totalDays === 0)
        return 'No days yet. Swipe one card to begin.';
    if (live === 0)
        return `Longest run: ${state.longest} days. Today is a good day to start again.`;
    if (state.lastActiveDay === today)
        return `Day ${live}, counted today.`;
    return `Day ${live}. Swipe one card to keep it.`;
}
