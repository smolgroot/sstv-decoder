import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FTDecodeResult,
  FTMessage,
  FTMode,
  FT_WINDOW_SECONDS,
  FT_SUPPORTED,
  decodeFTAudio,
} from '@/lib/ft/decoder';

export interface FTProcessorState {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  results: FTDecodeResult[];
  status: 'idle' | 'waiting' | 'recording' | 'decoding';
}

// Streamed partial decodes are coalesced into one state update per interval.
const PARTIAL_FLUSH_MS = 250;

// Returns ms until the next aligned window boundary
function msUntilNextWindow(windowSec: number): number {
  const totalMs = windowSec * 1000;
  const now     = new Date();
  const elapsed = (now.getSeconds() * 1000 + now.getMilliseconds()) % totalMs;
  return elapsed < 50 ? 0 : totalMs - elapsed;
}

export function useFTProcessor(mode: FTMode) {
  const [state, setState] = useState<FTProcessorState>({
    isRecording: false,
    isSupported: false,
    error:       null,
    results:     [],
    status:      'idle',
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const processorRef    = useRef<ScriptProcessorNode | null>(null);
  const sampleBufRef    = useRef<Float32Array | null>(null);
  const sampleCountRef  = useRef(0);
  const windowStartRef  = useRef<Date | null>(null);
  const isRunningRef    = useRef(false);
  const modeRef         = useRef(mode);
  const timersRef       = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const ok = typeof window !== 'undefined'
      && 'AudioContext' in window
      && !!navigator.mediaDevices?.getUserMedia;
    setState(prev => ({ ...prev, isSupported: ok }));
  }, []);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current.clear();
  };

  // Cancellable sleep — registers timeout so stopRecording can clear it
  const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => {
      const t = setTimeout(() => {
        timersRef.current.delete(t);
        resolve();
      }, ms);
      timersRef.current.add(t);
    });

  // Dev-only synthetic decode injection — lets perf tests simulate a long run
  // (hundreds of contacts) in seconds without audio. Exercises the exact same
  // streaming path as real decodes: placeholder → partials → final replace.
  // Tree-shaken out of production builds.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    (window as unknown as Record<string, unknown>).__ftInjectWindow =
      (messages: FTMessage[], partialMs = 50) => {
        const windowStart = new Date();
        const key = windowStart.getTime();
        const patch = (fn: (r: FTDecodeResult) => FTDecodeResult) =>
          setState(prev => ({
            ...prev,
            results: prev.results.map(r => (r.windowStart.getTime() === key ? fn(r) : r)),
          }));
        setState(prev => ({
          ...prev,
          results: [
            { windowStart, mode: modeRef.current, messages: [], decodeMs: 0, decoding: true },
            ...prev.results,
          ].slice(0, 100),
        }));
        // Mirror the real path's batching: partials arrive every `partialMs`
        // but flush as one state update per PARTIAL_FLUSH_MS.
        const perBatch = Math.max(1, Math.round(PARTIAL_FLUSH_MS / partialMs));
        for (let i = 0; i < messages.length; i += perBatch) {
          const batch = messages.slice(0, i + perBatch);
          setTimeout(
            () => patch(r => ({ ...r, messages: batch })),
            (i + perBatch) * partialMs,
          );
        }
        setTimeout(
          () => patch(r => ({ ...r, messages, decodeMs: messages.length * partialMs, decoding: false })),
          (messages.length + 2) * partialMs,
        );
      };
    return () => {
      delete (window as unknown as Record<string, unknown>).__ftInjectWindow;
    };
  }, []);

  const runLoop = useCallback(async () => {
    // Kick off decode of a captured buffer in the background; does not block the record loop.
    // A placeholder result is inserted immediately and messages stream into it as the
    // decoder finds them, so the UI (and contacts/auto-reply pipeline) doesn't wait
    // for the full CPU budget to elapse.
    const dispatchDecode = (captured: Float32Array, sampleRate: number, windowStart: Date) => {
      const t0  = performance.now();
      const key = windowStart.getTime();
      const patchWindow = (patch: (r: FTDecodeResult) => FTDecodeResult) =>
        setState(prev => ({
          ...prev,
          results: prev.results.map(r => (r.windowStart.getTime() === key ? patch(r) : r)),
        }));

      const placeholder: FTDecodeResult = {
        windowStart, mode: modeRef.current, messages: [], decodeMs: 0, decoding: true,
      };
      setState(prev => ({ ...prev, results: [placeholder, ...prev.results].slice(0, 100) }));

      // Batch streamed partials: one state update per ~250 ms instead of one
      // per message — each update walks the whole render/contacts pipeline,
      // which dominates UI cost on busy bands.
      const buffer: FTMessage[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        if (buffer.length === 0) return;
        const batch = buffer.splice(0);
        patchWindow(r => ({ ...r, messages: [...r.messages, ...batch] }));
      };

      const onPartial = (msg: FTMessage) => {
        if (!isRunningRef.current) return;
        buffer.push(msg);
        if (flushTimer === null) flushTimer = setTimeout(flush, PARTIAL_FLUSH_MS);
      };

      decodeFTAudio(captured, sampleRate, modeRef.current, onPartial)
        .then(messages => ({ messages, decodeMs: performance.now() - t0 }))
        .catch(() => ({ messages: [] as FTMessage[], decodeMs: performance.now() - t0 }))
        .then(({ messages, decodeMs }) => {
          if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
          buffer.length = 0; // the final list supersedes any unflushed partials
          if (!isRunningRef.current) return;
          // Final list is authoritative (same content the partials streamed);
          // replace rather than append so nothing is duplicated or lost.
          patchWindow(r => ({ ...r, messages, decodeMs, decoding: false }));
        });
    };

    // Wait for the very first UTC boundary before starting
    const windowSec = FT_WINDOW_SECONDS[modeRef.current];
    const waitMs    = msUntilNextWindow(windowSec);
    if (waitMs > 100) {
      setState(prev => ({ ...prev, status: 'waiting' }));
      await sleep(waitMs);
    }

    while (isRunningRef.current) {
      const curWindowSec = FT_WINDOW_SECONDS[modeRef.current];

      // Arm accumulation buffer for this window
      const sampleRate = audioContextRef.current?.sampleRate ?? 48000;
      const capacity   = Math.ceil(curWindowSec * sampleRate) + 8192;
      sampleBufRef.current   = new Float32Array(capacity);
      sampleCountRef.current = 0;
      windowStartRef.current = new Date();
      setState(prev => ({ ...prev, status: 'recording' }));

      await sleep(curWindowSec * 1000);
      if (!isRunningRef.current) break;

      // Snapshot captured audio, then immediately start next window's recording
      const captured    = sampleBufRef.current.slice(0, sampleCountRef.current);
      const windowStart = windowStartRef.current!;
      sampleBufRef.current = null;

      // Kick off decode concurrently — next iteration arms the buffer immediately
      dispatchDecode(captured, sampleRate, windowStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    try {
      if (!state.isSupported) throw new Error('Web Audio API not supported');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source  = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyserRef.current = analyser;
      source.connect(analyser);

      // ScriptProcessor accumulates raw samples into the current window buffer
      const proc = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = proc;
      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const buf   = sampleBufRef.current;
        if (!buf) return;
        const space = buf.length - sampleCountRef.current;
        const copy  = Math.min(input.length, space);
        buf.set(input.subarray(0, copy), sampleCountRef.current);
        sampleCountRef.current += copy;
      };
      analyser.connect(proc);
      proc.connect(audioContext.destination);

      isRunningRef.current = true;
      setState(prev => ({ ...prev, isRecording: true, error: null, status: 'waiting' }));
      runLoop();
    } catch (err) {
      setState(prev => ({
        ...prev,
        error:       err instanceof Error ? err.message : 'Failed to access microphone',
        isRecording: false,
      }));
    }
  };

  const stopRecording = useCallback(() => {
    isRunningRef.current = false;
    clearTimers();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current    = null;
    sampleBufRef.current = null;
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (analyserRef.current)  { analyserRef.current.disconnect();  analyserRef.current  = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    setState(prev => ({ ...prev, isRecording: false, status: 'idle' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearResults = useCallback(() => {
    setState(prev => ({ ...prev, results: [] }));
  }, []);

  const getAnalyser = useCallback((): AnalyserNode | null => analyserRef.current, []);

  useEffect(() => () => { stopRecording(); }, [stopRecording]);

  // Restart the decode loop when mode changes mid-session
  useEffect(() => {
    if (!isRunningRef.current) return;
    clearTimers();
    sampleBufRef.current = null;
    runLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return {
    state,
    startRecording,
    stopRecording,
    clearResults,
    getAnalyser,
    ftSupported: FT_SUPPORTED[mode],
  };
}
