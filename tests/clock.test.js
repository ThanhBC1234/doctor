import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, pgnTimeControl } from '../js/clock.js';

function fakeTime() {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('trừ giờ đúng bên đang chạy', () => {
  const ft = fakeTime();
  const c = createClock({ baseMs: 60000, now: ft.now });
  c.start('w');
  ft.advance(1500);
  assert.equal(c.time('w'), 58500);
  assert.equal(c.time('b'), 60000);
});

test('bấm đồng hồ: cộng increment cho bên vừa đi, chuyển bên', () => {
  const ft = fakeTime();
  const c = createClock({ baseMs: 60000, incrementMs: 10000, now: ft.now });
  c.start('w');
  ft.advance(5000);
  c.press();
  assert.equal(c.active, 'b');
  assert.equal(c.time('w'), 65000);
  ft.advance(2000);
  assert.equal(c.time('b'), 58000);
  c.press();
  assert.equal(c.time('b'), 68000);
  assert.equal(c.active, 'w');
});

test('tạm dừng không trừ giờ', () => {
  const ft = fakeTime();
  const c = createClock({ baseMs: 60000, now: ft.now });
  c.start('w');
  ft.advance(1000);
  c.pause();
  assert.equal(c.running, false);
  ft.advance(30000);
  assert.equal(c.time('w'), 59000);
  c.resume();
  ft.advance(1000);
  assert.equal(c.time('w'), 58000);
});

test('hết giờ: tick trả về bên hết giờ đúng một lần', () => {
  const ft = fakeTime();
  const c = createClock({ baseMs: 1000, now: ft.now });
  c.start('b');
  ft.advance(500);
  assert.equal(c.tick(), null);
  ft.advance(600);
  assert.equal(c.tick(), 'b');
  assert.equal(c.tick(), null);
  assert.equal(c.flagged, 'b');
  assert.equal(c.time('b'), 0);
  assert.equal(c.time('w'), 1000);
});

test('không âm, không cộng giờ sau khi hết giờ', () => {
  const ft = fakeTime();
  const c = createClock({ baseMs: 1000, incrementMs: 5000, now: ft.now });
  c.start('w');
  ft.advance(3000);
  assert.equal(c.time('w'), 0);
  c.tick();
  c.press();
  assert.equal(c.time('w'), 0);
});

test('setTime và serialize / khôi phục', () => {
  const ft = fakeTime();
  const c = createClock({ baseMs: 60000, incrementMs: 2000, now: ft.now });
  c.start('w');
  c.setTime('w', 1234);
  ft.advance(234);
  const s = c.serialize();
  assert.deepEqual(s, { baseMs: 60000, incrementMs: 2000, remaining: { w: 1000, b: 60000 } });
  const c2 = createClock({ baseMs: s.baseMs, incrementMs: s.incrementMs, remaining: s.remaining, now: ft.now });
  assert.equal(c2.time('w'), 1000);
  assert.equal(c2.active, null);
});

test('stop dừng hẳn', () => {
  const ft = fakeTime();
  const c = createClock({ baseMs: 60000, now: ft.now });
  c.start('w');
  c.stop();
  ft.advance(5000);
  assert.equal(c.time('w'), 60000);
  assert.equal(c.active, null);
});

test('TimeControl PGN', () => {
  assert.equal(pgnTimeControl(15, 10), '900+10');
  assert.equal(pgnTimeControl(0, 0), '-');
});
