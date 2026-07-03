'use client';

/**
 * WASM decoder monitor + runtime controls.
 *
 * Renders a compact status strip (engine, decode time, heap, budget usage)
 * that expands into tuning controls for the ft8mon FT8 engine. Params apply
 * live — the worker picks them up on the next decode window. The reload
 * button respawns the worker (fresh WASM instances) without a page reload.
 */

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DECODER_PARAMS,
  FTDecoderActivity,
  FTDecoderParams,
  FTDecoderStats,
  FTDecoderStatus,
  ensureDecoderReady,
  getDecoderParams,
  reloadDecoder,
  setDecoderParams,
  subscribeDecoderActivity,
  subscribeDecoderStats,
  subscribeDecoderStatus,
} from '@/lib/ft/decoder';

const STORAGE_KEY = 'ft-decoder-params-v1';

function loadStoredParams(): Partial<FTDecoderParams> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<FTDecoderParams>) : null;
  } catch {
    return null;
  }
}

interface SliderSpec {
  key: keyof FTDecoderParams;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

const SLIDERS: SliderSpec[] = [
  { key: 'osdDepth',      label: 'OSD depth',    min: 0,   max: 6,    step: 1,   hint: '0 = off; higher rescues weaker signals, too high decodes garbage' },
  { key: 'budgetSec',     label: 'CPU budget s', min: 1,   max: 12,   step: 0.5, hint: 'decode time-box per 15 s window — soft limit: fixed per-pass costs can overrun it by a few seconds (known issue)' },
  { key: 'npasses',       label: 'Sub. passes',  min: 1,   max: 6,    step: 1,   hint: 'decode → subtract → re-scan iterations' },
  { key: 'ldpcIters',     label: 'LDPC iters',   min: 10,  max: 60,   step: 5,   hint: 'belief-propagation iterations' },
  { key: 'osdLdpcThresh', label: 'OSD thresh',   min: 40,  max: 83,   step: 1,   hint: 'min correct parity bits before OSD is tried' },
  { key: 'minHz',         label: 'Min Hz',       min: 0,   max: 1000, step: 50,  hint: 'decode band lower bound' },
  { key: 'maxHz',         label: 'Max Hz',       min: 2000, max: 6000, step: 100, hint: 'decode band upper bound' },
];

// Animated elapsed-vs-budget bar shown while a decode is in flight.
// rAF drives DOM mutations directly — no React re-render per frame.
// Bar color doubles as the average marker: blue while this window's live
// decode count is below the rolling average, green once it reaches it.
function DecodeProgress({ startedAt, budgetSec, decoded, avgMsgs }:
  { startedAt: number; budgetSec: number; decoded: number; avgMsgs: number | null }) {
  const barRef = useRef<HTMLDivElement>(null);
  const lblRef = useRef<HTMLSpanElement>(null);
  const reachedAvg = avgMsgs !== null && decoded >= avgMsgs;

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const pct     = Math.min(100, (elapsed / budgetSec) * 100);
      if (barRef.current) {
        barRef.current.style.width = `${pct}%`;
        barRef.current.style.background =
          reachedAvg ? '#2ea043'                 // hit the rolling average
          : pct >= 100 ? '#e3b341'               // over budget, still below average
          : '#1f6feb';
      }
      if (lblRef.current) lblRef.current.textContent = `${elapsed.toFixed(1)}s`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, budgetSec, reachedAvg]);

  const avgTitle = avgMsgs === null
    ? 'decode in progress — elapsed vs CPU budget'
    : `decode in progress — bar turns green when the live count reaches the rolling average (${avgMsgs.toFixed(1)} msgs/window)`;

  return (
    <span className="flex items-center gap-1.5 min-w-0" title={avgTitle}>
      <span className="text-[#e3b341] animate-pulse text-[10px] shrink-0">DEC</span>
      <span className="relative w-16 h-1 rounded bg-[#21262d] overflow-hidden shrink-0">
        <div ref={barRef} className="absolute inset-y-0 left-0 rounded" style={{ width: 0, background: '#1f6feb' }} />
      </span>
      <span ref={lblRef} className="font-mono text-[#8b949e] text-[10px] shrink-0" />
      {decoded > 0 && (
        <span
          className={`font-mono text-[10px] shrink-0 ${reachedAvg ? 'text-[#2ea043]' : 'text-[#8b949e]'}`}
          title="messages decoded so far in this window"
        >
          {decoded} msg{decoded === 1 ? '' : 's'}
        </span>
      )}
    </span>
  );
}

