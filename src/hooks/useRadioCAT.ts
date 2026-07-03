'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

// Web Serial API ambient types (not yet in lib.dom.d.ts for all TS versions)
declare global {
  interface SerialPort {
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
  }
  interface SerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    flowControl?: 'none' | 'hardware';
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export type CATMode = 'USB' | 'LSB' | 'AM' | 'FM' | 'CW' | 'RTTY';

/** Rig dialect. 'generic' speaks plain TS-480; 'usdx-blackbrick' adds the
 *  PU7FTW custom extension commands (VO/AT/A2/NR/AG0/FW/SM/DR) and batches its poll. */
export type RigProfile = 'generic' | 'usdx-blackbrick';

export interface CATConnectionConfig {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'odd';
  /** How long to wait for a reply to a single CAT command (ms) */
  timeoutMs: number;
  /** How often to poll the radio for freq/mode updates (ms) */
  pollIntervalMs: number;
  /** Enable CAT debug logging to the browser console */
  debug: boolean;
  /** Rig dialect — controls which CAT commands are available/polled */
  rigProfile: RigProfile;
}

export interface RadioState {
  connected: boolean;
  frequency: number | null;
  mode: CATMode | null;
  ptt: boolean;
  error: string | null;
  /** false on SSR, true once mounted in a supporting browser */
  isSupported: boolean;
  /** uSDX BLACK_BRICK 4.00e extension state — null unless rigProfile is 'usdx-blackbrick' */
  volume: number | null;
  att1: number | null;
  att2: number | null;
  nr: number | null;
  /** AGC state: 0=OFF, 1=ON. The firmware CAT command allows values up to 2
   *  ("Slow"), but this build has FAST_AGC undefined, so only agc==1 has a
   *  distinct code path — 2 behaves identically to 0. Treated as a toggle. */
  agc: number | null;
  /** Filter bandwidth index: 0=Full, 1=3000Hz, 2=2400Hz, 3=1800Hz, 4=500Hz, 5=200Hz, 6=100Hz, 7=50Hz */
  filter: number | null;
  /** S-meter reading in dBm. Read-only — there is no corresponding setter. */
  sMeter: number | null;
  /** TX drive/power level, 0..8 (linear). */
  drive: number | null;
}

export interface RadioCATControls {
  state: RadioState;
  connect: (config: CATConnectionConfig) => Promise<void>;
  disconnect: () => void;
  setFrequency: (hz: number) => Promise<void>;
  setMode: (mode: CATMode) => Promise<void>;
  setPTT: (tx: boolean) => Promise<void>;
  setVolume: (n: number) => Promise<void>;
  setAtt1: (n: number) => Promise<void>;
  setAtt2: (n: number) => Promise<void>;
  setNR: (n: number) => Promise<void>;
  setAGC: (n: number) => Promise<void>;
  setFilter: (n: number) => Promise<void>;
  setDrive: (n: number) => Promise<void>;
}

// ── Kenwood TS-series CAT protocol ───────────────────────────────────────────
// Query freq:  FA;   → FA00014225000;  (11-digit Hz, VFO A)
// Set freq:    FA00014225000;           (no echo)
// Query mode:  MD;   → MD2;            (1=LSB 2=USB 3=CW 4=FM 5=AM 6=RTTY)
// Set mode:    MD2;                     (no echo)
// PTT on:      TX;                      (no echo)
// PTT off:     RX;                      (no echo)

// ── uSDX BLACK_BRICK 4.00e — PU7FTW custom extensions ────────────────────────
// Not part of the TS-480 spec. All SET commands echo the new value as a GET
// reply, and are safe to include in a multi-command string (e.g. "VO;AT;A2;").
// Query volume: VO;    → VOn;      (-1..16, -1 = mute)
// Set volume:   VOn;   → VOn;
// Query ATT1:   AT;    → ATn;      (0..7)
// Set ATT1:     ATn;   → ATn;
// Query ATT2:   A2;    → A2n;      (0..16)
// Set ATT2:     A2n;   → A2n;
// Query NR:     NR;    → NRn;      (0..8, 0 = off)
// Set NR:       NRn;   → NRn;
// Query AGC:    AG0;   → AG0n;     (0=OFF, 1=ON — firmware accepts up to 2,
//                                   but this build has FAST_AGC undefined so
//                                   2 ["Slow"] is not a distinct state from 0)
// Set AGC:      AG0n;  → AG0n;     (n in 0..1)
// Query filter: FW;    → FWn;      (0=Full 1=3000 2=2400 3=1800 4=500 5=200 6=100 7=50 Hz)
// Set filter:   FWn;   → FWn;      (n in 0..7)
// Query S-meter: SM;   → SMn;      (signed dBm, read-only — there is no SM SET)
// Query TX drive: DR;  → DRn;      (0..8, linear)
// Set TX drive:   DRn; → DRn;
// The firmware supports serialized/batched queries in one write, e.g.
// "FA;MD;AG0;FW;VO;AT;A2;NR;SM;DR;" — replies come back concatenated in the same order.
// Note: BL (backlight) exists in firmware but is intentionally not surfaced
// here — its CAT-driven hardware effect could not be confirmed reliable.

const BLACKBRICK_POLL_CMDS = ['FA;', 'MD;', 'AG0;', 'FW;', 'VO;', 'AT;', 'A2;', 'NR;', 'SM;', 'DR;'];

const KENWOOD_MODE_MAP: Record<string, CATMode> = {
  '1': 'LSB', '2': 'USB', '3': 'CW', '4': 'FM', '5': 'AM', '6': 'RTTY',
  '7': 'CW',  '9': 'RTTY',
};

const CAT_MODE_TO_KENWOOD: Record<CATMode, string> = {
  LSB: '1', USB: '2', CW: '3', FM: '4', AM: '5', RTTY: '6',
};

// ── Serial command queue ──────────────────────────────────────────────────────

interface QueueEntry {
  bytes: Uint8Array;
  /** 2-char response prefixes expected, in order; null = fire-and-forget.
   *  Multiple prefixes = a serialized/batched command string (e.g. "FA;MD;VO;")
   *  whose replies are collected and joined before resolving. */
  prefixes: string[] | null;
  /** Replies collected so far, for entries with prefixes.length > 1 */
  collected: string[];
  isPoll: boolean;
  resolve: (resp: string) => void;
  reject:  (err: Error)   => void;
  timer:   ReturnType<typeof setTimeout> | null;
}

// How long after a user set-command to suppress poll overwrites for that field.
const SET_GRACE_MS = 1500;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRadioCAT(): RadioCATControls {
  const [state, setState] = useState<RadioState>({
    connected: false, frequency: null, mode: null,
    ptt: false, error: null, isSupported: false,
    volume: null, att1: null, att2: null, nr: null,
    agc: null, filter: null, sMeter: null, drive: null,
  });

  useEffect(() => {
    setState(prev => ({
      ...prev,
      isSupported: typeof navigator !== 'undefined' && 'serial' in navigator,
    }));
  }, []);

  const portRef      = useRef<SerialPort | null>(null);
  const writerRef    = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readerRef    = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const rxBufRef     = useRef<string>('');
  const pollTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRunningRef  = useRef(false);
  const timeoutMsRef     = useRef<number>(50);
  const pollIntervalMsRef = useRef<number>(100);
  const debugRef     = useRef<boolean>(false);
  const rigProfileRef = useRef<RigProfile>('generic');
  const encoder      = useRef(new TextEncoder()).current;

  const queueRef    = useRef<QueueEntry[]>([]);
  const inflightRef = useRef<QueueEntry | null>(null);

  const lastSetRef = useRef<{ frequency: number; mode: number; volume: number; att1: number; att2: number; nr: number; agc: number; filter: number; drive: number }>({
    frequency: 0, mode: 0, volume: 0, att1: 0, att2: 0, nr: 0, agc: 0, filter: 0, drive: 0,
  });

  const log = useCallback((level: 'debug' | 'info' | 'warn' | 'error', ...args: unknown[]) => {
    if (!debugRef.current && level === 'debug') return;
    console[level]('[CAT]', ...args);
  }, []);

  // ── Queue machinery ───────────────────────────────────────────────────────

  const drainQueue = useCallback(() => {
    // If no writer, reject all queued commands immediately rather than letting them hang
    if (!writerRef.current) {
      const err = new Error('CAT not connected');
      while (queueRef.current.length > 0) queueRef.current.shift()!.reject(err);
      return;
    }
    if (inflightRef.current || queueRef.current.length === 0) return;
    const entry = queueRef.current.shift()!;
    inflightRef.current = entry;

    const cmdStr = new TextDecoder().decode(entry.bytes).trim();
    const qLen = queueRef.current.length; // already shifted, so this is remaining

    if (entry.prefixes === null) {
      log('debug', 'write ←', cmdStr, `[q:${qLen}]`);
      writerRef.current.write(entry.bytes).then(() => {
        entry.resolve('');
        inflightRef.current = null;
        drainQueue();
      }).catch(err => {
        log('warn', 'write error:', err);
        entry.reject(err instanceof Error ? err : new Error(String(err)));
        inflightRef.current = null;
        drainQueue();
      });
      return;
    }

    // Batched multi-command strings return one reply per sub-command from the
    // same read window, but need proportionally more time for the radio to
    // process and emit all of them.
    const timeoutMs = timeoutMsRef.current * entry.prefixes.length;
    log('debug', 'query ←', cmdStr, `(timeout ${timeoutMs}ms) [q:${qLen}]`);

    entry.timer = setTimeout(() => {
      // Flush any partial rx data — a timeout means the radio's response was
      // lost or garbled; stale bytes in the buffer would corrupt the next reply.
      if (rxBufRef.current.length > 0) {
        log('debug', 'timeout: flushing rx buffer:', JSON.stringify(rxBufRef.current));
        rxBufRef.current = '';
      }
      log('debug', 'timeout for', cmdStr);
      inflightRef.current = null;
      entry.resolve('__timeout__');
      drainQueue();
    }, timeoutMs);

    writerRef.current.write(entry.bytes).catch(err => {
      if (entry.timer) clearTimeout(entry.timer);
      log('warn', 'write error during query:', err);
      inflightRef.current = null;
      entry.reject(err instanceof Error ? err : new Error(String(err)));
      drainQueue();
    });
  }, [log]);

  const handleResponse = useCallback((msg: string) => {
    const inf = inflightRef.current;
    if (!inf || inf.prefixes === null) {
      log('debug', 'unsolicited →', msg.trim());
      return;
    }
    const expected = inf.prefixes[inf.collected.length];
    if (msg.substring(0, 2) !== expected) {
      log('debug', 'unexpected →', msg.trim(), '(waiting for', expected + ')');
      return;
    }
    inf.collected.push(msg);
    if (inf.collected.length < inf.prefixes.length) {
      log('debug', 'partial →', msg.trim(), `[${inf.collected.length}/${inf.prefixes.length}]`);
      return;
    }
    log('debug', 'response →', inf.collected.join(''), `[q:${queueRef.current.length}]`);
    if (inf.timer) clearTimeout(inf.timer);
    inflightRef.current = null;
    inf.resolve(inf.collected.join(''));
    drainQueue();
  }, [log, drainQueue]);

  const dropQueuedPolls = useCallback(() => {
    const dropped = queueRef.current.filter(e => e.isPoll);
    if (dropped.length) log('debug', 'dropping', dropped.length, 'queued poll(s)');
    queueRef.current = queueRef.current.filter(e => !e.isPoll);
    for (const e of dropped) e.resolve('__dropped__');
  }, [log]);

  const query = useCallback((cmd: string, isPoll = false): Promise<string> => {
    // Deduplicate: if an identical command is already queued, skip it
    if (queueRef.current.some(e => e.isPoll === isPoll && new TextDecoder().decode(e.bytes) === cmd)) {
      return Promise.resolve('__dedup__');
    }
    return new Promise<string>((resolve, reject) => {
      queueRef.current.push({
        bytes:  encoder.encode(cmd),
        prefixes: [cmd.substring(0, 2)],
        collected: [],
        isPoll, resolve, reject, timer: null,
      });
      drainQueue();
    });
  }, [encoder, drainQueue]);

  // Sends a serialized multi-command string (e.g. "FA;MD;VO;") in a single
  // write and collects each reply in order, joined back into one string.
  // Used to batch the poll into one round-trip instead of one per field.
  const queryBatch = useCallback((cmds: string[], isPoll = false): Promise<string> => {
    const cmdStr = cmds.join('');
    if (queueRef.current.some(e => e.isPoll === isPoll && new TextDecoder().decode(e.bytes) === cmdStr)) {
      return Promise.resolve('__dedup__');
    }
    return new Promise<string>((resolve, reject) => {
      queueRef.current.push({
        bytes:  encoder.encode(cmdStr),
        prefixes: cmds.map(c => c.substring(0, 2)),
        collected: [],
        isPoll, resolve, reject, timer: null,
      });
      drainQueue();
    });
  }, [encoder, drainQueue]);

  const write = useCallback((cmd: string): Promise<void> => {
    dropQueuedPolls();
    return new Promise<void>((resolve, reject) => {
      queueRef.current.push({
        bytes:  encoder.encode(cmd),
        prefixes: null, collected: [],
        isPoll: false,
        resolve: () => resolve(), reject, timer: null,
      });
      drainQueue();
    });
  }, [encoder, drainQueue, dropQueuedPolls]);

  // ── Serial read loop ─────────────────────────────────────────────────────

  const startReadLoop = useCallback((reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const dec = new TextDecoder();
    (async () => {
      log('debug', 'read loop started');
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { log('debug', 'read loop: stream done'); break; }
          rxBufRef.current += dec.decode(value, { stream: true });
          // Guard against unbounded growth from a radio sending malformed data
          // with no ';' terminator — a Kenwood response is at most ~20 bytes.
          if (rxBufRef.current.length > 256) {
            log('warn', 'rx buffer overflow, flushing:', JSON.stringify(rxBufRef.current));
            rxBufRef.current = '';
          }
          let i: number;
          while ((i = rxBufRef.current.indexOf(';')) !== -1) {
            const msg = rxBufRef.current.slice(0, i + 1);
            rxBufRef.current = rxBufRef.current.slice(i + 1);
            handleResponse(msg);
          }
        }
      } catch (e) {
        log('debug', 'read loop ended:', e);
      }
    })();
  }, [log, handleResponse]);

  // ── Parse helpers ────────────────────────────────────────────────────────

  const parseFrequency = (resp: string): number | null => {
    const m = resp.match(/^FA(\d+);$/);
    if (!m) return null;
    const hz = parseInt(m[1], 10);
    return hz > 0 ? hz : null;
  };

  const parseMode = (resp: string): CATMode | null => {
    const m = resp.match(/^MD([0-9A-Fa-f]);$/);
    return m ? (KENWOOD_MODE_MAP[m[1].toUpperCase()] ?? null) : null;
  };

  const parseIntField = (resp: string, prefix: string): number | null => {
    const m = resp.match(new RegExp(`^${prefix}(-?\\d+);$`));
    return m ? parseInt(m[1], 10) : null;
  };

  // ── Poll loop — self-scheduling setTimeout so the next poll only fires
  // after the current one fully completes. This prevents poll buildup when
  // the radio is slow or the USB-serial stack stalls. ─────────────────────

  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current !== null) return; // already scheduled
    pollTimerRef.current = setTimeout(async () => {
      pollTimerRef.current = null;
      if (!writerRef.current || pollRunningRef.current) {
        // Port gone or previous poll still running — reschedule and skip
        schedulePoll();
        return;
      }
      pollRunningRef.current = true;
      try {
        if (queueRef.current.some(e => !e.isPoll)) {
          // A user command (PTT/freq/mode) is pending — skip this poll cycle
          return;
        }
        const now = Date.now();
        const ls  = lastSetRef.current;

        if (rigProfileRef.current === 'usdx-blackbrick') {
          // Serialized batch — one round-trip for every polled field instead
          // of one per command, per the firmware's new multi-command support.
          let resp = '';
          try { resp = await queryBatch(BLACKBRICK_POLL_CMDS, true); } catch { resp = ''; }
          const frames = resp.split(';').filter(Boolean).map(f => f + ';');
          const byPrefix = new Map<string, string>();
          for (const f of frames) byPrefix.set(f.substring(0, 2), f);

          // AG0 replies as "AG0n;" — prefix is "AG", not "AG0"
          const agcRaw = [...byPrefix.entries()].find(([k]) => k === 'AG')?.[1] ?? null;
          const freq      = byPrefix.has('FA') ? parseFrequency(byPrefix.get('FA')!) : null;
          const mode      = byPrefix.has('MD') ? parseMode(byPrefix.get('MD')!) : null;
          const agc       = agcRaw ? parseIntField(agcRaw, 'AG0') : null;
          const filter    = byPrefix.has('FW') ? parseIntField(byPrefix.get('FW')!, 'FW') : null;
          const volume    = byPrefix.has('VO') ? parseIntField(byPrefix.get('VO')!, 'VO') : null;
          const att1      = byPrefix.has('AT') ? parseIntField(byPrefix.get('AT')!, 'AT') : null;
          const att2      = byPrefix.has('A2') ? parseIntField(byPrefix.get('A2')!, 'A2') : null;
          const nr        = byPrefix.has('NR') ? parseIntField(byPrefix.get('NR')!, 'NR') : null;
          const sMeter    = byPrefix.has('SM') ? parseIntField(byPrefix.get('SM')!, 'SM') : null;
          const drive     = byPrefix.has('DR') ? parseIntField(byPrefix.get('DR')!, 'DR') : null;

          log('debug', 'poll(batch) — freq:', freq, 'mode:', mode, 'agc:', agc, 'filt:', filter,
            'vol:', volume, 'att1:', att1, 'att2:', att2, 'nr:', nr, 'sm:', sMeter, 'drive:', drive, `[q:${queueRef.current.length}]`);

          setState(prev => ({
            ...prev,
            frequency: freq   !== null && (now - ls.frequency > SET_GRACE_MS) ? freq   : prev.frequency,
            mode:      mode   !== null && (now - ls.mode      > SET_GRACE_MS) ? mode   : prev.mode,
            agc:       agc    !== null && (now - ls.agc       > SET_GRACE_MS) ? agc    : prev.agc,
            filter:    filter !== null && (now - ls.filter    > SET_GRACE_MS) ? filter : prev.filter,
            volume:    volume !== null && (now - ls.volume    > SET_GRACE_MS) ? volume : prev.volume,
            att1:      att1   !== null && (now - ls.att1      > SET_GRACE_MS) ? att1   : prev.att1,
            att2:      att2   !== null && (now - ls.att2      > SET_GRACE_MS) ? att2   : prev.att2,
            nr:        nr     !== null && (now - ls.nr        > SET_GRACE_MS) ? nr     : prev.nr,
            drive:     drive  !== null && (now - ls.drive     > SET_GRACE_MS) ? drive  : prev.drive,
            // sMeter is read-only telemetry — no grace period needed, always take the latest poll value.
            sMeter:    sMeter !== null ? sMeter : prev.sMeter,
          }));
        } else {
          const safeQuery = async (cmd: string): Promise<string> => {
            try { return await query(cmd, true); } catch { return ''; }
          };
          const fr  = await safeQuery('FA;');
          const mr  = await safeQuery('MD;');
          const freq = parseFrequency(fr);
          const mode = parseMode(mr);
          log('debug', 'poll — freq:', freq, 'mode:', mode, `[q:${queueRef.current.length}]`);
          if (freq !== null || mode !== null) {
            setState(prev => ({
              ...prev,
              frequency: freq !== null && (now - ls.frequency > SET_GRACE_MS) ? freq : prev.frequency,
              mode:      mode !== null && (now - ls.mode      > SET_GRACE_MS) ? mode : prev.mode,
            }));
          }
        }
      } finally {
        pollRunningRef.current = false;
        // Only reschedule if still connected
        if (writerRef.current) schedulePoll();
      }
    }, pollIntervalMsRef.current);
  }, [log, query, queryBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API ───────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    log('info', 'disconnecting');
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    pollRunningRef.current = false;
    if (inflightRef.current) {
      if (inflightRef.current.timer) clearTimeout(inflightRef.current.timer);
      inflightRef.current.resolve('__disconnected__');
      inflightRef.current = null;
    }
    for (const e of queueRef.current) e.resolve('__disconnected__');
    queueRef.current = [];
    try { readerRef.current?.cancel(); } catch { /* ignore */ }
    try { writerRef.current?.close();  } catch { /* ignore */ }
    try { portRef.current?.close();    } catch { /* ignore */ }
    readerRef.current = null;
    writerRef.current = null;
    portRef.current   = null;
    rxBufRef.current  = '';
    setState(prev => ({
      ...prev, connected: false, frequency: null, mode: null, ptt: false, error: null,
      volume: null, att1: null, att2: null, nr: null, agc: null, filter: null, sMeter: null, drive: null,
    }));
  }, [log]);

  const connect = useCallback(async (config: CATConnectionConfig) => {
    debugRef.current = config.debug;
    // Dev-only: the performance testbed sets window.__catUseMock to run the
    // full CAT pipeline against a simulated radio (also enables CAT in
    // browsers without Web Serial, e.g. Firefox). Dynamic import keeps the
    // mock out of production bundles.
    const useMock = process.env.NODE_ENV === 'development'
      && typeof window !== 'undefined'
      && (window as unknown as Record<string, unknown>).__catUseMock === true;
    if (!useMock && !('serial' in navigator)) {
      setState(prev => ({ ...prev, error: 'Web Serial API not supported in this browser' }));
      return;
    }
    log('info', `connecting — ${config.baudRate} ${config.dataBits}${config.parity === 'none' ? 'N' : config.parity[0].toUpperCase()}${config.stopBits} timeout:${config.timeoutMs}ms debug:${config.debug} profile:${config.rigProfile}${useMock ? ' [MOCK]' : ''}`);
    try {
      let port: SerialPort;
      if (useMock) {
        const { createMockSerialPort } = await import('@/lib/cat/mockSerial');
        port = createMockSerialPort() as unknown as SerialPort;
      } else {
        const serial = (navigator as Navigator & { serial: { requestPort(): Promise<SerialPort> } }).serial;
        port = await serial.requestPort();
      }
      await port.open({
        baudRate: config.baudRate, dataBits: config.dataBits,
        stopBits: config.stopBits, parity: config.parity, flowControl: 'none',
      });
      if (!port.writable || !port.readable) throw new Error('Port streams unavailable');
      timeoutMsRef.current     = config.timeoutMs;
      pollIntervalMsRef.current = config.pollIntervalMs;
      rigProfileRef.current    = config.rigProfile;
      portRef.current   = port;
      writerRef.current = port.writable.getWriter();
      const reader      = port.readable.getReader();
      readerRef.current = reader;
      startReadLoop(reader);
      setState(prev => ({ ...prev, connected: true, error: null }));
      log('info', 'polling every', config.pollIntervalMs + 'ms');
      schedulePoll();
    } catch (err) {
      log('info', 'connection failed:', err);
      setState(prev => ({
        ...prev, connected: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }));
    }
  }, [log, startReadLoop, schedulePoll]);

  const setFrequency = useCallback(async (hz: number) => {
    lastSetRef.current.frequency = Date.now();
    log('info', 'setFrequency →', hz, 'Hz');
    setState(prev => ({ ...prev, frequency: hz }));
    await write(`FA${hz.toString().padStart(11, '0')};`);
  }, [log, write]);

  const setMode = useCallback(async (mode: CATMode) => {
    lastSetRef.current.mode = Date.now();
    log('info', 'setMode →', mode);
    setState(prev => ({ ...prev, mode }));
    await write(`MD${CAT_MODE_TO_KENWOOD[mode]};`);
  }, [log, write]);

  const setPTT = useCallback(async (tx: boolean) => {
    log('info', 'setPTT →', tx ? 'TX' : 'RX');
    setState(prev => ({ ...prev, ptt: tx }));
    await write(tx ? 'TX;' : 'RX;');
  }, [log, write]);

  const setVolume = useCallback(async (n: number) => {
    lastSetRef.current.volume = Date.now();
    log('info', 'setVolume →', n);
    setState(prev => ({ ...prev, volume: n }));
    await write(`VO${n};`);
  }, [log, write]);

  const setAtt1 = useCallback(async (n: number) => {
    lastSetRef.current.att1 = Date.now();
    log('info', 'setAtt1 →', n);
    setState(prev => ({ ...prev, att1: n }));
    await write(`AT${n};`);
  }, [log, write]);

  const setAtt2 = useCallback(async (n: number) => {
    lastSetRef.current.att2 = Date.now();
    log('info', 'setAtt2 →', n);
    setState(prev => ({ ...prev, att2: n }));
    await write(`A2${n};`);
  }, [log, write]);

  const setNR = useCallback(async (n: number) => {
    lastSetRef.current.nr = Date.now();
    log('info', 'setNR →', n);
    setState(prev => ({ ...prev, nr: n }));
    await write(`NR${n};`);
  }, [log, write]);

  const setAGC = useCallback(async (n: number) => {
    lastSetRef.current.agc = Date.now();
    log('info', 'setAGC →', n);
    setState(prev => ({ ...prev, agc: n }));
    await write(`AG0${n};`);
  }, [log, write]);

  const setFilter = useCallback(async (n: number) => {
    lastSetRef.current.filter = Date.now();
    log('info', 'setFilter →', n);
    setState(prev => ({ ...prev, filter: n }));
    await write(`FW${n};`);
  }, [log, write]);

  const setDrive = useCallback(async (n: number) => {
    lastSetRef.current.drive = Date.now();
    log('info', 'setDrive →', n);
    setState(prev => ({ ...prev, drive: n }));
    await write(`DR${n};`);
  }, [log, write]);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  return {
    state, connect, disconnect, setFrequency, setMode, setPTT,
    setVolume, setAtt1, setAtt2, setNR, setAGC, setFilter, setDrive,
  };
}
