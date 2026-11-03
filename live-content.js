'use strict';

const DAY = 24 * 60 * 60 * 1000;
const SMALL_INTERVAL = 3 * DAY;
const WEEK_INTERVAL = 7 * DAY;
const SMALL_ANCHOR = Date.UTC(2026, 10, 3, 0, 0, 0);
const WEEKLY_UPDATE_ANCHOR = Date.UTC(2026, 10, 7, 0, 0, 0);
const WEEKLY_UPDATE_DURATION = 7 * DAY;

const SMALL_ADDITIONS = [
  { id: 'field-scanner', title: 'Field Scanner', category: 'Utility', description: 'A new field report highlights a rotating enemy weakness for this cycle.' },
  { id: 'supply-cache', title: 'Sealed Supply Cache', category: 'Loot', description: 'A sealed cache discovery joins the rotating collection archive.' },
  { id: 'mutant-tracker', title: 'Mutant Tracker', category: 'Enemy Intel', description: 'A new mutation profile expands the outbreak threat index.' },
  { id: 'survivor-contract', title: 'Survivor Contract', category: 'Challenge', description: 'A new optional survival objective is featured for this cycle.' },
  { id: 'gear-schematic', title: 'Recovered Gear Schematic', category: 'Equipment', description: 'A new equipment schematic entry is added to the archive.' },
  { id: 'hidden-transmission', title: 'Hidden Transmission', category: 'Secret', description: 'A new encrypted clue appears in the monthly investigation.' },
  { id: 'elite-sighting', title: 'Elite Sighting', category: 'Enemy', description: 'A new elite enemy profile is added to the threat index.' },
  { id: 'relic-fragment', title: 'Relic Fragment', category: 'Collectible', description: 'A new relic fragment is added to the monthly collection trail.' },
  { id: 'map-anomaly', title: 'Map Anomaly', category: 'World', description: 'A rotating map anomaly is added to the field notes.' },
  { id: 'boss-dossier', title: 'Boss Dossier', category: 'Boss Intel', description: 'A new boss dossier reveals another piece of the outbreak story.' },
  { id: 'survivor-record', title: 'Survivor Record', category: 'Lore', description: 'A recovered survivor record adds another story entry.' },
  { id: 'emergency-protocol', title: 'Emergency Protocol', category: 'Gameplay', description: 'A new optional run protocol is featured on the operations board.' },
  { id: 'quarantine-notice', title: 'Quarantine Notice', category: 'World', description: 'A newly discovered quarantine notice reveals a restricted area.' },
  { id: 'medical-log', title: 'Medical Log 07', category: 'Lore', description: 'A medical log documents an unexplained change in the infection.' },
  { id: 'abandoned-camp', title: 'Abandoned Camp', category: 'Discovery', description: 'A new abandoned camp is added to the survivor discovery archive.' },
  { id: 'containment-tag', title: 'Containment Tag', category: 'Collectible', description: 'A numbered containment tag becomes part of the monthly collection.' },
  { id: 'research-note', title: 'Research Note', category: 'Lore', description: 'A new research note adds context to the month’s investigation.' },
  { id: 'power-grid-fault', title: 'Power Grid Fault', category: 'World', description: 'A new power-grid anomaly appears in the facility field report.' },
  { id: 'safehouse-signal', title: 'Safehouse Signal', category: 'Secret', description: 'A faint safehouse signal adds a new optional discovery.' },
  { id: 'mutation-sample', title: 'Mutation Sample', category: 'Collectible', description: 'A new sample record expands the mutation collection.' },
  { id: 'emergency-broadcast', title: 'Emergency Broadcast', category: 'Story', description: 'A recovered broadcast advances the current outbreak storyline.' },
  { id: 'biohazard-map', title: 'Biohazard Map', category: 'Map Intel', description: 'A new map annotation reveals an overlooked route.' },
  { id: 'rescue-marker', title: 'Rescue Marker', category: 'Challenge', description: 'A new rescue marker introduces an optional survival objective.' },
  { id: 'supply-route', title: 'Supply Route', category: 'World', description: 'A newly mapped supply route expands the exploration notes.' },
  { id: 'containment-code', title: 'Containment Code', category: 'Secret', description: 'A new access-code clue is added to the monthly mystery.' },
  { id: 'echo-chamber', title: 'Echo Chamber', category: 'Discovery', description: 'A new location entry records an unusual sound beneath the facility.' },
  { id: 'sublevel-door', title: 'Sublevel Door', category: 'World', description: 'A sealed sublevel entrance is added to the discovery archive.' },
  { id: 'research-archive', title: 'Research Archive', category: 'Lore', description: 'A recovered archive entry connects two earlier discoveries.' },
  { id: 'power-relay', title: 'Power Relay', category: 'World', description: 'A new relay report adds another point to the facility map.' },
  { id: 'night-watch-log', title: 'Night Watch Log', category: 'Lore', description: 'A night-watch entry reveals what happened during the previous shift.' },
  { id: 'evacuation-order', title: 'Evacuation Order', category: 'Story', description: 'A new evacuation order changes the context of the current investigation.' },
  { id: 'zone-warning', title: 'Zone Warning', category: 'World', description: 'A newly recovered warning marks a dangerous area on the map.' },
  { id: 'lost-passenger', title: 'Lost Passenger', category: 'Story', description: 'A survivor account adds a new character to the outbreak timeline.' },
  { id: 'final-dispatch', title: 'Final Dispatch', category: 'Story', description: 'A recovered dispatch adds a clue to the month-end finale.' },
  { id: 'maintenance-report', title: 'Maintenance Report', category: 'Lore', description: 'A maintenance report reveals a system failure that predates the outbreak.' },
  { id: 'observation-window', title: 'Observation Window', category: 'Discovery', description: 'A new observation record adds a hidden detail to the facility archive.' }
];

