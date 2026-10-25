// recognition.js chạy trong Node với một SpeechRecognition giả gắn vào globalThis.window.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRecognizer } from '../js/speech/recognition.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let instances;

class FakeRec {
  constructor() { instances.push(this); this.started = false; this.stopped = false; this.abortedCalls = 0; }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.stopped = true; }
  abort() { this.abortedCalls++; }
  result(alts, isFinal = true) {
    const res = Object.assign(alts.map((t) => ({ transcript: t })), { isFinal });
    this.onresult?.({ results: [res] });
  }
  /** Nhiều đoạn đã chốt trong cùng một sự kiện (Safari/Android chia câu) */
  results(segments) {
    const list = segments.map(({ alts, isFinal = true }) => Object.assign(alts.map((t) => ({ transcript: t })), { isFinal }));
    this.onresult?.({ results: list });
  }
  end() { this.onend?.(); }
  error(code) { this.onerror?.({ error: code }); }
}

function make(extra = {}) {
  const events = [];
  const rec = createRecognizer({
    timeoutMs: 80,
    endGraceMs: 60,
    onStart: () => events.push('start'),
    onResult: (alts) => events.push(['result', alts]),
    onNoSpeech: () => events.push('nospeech'),
    onError: (code) => events.push(['error', code]),
    onEnd: () => events.push('end'),
    ...extra,
  });
  return { rec, events };
}

beforeEach(() => {
  instances = [];
  globalThis.window = { SpeechRecognition: FakeRec };
});
afterEach(() => { delete globalThis.window; });

test('kết quả cuối → onResult rồi onend → onEnd; không gọi onNoSpeech', async () => {
  const { rec, events } = make();
  assert.equal(rec.start(), true);
  assert.equal(rec.listening, true);
  instances[0].result(['mã f3', 'ma f3']);
  instances[0].end();
  assert.deepEqual(events, ['start', ['result', ['mã f3', 'ma f3']], 'end']);
  assert.equal(rec.listening, false);
});

test('kết quả tạm (isFinal=false) chỉ được dùng khi không có kết quả cuối', async () => {
  const { rec, events } = make();
  rec.start();
  instances[0].result(['mã'], false);
  instances[0].result(['mã f3'], false);
  assert.equal(events.length, 1, 'chưa xử lý kết quả tạm');
  instances[0].end();
  assert.deepEqual(events, ['start', ['result', ['mã f3']], 'end']);
});

test('kết quả tạm rồi kết quả cuối → chỉ dùng kết quả cuối, một lần', async () => {
  const { rec, events } = make();
  rec.start();
  instances[0].result(['mã'], false);
  instances[0].result(['mã f3']);
  instances[0].result(['mã f3 f3']);
  instances[0].end();
  assert.deepEqual(events, ['start', ['result', ['mã f3']], 'end']);
});

test('im lặng: no-speech rồi onend → onNoSpeech', () => {
  const { rec, events } = make();
  rec.start();
  instances[0].error('no-speech');
  instances[0].end();
  assert.deepEqual(events, ['start', 'nospeech', 'end']);
});

test('onend không bao giờ tới sau khi có kết quả → tự đóng phiên, micro mở lại được', async () => {
  const { rec, events } = make();
  rec.start();
  instances[0].result(['e4']);
  assert.equal(rec.listening, true);
  await sleep(120);
  assert.equal(rec.listening, false);
  assert.deepEqual(events, ['start', ['result', ['e4']], 'end']);
  assert.equal(rec.start(), true);
});

test('hết thời gian nghe: gọi stop(); nếu onend không tới thì tự dọn và báo không nghe thấy', async () => {
  const { rec, events } = make();
  rec.start();
  await sleep(100);
  assert.equal(instances[0].stopped, true);
  await sleep(100);
  assert.equal(rec.listening, false);
  assert.deepEqual(events, ['start', 'nospeech', 'end']);
});

