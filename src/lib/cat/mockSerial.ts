/**
 * Mock Web Serial port simulating a uSDX BLACK_BRICK radio for CAT testing.
 *
 * Development/test aid: lets the full CAT pipeline (useRadioCAT read loop,
 * frame parsing, batched poll, per-poll state updates) run in browsers with
 * no Web Serial (Firefox) and with no radio attached — used by the
 * performance testbed (`npm run test:perf -- --cat`) to reproduce the
 * poll-driven render load a real radio generates.
 *
 * The simulated firmware answers the batched poll with Kenwood-style frames
 * after a baud-realistic delay (wire time at 38400 plus MCU latency+jitter —
 * the uSDX shares one ATmega328 between DSP and CAT, so replies are slow and
 * jittery). S-meter noise makes every poll's reply differ, matching the real
 * radio's constant state churn.
 *
 * Poll-cadence statistics are published on `window.__catMockStats`: if the
 * main thread jams, gaps between polls stretch — a direct, measurable proxy
 * for CAT degradation under UI load.
 */

export interface MockSerialOptions {
  /** base MCU processing latency per exchange (ms) */
  baseLatencyMs?: number;
  /** uniform random extra latency (ms) */
  jitterMs?: number;
  baudRate?: number;
  initialFrequency?: number;
  /** Kenwood mode digit, 2 = USB */
  modeDigit?: number;
}

interface MockStats {
  polls: number;
  lastPollAt: number;
  maxPollGapMs: number;
  /** rolling mean of gaps between consecutive polls */
  avgPollGapMs: number;
}

export function createMockSerialPort(opts: MockSerialOptions = {}) {
  const baseLatencyMs = opts.baseLatencyMs ?? 20;
  const jitterMs      = opts.jitterMs ?? 15;
  const baudRate      = opts.baudRate ?? 38400;

  // simulated radio state
  const rig = {
    frequency: opts.initialFrequency ?? 7074000,
    modeDigit: opts.modeDigit ?? 2, // USB
    agc: 1, filter: 1, volume: 10, att1: 0, att2: 0, nr: 0, drive: 4,
    sMeter: 7,
    tx: false,
  };

  const stats: MockStats = { polls: 0, lastPollAt: 0, maxPollGapMs: 0, avgPollGapMs: 0 };
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__catMockStats = stats;
  }

  let readController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let rxBuffer = '';

  function respond(cmd: string): string {
    // set-commands carry a payload and (like the real firmware) get no reply
    const set = cmd.match(/^([A-Z]{2})([0-9-]+.*)$/);
    if (set && cmd.length > 3) {
      const [, prefix, val] = set;
      if (prefix === 'FA') rig.frequency = parseInt(val, 10);
      if (prefix === 'MD') rig.modeDigit = parseInt(val, 10);
      if (prefix === 'VO') rig.volume = parseInt(val, 10);
      if (prefix === 'AT') rig.att1 = parseInt(val, 10);
      if (prefix === 'A2') rig.att2 = parseInt(val, 10);
      if (prefix === 'NR') rig.nr = parseInt(val, 10);
      if (prefix === 'DR') rig.drive = parseInt(val, 10);
      return '';
    }
    switch (cmd) {
      case 'FA': return `FA${rig.frequency.toString().padStart(11, '0')};`;
      case 'MD': return `MD${rig.modeDigit};`;
      case 'AG0': return `AG0${rig.agc};`;
      case 'FW': return `FW${rig.filter};`;
      case 'VO': return `VO${rig.volume};`;
      case 'AT': return `AT${rig.att1};`;
      case 'A2': return `A2${rig.att2};`;
      case 'NR': return `NR${rig.nr};`;
      case 'SM': {
        // noisy band: random-walk the S-meter so every poll differs
        rig.sMeter = Math.max(0, Math.min(15, rig.sMeter + (Math.random() < 0.5 ? -1 : 1)));
        return `SM${rig.sMeter};`;
      }
      case 'DR': return `DR${rig.drive};`;
      case 'TX': rig.tx = true; return '';
      case 'RX': rig.tx = false; return '';
      case 'IF': {
        const f = rig.frequency.toString().padStart(11, '0');
        return `IF${f}00000+0000000000${rig.modeDigit}${rig.tx ? 1 : 0}000000;`;
      }
      default: return `?;`;
    }
  }

  function handleWrite(chunk: Uint8Array) {
    rxBuffer += decoder.decode(chunk);
    const frames: string[] = [];
    let idx: number;
    while ((idx = rxBuffer.indexOf(';')) >= 0) {
      frames.push(rxBuffer.slice(0, idx));
      rxBuffer = rxBuffer.slice(idx + 1);
    }
    if (frames.length === 0) return;

    // poll-cadence stats (a batch starting with FA is the poll)
    if (frames[0] === 'FA' && frames.length > 2) {
      const now = performance.now();
      if (stats.lastPollAt > 0) {
        const gap = now - stats.lastPollAt;
        stats.maxPollGapMs = Math.max(stats.maxPollGapMs, Math.round(gap));
        stats.avgPollGapMs = Math.round(stats.avgPollGapMs * 0.9 + gap * 0.1);
      }
      stats.lastPollAt = now;
      stats.polls++;
    }

    const reply = frames.map(respond).join('');
    const txBytes = frames.join(';').length + frames.length;
    const wireMs  = ((txBytes + reply.length) * 10 / baudRate) * 1000; // 8N1 → 10 bits/byte
    const delay   = baseLatencyMs + Math.random() * jitterMs + wireMs;
    setTimeout(() => {
      if (!closed && readController && reply) {
        try { readController.enqueue(encoder.encode(reply)); } catch { /* stream closed */ }
      }
    }, delay);
  }

  const readable = new ReadableStream<Uint8Array>({
    start(controller) { readController = controller; },
    cancel() { readController = null; },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) { handleWrite(chunk); },
  });

  return {
    readable,
    writable,
    async open(_options: unknown) { /* instantly "open" */ },
    async close() {
      closed = true;
      try { readController?.close(); } catch { /* already closed */ }
      readController = null;
    },
  };
}
