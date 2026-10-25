import assert from 'node:assert/strict';
import test from 'node:test';
import { QualityController } from '../src/engine/quality.ts';

test('Auto reduces quality after three sustained low samples', () => {
  const controller = new QualityController();
  controller.setMode('auto', 0);
  assert.equal(controller.observeFPS(35, 6_000), null);
  assert.equal(controller.observeFPS(35, 7_500), null);
  const change = controller.observeFPS(35, 9_000);
  assert.deepEqual(change && { from: change.from, to: change.to }, { from: 'balanced', to: 'eco' });
});

test('Auto increases quality after five sustained high samples and a cooldown', () => {
  const controller = new QualityController();
  controller.setMode('auto', 0);
  controller.observeFPS(35, 6_000);
  controller.observeFPS(35, 7_500);
  controller.observeFPS(35, 9_000);
  const times = [15_000, 16_500, 18_000, 19_500, 21_000];
  let change = null;
  for (const now of times) change = controller.observeFPS(80, now) ?? change;
  assert.deepEqual(change && { from: change.from, to: change.to }, { from: 'eco', to: 'balanced' });
});

test('Manual modes do not adapt to frame-rate samples', () => {
  const controller = new QualityController();
  controller.setMode('high', 0);
  for (let index = 0; index < 10; index++) controller.observeFPS(10, 10_000 + index * 1_500);
  assert.equal(controller.currentTier, 'high');
  assert.match(controller.currentDiagnostic, /Manual high/);
});