export default function FTWasmPanel({ ftMode }: { ftMode: string }) {
  const [stats,    setStats]    = useState<FTDecoderStats | null>(null);
  const [status,   setStatus]   = useState<FTDecoderStatus>({ engines: [], generation: 0 });
  const [activity, setActivity] = useState<FTDecoderActivity>({ inFlight: 0, startedAt: null, decodedSoFar: 0 });
  const [open,     setOpen]     = useState(false);
  const [params,   setParams]   = useState<FTDecoderParams>(DEFAULT_DECODER_PARAMS);
  const restored = useRef(false);

  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const stored = loadStoredParams();
      if (stored) {
        setDecoderParams(stored);
      }
      setParams(getDecoderParams());
    }
    ensureDecoderReady(); // spawn worker + load WASM before the first decode
    const unsubStats    = subscribeDecoderStats(setStats);
    const unsubStatus   = subscribeDecoderStatus(setStatus);
    const unsubActivity = subscribeDecoderActivity(setActivity);
    return () => { unsubStats(); unsubStatus(); unsubActivity(); };
  }, []);

  const update = (key: keyof FTDecoderParams, value: number) => {
    setDecoderParams({ [key]: value });
    const next = getDecoderParams();
    setParams(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const resetDefaults = () => {
    setDecoderParams(DEFAULT_DECODER_PARAMS);
    setParams(getDecoderParams());
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  const decodeS  = stats ? (stats.decodeMs / 1000).toFixed(1) : '—';
  const engine   = stats?.engine ?? (status.engines[0] ?? '—');
  const budgetPct = stats && stats.engine === 'ft8mon'
    ? Math.min(100, Math.round((stats.decodeMs / 1000 / params.budgetSec) * 100))
    : null;
  const loading = status.engines.length === 0;

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-md text-xs">
      {/* status strip */}
      <div className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
        <span className="text-[#484f58] uppercase text-[9px] tracking-wider shrink-0">WASM</span>

        <span className={`font-mono font-semibold ${loading ? 'text-[#e3b341]' : 'text-[#c9d1d9]'}`}>
          {loading ? 'loading…' : engine}
        </span>

        <span className="text-[#484f58]">·</span>
        {activity.inFlight > 0 && activity.startedAt !== null ? (
          <DecodeProgress startedAt={activity.startedAt} budgetSec={params.budgetSec}
                          decoded={activity.decodedSoFar} avgMsgs={stats?.avgMsgs ?? null} />
        ) : (
          <span className="font-mono text-[#8b949e]" title="last decode time inside WASM">
            {decodeS}s
            {budgetPct !== null && <span className="text-[#484f58]"> /{params.budgetSec}s ({budgetPct}%)</span>}
          </span>
        )}

        {status.generation > 1 && (
          <span className="font-mono text-[#484f58]" title="worker respawn count">gen {status.generation}</span>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => setOpen(o => !o)}
            className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
              open
                ? 'bg-[#1f6feb]/20 border-[#1f6feb]/50 text-[#58a6ff]'
                : 'bg-transparent border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#484f58]'
            }`}
            title="decoder tuning"
          >
            Tune
          </button>
          <button
            onClick={() => reloadDecoder()}
            className="px-1.5 py-0.5 rounded border border-[#30363d] text-[10px] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#484f58] transition-colors"
            title="terminate worker and reload WASM modules (no page reload)"
          >
            ⟳ WASM
          </button>
        </div>
      </div>

      {/* tuning controls */}
      {open && (
        <div className="border-t border-[#21262d] px-2 py-2">
          {ftMode !== 'FT8' && (
            <div className="mb-2 text-[10px] text-[#e3b341]">
              Tuning applies to the ft8mon engine (FT8 mode). {ftMode} decodes on ft8_lib.
            </div>
          )}
          <div className="grid grid-cols-1 gap-y-1.5">
            {SLIDERS.map(({ key, label, min, max, step, hint }) => {
              const suggested = key === 'budgetSec' ? stats?.suggestedBudgetSec ?? null : null;
              return (
                <label key={key} className="flex items-center gap-2 min-w-0" title={hint}>
                  <span className="text-[#8b949e] w-24 shrink-0 text-[10px]">{label}</span>
                  <span className="relative flex-1 flex items-center">
                    <input
                      type="range"
                      min={min} max={max} step={step}
                      value={params[key]}
                      onChange={e => update(key, Number(e.target.value))}
                      className="w-full h-1 accent-[#1f6feb] cursor-pointer"
                    />
                    {suggested !== null && (
                      // marker: latest message in recent windows arrived by here (+margin)
                      <span
                        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-[#2ea043] rounded pointer-events-none"
                        style={{ left: `${((suggested - min) / (max - min)) * 100}%` }}
                        title={`suggested ${suggested}s — last message in recent windows arrived by here`}
                      />
                    )}
                  </span>
                  <span className="font-mono text-[#c9d1d9] w-10 text-right shrink-0">{params[key]}</span>
                  {suggested !== null && suggested !== params[key] && (
                    <button
                      onClick={e => { e.preventDefault(); update('budgetSec', suggested); }}
                      className="font-mono text-[10px] text-[#2ea043] hover:underline shrink-0"
                      title="apply suggested budget (max observed last-message time + 0.5s, last 10 windows)"
                    >
                      →{suggested}s
                    </button>
                  )}
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={resetDefaults}
              className="px-1.5 py-0.5 rounded border border-[#30363d] text-[10px] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#484f58] transition-colors"
            >
              Reset defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
