const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildLiveContent, SMALL_ANCHOR, SMALL_INTERVAL } = require('../live-content');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test('small additions rotate on a fixed 72-hour server schedule', () => {
  const first = buildLiveContent(Date.UTC(2026, 10, 3, 12));
  const before = buildLiveContent(Date.UTC(2026, 10, 5, 23, 59));
  const at = buildLiveContent(Date.UTC(2026, 10, 6, 0));
  assert.equal(first.smallAddition.id, before.smallAddition.id);
  assert.notEqual(before.smallAddition.id, at.smallAddition.id);
  assert.equal(first.smallAddition.nextAt - first.smallAddition.startsAt, 3 * DAY);
});

test('weekend event opens Friday and closes Monday, with sequential chapters', () => {
  const before = buildLiveContent(Date.UTC(2026, 10, 6, 16, 59));
  const live = buildLiveContent(Date.UTC(2026, 10, 6, 17));
  const after = buildLiveContent(Date.UTC(2026, 10, 9, 17));
  assert.equal(before.weekendEvent.active, false);
  assert.equal(live.weekendEvent.active, true);
  assert.match(live.weekendEvent.title, /Part 1/);
  assert.equal(after.weekendEvent.active, false);
  assert.match(after.weekendEvent.title, /Part 2/);
});

test('monthly event runs from the first day through the whole month', () => {
  const firstDay = buildLiveContent(Date.UTC(2026, 10, 1, 0));
  const midMonth = buildLiveContent(Date.UTC(2026, 10, 15, 12));
  const lastDay = buildLiveContent(Date.UTC(2026, 10, 30, 23, 59));
  const nextMonth = buildLiveContent(Date.UTC(2026, 11, 1, 0));
  assert.equal(firstDay.monthlyEvent.active, true);
  assert.equal(midMonth.monthlyEvent.active, true);
  assert.equal(lastDay.monthlyEvent.active, true);
  assert.equal(nextMonth.monthlyEvent.active, true);
  assert.equal(firstDay.monthlyEvent.startsAt, Date.UTC(2026, 10, 1, 0));
  assert.equal(firstDay.monthlyEvent.endsAt, Date.UTC(2026, 11, 1, 0));
  assert.equal(firstDay.monthlyEvent.theme, 'Project Blackout');
  assert.ok(Array.isArray(midMonth.monthlyEvent.monthlyRecap));
});

test('response includes UTC server time and next scheduled drops', () => {
  const now = Date.UTC(2026, 10, 3, 12);
  const result = buildLiveContent(now);
  assert.equal(result.serverTime, new Date(now).toISOString());
  assert.ok(result.nextSmallAdditionAt > now);
  assert.ok(result.nextWeekendEventAt > now);
  assert.ok(result.nextMonthlyEventAt > now);
});

test('the first 36 three-day drops have unique content', () => {
  const ids = Array.from({ length: 36 }, (_, index) => buildLiveContent(SMALL_ANCHOR + index * SMALL_INTERVAL).smallAddition.id);
  assert.equal(new Set(ids).size, 36);
});


test('monthly event overlaps the weekend event and three-day addition', () => {
  const result = buildLiveContent(Date.UTC(2026, 10, 7, 12));
  assert.equal(result.monthlyEvent.active, true);
  assert.equal(result.weekendEvent.active, true);
  assert.equal(result.smallAddition.id, 'supply-cache');
});
