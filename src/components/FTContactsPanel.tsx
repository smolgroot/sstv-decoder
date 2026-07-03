'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Contact, ContactMsg, MSG_TYPE_LABEL, MSG_TYPE_COLOR, generateADIF, parseADIF, gridToLatLon, haversineKm, isConfirmedQSO,
} from '@/lib/ft/parser';
import { callsignCountry } from '@/lib/ft/prefixes';

import type { FTMode } from '@/lib/ft/decoder';
import { fmtAbsHz } from '@/lib/formatFreq';
import VirtualList from './VirtualList';

// Virtualized contact list geometry: collapsed cards are fixed-height
// (summary row 28px + 2px borders + 6px gap); the expanded card is measured
// live via ResizeObserver, with a fallback used until the first measurement.
const CARD_GAP_H = 6;
const COLLAPSED_CARD_H = 30 + CARD_GAP_H;
const EXPANDED_CARD_FALLBACK_H = 420;

// Format a stored absolute frequency. Values > 1 MHz are already absolute (VFO
// was set at decode time); smaller values are raw audio offsets (no VFO then).
function formatMsgFreq(freq: number): string {
  if (freq <= 0) return '—';
  if (freq > 1_000_000) return fmtAbsHz(freq);
  return `${freq.toFixed(0)} Hz`;
}

// Loaded only in the browser — Leaflet must not run in SSR
const FTLeafletMap = dynamic(() => import('./FTLeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-xs text-[#484f58] font-mono">
      Loading map…
    </div>
  ),
});

