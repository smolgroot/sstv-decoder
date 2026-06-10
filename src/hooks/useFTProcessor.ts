import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FTDecodeResult,
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

  const runLoop = useCallback(async () => {
    while (isRunningRef.current) {
      const windowSec = FT_WINDOW_SECONDS[modeRef.current];
      const waitMs    = msUntilNextWindow(windowSec);

      if (waitMs > 100) {
        setState(prev => ({ ...prev, status: 'waiting' }));
        await sleep(waitMs);
      }
      if (!isRunningRef.current) break;

      // Arm accumulation buffer for this window
      const sampleRate = audioContextRef.current?.sampleRate ?? 48000;
      const capacity   = Math.ceil(windowSec * sampleRate) + 8192;
      sampleBufRef.current   = new Float32Array(capacity);
      sampleCountRef.current = 0;
      windowStartRef.current = new Date();
      setState(prev => ({ ...prev, status: 'recording' }));

      await sleep(windowSec * 1000);
      if (!isRunningRef.current) break;

      // Snapshot captured audio
      const captured    = sampleBufRef.current.slice(0, sampleCountRef.current);
      const windowStart = windowStartRef.current!;
      sampleBufRef.current = null;

      setState(prev => ({ ...prev, status: 'decoding' }));

      let result: FTDecodeResult;
      const t0 = performance.now();
      try {
        const messages = await decodeFTAudio(captured, sampleRate, modeRef.current);
        result = { windowStart, mode: modeRef.current, messages, decodeMs: performance.now() - t0 };
      } catch {
        result = { windowStart, mode: modeRef.current, messages: [], decodeMs: performance.now() - t0 };
      }

      if (!isRunningRef.current) break;
      setState(prev => ({
        ...prev,
        status:  'waiting',
        results: [result, ...prev.results].slice(0, 300),
      }));
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
