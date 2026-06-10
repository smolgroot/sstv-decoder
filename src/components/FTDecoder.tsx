'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFTProcessor } from '@/hooks/useFTProcessor';
import { FTMode, FT_WINDOW_SECONDS } from '@/lib/ft/decoder';
import { Contact, mergeContacts } from '@/lib/ft/parser';
import FTContactsPanel from './FTContactsPanel';

const DISPLAY_MAX_HZ = 3000;
const CANVAS_H = 180;
const AXIS_H   = 22;
const PLOT_H   = CANVAS_H - AXIS_H;

// ── Freq axis ─────────────────────────────────────────────────────────────────

function drawFreqAxis(ctx: CanvasRenderingContext2D, w: number, plotH: number) {
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, plotH); ctx.lineTo(w, plotH); ctx.stroke();
  for (let f = 0; f <= DISPLAY_MAX_HZ; f += 200) {
    const x       = (f / DISPLAY_MAX_HZ) * w;
    const isMajor = f % 1000 === 0;
    const isMed   = !isMajor && f % 500 === 0;
    const tick    = isMajor ? 6 : isMed ? 4 : 2;
    ctx.strokeStyle = isMajor ? '#8b949e' : '#30363d';
    ctx.beginPath(); ctx.moveTo(x, plotH); ctx.lineTo(x, plotH + tick); ctx.stroke();
    if (isMajor || isMed) {
      ctx.fillStyle = '#8b949e'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, plotH + 17);
    }
  }
}

// ── Clock ring (rAF-driven, no setState) ──────────────────────────────────────

