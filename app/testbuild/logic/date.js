"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dayKey = dayKey;
exports.isDayKey = isDayKey;
exports.fromDayKey = fromDayKey;
exports.daysBetween = daysBetween;
exports.addDays = addDays;
exports.formatDay = formatDay;
exports.relativeTime = relativeTime;
function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function isDayKey(key) {
    return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}
function fromDayKey(key) {
    const [y, m, d] = key.split('-');
    return new Date(Number(y), Number(m) - 1, Number(d));
}
function daysBetween(d1, d2) {
    const t1 = fromDayKey(d1).getTime();
    const t2 = fromDayKey(d2).getTime();
    return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}
function addDays(key, days) {
    const d = fromDayKey(key);
    d.setDate(d.getDate() + days);
    return dayKey(d);
}
function formatDay(key) {
    const d = fromDayKey(key);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
function relativeTime(timeMs, nowMs = Date.now()) {
    const diff = nowMs - timeMs;
    if (diff < 60_000)
        return 'just now';
    if (diff < 3600_000)
        return `${Math.round(diff / 60_000)}m ago`;
    if (diff < 86400_000) {
        const h = Math.round(diff / 3600_000);
        if (h < 24)
            return `${h}h ago`;
    }
    if (diff < 2 * 86400_000)
        return 'yesterday';
    if (diff < 7 * 86400_000)
        return `${Math.round(diff / 86400_000)} days ago`;
    const d = new Date(timeMs);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${m[d.getMonth()]}`;
}
