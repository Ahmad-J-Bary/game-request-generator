import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  filterStandaloneSessionLevels,
  buildModeColumns,
} from './excel-column-builder.ts';

const level = (overrides: any = {}) => ({
  id: 1,
  game_id: 1,
  branch_id: 1,
  event_token: 'abc_day0',
  level_name: 'Level 1',
  days_offset: 0,
  time_spent: 100,
  is_bonus: false,
  ...overrides,
});

const purchase = (overrides: any = {}) => ({
  id: 10,
  game_id: 1,
  branch_id: 1,
  event_token: 'buy_day2',
  level_name: '$19.99',
  days_offset: 2,
  max_days_offset: null,
  is_restricted: false,
  ...overrides,
});

describe('filterStandaloneSessionLevels — three-type rule', () => {
  it('drops a standalone Session sharing base + day with a Level Event', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc_day0', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterStandaloneSessionLevels(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1],
      'same-token event-day session is dropped',
    );
  });

  it('drops a standalone Session whose base has a Level Event on a DIFFERENT day', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc_day2', level_name: '-', days_offset: 2 }),
    ];

    const filtered = filterStandaloneSessionLevels(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1],
      'gap-day session of an event token is dropped — the session folds into the event',
    );
  });

  it('keeps a standalone Session with a different base token on an event day', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'zzz_day0', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterStandaloneSessionLevels(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 2],
      'standalone token without any Level Event is kept as Session Only',
    );
  });

  it('keeps a standalone Session on a day with no Level Event at all', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'zzz_day1', level_name: '-', days_offset: 1 }),
    ];

    const filtered = filterStandaloneSessionLevels(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 2],
      'session on a non-event day is kept when its base has no event',
    );
  });

  it('keeps all real levels untouched', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'def_day3', level_name: 'Level 2', days_offset: 3 }),
    ];

    const filtered = filterStandaloneSessionLevels(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 2],
    );
  });

  it('drops only the event-token session when two sessions exist on an event day', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc_day0', level_name: '-', days_offset: 0 }),
      level({ id: 3, event_token: 'zzz_day0', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterStandaloneSessionLevels(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 3],
      'only the event-token session is dropped',
    );
  });

  it('handles tokens without a _day suffix', () => {
    const levels = [
      level({ id: 1, event_token: 'abc', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterStandaloneSessionLevels(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1],
    );
  });
});

