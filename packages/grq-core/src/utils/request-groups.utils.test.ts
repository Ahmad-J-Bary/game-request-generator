import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildRequestGroups, classifyLevelRequestType } from './request-groups.utils.ts';

const sessionReq = (overrides: any = {}) => ({
  request_type: 'Session Only',
  content: 'SESSION',
  event_token: 'evt-1',
  level_id: 1,
  level_name: '-',
  time_spent: 1000 * 1000 + 100,
  ...overrides,
});

const eventReq = (overrides: any = {}) => ({
  request_type: 'Level Event',
  content: 'EVENT',
  event_token: 'evt-1',
  level_id: 2,
  level_name: 'Level 2',
  time_spent: 1000 * 1000 + 200,
  ...overrides,
});

// ===== Grouping =====

it('keeps session and event in ONE group despite different time_spent', () => {
  const groups = buildRequestGroups([
    sessionReq({ time_spent: 1000 * 1000 + 100 }),
    eventReq({ time_spent: 1000 * 1000 + 200 }),
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
    sessionReq({ time_spent: 1000 * 1000 + 100 }),
    eventReq({ time_spent: 1000 * 1000 + 200 }),
  ]);
  assert.equal(groups[0].time_spent, 1000 * 1000 + 200);
});

it('keeps the session value for session-only groups', () => {
  const groups = buildRequestGroups([sessionReq()]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].time_spent, 1000 * 1000 + 100);
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
    sessionReq({ event_token: 'slow', time_spent: 3000 * 1000 }),
    sessionReq({ event_token: 'fast', time_spent: 1000 * 1000 }),
  ]);
  assert.equal(groups[0].event_token, 'fast');
  assert.equal(groups[1].event_token, 'slow');
});

it('handles empty input', () => {
  assert.deepEqual(buildRequestGroups([]), []);
});

it('groups a compound (session + event) pair as one group by token', () => {
  const groups = buildRequestGroups([
    eventReq({ event_token: 'evt-9', time_spent: 5000 * 1000 }),
    sessionReq({ event_token: 'evt-9', time_spent: 1000 * 1000 }),
    eventReq({ event_token: 'evt-2', time_spent: 2000 * 1000 }),
  ]);
  assert.equal(groups.length, 2);
  const compound = groups.find((g) => g.event_token === 'evt-9')!;
  assert.equal(compound.requests.length, 2);
  assert.equal(compound.time_spent, 5000 * 1000);
});

// ===== Compound-pair classification (Level Session + Level Event) =====

it('classifies an event as Level Event', () => {
  assert.equal(classifyLevelRequestType('event', false), 'Level Event');
  assert.equal(classifyLevelRequestType('event', true), 'Level Event');
});

it('classifies a session paired with an event as Level Session', () => {
  assert.equal(classifyLevelRequestType('session', true), 'Level Session');
  assert.equal(classifyLevelRequestType('session only', true), 'Level Session');
});

it('classifies a standalone session without an event as Session Only', () => {
  assert.equal(classifyLevelRequestType('session', false), 'Session Only');
  assert.equal(classifyLevelRequestType('session only', false), 'Session Only');
});
