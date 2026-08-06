import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildRegionProcessingOrder } from './region-order.utils.ts';
import type { Region } from '@grq/api-bindings';

const region = (overrides: Partial<Region>): Region => ({
  id: 1,
  name: 'X',
  parent_id: null,
  is_primary: true,
  sort_order: 0,
  ...overrides,
});

describe('buildRegionProcessingOrder', () => {
  it('orders used sub-regions by the configured region order', () => {
    const regions = [
      region({ id: 1, name: 'UNITED STATES (US)', sort_order: 0 }),
      region({ id: 2, name: 'FLORIDA', parent_id: 1, sort_order: 1 }),
      region({ id: 3, name: 'CALIFORNIA', parent_id: 1, sort_order: 2 }),
      region({ id: 4, name: 'TEXAS', parent_id: 1, sort_order: 3 }),
      region({ id: 5, name: 'New York', parent_id: 1, sort_order: 4 }),
    ];
    const order = buildRegionProcessingOrder(regions, [
      'New York',
      'FLORIDA',
      'TEXAS',
    ]);
    assert.deepStrictEqual(order, ['FLORIDA', 'TEXAS', 'New York']);
  });

  it('appends leftover keys (not mapped to a region) at the end', () => {
    const regions = [
      region({ id: 1, name: 'UNITED STATES (US)', sort_order: 0 }),
      region({ id: 2, name: 'FLORIDA', parent_id: 1, sort_order: 1 }),
    ];
    const order = buildRegionProcessingOrder(regions, [
      'FLORIDA',
      'Unknown',
    ]);
    assert.deepStrictEqual(order, ['FLORIDA', 'Unknown']);
  });

  it('sorts by sort_order regardless of input array order', () => {
    const regions = [
      region({ id: 3, name: 'TEXAS', parent_id: 1, sort_order: 3 }),
      region({ id: 2, name: 'CALIFORNIA', parent_id: 1, sort_order: 2 }),
      region({ id: 1, name: 'FLORIDA', parent_id: 1, sort_order: 1 }),
    ];
    assert.deepStrictEqual(buildRegionProcessingOrder(regions, ['CALIFORNIA', 'FLORIDA', 'TEXAS']), [
      'FLORIDA',
      'CALIFORNIA',
      'TEXAS',
    ]);
  });

  it('returns only used keys when regions reference states that have no accounts', () => {
    const regions = [
      region({ id: 1, name: 'FLORIDA', parent_id: 2, sort_order: 1 }),
      region({ id: 2, name: 'CALIFORNIA', parent_id: 2, sort_order: 2 }),
    ];
    assert.deepStrictEqual(buildRegionProcessingOrder(regions, ['CALIFORNIA']), [
      'CALIFORNIA',
    ]);
  });
});