const MONTH_THEMES = {
  0: 'Frozen Outbreak', 1: 'Heart of the Infection', 2: 'Mutation Season', 3: 'The Forgotten Laboratory',
  4: 'Biohazard Protocol', 5: 'The Last Colony', 6: 'Project Extinction', 7: 'The Underground',
  8: 'The Return', 9: 'Nightmare Month', 10: 'Project Blackout', 11: 'Winter Apocalypse'
};
const WEEKLY_UPDATE_PARTS = [
  { subtitle: 'The Signal', objective: 'Investigate the first blackout signal and recover the missing field report.', reward: 'Blackout Intel I' },
  { subtitle: 'The Power Station', objective: 'Trace the signal to the power station and uncover who restarted the grid.', reward: 'Blackout Intel II' },
  { subtitle: 'The Containment Breach', objective: 'Track the outbreak into containment and uncover the source of the mutations.', reward: 'Blackout Intel III' },
  { subtitle: 'Final Transmission', objective: 'Complete the final transmission and expose what the monthly investigation uncovered.', reward: 'Monthly Finale Access' }
];

function monthStartUtc(year, month) { return Date.UTC(year, month, 1); }
function monthEndUtc(year, month) { return Date.UTC(year, month + 1, 1); }
function lastThreeDaysStartUtc(year, month) { return monthEndUtc(year, month) - 3 * DAY; }
function monthTheme(month) { return MONTH_THEMES[month] || 'Outbreak Investigation'; }
function weeklyUpdateForIndex(index, month) {
  const partNumber = ((index % WEEKLY_UPDATE_PARTS.length) + WEEKLY_UPDATE_PARTS.length) % WEEKLY_UPDATE_PARTS.length + 1;
  const part = WEEKLY_UPDATE_PARTS[partNumber - 1];
  return {
    id: `weekly-update-${index + 1}`,
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

  const weeklyIndex = Math.floor((timestamp - WEEKLY_UPDATE_ANCHOR) / WEEK_INTERVAL);
  const weeklyStart = WEEKLY_UPDATE_ANCHOR + weeklyIndex * WEEK_INTERVAL;
  const weeklyEnd = weeklyStart + WEEKLY_UPDATE_DURATION;
  const activeWeekly = timestamp >= WEEKLY_UPDATE_ANCHOR && timestamp >= weeklyStart && timestamp < weeklyEnd;
  const upcomingWeeklyIndex = activeWeekly ? weeklyIndex + 1 : (timestamp < weeklyStart ? weeklyIndex : weeklyIndex + 1);
  const upcomingWeeklyStart = WEEKLY_UPDATE_ANCHOR + upcomingWeeklyIndex * WEEK_INTERVAL;
  const selectedWeeklyIndex = activeWeekly ? weeklyIndex : upcomingWeeklyIndex;
  const selectedWeeklyMonth = new Date(activeWeekly ? weeklyStart : upcomingWeeklyStart).getUTCMonth();
  const weeklyMeta = weeklyUpdateForIndex(selectedWeeklyIndex, selectedWeeklyMonth);

  // The monthly story is the always-on season layer. Weekend chapters and
  // three-day additions are separate overlays that run alongside it.
  const monthlyStart = currentMonthStart;
  const monthlyActive = timestamp >= currentMonthStart && timestamp < currentMonthEnd;
  const nextMonth = new Date(currentMonthEnd);
  const nextMonthlyStart = currentMonthEnd;
  const monthlyRecap = [];
  for (let i = 0; i <= smallIndex; i++) {
    const at = SMALL_ANCHOR + i * SMALL_INTERVAL;
    if (at >= currentMonthStart && at < currentMonthEnd && at <= timestamp) {
      monthlyRecap.push(SMALL_ADDITIONS[i % SMALL_ADDITIONS.length].title);
    }
  }
  const weeklyRecap = [];
  for (let i = 0; i < 100; i++) {
    const at = WEEKLY_UPDATE_ANCHOR + i * WEEK_INTERVAL;
    if (at >= currentMonthStart && at < currentMonthEnd && at <= timestamp) {
      weeklyRecap.push(weeklyUpdateForIndex(i, new Date(at).getUTCMonth()).title);
    }
  }
  const theme = monthTheme(month);
  const monthlyEvent = {
    id: `monthly-${year}-${String(month + 1).padStart(2, '0')}`,
    theme,
    title: `${theme}: Monthly Event`,
    active: monthlyActive,
    startsAt: monthlyStart,
    endsAt: currentMonthEnd,
    objective: 'Bring together this month’s field reports, weekly updates, and discoveries for the final operation.',
    monthlyRecap: [...monthlyRecap, ...weeklyRecap].slice(-12)
  };

  return {
    ok: true,
    version: '1.0.0',
    timezone: 'UTC',
    serverTime: date.toISOString(),
    smallAddition: { ...smallItem, cycle: smallIndex + 1, startsAt: smallStart, endsAt: smallEnd, nextAt: smallEnd },
    weeklyEvent: {
      ...weeklyMeta,
      active: activeWeekly,
      startsAt: activeWeekly ? weeklyStart : upcomingWeeklyStart,
      endsAt: activeWeekly ? weeklyEnd : upcomingWeeklyStart + WEEKLY_UPDATE_DURATION,
      nextAt: upcomingWeeklyStart
    },
    monthlyEvent,
    nextSmallAdditionAt: smallEnd,
    nextWeeklyEventAt: upcomingWeeklyStart,
    nextMonthlyEventAt: monthlyActive ? nextMonthlyStart : monthlyStart
  };
}

module.exports = { buildLiveContent, SMALL_INTERVAL, WEEKLY_UPDATE_DURATION, SMALL_ANCHOR, WEEKLY_UPDATE_ANCHOR };
