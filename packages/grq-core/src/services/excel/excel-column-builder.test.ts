import { describe, it } from 'node:test';
import assert from 'node:assert';
import { filterStandaloneSessionLevels } from './excel-column-builder.ts';

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
