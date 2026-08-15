"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const date_1 = require("../date");
(0, node_test_1.default)('dayKey uses the local calendar, not UTC', () => {
    // 31 Dec 2025, 23:30 local. In UTC+X this is already 1 Jan; the key must
    // still say 31 Dec, or users east of Greenwich lose a streak day.
    const d = new Date(2025, 11, 31, 23, 30, 0);
    strict_1.default.equal((0, date_1.dayKey)(d), '2025-12-31');
});
(0, node_test_1.default)('dayKey zero-pads months and days', () => {
    strict_1.default.equal((0, date_1.dayKey)(new Date(2026, 0, 5)), '2026-01-05');
});
(0, node_test_1.default)('fromDayKey round-trips', () => {
    strict_1.default.equal((0, date_1.dayKey)((0, date_1.fromDayKey)('2026-07-04')), '2026-07-04');
});
(0, node_test_1.default)('daysBetween counts calendar days in both directions', () => {
    strict_1.default.equal((0, date_1.daysBetween)('2026-03-01', '2026-03-02'), 1);
    strict_1.default.equal((0, date_1.daysBetween)('2026-03-01', '2026-03-01'), 0);
    strict_1.default.equal((0, date_1.daysBetween)('2026-03-03', '2026-03-01'), -2);
    strict_1.default.equal((0, date_1.daysBetween)('2026-02-28', '2026-03-01'), 1, 'non-leap February');
    strict_1.default.equal((0, date_1.daysBetween)('2028-02-28', '2028-03-01'), 2, 'leap February');
    strict_1.default.equal((0, date_1.daysBetween)('2025-12-31', '2026-01-01'), 1, 'year boundary');
});
(0, node_test_1.default)('daysBetween survives a DST transition', () => {
    // Whatever the runner's timezone, a 23- or 25-hour day must still be one day.
    strict_1.default.equal((0, date_1.daysBetween)('2026-03-28', '2026-03-29'), 1);
    strict_1.default.equal((0, date_1.daysBetween)('2026-10-24', '2026-10-25'), 1);
    strict_1.default.equal((0, date_1.daysBetween)('2026-11-01', '2026-11-02'), 1);
});
(0, node_test_1.default)('addDays moves across month and year boundaries', () => {
    strict_1.default.equal((0, date_1.addDays)('2026-01-31', 1), '2026-02-01');
    strict_1.default.equal((0, date_1.addDays)('2026-01-01', -1), '2025-12-31');
    strict_1.default.equal((0, date_1.addDays)('2026-03-01', 0), '2026-03-01');
});
(0, node_test_1.default)('isDayKey accepts only the exact format', () => {
    strict_1.default.equal((0, date_1.isDayKey)('2026-03-01'), true);
    strict_1.default.equal((0, date_1.isDayKey)('2026-3-1'), false);
    strict_1.default.equal((0, date_1.isDayKey)('01/03/2026'), false);
    strict_1.default.equal((0, date_1.isDayKey)(null), false);
    strict_1.default.equal((0, date_1.isDayKey)(20260301), false);
});
(0, node_test_1.default)('formatDay is short and locale-independent', () => {
    strict_1.default.equal((0, date_1.formatDay)('2026-03-01'), '1 Mar 2026');
    strict_1.default.equal((0, date_1.formatDay)('2026-12-25'), '25 Dec 2026');
});
(0, node_test_1.default)('relativeTime reads the way a person would say it', () => {
    const now = new Date(2026, 2, 10, 12, 0, 0).getTime();
    strict_1.default.equal((0, date_1.relativeTime)(now - 5_000, now), 'just now');
    strict_1.default.equal((0, date_1.relativeTime)(now - 90_000, now), '2m ago');
    strict_1.default.equal((0, date_1.relativeTime)(now - 3 * 3600_000, now), '3h ago');
    strict_1.default.equal((0, date_1.relativeTime)(now - 26 * 3600_000, now), 'yesterday');
    strict_1.default.equal((0, date_1.relativeTime)(now - 3 * 86400_000, now), '3 days ago');
    strict_1.default.equal((0, date_1.relativeTime)(new Date(2026, 1, 12, 12).getTime(), now), '12 Feb');
});
