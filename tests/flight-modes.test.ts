import assert from 'node:assert/strict';
import test from 'node:test';
import { EndlessRoutePlanner, hasTerrainLineOfSight } from '../src/gameplay/EndlessRoute.ts';
import { FlightEnergy } from '../src/gameplay/FlightEnergy.ts';
import { calculateSpeedRush, calculateWaterSkimIntensity } from '../src/gameplay/FlightFeedbackMath.ts';
import { formatCheckpointProgress } from '../src/gameplay/GameplayPresentation.ts';
import { calculateHeightfieldNormal, resolveSteepTerrainContact } from '../src/gameplay/TerrainContactMath.ts';

test('checkpoint energy is consumed only while climbing and restored by a gate', () => {
  const energy = new FlightEnergy();
  energy.setLimited(true);
  energy.consumeClimb(2);
  assert.ok(energy.getValue() < 1);
  const consumed = energy.getValue();
  energy.consumeClimb(0);
  assert.equal(energy.getValue(), consumed);
  energy.restore();
  assert.equal(energy.getValue(), 1);
});

test('free-flight climb remains unlimited', () => {
  const energy = new FlightEnergy();
  energy.setLimited(false);
  energy.consumeClimb(100);
  assert.equal(energy.getValue(), 1);
  assert.equal(energy.canClimb(), true);
});

test('endless route is deterministic, sequential, and keeps moving forward', () => {
  const first = new EndlessRoutePlanner();
  const second = new EndlessRoutePlanner();
  const height = (x: number, z: number) => x * 0.01 + z * 0.005;
  let previousZ = 0;
  for (let sequence = 1; sequence <= 40; sequence++) {
    const a = first.next(height);
    const b = second.next(height);
    assert.deepEqual(a, b);
    assert.equal(a.sequence, sequence);
    assert.ok(a.z > previousZ);
    assert.ok(a.y > height(a.x, a.z) + 60);
    previousZ = a.z;
  }
});

test('every generated gate keeps the next gate close, gently turning, and above the terrain sightline', () => {
  const planner = new EndlessRoutePlanner();
  const height = (x: number, z: number) => 32 * Math.sin(z / 93) + 18 * Math.cos(x / 71);
  let previous = planner.next(height);
  for (let index = 0; index < 60; index++) {
    const next = planner.next(height);
    const spacing = Math.hypot(next.x - previous.x, next.z - previous.z);
    assert.ok(spacing >= 300 && spacing <= 420.001);
    assert.ok(Math.abs(next.heading - previous.heading) <= 0.181);
    assert.equal(hasTerrainLineOfSight(previous, next, height), true);
    previous = next;
  }
});

test('screen-edge airflow fades in only at high speed', () => {
  assert.equal(calculateSpeedRush(110), 0);
  assert.ok(calculateSpeedRush(150) > 0.3);
  assert.equal(calculateSpeedRush(210), 1);
});

test('water skim requires water, speed, and low altitude together', () => {
  assert.equal(calculateWaterSkimIntensity(0, 5, 190), 0, 'land must not emit spray');
  assert.equal(calculateWaterSkimIntensity(12, -30, 190), 0, 'high flight must not emit spray');
  assert.equal(calculateWaterSkimIntensity(-3, -30, 80), 0, 'slow flight must not emit spray');
  assert.ok(calculateWaterSkimIntensity(-3, -30, 190) > 0.5, 'fast low water flight should emit spray');
});

test('endless checkpoint progress starts at zero instead of one', () => {
  assert.deepEqual(formatCheckpointProgress(0, null), { current: '00', total: '∞' });
  assert.deepEqual(formatCheckpointProgress(7, null), { current: '07', total: '∞' });
});

test('a steep mountain impact becomes an outward tangent slide instead of a stop', () => {
  const normal = calculateHeightfieldNormal(0, 0, (x) => x * 1.5);
  const incoming = { x: 42, y: -3, z: 18 };
  const response = resolveSteepTerrainContact(incoming, normal, 1.4);
  assert.equal(response.sliding, true);
  const outgoingNormalSpeed = response.velocity.x * normal.x
    + response.velocity.y * normal.y
    + response.velocity.z * normal.z;
  assert.ok(outgoingNormalSpeed >= 4.49, 'response must separate the rider from the face');
  assert.ok(Math.hypot(response.velocity.x, response.velocity.z) > 10, 'glancing momentum must survive');
});

test('open air and shallow terrain do not alter flight velocity', () => {
  const velocity = { x: 20, y: -4, z: 31 };
  const shallowNormal = { x: -0.1, y: Math.sqrt(0.99), z: 0 };
  assert.equal(resolveSteepTerrainContact(velocity, shallowNormal, 1.2).sliding, false);
  const steepNormal = calculateHeightfieldNormal(0, 0, (x) => x * 1.5);
  assert.equal(resolveSteepTerrainContact(velocity, steepNormal, 8).sliding, false);
});