describe('buildModeColumns — mode-aware export columns', () => {
  it('event-only returns real events and purchases only (no session rows)', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
      level({ id: 2, event_token: 'def_day3', level_name: 'Level 2', days_offset: 3, time_spent: 200 }),
      level({ id: 3, event_token: 'zzz_day1', level_name: '-', days_offset: 1, time_spent: 90 }),
    ];

    const columns = buildModeColumns(levels, [], 'event-only');

    assert.deepEqual(
      columns.map((c) => c.name),
      ['Level 1', 'Level 2'],
    );
  });

  it('all synthesizes Session Only columns for gap days between events', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
      level({ id: 2, event_token: 'def_day3', level_name: 'Level 2', days_offset: 3, time_spent: 200 }),
    ];

    const columns = buildModeColumns(levels, [], 'all');

    assert.deepEqual(
      columns.map((c) => ({ token: c.token, name: c.name, day: c.daysOffset, synthetic: c.synthetic })),
      [
        { token: 'abc', name: 'Level 1', day: 0, synthetic: false },
        { token: 'def', name: '-', day: 1, synthetic: true },
        { token: 'def', name: '-', day: 2, synthetic: true },
        { token: 'def', name: 'Level 2', day: 3, synthetic: false },
      ],
    );

    const synth = columns.filter((c) => c.synthetic);
    assert.strictEqual(synth[0].timeSpent, 133, 'day 1 interpolates between 100 and 200');
    assert.strictEqual(synth[1].timeSpent, 167, 'day 2 interpolates between 100 and 200');
  });

  it('all does not synthesize when event days are consecutive', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
      level({ id: 2, event_token: 'def_day1', level_name: 'Level 2', days_offset: 1, time_spent: 150 }),
    ];

    const columns = buildModeColumns(levels, [], 'all');

    assert.deepEqual(columns.map((c) => c.name), ['Level 1', 'Level 2']);
  });

  it('all fills days before the first event starting from day 0', () => {
    const levels = [
      level({ id: 2, event_token: 'def_day3', level_name: 'Level 2', days_offset: 3, time_spent: 200 }),
    ];

    const columns = buildModeColumns(levels, [], 'all');

    assert.deepEqual(
      columns.map((c) => ({ name: c.name, day: c.daysOffset })),
      [
        { name: '-', day: 0 },
        { name: '-', day: 1 },
        { name: '-', day: 2 },
        { name: 'Level 2', day: 3 },
      ],
    );
    assert.deepEqual(
      columns.filter((c) => c.synthetic).map((c) => c.timeSpent),
      [50, 100, 150],
      'progressive ramp to first anchor',
    );
  });

  it('all keeps a DB standalone Session on a gap day instead of synthesizing', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
      level({ id: 2, event_token: 'def_day3', level_name: 'Level 2', days_offset: 3, time_spent: 200 }),
      level({ id: 3, event_token: 'zzz_day2', level_name: '-', days_offset: 2, time_spent: 90 }),
    ];

    const columns = buildModeColumns(levels, [], 'all');

    assert.deepEqual(
      columns.map((c) => ({ id: c.id, name: c.name, day: c.daysOffset, synthetic: c.synthetic })),
      [
        { id: 1, name: 'Level 1', day: 0, synthetic: false },
        { id: 'synth-def-1', name: '-', day: 1, synthetic: true },
        { id: 3, name: '-', day: 2, synthetic: true },
        { id: 2, name: 'Level 2', day: 3, synthetic: false },
      ],
    );
  });

  it('all keeps a DB gap-day Session whose base token ALSO has a Level Event (real id preserved so progress resolves)', () => {
    // The import persists '-' rows for gap days using the NEXT event's base
    // token, so the row's base token always belongs to a real Level Event.
    // These rows must be kept with their REAL id (not re-synthesized) so the
    // export can resolve account_level_progress and render "(C)" on completed
    // Session Only requests, exactly like the ALL-mode table.
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
      level({ id: 2, event_token: 'abc_day5', level_name: 'Level 5', days_offset: 5, time_spent: 200 }),
      level({ id: 3, event_token: 'abc_day2', level_name: '-', days_offset: 2, time_spent: 90 }),
    ];

    const columns = buildModeColumns(levels, [], 'all');

    assert.deepEqual(
      columns.map((c) => ({ id: c.id, name: c.name, day: c.daysOffset, synthetic: c.synthetic })),
      [
        { id: 1, name: 'Level 1', day: 0, synthetic: false },
        { id: 'synth-abc-1', name: '-', day: 1, synthetic: true },
        { id: 3, name: '-', day: 2, synthetic: true },
        { id: 'synth-abc-3', name: '-', day: 3, synthetic: true },
        { id: 'synth-abc-4', name: '-', day: 4, synthetic: true },
        { id: 2, name: 'Level 5', day: 5, synthetic: false },
      ],
    );

    const dbSession = columns.find((c) => c.id === 3);
    assert.strictEqual(dbSession?.daysOffset, 2, 'persisted gap-day session keeps its real id');
    assert.strictEqual(dbSession?.synthetic, true, 'persisted gap-day session is still visually flagged as synthetic');
  });

  it('appends purchases after the timeline in both modes', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
    ];
    const purchases = [
      purchase({ id: 10, event_token: 'buy_day2', level_name: '$19.99', days_offset: 2 }),
    ];

    const all = buildModeColumns(levels, purchases, 'all');
    assert.strictEqual(all[all.length - 1].kind, 'purchase');

    const eventOnly = buildModeColumns(levels, purchases, 'event-only');
    assert.strictEqual(eventOnly[eventOnly.length - 1].kind, 'purchase');
  });
});
