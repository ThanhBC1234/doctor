import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eloToEngineParams, clampElo, allEloLevels, eloLabelKey, ENGINE_ELO_MIN } from '../js/elo.js';

test('các mức 1000 → 2500 bước 50', () => {
  const levels = allEloLevels();
  assert.equal(levels[0], 1000);
  assert.equal(levels[levels.length - 1], 2500);
  assert.equal(levels.length, 31);
});

test('mọi mức đều cho tham số hợp lệ với Stockfish 19 lite', () => {
  for (const elo of allEloLevels()) {
    const p = eloToEngineParams(elo);
    assert.equal(p.elo, elo);
    const skill = p.options['Skill Level'];
    assert.ok(Number.isInteger(skill) && skill >= 0 && skill <= 20, `Skill Level ${skill}`);
    assert.ok([1, 3].includes(p.options.MultiPV));
    assert.match(p.goCommand, /^go (depth [1-9]|movetime \d+)$/);
    if (elo < ENGINE_ELO_MIN) {
      assert.equal(p.options.UCI_LimitStrength, false);
      assert.equal('UCI_Elo' in p.options, false, 'không gửi UCI_Elo dưới 1320');
      assert.ok(p.randomize);
      assert.equal(p.approximate, true);
    } else {
      assert.equal(p.options.UCI_LimitStrength, true);
      assert.equal(p.options.UCI_Elo, elo);
      assert.ok(p.options.UCI_Elo >= 1320 && p.options.UCI_Elo <= 3190);
      assert.equal(p.randomize, null);
    }
  }
});

test('mức thấp yếu dần đều', () => {
  let prevDepth = 0;
  let prevSkill = -1;
  for (const elo of [1000, 1050, 1100, 1150, 1200, 1250, 1300]) {
    const p = eloToEngineParams(elo);
    const depth = Number(p.goCommand.split(' ')[2]);
    assert.ok(depth >= prevDepth);
    assert.ok(p.options['Skill Level'] >= prevSkill);
    prevDepth = depth;
    prevSkill = p.options['Skill Level'];
  }
});

test('mức cao nghĩ lâu hơn', () => {
  assert.equal(eloToEngineParams(1400).goCommand, 'go movetime 800');
  assert.equal(eloToEngineParams(2500).goCommand, 'go movetime 1200');
});

test('clampElo', () => {
  assert.equal(clampElo(900), 1000);
  assert.equal(clampElo(3000), 2500);
  assert.equal(clampElo(1424), 1400);
  assert.equal(clampElo(1426), 1450);
  assert.equal(clampElo('abc'), 1400);
});

test('nhãn mức chơi', () => {
  assert.equal(eloLabelKey(1000), 'beginner');
  assert.equal(eloLabelKey(1400), 'intermediate');
  assert.equal(eloLabelKey(1700), 'good');
  assert.equal(eloLabelKey(2000), 'strong');
  assert.equal(eloLabelKey(2500), 'expert');
});
