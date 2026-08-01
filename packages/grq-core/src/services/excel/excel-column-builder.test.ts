import { describe, it } from 'node:test';
import assert from 'node:assert';
import { filterSessionLevelsSharingDayWithEvent } from './excel-column-builder.ts';

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

describe('filterSessionLevelsSharingDayWithEvent — per-token rule', () => {
  it('drops a standalone Session sharing the same day + base token with a Level Event', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc_day0', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterSessionLevelsSharingDayWithEvent(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1],
      'same-token event-day session is dropped',
    );
  });

  it('keeps a standalone Session with a different base token on an event day', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'zzz_day0', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterSessionLevelsSharingDayWithEvent(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 2],
      'different-token session is kept under the per-token rule',
    );
  });

  it('keeps a standalone Session on a day with no Level Event', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc_day1', level_name: '-', days_offset: 1 }),
    ];

    const filtered = filterSessionLevelsSharingDayWithEvent(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 2],
      'session on a non-event day is kept',
    );
  });

  it('keeps a session with the same base token but a different day', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc_day2', level_name: '-', days_offset: 2 }),
    ];

    const filtered = filterSessionLevelsSharingDayWithEvent(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 2],
      'same token on a different day is not blocked',
    );
  });

  it('keeps all real levels untouched', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'def_day3', level_name: 'Level 2', days_offset: 3 }),
    ];

    const filtered = filterSessionLevelsSharingDayWithEvent(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 2],
    );
  });

  it('drops only the same-token session when two sessions exist on an event day', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc_day0', level_name: '-', days_offset: 0 }),
      level({ id: 3, event_token: 'zzz_day0', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterSessionLevelsSharingDayWithEvent(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1, 3],
      'only the same-token session is dropped',
    );
  });

  it('handles tokens without a _day suffix', () => {
    const levels = [
      level({ id: 1, event_token: 'abc', level_name: 'Level 1', days_offset: 0 }),
      level({ id: 2, event_token: 'abc', level_name: '-', days_offset: 0 }),
    ];

    const filtered = filterSessionLevelsSharingDayWithEvent(levels);

    assert.deepEqual(
      filtered.map((l) => l.id),
      [1],
    );
  });
});