function ClockRing({ status, windowSec }: { status: string; windowSec: number }) {
  const r    = 28;
  const cx   = 36;
  const cy   = 36;
  const circ = 2 * Math.PI * r;

  const svgRef     = useRef<SVGSVGElement>(null);
  const rafRef     = useRef<number | null>(null);
  const prevRef    = useRef('');

  useEffect(() => {
    const tick = () => {
      const svg = svgRef.current;
      if (!svg) { rafRef.current = requestAnimationFrame(tick); return; }

      const totalMs   = windowSec * 1000;
      const now       = new Date();
      const elapsed   = (now.getSeconds() * 1000 + now.getMilliseconds()) % totalMs;
      const progress  = elapsed / totalMs;
      const nextMs    = totalMs - elapsed;
      const secVal    = (nextMs / 1000).toFixed(1);

      if (secVal === prevRef.current) { rafRef.current = requestAnimationFrame(tick); return; }
      prevRef.current = secVal;

      const arcColor    = status === 'recording' ? '#2ea043' : status === 'decoding' ? '#e3b341' : '#30363d';
      const lblColor    = status === 'recording' ? '#2ea043' : status === 'decoding' ? '#e3b341' : '#484f58';
      const label       = status === 'decoding' ? 'DEC' : status === 'recording' ? 'REC' : 'WAIT';
      const filled      = circ * progress;

      svg.querySelector<SVGCircleElement>('.ft-arc')?.setAttribute('stroke', arcColor);
      svg.querySelector<SVGCircleElement>('.ft-arc')?.setAttribute('stroke-dasharray', `${filled} ${circ - filled}`);
      const txt = svg.querySelector<SVGTextElement>('.ft-sec');
      if (txt) txt.textContent = status === 'idle' ? '--' : secVal;
      const lbl = svg.querySelector<SVGTextElement>('.ft-lbl');
      if (lbl) { lbl.setAttribute('fill', lblColor); lbl.textContent = label; }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [status, windowSec, circ]);

  const arcColor = status === 'recording' ? '#2ea043' : status === 'decoding' ? '#e3b341' : '#30363d';
  const lblColor = status === 'recording' ? '#2ea043' : status === 'decoding' ? '#e3b341' : '#484f58';
  const label    = status === 'decoding' ? 'DEC' : status === 'recording' ? 'REC' : 'WAIT';

  return (
    <svg ref={svgRef} width={72} height={72} viewBox="0 0 72 72" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#21262d" strokeWidth={5} />
      <circle
        className="ft-arc"
        cx={cx} cy={cy} r={r}
        fill="none" stroke={arcColor} strokeWidth={5}
        strokeDasharray={`0 ${circ}`} strokeDashoffset={circ * 0.25}
      />
      <text className="ft-lbl" x={cx} y={cy - 4} textAnchor="middle" fontSize={7.5} fill={lblColor}
        fontFamily="monospace" fontWeight="bold">{label}</text>
      <text x={cx} y={cy + 7} textAnchor="middle" fontSize={11} fill="#c9d1d9"
        fontFamily="monospace" fontWeight="bold">
        <tspan className="ft-sec">{status === 'idle' ? '--' : '0.0'}</tspan>
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={7} fill="#484f58" fontFamily="monospace">
        {status !== 'idle' ? `/${windowSec}s` : ''}
      </text>
    </svg>
  );
}

// ── FT sub-mode selector (exported for page.tsx) ──────────────────────────────

const FT_MODES: FTMode[] = ['FT8', 'FT4', 'FT2'];

export function FTModeSelector({ mode, onChange }: {
  mode: FTMode;
  onChange: (m: FTMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-[#0d1117] border border-[#30363d] rounded-lg p-1">
      {FT_MODES.map(m => (
        <button
          key={m}
          onClick={() => m !== 'FT2' && onChange(m)}
          title={m === 'FT2' ? 'FT2 is experimental — no decoder available yet' : undefined}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
            mode === m
              ? m === 'FT2' ? 'bg-[#30363d] text-[#8b949e]' : 'bg-[#238636] text-white'
              : m === 'FT2' ? 'text-[#484f58] cursor-default' : 'text-[#8b949e] hover:text-[#c9d1d9]'
          }`}
        >
          {m}
          {m === 'FT2' && <span className="ml-1 text-[9px] text-[#30363d]">beta</span>}
        </button>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function msgColor(msg: string, snr: number): string {
  if (msg.startsWith('CQ ') || msg.startsWith('CQ\t')) return '#2ea043';
  if (snr <= -20) return '#484f58';
  return '#c9d1d9';
}

function utcTime(d: Date): string { return d.toISOString().slice(11, 19); }
function formatFreq(hz: number): string { return hz.toFixed(0).padStart(4, ' '); }
function formatDT(dt: number): string { return (dt >= 0 ? '+' : '') + dt.toFixed(1); }

// ── Main component ────────────────────────────────────────────────────────────

export default function FTDecoder({ ftMode }: { ftMode: FTMode }) {
  const {
    state, startRecording, stopRecording, clearResults, getAnalyser, ftSupported,
  } = useFTProcessor(ftMode);

  // ── Contact tracking ────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const prevResultLenRef = useRef(0);

  useEffect(() => {
    const { results } = state;
    if (results.length < prevResultLenRef.current) {
      // clearResults() was called
      prevResultLenRef.current = 0;
      return;
    }
    const newCount = results.length - prevResultLenRef.current;
    if (newCount <= 0) return;

    // results is newest-first; reverse to process oldest → newest
    const fresh = results.slice(0, newCount).slice().reverse();
    setContacts(prev => {
      let m = prev;
      for (const r of fresh) {
        m = mergeContacts(m, r.windowStart, r.messages, 0);
      }
      return m;
    });
    prevResultLenRef.current = results.length;
  }, [state.results]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = useCallback(() => {
    clearResults();
    setContacts(new Map());
    prevResultLenRef.current = 0;
  }, [clearResults]);

  // ── Canvas / spectrogram ────────────────────────────────────────────────────
  const spectrumCanvasRef    = useRef<HTMLCanvasElement>(null);
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef         = useRef<number | null>(null);
  const spectrogramFrameRef  = useRef(0);
  const [spectrogramGamma, setSpectrogramGamma] = useState(2.5);
  const [spectrogramSpeed, setSpectrogramSpeed] = useState(2);
  const spectrogramGammaRef = useRef(2.5);
  const spectrogramSpeedRef = useRef(2);
  useEffect(() => { spectrogramGammaRef.current = spectrogramGamma; }, [spectrogramGamma]);
  useEffect(() => { spectrogramSpeedRef.current = spectrogramSpeed; }, [spectrogramSpeed]);

  const spectrogramContainerRef = useRef<HTMLDivElement>(null);
  const [sgHeight, setSgHeight]  = useState(200);
  const sgHeightRef = useRef(200);
  useEffect(() => {
    const el = spectrogramContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const h = Math.round(entries[0].contentRect.height);
      if (h > 60 && Math.abs(h - sgHeightRef.current) > 4) {
        sgHeightRef.current = h;
        setSgHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawSpectrum = useCallback((canvas: HTMLCanvasElement): Uint8Array | undefined => {
    const analyser = getAnalyser();
    const ctx      = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgb(10,10,10)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!analyser) { drawFreqAxis(ctx, canvas.width, PLOT_H); return; }
    const bufLen   = analyser.frequencyBinCount;
    const data     = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);
    const nq       = analyser.context.sampleRate / 2;
    const binsShow = Math.max(1, Math.floor((DISPLAY_MAX_HZ / nq) * bufLen));
    const visible  = data.subarray(0, binsShow);
    ctx.strokeStyle = '#2ea043'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    const bw = canvas.width / binsShow;
    for (let i = 0; i < binsShow; i++) {
      const x = i * bw;
      const y = PLOT_H - (visible[i] / 255) * PLOT_H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    drawFreqAxis(ctx, canvas.width, PLOT_H);
    return visible;
  }, [getAnalyser]);

  const drawSpectrogram = useCallback((canvas: HTMLCanvasElement, freqData: Uint8Array) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const row = ctx.createImageData(canvas.width, 1);
    for (let px = 0; px < canvas.width; px++) {
      const bf    = (px / canvas.width) * (freqData.length - 1);
      const b0    = Math.floor(bf);
      const b1    = Math.min(b0 + 1, freqData.length - 1);
      const v     = freqData[b0] * (1 - (bf - b0)) + freqData[b1] * (bf - b0);
      const gamma = spectrogramGammaRef.current;
      const adj   = gamma === 1 ? v : Math.pow(v / 255, gamma) * 255;
      let r: number, g: number, b: number;
      if (adj < 64)       { r = 0;    g = 0;    b = Math.round(adj * 4); }
      else if (adj < 128) { r = 0;    g = Math.round((adj - 64) * 4); b = 255; }
      else if (adj < 192) { r = Math.round((adj - 128) * 4); g = 255; b = Math.round(255 - (adj - 128) * 4); }
      else                { r = 255;  g = Math.round(255 - (adj - 192) * 4); b = 0; }
      const i = px * 4;
      row.data[i] = r; row.data[i+1] = g; row.data[i+2] = b; row.data[i+3] = 255;
    }
    ctx.putImageData(ctx.getImageData(0, 0, canvas.width, canvas.height - 1), 0, 1);
    ctx.putImageData(row, 0, 0);
  }, []);

  useEffect(() => {
    const tick = () => {
      const sc = spectrumCanvasRef.current;
      const sg = spectrogramCanvasRef.current;
      if (sc) {
        const fd = drawSpectrum(sc);
        spectrogramFrameRef.current++;
        if (sg && fd && spectrogramFrameRef.current % spectrogramSpeedRef.current === 0) {
          drawSpectrogram(sg, fd);
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [drawSpectrum, drawSpectrogram]);

  // ── 3-panel drag ────────────────────────────────────────────────────────────
  const containerRef    = useRef<HTMLDivElement>(null);
  const [panelWeights, setPanelWeights] = useState([0.8, 0.6, 1.2]);
  const panelWeightsRef = useRef([0.8, 0.6, 1.2]);
  const panelDragRef    = useRef<{ divider: number; startX: number; startW: number[] } | null>(null);
  useEffect(() => { panelWeightsRef.current = panelWeights; }, [panelWeights]);

  const startPanelDrag = (divider: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    panelDragRef.current = { divider, startX: e.clientX, startW: [...panelWeightsRef.current] };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = panelDragRef.current;
      if (!d || !containerRef.current) return;
      const total = d.startW.reduce((a, b) => a + b, 0);
      const dw    = ((e.clientX - d.startX) / containerRef.current.offsetWidth) * total;
      const nw    = [...d.startW];
      nw[d.divider]     = Math.max(0.15, d.startW[d.divider] + dw);
      nw[d.divider + 1] = Math.max(0.15, d.startW[d.divider + 1] - dw);
      setPanelWeights(nw);
    };
    const onUp = () => { panelDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const { results, status } = state;
  const windowSec = FT_WINDOW_SECONDS[ftMode];
  const totalMsgs = results.reduce((s, r) => s + r.messages.length, 0);
  const hasData   = results.length > 0 || contacts.size > 0;

  type SepRow = { kind: 'sep'; time: Date; mode: FTMode; empty: boolean; key: string };
  type MsgRow = { kind: 'msg'; freq: number; dt: number; snr: number; msg: string; time: Date; key: string };
  type TableRow = SepRow | MsgRow;

  const tableRows: TableRow[] = results.flatMap((r, ri) => [
    { kind: 'sep' as const, time: r.windowStart, mode: r.mode, empty: r.messages.length === 0, key: `sep-${ri}` },
    ...r.messages.map((m, mi) => ({
      kind: 'msg' as const,
      freq: m.freq, dt: m.dt, snr: m.snr, msg: m.msg,
      time: r.windowStart, key: `msg-${ri}-${mi}`,
    })),
  ]);

  return (
    <div className="space-y-3 sm:space-y-4">

      {/* ── Slim control bar ────────────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">

          {/* LEFT: clock + counters when recording, otherwise empty spacer */}
          {state.isRecording ? (
            <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <ClockRing status={status} windowSec={windowSec} />
                <div className="space-y-0.5">
                  <div className="text-[10px] text-[#8b949e] font-mono">
                    Window: <span className="text-[#c9d1d9]">{windowSec}s</span>
                  </div>
                  <div className="text-[10px] text-[#8b949e] font-mono">
                    Mode: <span className="text-[#79c0ff]">{ftMode}</span>
                  </div>
                  <div className="text-[10px] text-[#8b949e] font-mono">
                    Msgs: <span className="text-[#c9d1d9]">{totalMsgs}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Windows', value: results.length },
                  { label: 'Total',   value: totalMsgs },
                  { label: 'Last ms', value: results[0] ? `${results[0].decodeMs.toFixed(0)}` : '—' },
                  { label: 'Last #',  value: results[0] ? results[0].messages.length : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#0d1117] border border-[#21262d] rounded px-2 py-1">
                    <div className="text-[#484f58] text-[9px]">{label}</div>
                    <div className="font-mono font-semibold text-xs text-[#c9d1d9]">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0" />
          )}

          {/* RIGHT: Reset then Start/Stop */}
          <button
            onClick={handleReset}
            disabled={!hasData}
            className="bg-[#21262d] hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed text-[#c9d1d9] font-semibold px-4 py-1.5 rounded-md text-sm transition-colors border border-[#30363d] flex items-center gap-1.5 shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Reset
          </button>

          {!state.isRecording ? (
            <button
              onClick={startRecording}
              disabled={!state.isSupported}
              className="bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Start
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-[#da3633] hover:bg-[#f85149] text-white font-semibold px-4 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              Stop
            </button>
          )}
        </div>

        {state.error && (
          <div className="mt-2 bg-[#da3633]/10 border border-[#f85149]/30 rounded-md p-2 text-[#f85149] text-xs">
            {state.error}
          </div>
        )}

        {!ftSupported && (
          <div className="mt-2 bg-[#e3b341]/10 border border-[#e3b341]/30 rounded-md p-2 text-[#e3b341] text-xs flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>
              <strong>FT2 is experimental</strong> (first signals February 2026) — no JS decoder available yet.
              Waterfall still works. Switch to FT8 or FT4 to decode.
            </span>
          </div>
        )}
      </div>

      {/* ── 3-panel layout ───────────────────────────────────────────────────── */}
      {/* Bounded height on lg so panel content scrolls instead of growing the page */}
      <div ref={containerRef} className="flex flex-col lg:flex-row lg:items-stretch gap-4 lg:gap-0 lg:h-[max(480px,calc(100vh-280px))]" style={{ minHeight: 480 }}>

        {/* Panel 1 — Decoded Messages */}
        <div
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 sm:p-4 flex flex-col min-w-0"
          style={{ flex: panelWeights[0] }}
        >
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-lg sm:text-xl font-semibold">Decoded Messages</h2>
            <span className="text-xs font-mono text-[#8b949e]">{totalMsgs} total</span>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 max-h-[60vh] lg:max-h-none font-mono text-xs">
            {results.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#484f58] space-y-2">
                  <div className="text-4xl">📻</div>
                  <div>{state.isRecording
                    ? `Waiting for next ${ftMode} window…`
                    : `Start decoding to receive ${ftMode} signals`}
                  </div>
                  {state.isRecording && ftSupported && (
                    <div className="text-[#30363d]">UTC-synchronized · {windowSec}s windows</div>
                  )}
                </div>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-[#0d1117] z-10">
                  <tr className="text-[#8b949e] border-b border-[#30363d]">
                    <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">UTC</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Hz</th>
                    <th className="text-right py-1.5 px-2 font-semibold">dB</th>
                    <th className="text-right py-1.5 px-2 font-semibold">DT</th>
                    <th className="text-left py-1.5 px-2 font-semibold w-full">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(row =>
                    row.kind === 'sep' ? (
                      <tr key={row.key}>
                        <td colSpan={5} className="px-2 py-0.5 text-[10px] text-[#484f58] border-t border-[#21262d] bg-[#0d1117]/60">
                          {utcTime(row.time)} UTC — {row.mode}
                          {row.empty && <span className="ml-2 text-[#30363d]">no signals</span>}
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.key} className="border-b border-[#21262d]/50 hover:bg-[#21262d]/40 transition-colors">
                        <td className="py-1 px-2 text-[#484f58] whitespace-nowrap">{utcTime(row.time)}</td>
                        <td className="py-1 px-2 text-right text-[#8b949e] whitespace-nowrap">{formatFreq(row.freq)}</td>
                        <td className={`py-1 px-2 text-right whitespace-nowrap ${
                          row.snr >= -5 ? 'text-[#2ea043]' : row.snr >= -15 ? 'text-[#e3b341]' : 'text-[#8b949e]'
                        }`}>{row.snr > 0 ? '+' : ''}{row.snr}</td>
                        <td className="py-1 px-2 text-right text-[#8b949e] whitespace-nowrap">{formatDT(row.dt)}</td>
                        <td className="py-1 px-2 truncate max-w-0" style={{ color: msgColor(row.msg, row.snr) }}>
                          {row.msg}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Drag handle 1 */}
        <div
          className="hidden lg:flex w-3 self-stretch cursor-col-resize items-center justify-center group shrink-0"
          onMouseDown={startPanelDrag(0)}
        >
          <div className="w-px h-full bg-[#30363d] group-hover:bg-[#2ea043]/50 transition-colors" />
        </div>

        {/* Panel 2 — Audio Analysis */}
        <div
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 sm:p-4 min-w-0 flex flex-col"
          style={{ flex: panelWeights[1] }}
        >
          <h2 className="text-lg sm:text-xl font-semibold mb-3 shrink-0">Audio Analysis</h2>

          <div className="space-y-1 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[#8b949e]">Spectrum</h3>
              <span className="text-xs text-[#484f58] font-mono">0–3 kHz</span>
            </div>
            <canvas
              ref={spectrumCanvasRef}
              width={640} height={CANVAS_H}
              className="w-full border border-[#30363d] rounded bg-[#0d1117]"
            />
          </div>

          <div className="flex flex-col flex-1 gap-2 mt-3 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-sm font-medium text-[#8b949e]">Waterfall</h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#8b949e]">
                <label className="flex items-center gap-1.5">
                  Contrast
                  <input type="range" min={0.5} max={6} step={0.1}
                    value={spectrogramGamma}
                    onChange={e => setSpectrogramGamma(parseFloat(e.target.value))}
                    className="w-16 accent-[#2ea043] cursor-pointer"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  Speed
                  <select
                    value={spectrogramSpeed}
                    onChange={e => setSpectrogramSpeed(parseInt(e.target.value))}
                    className="bg-[#0d1117] border border-[#30363d] rounded px-1 py-0.5 text-[#c9d1d9] focus:outline-none cursor-pointer text-xs"
                  >
                    <option value={1}>Fast</option>
                    <option value={2}>Normal</option>
                    <option value={4}>Slow</option>
                    <option value={8}>V.Slow</option>
                  </select>
                </label>
              </div>
            </div>
            <div ref={spectrogramContainerRef} className="relative flex-1 min-h-[120px]">
              <canvas
                ref={spectrogramCanvasRef}
                width={640} height={sgHeight}
                style={{ height: sgHeight }}
                className="w-full border border-[#30363d] rounded bg-[#0d1117] block"
              />
              {[500, 1000, 1500, 2000, 2500].map(hz => (
                <div key={hz} className="absolute inset-y-0 pointer-events-none"
                  style={{ left: `${(hz / DISPLAY_MAX_HZ) * 100}%`, width: 1, background: '#21262d', opacity: 0.7 }}
                />
              ))}
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-[#21262d] text-[10px] text-[#484f58] font-mono space-y-0.5 shrink-0">
            <div><span className="text-[#30363d]">window:</span> {windowSec}s · UTC-synced</div>
            {ftMode === 'FT8' && <div><span className="text-[#30363d]">sensitivity:</span> −24 dB SNR</div>}
            {ftMode === 'FT4' && <div><span className="text-[#30363d]">sensitivity:</span> −17 dB SNR (faster)</div>}
            {ftMode === 'FT2' && <div><span className="text-[#30363d]">sensitivity:</span> −12 dB SNR (experimental)</div>}
          </div>
        </div>

        {/* Drag handle 2 */}
        <div
          className="hidden lg:flex w-3 self-stretch cursor-col-resize items-center justify-center group shrink-0"
          onMouseDown={startPanelDrag(1)}
        >
          <div className="w-px h-full bg-[#30363d] group-hover:bg-[#2ea043]/50 transition-colors" />
        </div>

        {/* Panel 3 — Contacts */}
        <div
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 sm:p-4 min-w-0 flex flex-col"
          style={{ flex: panelWeights[2] }}
        >
          <FTContactsPanel
            contacts={contacts}
            mode={ftMode}
            onClearContacts={() => setContacts(new Map())}
          />
        </div>
      </div>

      {/* ── How to Use ── */}
      <details className="bg-[#161b22] border border-[#30363d] rounded-lg">
        <summary className="cursor-pointer p-4 sm:p-5 font-semibold text-base sm:text-lg hover:bg-[#21262d] rounded-lg transition-colors select-none">
          How to Use
        </summary>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-3">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-[#c9d1d9]">
            <li>Ensure your clock is NTP-synchronized — FT8/FT4 requires UTC sync within ±1 second</li>
            <li>Select <strong>FT8</strong> (15 s) or <strong>FT4</strong> (7.5 s) in the mode selector above</li>
            <li>Click <strong>Start</strong> and allow microphone access</li>
            <li>Tune to a FT8/FT4 frequency in USB mode (e.g. 14.074 MHz for 20m FT8)</li>
            <li>Decoder waits for the next UTC window, then records and decodes automatically</li>
            <li><span className="text-[#2ea043]">Green</span> rows are CQ calls — Contacts panel tracks unique callsigns with QSO history</li>
          </ol>
          <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-3 text-xs text-[#8b949e] space-y-1">
            <p><strong className="text-[#c9d1d9]">Common frequencies:</strong></p>
            <p>FT8 — 1.840 · 3.573 · 7.074 · 10.136 · 14.074 · 18.100 · 21.074 · 24.915 · 28.074 MHz</p>
            <p>FT4 — 3.575 · 7.047 · 10.140 · 14.080 · 18.104 · 21.140 · 24.919 · 28.180 MHz</p>
          </div>
        </div>
      </details>

      <details className="bg-[#161b22] border border-[#30363d] rounded-lg">
        <summary className="cursor-pointer p-4 sm:p-5 font-semibold text-base sm:text-lg hover:bg-[#21262d] rounded-lg transition-colors select-none">
          Privacy
        </summary>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-sm text-[#c9d1d9] space-y-1.5">
          <p>All decoding runs entirely in your browser. No audio or decoded messages are transmitted to any server.</p>
          <p className="text-xs text-[#8b949e]">FT8/FT4 decoding powered by <a href="https://github.com/e04/ft8ts" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#c9d1d9]">ft8ts</a> (GPL-3.0).</p>
        </div>
      </details>
    </div>
  );
}
