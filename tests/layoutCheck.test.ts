import { describe, expect, test } from 'bun:test';
import { architectureParents, contains, crosses, inset, intersection, overlaps } from '../src/lib/utils/layoutCheck';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('geometry', () => {
  test('intersection of overlapping and disjoint boxes', () => {
    expect(intersection(box(0, 0, 10, 10), box(5, 5, 10, 10))).toEqual(box(5, 5, 5, 5));
    expect(intersection(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBeNull(); // touching edges
    expect(intersection(box(0, 0, 10, 10), box(20, 20, 5, 5))).toBeNull();
  });

  test('overlaps ignores slivers below the threshold', () => {
    expect(overlaps(box(0, 0, 10, 10), box(8, 0, 10, 10), 3)).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(6, 0, 10, 10), 3)).toBe(true);
  });

  test('contains with slack', () => {
    expect(contains(box(0, 0, 100, 100), box(10, 10, 20, 20))).toBe(true);
    expect(contains(box(0, 0, 100, 100), box(90, 10, 20, 20))).toBe(false);
    expect(contains(box(0, 0, 100, 100), box(0.5, 0, 100, 100), 1)).toBe(true);
  });

  test('crosses: a sampled edge through a box, inset excludes the border', () => {
    const line = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50 }));
    expect(crosses(line, box(40, 40, 20, 20))).toBe(true);
    expect(crosses(line, box(40, 60, 20, 20))).toBe(false);
    // An edge running along the border isn't "through" once the box is inset
    expect(crosses(line, inset(box(40, 50, 20, 20), 3))).toBe(false);
  });
});

describe('architectureParents', () => {
  test('services, groups and junctions with "in"', () => {
    const parents = architectureParents(`architecture-beta
    group cloud(cloud)[Cloud]
    group data(database)[Data] in cloud
    service db(database)[DB] in data
    service gw(lucide:globe)[Gateway Service]
    junction j1 in cloud
    db:L --> R:gw`);
    expect([...parents]).toEqual([['data', 'cloud'], ['db', 'data'], ['j1', 'cloud']]);
  });
});
