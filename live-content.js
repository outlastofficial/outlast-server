'use strict';

const DAY = 24 * 60 * 60 * 1000;
const SMALL_INTERVAL = 3 * DAY;
const WEEK_INTERVAL = 7 * DAY;
const SMALL_ANCHOR = Date.UTC(2026, 10, 3, 0, 0, 0);
const WEEKEND_ANCHOR = Date.UTC(2026, 10, 6, 17, 0, 0);
const WEEKEND_DURATION = 3 * DAY;

const SMALL_ADDITIONS = [
  { id: 'field-scanner', title: 'Field Scanner', category: 'Utility', description: 'A new field report appears in the Live Content board, highlighting a rotating enemy weakness for the current cycle.' },
  { id: 'supply-cache', title: 'Sealed Supply Cache', category: 'Loot', description: 'A new cache discovery joins the rotating content catalogue, with a fresh collection entry to find.' },
  { id: 'mutant-tracker', title: 'Mutant Tracker', category: 'Enemy Intel', description: 'A new mutation profile is added to the outbreak reports, expanding the enemy lore and weekly briefing.' },
  { id: 'survivor-contract', title: 'Survivor Contract', category: 'Challenge', description: 'A new optional survival objective is featured for this content cycle.' },
  { id: 'weapon-blueprint', title: 'Recovered Blueprint', category: 'Gear', description: 'A new weapon blueprint entry is added to the rotating archive.' },
  { id: 'hidden-transmission', title: 'Hidden Transmission', category: 'Secret', description: 'A new encrypted clue appears in the monthly investigation.' },
  { id: 'elite-sighting', title: 'Elite Sighting', category: 'Enemy', description: 'A new elite enemy profile is added to the threat index.' },
  { id: 'relic-fragment', title: 'Relic Fragment', category: 'Collectible', description: 'A new relic fragment is added to the monthly collection trail.' },
  { id: 'map-anomaly', title: 'Map Anomaly', category: 'World', description: 'A rotating map anomaly is added to the field notes.' },
  { id: 'boss-dossier', title: 'Boss Dossier', category: 'Boss Intel', description: 'A new boss dossier reveals a little more of the current outbreak story.' },
  { id: 'survivor-record', title: 'Survivor Record', category: 'Lore', description: 'A recovered survivor record adds another piece to the ongoing monthly story.' },
  { id: 'emergency-protocol', title: 'Emergency Protocol', category: 'Gameplay', description: 'A new optional run protocol is featured in the operations board.' }
];

const MONTH_THEMES = {
  0: 'Frozen Outbreak', 1: 'Heart of the Infection', 2: 'Mutation Season', 3: 'The Forgotten Laboratory',
  4: 'Biohazard Protocol', 5: 'The Last Colony', 6: 'Project Extinction', 7: 'The Underground',
  8: 'The Return', 9: 'Nightmare Month', 10: 'Project Blackout', 11: 'Winter Apocalypse'
};
const WEEKEND_PARTS = [
  { subtitle: 'The Signal', objective: 'Investigate the first blackout signal and recover the missing field report.', reward: 'Blackout Intel I' },
  { subtitle: 'The Power Station', objective: 'Trace the signal to the power station and uncover who restarted the grid.', reward: 'Blackout Intel II' },
  { subtitle: 'The Containment Breach', objective: 'Track the outbreak into containment and uncover the source of the mutations.', reward: 'Blackout Intel III' },
  { subtitle: 'Final Transmission', objective: 'Complete the final transmission and expose what the monthly investigation uncovered.', reward: 'Monthly Finale Access' }
];

function monthStartUtc(year, month) { return Date.UTC(year, month, 1); }
function monthEndUtc(year, month) { return Date.UTC(year, month + 1, 1); }
function lastThreeDaysStartUtc(year, month) { return monthEndUtc(year, month) - 3 * DAY; }
function monthTheme(month) { return MONTH_THEMES[month] || 'Outbreak Investigation'; }
function weekendForIndex(index, month) {
  const partNumber = ((index % WEEKEND_PARTS.length) + WEEKEND_PARTS.length) % WEEKEND_PARTS.length + 1;
  const part = WEEKEND_PARTS[partNumber - 1];
  return {
    id: `weekend-${index + 1}`,
    title: `${monthTheme(month)} — Part ${partNumber}`,
    subtitle: part.subtitle,
    part: partNumber,
    objective: part.objective,
    reward: part.reward
  };
}

