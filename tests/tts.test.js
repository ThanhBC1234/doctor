// tts.js chạy trong Node với speechSynthesis giả gắn vào globalThis.window.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTts, chunkText } from '../js/speech/tts.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let synth;

function fakeSynth() {
  const s = {
    queue: [], resumed: 0, cancelled: 0, speaking: false,
    speak(u) { s.queue.push(u); },
    cancel() { s.cancelled++; const q = s.queue.splice(0); for (const u of q) u.onerror?.({ error: 'canceled' }); },
    resume() { s.resumed++; },
    getVoices: () => [{ name: 'A', lang: 'vi-VN', voiceURI: 'a' }, { name: 'B', lang: 'en-US', voiceURI: 'b' }],
    addEventListener() {},
  };
  return s;
}

beforeEach(() => {
  synth = fakeSynth();
  globalThis.window = { speechSynthesis: synth, SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } } };
});
afterEach(() => { delete globalThis.window; });

test('đọc xong khi onend; speaking đúng trong lúc đọc; resume() trước khi đọc', async () => {
  const tts = createTts();
  let done = false;
  const p = tts.speak('xin chào').then(() => { done = true; });
  assert.equal(tts.speaking, true);
  await sleep(5);
  assert.equal(synth.queue.length, 1);
  assert.equal(synth.resumed, 1);
  synth.queue[0].onstart?.();
  await sleep(5);
  assert.equal(done, false, 'chưa xong khi chưa onend');
  synth.queue[0].onend();
  await p;
  assert.equal(tts.speaking, false);
  assert.deepEqual(tts.log, ['xin chào']);
});

test('không onend: hẹn giờ dự phòng chỉ tính từ lúc thật sự bắt đầu đọc', async () => {
  const tts = createTts({ startWatchdogMs: 400 });
  let done = false;
  tts.speak('ab').then(() => { done = true; }); // thời lượng dự phòng: 2*90 + 1500 = 1680 ms
  await sleep(5);
  const u = synth.queue[0];
  await sleep(300);
  u.onstart?.(); // giọng khởi động chậm 300 ms
  await sleep(250); // tổng 550 ms > watchdog 400 nhưng đã onstart → không được kết thúc sớm
  assert.equal(done, false);
  u.onend();
  await sleep(5);
  assert.equal(done, true);
});

test('không bao giờ bắt đầu đọc: bỏ qua sau watchdog, không kẹt', async () => {
  const tts = createTts({ startWatchdogMs: 120 });
  const t0 = Date.now();
  await tts.speak('câu này không bao giờ được đọc');
  assert.ok(Date.now() - t0 >= 100 && Date.now() - t0 < 1000);
  assert.equal(tts.speaking, false);
});

test('cancel(): câu đang đọc và đang chờ đều kết thúc; câu sau cancel vẫn đọc được', async () => {
  const tts = createTts();
  const p1 = tts.speak('một');
  const p2 = tts.speak('hai');
  await sleep(5);
  tts.cancel();
  await Promise.all([p1, p2]);
  assert.equal(tts.speaking, false);
  const p3 = tts.speak('ba');
  await sleep(200); // chờ nhịp 150 ms sau cancel
  assert.equal(synth.queue.length, 1);
  assert.equal(synth.queue[0].text, 'ba');
  synth.queue[0].onend();
  await p3;
});

test('lỗi đọc (synthesis-failed) → kết thúc ngay', async () => {
  const tts = createTts();
  const p = tts.speak('lỗi');
  await sleep(5);
  synth.queue[0].onerror({ error: 'synthesis-failed' });
  await p;
  assert.equal(tts.speaking, false);
});

test('chọn giọng tiếng Việt trước; câu dài được chia nhỏ', () => {
  const tts = createTts();
  assert.equal(tts.getVoices()[0].lang, 'vi-VN');
  assert.equal(tts.setVoice('b').voiceURI, 'b');
  assert.equal(tts.setVoice('khong-co').voiceURI, 'a');
  assert.equal(tts.hasVietnameseVoice(), true);
  const chunks = chunkText('a'.repeat(100) + '. ' + 'b'.repeat(100) + ', ' + 'c'.repeat(50), 140);
  assert.ok(chunks.length >= 2 && chunks.every((c) => c.length <= 140));
});

test('không có speechSynthesis: speak() xong ngay, không ném lỗi', async () => {
  delete globalThis.window;
  const tts = createTts();
  assert.equal(tts.supported, false);
  await tts.speak('abc');
  assert.equal(tts.speaking, false);
});
