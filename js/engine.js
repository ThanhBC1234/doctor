// Bọc Stockfish qua giao thức UCI.
//
// Lõi UCI không biết mình chạy ở đâu: nhận một "transport" có post(cmd) và onLine(fn).
// Trình duyệt dùng createWorkerTransport (Web Worker); test Node dùng engine.processCommand.

import { eloToEngineParams, FULL_STRENGTH_OPTIONS } from './elo.js';

const ENGINE_VERSION = '19.0.1';

/**
 * Transport cho trình duyệt. File .wasm được chỉ định qua phần # của URL (stockfish.js đọc chỗ này),
 * kèm ?v= để không dính cache cũ khi đổi phiên bản.
 * @param {string} [baseUrl] thư mục chứa engine
 */
export function createWorkerTransport(baseUrl = new URL('../vendor/stockfish/', import.meta.url).href) {
  const jsUrl = new URL(`stockfish-19-lite-single.js?v=${ENGINE_VERSION}`, baseUrl).href;
  const wasmUrl = new URL(`stockfish-19-lite-single.wasm?v=${ENGINE_VERSION}`, baseUrl).href;
  const worker = new Worker(`${jsUrl}#${encodeURIComponent(wasmUrl)}`);
  const listeners = [];
  const errorListeners = [];
  worker.onmessage = (e) => {
    // Engine cũng gửi object tiến trình tải wasm; chỉ quan tâm chuỗi.
    if (typeof e.data !== 'string') return;
    for (const line of e.data.split('\n')) if (line) listeners.forEach((fn) => fn(line));
  };
  worker.onerror = (e) => {
    console.error('[engine] lỗi worker', e.message || e);
    errorListeners.forEach((fn) => fn(e));
  };
  return {
    post: (cmd) => worker.postMessage(cmd),
    onLine: (fn) => listeners.push(fn),
    onError: (fn) => errorListeners.push(fn),
    terminate: () => worker.terminate(),
  };
}

/** Phân tích một dòng "info ..." của UCI. */
export function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const num = (key) => {
    const m = new RegExp(` ${key} (-?\\d+)`).exec(line);
    return m ? Number(m[1]) : null;
  };
  const depth = num('depth');
  const multipv = num('multipv') || 1;
  const cp = num('cp');
  const mate = num('mate');
  const pv = line.split(' pv ')[1].trim().split(' ');
  let score = cp;
  if (mate !== null) score = mate > 0 ? 100000 - mate : -100000 - mate;
  if (score === null) return null;
  return { depth, multipv, score, mate, move: pv[0] };
}

/**
 * Chọn nước cho mức thấp: thỉnh thoảng lấy nước kém hơn một chút để máy không chơi "quá chuẩn".
 * @param {{move:string, score:number}[]} candidates đã sắp theo multipv (tốt nhất trước)
 */
export function pickRandomized(candidates, randomize, random = Math.random) {
  if (!candidates.length) return null;
  const best = candidates[0];
  if (!randomize || candidates.length < 2 || random() >= randomize.probability) return best.move;
  const pool = candidates.filter((c) => c.score >= best.score - randomize.windowCp);
  return pool[Math.floor(random() * pool.length)].move;
}

/**
 * @param {{ post:(cmd:string)=>void, onLine:(fn:(line:string)=>void)=>void, terminate?:()=>void }} transport
 * @param {{ random?: () => number, timeoutMs?: number }} [opts]
 */
export function createEngine(transport, opts = {}) {
  const random = opts.random || Math.random;
  const timeoutMs = opts.timeoutMs || 30000;
  let waiters = [];
  let params = eloToEngineParams(1400);
  let queue = Promise.resolve();
  let ready = false;

  transport.onLine((line) => {
    for (const w of waiters.slice()) w(line);
  });

  /** Chờ tới khi có dòng thỏa điều kiện. collect nhận mọi dòng trước đó. */
  function waitFor(pred, collect) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters = waiters.filter((w) => w !== onLine);
        reject(new Error('Stockfish không phản hồi'));
      }, timeoutMs);
      function onLine(line) {
        if (collect) collect(line);
        if (pred(line)) {
          clearTimeout(timer);
          waiters = waiters.filter((w) => w !== onLine);
          resolve(line);
        }
      }
      waiters.push(onLine);
    });
  }

  /** Lệnh UCI chạy tuần tự, không chồng nhau. */
  function enqueue(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  }

  async function isReady() {
    const p = waitFor((l) => l === 'readyok');
    transport.post('isready');
    await p;
  }

  function setOptions(options) {
    for (const [name, value] of Object.entries(options)) transport.post(`setoption name ${name} value ${value}`);
  }

  async function search(fen, goCommand) {
    const infos = new Map();
    let maxDepth = 0;
    const p = waitFor((l) => l.startsWith('bestmove'), (l) => {
      const info = parseInfo(l);
      if (!info) return;
      if (info.depth > maxDepth) {
        maxDepth = info.depth;
        infos.clear();
      }
      if (info.depth === maxDepth) infos.set(info.multipv, info);
    });
    transport.post(`position fen ${fen}`);
    transport.post(goCommand);
    const line = await p;
    const best = line.split(' ')[1];
    const candidates = [...infos.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    return { best: best && best !== '(none)' ? best : null, candidates };
  }

  return {
    get ready() { return ready; },
    get params() { return params; },

    init() {
      return enqueue(async () => {
        const p = waitFor((l) => l === 'uciok');
        transport.post('uci');
        await p;
        await isReady();
        ready = true;
      });
    },

    newGame() {
      return enqueue(async () => {
        transport.post('ucinewgame');
        await isReady();
      });
    },

    /** Đặt sức mạnh theo Elo hiển thị. */
    setStrength(elo) {
      return enqueue(async () => {
        params = eloToEngineParams(elo);
        setOptions(params.options);
        await isReady();
      });
    },

    /**
     * Nước của máy cho thế cờ.
     * @returns {Promise<string|null>} nước UCI, null nếu hết nước
     */
    bestMove(fen) {
      return enqueue(async () => {
        const { best, candidates } = await search(fen, params.goCommand);
        if (!best) return null;
        if (params.randomize) {
          const picked = pickRandomized(candidates, params.randomize, random);
          return picked || best;
        }
        return best;
      });
    },

    /**
     * Đánh giá thế cờ ở sức mạnh tối đa (dùng cho cầu hòa).
     * @returns {Promise<number|null>} điểm centipawn theo góc nhìn bên đang đi
     */
    evaluate(fen, depth = 12) {
      return enqueue(async () => {
        setOptions(FULL_STRENGTH_OPTIONS);
        await isReady();
        try {
          const { candidates } = await search(fen, `go depth ${depth}`);
          return candidates.length ? candidates[0].score : null;
        } finally {
          setOptions(params.options);
          await isReady();
        }
      });
    },

    stop() {
      transport.post('stop');
    },

    terminate() {
      transport.terminate?.();
    },
  };
}
