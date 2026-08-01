import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildRequestGroups } from './request-groups.utils.ts';

// time_spent values are in SECONDS (as emitted by the Rust backend).
const sessionReq = (overrides: any = {}) => ({
  request_type: 'Session Only',
  content: 'SESSION',
  event_token: 'evt-1',
  level_id: 1,
  level_name: '-',
  time_spent: 1100,
  ...overrides,
});

const eventReq = (overrides: any = {}) => ({
  request_type: 'Level Event',
  content: 'EVENT',
  event_token: 'evt-1',
  level_id: 2,
  level_name: 'Level 2',
  time_spent: 1200,
  ...overrides,
});

// ===== Grouping =====

it('keeps session and event in ONE group despite different time_spent', () => {
  const groups = buildRequestGroups([
    sessionReq({ time_spent: 1100 }),
    eventReq({ time_spent: 1200 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].requests.length, 2);
});

it('sorts session before event within a group', () => {
  const groups = buildRequestGroups([
    eventReq(),
    sessionReq(),
  ]);
  assert.equal(groups[0].requests[0].request_type, 'Session Only');
  assert.equal(groups[0].requests[1].request_type, 'Level Event');
});

it('uses the event time as the group pacing time', () => {
  const groups = buildRequestGroups([
    sessionReq({ time_spent: 1100 }),
    eventReq({ time_spent: 1200 }),
  ]);
  assert.equal(groups[0].time_spent, 1200);
});

it('keeps the session value for session-only groups', () => {
  const groups = buildRequestGroups([sessionReq()]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].time_spent, 1100);
});

it('splits different tokens into separate groups', () => {
  const groups = buildRequestGroups([
    sessionReq({ event_token: 'evt-1' }),
    sessionReq({ event_token: 'evt-2' }),
  ]);
  assert.equal(groups.length, 2);
});

it('sorts groups by their pacing time ascending', () => {
  const groups = buildRequestGroups([
    sessionReq({ event_token: 'slow', time_spent: 3000 }),
    sessionReq({ event_token: 'fast', time_spent: 1000 }),
  ]);
  assert.equal(groups[0].event_token, 'fast');
  assert.equal(groups[1].event_token, 'slow');
});

it('handles empty input', () => {
  assert.deepEqual(buildRequestGroups([]), []);
});

it('groups a compound (session + event) pair as one group by token', () => {
  const groups = buildRequestGroups([
    eventReq({ event_token: 'evt-9', time_spent: 5000 }),
    sessionReq({ event_token: 'evt-9', time_spent: 1000 }),
    eventReq({ event_token: 'evt-2', time_spent: 2000 }),
  ]);
  assert.equal(groups.length, 2);
  const compound = groups.find((g) => g.event_token === 'evt-9')!;
  assert.equal(compound.requests.length, 2);
  assert.equal(compound.time_spent, 5000);
});
