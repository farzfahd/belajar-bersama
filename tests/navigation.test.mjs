import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOTTOM_NAV_KEYS,
  NAV,
  isNavItemActive,
  navByKey,
  navByPath
} from '../src/app/layout/navConfig.js';

test('navigation has unique items and seven mobile targets', () => {
  assert.equal(NAV.length, 13);
  assert.equal(new Set(NAV.map((item) => item.key)).size, NAV.length);
  assert.equal(BOTTOM_NAV_KEYS.length, 7);
  assert.ok(BOTTOM_NAV_KEYS.every((key) => navByKey(key)));
});

test('deep routes resolve to their parent navigation item', () => {
  assert.equal(navByPath('/roadmap/topic-1')?.key, 'roadmap');
  assert.equal(navByPath('/notes/note-1')?.key, 'learn');
  assert.equal(navByPath('/learn')?.key, 'learn');
  assert.equal(navByPath('/progress')?.key, 'progress');
  assert.equal(navByPath('/achievements')?.key, 'achievements');
  assert.equal(navByKey('progress')?.comingSoon, false);
  assert.equal(navByKey('achievements')?.comingSoon, false);
  assert.equal(navByKey('questions')?.comingSoon, false);
});

test('dashboard does not become active for unrelated descendants', () => {
  const dashboard = NAV.find((item) => item.key === 'dashboard');
  assert.equal(isNavItemActive(dashboard, '/dashboard'), true);
  assert.equal(isNavItemActive(dashboard, '/dashboard/settings'), false);
  assert.equal(isNavItemActive(dashboard, '/learn/notes'), false);
});
