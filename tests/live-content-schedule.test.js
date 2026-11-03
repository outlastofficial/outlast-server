const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildLiveContent } = require('../live-content');

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

test('monthly finale begins in the final three days and recaps that month', () => {
  const before = buildLiveContent(Date.UTC(2026, 10, 27, 23, 59));
  const live = buildLiveContent(Date.UTC(2026, 10, 28, 0));
  assert.equal(before.monthlyEvent.active, false);
  assert.equal(live.monthlyEvent.active, true);
  assert.equal(live.monthlyEvent.theme, 'Project Blackout');
  assert.ok(Array.isArray(live.monthlyEvent.monthlyRecap));
  assert.ok(live.monthlyEvent.monthlyRecap.length > 0);
});

test('response includes UTC server time and next scheduled drops', () => {
  const now = Date.UTC(2026, 10, 3, 12);
  const result = buildLiveContent(now);
  assert.equal(result.serverTime, new Date(now).toISOString());
  assert.ok(result.nextSmallAdditionAt > now);
  assert.ok(result.nextWeekendEventAt > now);
  assert.ok(result.nextMonthlyEventAt > now);
});