test('abort: bỏ qua kết quả tới sau đó, không báo no-speech, tự dọn nếu onend không tới', async () => {
  const { rec, events } = make();
  rec.start();
  rec.abort();
  instances[0].result(['e4']);
  await sleep(120);
  assert.equal(rec.listening, false);
  assert.deepEqual(events, ['start', 'end']);
});

test('lỗi quyền micro: onError rồi onEnd, không onNoSpeech', () => {
  const { rec, events } = make();
  rec.start();
  instances[0].error('not-allowed');
  instances[0].end();
  assert.deepEqual(events, ['start', ['error', 'not-allowed'], 'end']);
});

test('start() ném lỗi (InvalidStateError) → trả false, onError start-failed, không kẹt', () => {
  class Throwing extends FakeRec { start() { throw new Error('InvalidStateError'); } }
  globalThis.window = { SpeechRecognition: Throwing };
  const { rec, events } = make();
  assert.equal(rec.start(), false);
  assert.equal(rec.listening, false);
  assert.deepEqual(events, [['error', 'start-failed']]);
  globalThis.window = { SpeechRecognition: FakeRec };
  assert.equal(rec.start(), true);
});

test('kết quả / lỗi tới muộn sau khi phiên đã tự đóng bị bỏ qua, không lọt vào phiên mới', async () => {
  const { rec, events } = make();
  rec.start();
  await sleep(100); // hết thời gian nghe → stop() → chờ onend
  await sleep(100); // không có onend → tự dọn: nospeech, end
  assert.deepEqual(events, ['start', 'nospeech', 'end']);
  assert.equal(rec.start(), true, 'phiên mới');
  instances[0].result(['đúng']); // phiên CŨ trả kết quả muộn
  instances[0].error('network');
  instances[0].end();
  assert.deepEqual(events, ['start', 'nospeech', 'end', 'start'], 'phiên cũ không gây callback nào');
  instances[1].result(['e4']);
  instances[1].end();
  assert.deepEqual(events.slice(4), [['result', ['e4']], 'end']);
});

test('nhiều đoạn đã chốt được ghép lại; phương án lấy từ đoạn cuối', () => {
  const { rec, events } = make();
  rec.start();
  instances[0].results([{ alts: ['mã'] }, { alts: ['ép ba', 'ép bà'] }]);
  instances[0].end();
  assert.deepEqual(events, ['start', ['result', ['mã ép ba', 'mã ép bà']], 'end']);
});

test('nghe thấy nhưng không nhận ra chữ (nomatch) → onError no-match, không phải "không nghe thấy"', () => {
  const { rec, events } = make();
  rec.start();
  instances[0].onnomatch?.();
  instances[0].end();
  assert.deepEqual(events, ['start', ['error', 'no-match'], 'end']);
});

test('onStart chỉ phát khi trình duyệt bắt đầu thu (onaudiostart), hoặc sau 500 ms nếu không báo', async () => {
  class Silent extends FakeRec { start() { this.started = true; } }
  globalThis.window = { SpeechRecognition: Silent };
  const { rec, events } = make();
  rec.start();
  assert.deepEqual(events, [], 'chưa bíp lúc gọi start()');
  instances[0].onaudiostart?.();
  assert.deepEqual(events, ['start']);
  instances[0].onstart?.();
  assert.deepEqual(events, ['start'], 'không lặp');
  instances[0].end();

  const { rec: rec2, events: ev2 } = make({ timeoutMs: 2000, startGraceMs: 100 });
  rec2.start();
  await sleep(40);
  assert.deepEqual(ev2, []);
  await sleep(120);
  assert.deepEqual(ev2, ['start'], 'dự phòng sau startGraceMs');
  instances[1].end();
});

test('không mở hai phiên cùng lúc; không hỗ trợ thì start() trả false', () => {
  const { rec } = make();
  assert.equal(rec.start(), true);
  assert.equal(rec.start(), false);
  delete globalThis.window;
  const { rec: rec2 } = make();
  assert.equal(rec2.isSupported(), false);
  assert.equal(rec2.start(), false);
});