function localHMS(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface LocationParts {
  flag: string;
  country: string;
  grids: string;
}

function locationParts(contact: Contact): LocationParts | null {
  const pfx     = callsignCountry(contact.callsign);
  const flag    = pfx?.flag ?? '';
  const country = pfx?.country ?? '';
  const grids   = contact.grid
    ? contact.grid + (contact.grids.length > 1 ? ` +${contact.grids.length - 1}` : '')
    : '';
  if (!flag && !country && !grids) return null;
  return { flag, country, grids };
}

function qrzUrl(callsign: string): string {
  return `https://www.qrz.com/db/${encodeURIComponent(callsign.split('/')[0])}`;
}

function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`;
}


// All messages involving a specific peer with this contact, sorted by time
function conversationWith(contact: Contact, peer: string): ContactMsg[] {
  return contact.msgs
    .filter(m => {
      const other = m.role === 'tx' ? m.parsed.callee : m.parsed.caller;
      return other === peer || m.parsed.caller === peer;
    })
    .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());
}

// Partial handshake: the contact transmitted to the peer AND received from the peer
function isHandshake(contact: Contact, peer: string): boolean {
  const msgs = conversationWith(contact, peer);
  const sentToPeer       = msgs.some(m => m.role === 'tx' && m.parsed.callee === peer);
  const receivedFromPeer = msgs.some(m => m.role === 'rx' && m.parsed.caller === peer);
  return sentToPeer && receivedFromPeer;
}

// Full QSO: handshake confirmed AND a signal report was exchanged AND the
// conversation ended with a sign-off (RR73 / RRR / 73)
function isFullQSO(contact: Contact, peer: string): boolean {
  if (!isHandshake(contact, peer)) return false;
  const types = conversationWith(contact, peer).map(m => m.parsed.type);
  const hasReport  = types.includes('report') || types.includes('r_report');
  const hasSignOff = types.includes('rr73') || types.includes('rrr') || types.includes('tx73');
  return hasReport && hasSignOff;
}

function longestDistances(contact: Contact, contactMap: Map<string, Contact>) {
  let tx: { km: number; peer: string } | null = null;
  let rx: { km: number; peer: string } | null = null;
  if (!contact.latLon) return { tx, rx };
  for (const m of contact.msgs) {
    const peer    = m.role === 'tx' ? m.parsed.callee : m.parsed.caller;
    const peerLoc = peer ? contactMap.get(peer)?.latLon : undefined;
    if (!peer || !peerLoc) continue;
    const km = haversineKm(contact.latLon, peerLoc);
    if (m.role === 'tx') { if (!tx || km > tx.km) tx = { km, peer }; }
    else                 { if (!rx || km > rx.km) rx = { km, peer }; }
  }
  return { tx, rx };
}

// ── Conversation balloon (portal — renders above all card overflow) ────────────

function ConversationBalloon({
  contact, peer, contactMap, pos,
}: {
  contact: Contact;
  peer: string;
  contactMap: Map<string, Contact>;
  pos: { top: number; left: number };
}) {
  const msgs        = conversationWith(contact, peer);
  const peerContact = contactMap.get(peer);
  const handshake   = isHandshake(contact, peer);
  const fullQSO     = isFullQSO(contact, peer);

  if (!msgs.length) return null;

  return createPortal(
    <div
      className="fixed z-[9999] w-72 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl p-2.5 pointer-events-none"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center gap-1.5 mb-1.5 border-b border-[#21262d] pb-1.5">
        <span className="font-mono font-bold text-[11px]" style={{ color: contact.color }}>
          {contact.callsign}
        </span>
        <span className="text-[#484f58] text-[10px]">↔</span>
        <span className="font-mono font-bold text-[11px]" style={{ color: peerContact?.color ?? '#8b949e' }}>
          {peer}
        </span>
        {fullQSO ? (
          <span className="ml-auto text-[10px]" title="Full QSO — report exchanged and signed off">⭐</span>
        ) : handshake ? (
          <span className="ml-auto text-[10px]" title="Partial handshake — both sides transmitted">🤝</span>
        ) : null}
      </div>
      <div className="space-y-0.5 max-h-52 overflow-y-auto">
        {msgs.map((m, i) => {
          const isTx = m.role === 'tx';
          return (
            <div key={i} className="flex items-start gap-1.5 font-mono text-[9px]">
              <span className="text-[#30363d] shrink-0 w-[44px]">{localHMS(m.windowStart)}</span>
              <span className="text-[#484f58] shrink-0 w-[60px]" title="Frequency">
                {formatMsgFreq(m.freq)}
              </span>
              <span
                className="shrink-0 px-1 rounded text-[8px] font-bold"
                style={{
                  background: `${MSG_TYPE_COLOR[m.parsed.type]}1a`,
                  color: MSG_TYPE_COLOR[m.parsed.type],
                }}
              >
                {isTx ? '▶' : '◀'}{MSG_TYPE_LABEL[m.parsed.type]}
              </span>
              <span
                className="truncate"
                style={{ color: isTx ? contact.color : peerContact?.color ?? '#8b949e', opacity: 0.9 }}
              >
                {m.raw}
              </span>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ── Contact card ──────────────────────────────────────────────────────────────

function ContactCard({
  contact, expanded, onToggle, onSelect, contactMap, myCall = '',
}: {
  contact: Contact;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (callsign: string) => void;
  contactMap: Map<string, Contact>;
  myCall?: string;
}) {
  const [hoveredPeer, setHoveredPeer] = useState<string | null>(null);
  const [balloonPos,  setBalloonPos]  = useState<{ top: number; left: number } | null>(null);
  const hoverTimeout                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorRef                     = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Track cursor position precisely — read synchronously in hover handler
  useEffect(() => {
    const update = (e: MouseEvent) => { cursorRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', update, { passive: true });
    return () => window.removeEventListener('mousemove', update);
  }, []);

  const handlePeerEnter = (p: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    const { x: cx, y: cy } = cursorRef.current;
    const vh  = window.innerHeight;
    const vw  = window.innerWidth;
    const bH  = 280;
    const bW  = 288; // w-72 = 18rem
    const top  = cy + 20 + bH > vh ? Math.max(4, cy - bH - 4) : cy + 20;
    const left = cx + 20 + bW > vw ? Math.max(4, cx - bW - 4) : cx + 20;
    setBalloonPos({ top, left });
    setHoveredPeer(p);
  };
  const handlePeerLeave = () => {
    hoverTimeout.current = setTimeout(() => {
      setHoveredPeer(null);
      setBalloonPos(null);
    }, 120);
  };

  const txMsgs = contact.msgs.filter(m => m.role === 'tx');
  const rxMsgs = contact.msgs.filter(m => m.role === 'rx');

  const groups: ContactMsg[][] = [];
  for (const m of contact.msgs) {
    const last = groups[groups.length - 1];
    if (last && last[0].raw === m.raw && last[0].role === m.role) last.push(m);
    else groups.push([m]);
  }
  const history = groups.slice(-12);

  const locParts = locationParts(contact);
  const longest = expanded ? longestDistances(contact, contactMap) : { tx: null, rx: null };

  // Split peers into groups
  const receivedFrom = new Set<string>();
  const repliedTo    = new Set<string>();
  for (const m of contact.msgs) {
    const peer = m.role === 'tx' ? m.parsed.callee : m.parsed.caller;
    if (!peer || peer === contact.callsign) continue;
    if (m.role === 'tx') repliedTo.add(peer);
    else receivedFrom.add(peer);
  }
  const handshakes = new Set(
    Array.from(repliedTo).filter(p => receivedFrom.has(p) && isHandshake(contact, p))
  );
  const fullQSOs = new Set(
    Array.from(handshakes).filter(p => isFullQSO(contact, p))
  );

  // QSO status with the local operator
  const myCallUp   = myCall.toUpperCase();
  const myQSOFull  = myCallUp ? isFullQSO(contact, myCallUp) : false;
  const myQSOPart  = myCallUp && !myQSOFull ? isHandshake(contact, myCallUp) : false;

  function PeerChip({ peer }: { peer: string }) {
    const pc = contactMap.get(peer);
    return (
      <span className="inline-block">
        <button
          onClick={() => onSelect(peer)}
          onMouseEnter={() => handlePeerEnter(peer)}
          onMouseLeave={handlePeerLeave}
          className="text-[9px] font-mono font-bold hover:underline"
          style={{ color: pc?.color ?? '#8b949e' }}
        >
          {peer}{pc?.grid ? ` ${pc.grid}` : ''}
        </button>
        {hoveredPeer === peer && balloonPos && (
          <ConversationBalloon
            contact={contact}
            peer={peer}
            contactMap={contactMap}
            pos={balloonPos}
          />
        )}
      </span>
    );
  }

  return (
    <div
      className="mb-1.5 rounded-md border border-[#21262d]"
      style={{ borderLeftColor: contact.color, borderLeftWidth: '3px' }}
    >
      {/* Summary row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[#21262d]/40 transition-colors min-w-0 cursor-pointer"
      >
        <a
          href={qrzUrl(contact.callsign)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={`${contact.callsign} on QRZ.com`}
          className="font-mono font-bold text-xs shrink-0 hover:underline"
          style={{ color: contact.color }}
        >
          {contact.callsign}
        </a>
        {/* QSO badge — only shown when the local operator has exchanged with this station */}
        {myQSOFull && (
          <span
            className="shrink-0 text-[9px] font-bold font-mono px-1 py-px rounded"
            style={{ background: 'rgba(46,160,67,0.15)', color: '#2ea043', border: '1px solid rgba(46,160,67,0.4)' }}
            title="Full QSO completed with you (signal reports + sign-off exchanged)"
          >
            QSO✓
          </span>
        )}
        {myQSOPart && (
          <span
            className="shrink-0 text-[9px] font-bold font-mono px-1 py-px rounded"
            style={{ background: 'rgba(227,179,65,0.15)', color: '#e3b341', border: '1px solid rgba(227,179,65,0.4)' }}
            title="Partial QSO — exchange started but not fully signed off"
          >
            QSO…
          </span>
        )}
        {locParts && (
          <span className="font-mono text-[10px] text-[#484f58] flex items-center gap-1 truncate min-w-0"
            title={contact.grids.join(' · ')}>
            {locParts.flag && (
              <span title={locParts.country} className="not-italic">{locParts.flag}</span>
            )}
            {locParts.grids && <span>({locParts.grids})</span>}
          </span>
        )}
        <span className="flex-1 min-w-0" />
        <span
          className="font-mono text-[11px] font-semibold text-[#2ea043] shrink-0"
          title="Messages transmitted by this station"
        >
          {txMsgs.length}tx
        </span>
        <span
          className="font-mono text-[11px] font-semibold text-[#79c0ff] shrink-0"
          title="Messages addressed to this station"
        >
          {rxMsgs.length}rx
        </span>
        <span
          className="font-mono text-[11px] font-semibold text-[#d2a8ff] shrink-0"
          title={`Worked ${contact.peers.size} station${contact.peers.size === 1 ? '' : 's'}`}
        >
          {contact.peers.size}w
        </span>
        <svg
          viewBox="0 0 20 20" fill="currentColor"
          className="shrink-0 text-[#484f58] ml-1 transition-transform duration-150"
          style={{ width: 10, height: 10, transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>

      {/* Expanded history */}
      {expanded && (
        <div className="border-t border-[#21262d] bg-[#0d1117]/70 px-2.5 py-2">
          {contact.grids.length > 1 && (
            <div className="mb-1.5 pb-1.5 border-b border-[#21262d] text-[10px] font-mono flex items-center gap-1.5 flex-wrap">
              <span className="text-[#484f58]">grids:</span>
              {contact.grids.map(g => (
                <span key={g} className={g === contact.grid ? 'text-[#c9d1d9] font-bold' : 'text-[#8b949e]'}
                  title={g === contact.grid ? 'Most recent locator' : undefined}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {(longest.tx || longest.rx) && (
            <div className="mb-1.5 pb-1.5 border-b border-[#21262d] text-[10px] font-mono flex flex-wrap gap-x-3 gap-y-0.5">
              {longest.tx && (
                <span title="Longest transmission — distance to the addressed station">
                  <span className="text-[#2ea043]">longest tx:</span>{' '}
                  <span className="text-[#c9d1d9]">{formatKm(longest.tx.km)}</span>{' '}
                  <button onClick={() => onSelect(longest.tx!.peer)}
                    className="font-bold hover:underline"
                    style={{ color: contactMap.get(longest.tx.peer)?.color ?? '#8b949e' }}>
                    → {longest.tx.peer}
                  </button>
                </span>
              )}
              {longest.rx && (
                <span title="Longest reception — distance to the transmitting station">
                  <span className="text-[#79c0ff]">longest rx:</span>{' '}
                  <span className="text-[#c9d1d9]">{formatKm(longest.rx.km)}</span>{' '}
                  <button onClick={() => onSelect(longest.rx!.peer)}
                    className="font-bold hover:underline"
                    style={{ color: contactMap.get(longest.rx.peer)?.color ?? '#8b949e' }}>
                    ← {longest.rx.peer}
                  </button>
                </span>
              )}
            </div>
          )}

          {history.length === 0 ? (
            <p className="text-[10px] font-mono text-[#484f58]">no messages</p>
          ) : (
            <div className="space-y-1">
              {history.map((group, i) => {
                const m      = group[group.length - 1];
                const isTx   = m.role === 'tx';
                const peerCs = isTx ? m.parsed.callee : m.parsed.caller;
                const peerColor    = peerCs ? contactMap.get(peerCs)?.color : undefined;
                const repeatsTitle = group.map(g => `${localHMS(g.windowStart)}  ${g.raw}`).join('\n');
                const gridLoc  = m.parsed.grid ? gridToLatLon(m.parsed.grid) : null;
                const otherLoc = isTx
                  ? (peerCs ? contactMap.get(peerCs)?.latLon : undefined)
                  : contact.latLon;
                const km = gridLoc && otherLoc ? haversineKm(gridLoc, otherLoc) : null;
                return (
                  <div key={i} className="font-mono text-[10px] flex items-center gap-1.5 min-w-0">
                    <span className="text-[#30363d] shrink-0 w-[56px]">{localHMS(m.windowStart)}</span>
                    <span className="text-[#484f58] shrink-0 w-[60px]" title="Frequency">
                      {formatMsgFreq(m.freq)}
                    </span>
                    {isTx ? (
                      <span
                        className="shrink-0 px-1 py-px rounded text-[8px] font-bold w-[34px] text-center"
                        style={{ background: `${MSG_TYPE_COLOR[m.parsed.type]}1a`, color: MSG_TYPE_COLOR[m.parsed.type] }}
                      >
                        {MSG_TYPE_LABEL[m.parsed.type]}
                      </span>
                    ) : (
                      <span
                        className="shrink-0 px-1 py-px rounded text-[8px] font-bold w-[34px] text-center border"
                        style={{
                          background: `${MSG_TYPE_COLOR[m.parsed.type]}11`,
                          color: MSG_TYPE_COLOR[m.parsed.type],
                          borderColor: `${MSG_TYPE_COLOR[m.parsed.type]}30`,
                        }}
                      >
                        ←{MSG_TYPE_LABEL[m.parsed.type]}
                      </span>
                    )}
                    <span
                      className="text-[#8b949e] truncate"
                      title={group.length > 1 ? repeatsTitle : m.raw}
                      style={{ color: isTx ? contact.color : peerColor ?? '#8b949e', opacity: isTx ? 0.85 : 0.55 }}
                    >
                      {m.raw}
                    </span>
                    {km !== null && (
                      <span className="shrink-0 text-[9px] text-[#484f58]">{formatKm(km)}</span>
                    )}
                    {group.length > 1 && (
                      <span className="shrink-0 px-1 py-px rounded text-[8px] font-bold bg-[#30363d] text-[#8b949e] cursor-help" title={repeatsTitle}>
                        ×{group.length}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Peers — grouped as Full QSOs / Handshakes / Received from / Replied to */}
          {contact.peers.size > 0 && (
            <div className="mt-2 pt-1.5 border-t border-[#21262d] space-y-1.5">
              {fullQSOs.size > 0 && (
                <div>
                  <span className="text-[9px] text-[#e3b341] font-mono font-semibold block mb-0.5">
                    ⭐ full QSO ({fullQSOs.size})
                  </span>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-3">
                    {Array.from(fullQSOs).map(p => <PeerChip key={p} peer={p} />)}
                  </div>
                </div>
              )}

              {Array.from(handshakes).some(p => !fullQSOs.has(p)) && (
                <div>
                  <span className="text-[9px] text-[#d2a8ff] font-mono font-semibold block mb-0.5">
                    🤝 handshake ({Array.from(handshakes).filter(p => !fullQSOs.has(p)).length})
                  </span>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-3">
                    {Array.from(handshakes).filter(p => !fullQSOs.has(p)).map(p => <PeerChip key={p} peer={p} />)}
                  </div>
                </div>
              )}

              {receivedFrom.size > 0 && Array.from(receivedFrom).some(p => !handshakes.has(p)) && (
                <div>
                  <span className="text-[9px] text-[#79c0ff] font-mono font-semibold block mb-0.5">
                    ← received from ({Array.from(receivedFrom).filter(p => !handshakes.has(p)).length})
                  </span>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-3">
                    {Array.from(receivedFrom).filter(p => !handshakes.has(p)).map(p => <PeerChip key={p} peer={p} />)}
                  </div>
                </div>
              )}

              {repliedTo.size > 0 && Array.from(repliedTo).some(p => !handshakes.has(p)) && (
                <div>
                  <span className="text-[9px] text-[#2ea043] font-mono font-semibold block mb-0.5">
                    → replied to ({Array.from(repliedTo).filter(p => !handshakes.has(p)).length})
                  </span>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-3">
                    {Array.from(repliedTo).filter(p => !handshakes.has(p)).map(p => <PeerChip key={p} peer={p} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  contacts: Map<string, Contact>;
  mode: FTMode;
  myCall?: string;
  myGrid?: string;
  vfoHz?: number;
  onClearContacts: () => void;
  onImportADIF?: (content: string) => void;
  focus?: { cs: string; n: number } | null;
}

type SortKey = 'date' | 'tx' | 'rx' | 'worked' | 'alpha' | 'snr-hi' | 'snr-lo' | 'near' | 'far';
type QuickFilter = 'full-qso' | 'handshake' | 'tx-only' | 'rx-only'; // country handled by separate select

const SORT_OPTIONS: Array<{ key: SortKey; label: string; title: string }> = [
  { key: 'date',   label: 'Time',     title: 'Most recently heard first' },
  { key: 'tx',     label: 'TX',       title: 'Most transmissions first' },
  { key: 'rx',     label: 'RX',       title: 'Most receptions first' },
  { key: 'worked', label: 'Worked',   title: 'Most unique stations worked first' },
  { key: 'snr-hi', label: 'Strongest', title: 'Strongest signal (highest SNR) first' },
  { key: 'snr-lo', label: 'Weakest',  title: 'Weakest signal (lowest SNR) first' },
  { key: 'near',   label: 'Nearest',  title: 'Geographically closest first (requires your grid)' },
  { key: 'far',    label: 'Farthest', title: 'Geographically farthest first (requires your grid)' },
  { key: 'alpha',  label: 'A–Z',      title: 'Alphabetical by callsign' },
];

export default function FTContactsPanel({ contacts, mode, myCall = '', myGrid = '', vfoHz = 0, onClearContacts, onImportADIF, focus }: Props) {
  const [expanded,       setExpanded]      = useState<string | null>(null);
  const [sortKey,        setSortKey]       = useState<SortKey>('date');
  const [sortRev,        setSortRev]       = useState(false);
  const [query,          setQuery]         = useState('');
  const [quickFilter,    setQuickFilter]   = useState<QuickFilter | null>(null);
  const [countryFilter,  setCountryFilter] = useState<string>(''); // country code or ''
  const [mapHeight,     setMapHeight]     = useState(160);
  const panelRef    = useRef<HTMLDivElement>(null);
  const mapDragRef  = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = mapDragRef.current;
      if (!d || !panelRef.current) return;
      const panelH = panelRef.current.offsetHeight;
      const maxH   = Math.floor(panelH * 0.5);
      const newH   = Math.max(80, Math.min(maxH, d.startH + (e.clientY - d.startY)));
      setMapHeight(newH);
    };
    const onUp = () => { mapDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const select = useCallback((callsign: string) => {
    if (contacts.has(callsign)) setExpanded(callsign);
  }, [contacts]);

  // ── Virtualized list plumbing ────────────────────────────────────────────
  // Collapsed cards have a fixed height; the (single) expanded card is
  // measured live so rows below it are positioned correctly.
  const [expandedH, setExpandedH] = useState(EXPANDED_CARD_FALLBACK_H);
  const [heightsVersion, setHeightsVersion] = useState(0);
  useEffect(() => { setHeightsVersion(v => v + 1); }, [expanded, expandedH]);

  const expandedRO = useRef<ResizeObserver | null>(null);
  const measureExpanded = useCallback((el: HTMLDivElement | null) => {
    expandedRO.current?.disconnect();
    if (!el) return;
    if (!expandedRO.current) {
      expandedRO.current = new ResizeObserver(entries => {
        const box = entries[0];
        const h = (box.borderBoxSize?.[0]?.blockSize ?? box.contentRect.height) + CARD_GAP_H;
        setExpandedH(prev => (Math.abs(prev - h) > 2 ? h : prev));
      });
    }
    expandedRO.current.observe(el);
  }, []);
  useEffect(() => () => expandedRO.current?.disconnect(), []);

  // Scroll the expanded card into view (replaces the old scrollIntoView refs)
  const [scrollIdx, setScrollIdx] = useState(-1);
  useEffect(() => {
    if (expanded) setScrollIdx(filtered.findIndex(c => c.callsign === expanded));
    else setScrollIdx(-1);
    // scroll on expansion change only — not when the list reorders under it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (focus && contacts.has(focus.cs)) setExpanded(focus.cs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const myGridUp = myGrid.toUpperCase();

  const myLatLon: [number, number] | null = useMemo(
    () => myGridUp ? (gridToLatLon(myGridUp) ?? null) : null,
    [myGridUp],
  );

  // Per-contact derived values — computed once per contacts Map reference, not per render
  const contactStats = useMemo(() => {
    const map = new Map<string, {
      txCount: number; rxCount: number; maxSnr: number; distKm: number;
      countryCode: string | undefined;
    }>();
    for (const c of contacts.values()) {
      let txCount = 0, rxCount = 0, snrMax = -99;
      for (const m of c.msgs) {
        if (m.role === 'tx') txCount++;
        else rxCount++;
        if (m.snr > snrMax) snrMax = m.snr;
      }
      const dkm = (myLatLon && c.latLon) ? haversineKm(myLatLon, c.latLon) : Infinity;
      const pfx  = callsignCountry(c.callsign);
      map.set(c.callsign, { txCount, rxCount, maxSnr: snrMax, distKm: dkm, countryCode: pfx?.countryCode });
    }
    return map;
  }, [contacts, myLatLon]);

  // Build the list of unique countries for the country select dropdown
  const countryOptions = useMemo(() => Array.from(
    Array.from(contacts.values()).reduce((acc, c) => {
      const pfx = callsignCountry(c.callsign);
      const flag    = pfx?.flag;
      const country = pfx?.country;
      const code    = pfx?.countryCode;
      if (code && country && flag) {
        const existing = acc.get(code);
        acc.set(code, existing
          ? { ...existing, count: existing.count + 1 }
          : { code, country, flag, count: 1 });
      }
      return acc;
    }, new Map<string, { code: string; country: string; flag: string; count: number }>())
  .values()).sort((a, b) => b.count - a.count || a.country.localeCompare(b.country)),
  [contacts]);

  // Sort contacts — only when contacts, sortKey, sortRev, or stats change
  const sorted = useMemo(() => Array.from(contacts.values()).sort((a, b) => {
    const sa = contactStats.get(a.callsign)!;
    const sb = contactStats.get(b.callsign)!;
    let cmp: number;
    if      (sortKey === 'date')   cmp = b.lastSeen.getTime() - a.lastSeen.getTime();
    else if (sortKey === 'tx')     cmp = sb.txCount - sa.txCount;
    else if (sortKey === 'rx')     cmp = sb.rxCount - sa.rxCount;
    else if (sortKey === 'worked') cmp = b.peers.size - a.peers.size;
    else if (sortKey === 'snr-hi') cmp = sb.maxSnr - sa.maxSnr;
    else if (sortKey === 'snr-lo') cmp = sa.maxSnr - sb.maxSnr;
    else if (sortKey === 'near')   cmp = sa.distKm - sb.distKm;
    else if (sortKey === 'far')    cmp = sb.distKm - sa.distKm;
    else                           cmp = a.callsign.localeCompare(b.callsign);
    return sortRev ? -cmp : cmp;
  }), [contacts, contactStats, sortKey, sortRev]);

  // Stats for filter chip counts — computed once over sorted, not re-run per filter change
  const filterStats = useMemo(() => {
    let withLocation = 0, fullQSOCount = 0, handshakeCount = 0, txOnlyCount = 0, rxOnlyCount = 0;
    for (const c of sorted) {
      const s = contactStats.get(c.callsign)!;
      if (c.latLon) withLocation++;
      if (s.txCount > 0 && s.rxCount === 0) txOnlyCount++;
      if (s.rxCount > 0 && s.txCount === 0) rxOnlyCount++;
      const peers = Array.from(c.peers);
      const hasFull = peers.some(p => isFullQSO(c, p));
      const hasHand = peers.some(p => isHandshake(c, p) && !isFullQSO(c, p));
      if (hasFull) fullQSOCount++;
      if (hasHand) handshakeCount++;
    }
    return { withLocation, fullQSOCount, handshakeCount, txOnlyCount, rxOnlyCount };
  }, [sorted, contactStats]);

  const { withLocation, fullQSOCount, handshakeCount, txOnlyCount, rxOnlyCount } = filterStats;

  // Apply quick filter + country filter
  const quickFiltered = useMemo(() => sorted.filter(c => {
    const s = contactStats.get(c.callsign)!;
    if (quickFilter === 'full-qso'  && !Array.from(c.peers).some(p => isFullQSO(c, p))) return false;
    if (quickFilter === 'handshake' && !Array.from(c.peers).some(p => isHandshake(c, p) && !isFullQSO(c, p))) return false;
    if (quickFilter === 'tx-only'   && !(s.txCount > 0 && s.rxCount === 0)) return false;
    if (quickFilter === 'rx-only'   && !(s.rxCount > 0 && s.txCount === 0)) return false;
    if (countryFilter) {
      const code = callsignCountry(c.callsign)?.countryCode;
      if (code !== countryFilter) return false;
    }
    return true;
  }), [sorted, contactStats, quickFilter, countryFilter]);

  // Free-text search on top
  const q        = query.trim().toLowerCase();
  const filtered = useMemo(() => q
    ? quickFiltered.filter(c => {
        const pfx = callsignCountry(c.callsign);
        return [c.callsign, ...c.grids, pfx?.country, pfx?.countryCode]
          .some(s => s?.toLowerCase().includes(q));
      })
    : quickFiltered,
  [q, quickFiltered]);

  const hasAnyFilter   = !!quickFilter || !!countryFilter;

  const importFileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ count: number; err?: string } | null>(null);

  const confirmedQSOCount = myCall
    ? [...contacts.values()].filter(c => isConfirmedQSO(c, myCall)).length
    : 0;

  function downloadADIF() {
    const content = generateADIF(contacts, mode, { myCall, myGrid, vfoHz });
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ft-log-${new Date().toISOString().slice(0, 10)}.adi`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      try {
        const records = parseADIF(content);
        if (records.length === 0) { setImportStatus({ count: 0, err: 'No valid QSO records found' }); return; }
        onImportADIF?.(content);
        setImportStatus({ count: records.length });
        setTimeout(() => setImportStatus(null), 4000);
      } catch {
        setImportStatus({ count: 0, err: 'Failed to parse ADIF file' });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div ref={panelRef} className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
        <h2 className="text-lg sm:text-xl font-semibold">Contacts</h2>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="text-xs font-mono text-[#8b949e]">
            {q || hasAnyFilter ? `${filtered.length}/${contacts.size} shown` : `${contacts.size} found`}
            {withLocation > 0 && <span className="text-[#484f58]"> · {withLocation} located</span>}
          </span>
          {importStatus && (
            <span className={`text-[10px] font-mono ${importStatus.err ? 'text-[#f85149]' : 'text-[#2ea043]'}`}>
              {importStatus.err ?? `+${importStatus.count} imported`}
            </span>
          )}
          {/* Hidden file input */}
          <input
            ref={importFileRef}
            type="file"
            accept=".adi,.adif"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => importFileRef.current?.click()}
            className="text-xs px-2 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#2ea043] hover:border-[#2ea043]/40 transition-colors font-mono"
            title="Import ADIF log (.adi / .adif)"
          >
            import
          </button>
          {contacts.size > 0 && (
            <>
              <button
                onClick={downloadADIF}
                disabled={confirmedQSOCount === 0}
                className="text-xs px-2 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#79c0ff] hover:border-[#79c0ff]/40 transition-colors font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                title={confirmedQSOCount > 0
                  ? `Download ADIF log — ${confirmedQSOCount} confirmed QSO${confirmedQSOCount !== 1 ? 's' : ''} (SWL entries excluded)`
                  : 'No confirmed two-way QSOs to export yet'}
              >
                export{confirmedQSOCount > 0 ? ` (${confirmedQSOCount})` : ''}
              </button>
              <button
                onClick={onClearContacts}
                className="text-xs px-2 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#f85149] hover:border-[#f85149]/40 transition-colors font-mono"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="shrink-0 mb-0">
        <div className="text-[10px] text-[#484f58] font-mono mb-1 flex items-center justify-between">
          <span>World Map</span>
          <span className="text-[#30363d]">
            {withLocation > 0 ? `${withLocation} located` : 'no positions yet'}
          </span>
        </div>
        <div className="rounded overflow-hidden border border-[#21262d]" style={{ height: mapHeight }}>
          <FTLeafletMap contacts={contacts} onSelect={select} selected={expanded} />
        </div>
        {/* Drag handle to resize map */}
        <div
          className="h-2 flex items-center justify-center cursor-ns-resize group mb-1.5"
          onMouseDown={e => {
            e.preventDefault();
            mapDragRef.current = { startY: e.clientY, startH: mapHeight };
          }}
        >
          <div className="w-8 h-0.5 rounded-full bg-[#30363d] group-hover:bg-[#2ea043]/60 transition-colors" />
        </div>
      </div>

      {/* Search filter */}
      {contacts.size > 0 && (
        <div className="mb-1.5 shrink-0 relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search callsign, grid, city, country…"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs font-mono text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#2ea043] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#c9d1d9] text-xs px-1"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Quick filter chips + country select */}
      {contacts.size > 0 && (
        <div className="mb-1.5 shrink-0 flex flex-wrap gap-1 items-center">
          {fullQSOCount > 0 && (
            <button
              onClick={() => setQuickFilter(f => f === 'full-qso' ? null : 'full-qso')}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                quickFilter === 'full-qso'
                  ? 'border-[#e3b341]/50 text-[#e3b341] bg-[#e3b341]/10'
                  : 'border-[#30363d] text-[#8b949e] hover:text-[#e3b341] hover:border-[#e3b341]/30'
              }`}
              title="Show contacts with a complete QSO (report exchanged and signed off)"
            >
              ⭐ full QSO <span className="opacity-60">{fullQSOCount}</span>
            </button>
          )}
          {handshakeCount > 0 && (
            <button
              onClick={() => setQuickFilter(f => f === 'handshake' ? null : 'handshake')}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                quickFilter === 'handshake'
                  ? 'border-[#d2a8ff]/50 text-[#d2a8ff] bg-[#d2a8ff]/10'
                  : 'border-[#30363d] text-[#8b949e] hover:text-[#d2a8ff] hover:border-[#d2a8ff]/30'
              }`}
              title="Show contacts with a partial handshake (both sides transmitted, not yet complete)"
            >
              🤝 handshake <span className="opacity-60">{handshakeCount}</span>
            </button>
          )}
          {txOnlyCount > 0 && (
            <button
              onClick={() => setQuickFilter(f => f === 'tx-only' ? null : 'tx-only')}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                quickFilter === 'tx-only'
                  ? 'border-[#2ea043]/50 text-[#2ea043] bg-[#2ea043]/10'
                  : 'border-[#30363d] text-[#8b949e] hover:text-[#2ea043] hover:border-[#2ea043]/30'
              }`}
              title="Show stations that transmitted only (no messages addressed to them)"
            >
              tx only <span className="opacity-60">{txOnlyCount}</span>
            </button>
          )}
          {rxOnlyCount > 0 && (
            <button
              onClick={() => setQuickFilter(f => f === 'rx-only' ? null : 'rx-only')}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                quickFilter === 'rx-only'
                  ? 'border-[#79c0ff]/50 text-[#79c0ff] bg-[#79c0ff]/10'
                  : 'border-[#30363d] text-[#8b949e] hover:text-[#79c0ff] hover:border-[#79c0ff]/30'
              }`}
              title="Show stations seen only as addressees (never transmitted)"
            >
              rx only <span className="opacity-60">{rxOnlyCount}</span>
            </button>
          )}
          {countryOptions.length > 0 && (
            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              title="Filter by country"
              className={`text-[9px] font-mono px-1 py-0.5 rounded border bg-[#0d1117] transition-colors cursor-pointer ${
                countryFilter
                  ? 'border-[#e3b341]/50 text-[#e3b341]'
                  : 'border-[#30363d] text-[#8b949e]'
              }`}
            >
              <option value="">🌍 All countries</option>
              {countryOptions.map(({ code, country, flag, count }) => (
                <option key={code} value={code}>{flag} {country} ({count})</option>
              ))}
            </select>
          )}
          {hasAnyFilter && (
            <button
              onClick={() => { setQuickFilter(null); setCountryFilter(''); }}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[#30363d] text-[#484f58] hover:text-[#c9d1d9]"
              title="Clear all filters"
            >
              ✕ clear
            </button>
          )}
        </div>
      )}

      {/* Sort controls */}
      {contacts.size > 1 && (
        <div className="flex items-center gap-1 mb-1.5 shrink-0 flex-wrap">
          <span className="text-[9px] text-[#484f58] font-mono">sort:</span>
          {SORT_OPTIONS.map(({ key, label, title }) => (
            <button
              key={key}
              onClick={() => {
                if (sortKey === key) setSortRev(r => !r);
                else { setSortKey(key); setSortRev(false); }
              }}
              title={sortKey === key ? `${title} — click to reverse` : title}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                sortKey === key
                  ? 'border-[#2ea043]/50 text-[#2ea043] bg-[#2ea043]/10'
                  : 'border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              {label}{sortKey === key ? (sortRev ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
      )}

      {/* Contact list — windowed: DOM size is constant however many contacts exist */}
      <VirtualList
        items={filtered}
        className="flex-1 overflow-y-auto min-h-0 max-h-[50vh] lg:max-h-none"
        itemKey={c => c.callsign}
        itemHeight={c => (c.callsign === expanded ? expandedH : COLLAPSED_CARD_H)}
        heightsVersion={heightsVersion}
        scrollToIndex={scrollIdx}
        overscan={5}
        empty={
          <div className="flex flex-col items-center justify-center h-28 gap-2">
            <div className="text-3xl select-none">{q || hasAnyFilter ? '🔍' : '🌍'}</div>
            <div className="text-xs text-[#484f58] font-mono">
              {q ? `No contacts match "${query.trim()}"` : hasAnyFilter ? 'No contacts match this filter' : 'No contacts yet'}
            </div>
          </div>
        }
        renderItem={c => (
          <div ref={c.callsign === expanded ? measureExpanded : undefined} style={{ overflow: c.callsign === expanded ? 'visible' : 'hidden' }}>
            <ContactCard
              contact={c}
              expanded={expanded === c.callsign}
              onToggle={() => setExpanded(p => p === c.callsign ? null : c.callsign)}
              onSelect={select}
              contactMap={contacts}
              myCall={myCall}
            />
          </div>
        )}
      />
    </div>
  );
}