function buildLiveContent(now = Date.now()) {
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) throw new TypeError('now must be a finite timestamp');
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const currentMonthStart = monthStartUtc(year, month);
  const currentMonthEnd = monthEndUtc(year, month);

  const smallIndex = Math.max(0, Math.floor((timestamp - SMALL_ANCHOR) / SMALL_INTERVAL));
  const smallStart = SMALL_ANCHOR + smallIndex * SMALL_INTERVAL;
  const smallEnd = smallStart + SMALL_INTERVAL;
  const smallItem = SMALL_ADDITIONS[smallIndex % SMALL_ADDITIONS.length];

  const weekendIndex = Math.floor((timestamp - WEEKEND_ANCHOR) / WEEK_INTERVAL);
  const weekendStart = WEEKEND_ANCHOR + weekendIndex * WEEK_INTERVAL;
  const weekendEnd = weekendStart + WEEKEND_DURATION;
  const activeWeekend = timestamp >= weekendStart && timestamp < weekendEnd;
  const upcomingWeekendIndex = activeWeekend ? weekendIndex + 1 : (timestamp < weekendStart ? weekendIndex : weekendIndex + 1);
  const upcomingWeekendStart = WEEKEND_ANCHOR + upcomingWeekendIndex * WEEK_INTERVAL;
  const selectedWeekendIndex = activeWeekend ? weekendIndex : upcomingWeekendIndex;
  const selectedWeekendMonth = new Date(activeWeekend ? weekendStart : upcomingWeekendStart).getUTCMonth();
  const weekendMeta = weekendForIndex(selectedWeekendIndex, selectedWeekendMonth);

  const monthlyStart = lastThreeDaysStartUtc(year, month);
  const monthlyActive = timestamp >= monthlyStart;
  const nextMonth = new Date(currentMonthEnd);
  const nextMonthlyStart = lastThreeDaysStartUtc(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth());
  const monthlyRecap = [];
  for (let i = 0; i <= smallIndex; i++) {
    const at = SMALL_ANCHOR + i * SMALL_INTERVAL;
    if (at >= currentMonthStart && at < currentMonthEnd && at <= timestamp) {
      monthlyRecap.push(SMALL_ADDITIONS[i % SMALL_ADDITIONS.length].title);
    }
  }
  const weekendRecap = [];
  for (let i = 0; i < 100; i++) {
    const at = WEEKEND_ANCHOR + i * WEEK_INTERVAL;
    if (at >= currentMonthStart && at < currentMonthEnd && at <= timestamp) {
      weekendRecap.push(weekendForIndex(i, new Date(at).getUTCMonth()).title);
    }
  }
  const theme = monthTheme(month);
  const monthlyEvent = {
    id: `monthly-${year}-${String(month + 1).padStart(2, '0')}`,
    theme,
    title: `${theme}: Monthly Finale`,
    active: monthlyActive,
    startsAt: monthlyStart,
    endsAt: currentMonthEnd,
    objective: 'Bring together this month’s field reports, weekend chapters, and discoveries for the final operation.',
    monthlyRecap: [...monthlyRecap, ...weekendRecap].slice(-12)
  };

  return {
    ok: true,
    version: '1.0.0',
    timezone: 'UTC',
    serverTime: date.toISOString(),
    smallAddition: { ...smallItem, cycle: smallIndex + 1, startsAt: smallStart, endsAt: smallEnd, nextAt: smallEnd },
    weekendEvent: {
      ...weekendMeta,
      active: activeWeekend,
      startsAt: activeWeekend ? weekendStart : upcomingWeekendStart,
      endsAt: activeWeekend ? weekendEnd : upcomingWeekendStart + WEEKEND_DURATION,
      nextAt: upcomingWeekendStart
    },
    monthlyEvent,
    nextSmallAdditionAt: smallEnd,
    nextWeekendEventAt: upcomingWeekendStart,
    nextMonthlyEventAt: monthlyActive ? nextMonthlyStart : monthlyStart
  };
}

module.exports = { buildLiveContent, SMALL_INTERVAL, WEEKEND_DURATION, SMALL_ANCHOR, WEEKEND_ANCHOR };
