'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Contact, ContactMsg, MSG_TYPE_LABEL, MSG_TYPE_COLOR, generateADIF } from '@/lib/ft/parser';
import { GeoInfo, OperatorInfo, resolveGridLocation, lookupOperator } from '@/lib/ft/lookup';
import type { FTMode } from '@/lib/ft/decoder';

// Loaded only in the browser — Leaflet must not run in SSR
const FTLeafletMap = dynamic(() => import('./FTLeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-xs text-[#484f58] font-mono">
      Loading map…
    </div>
  ),
});

function utcHMS(d: Date): string { return d.toISOString().slice(11, 19); }

// "🇧🇷 Joao Pessoa - HI72", degrading to just the grid until geocoding resolves
function locationLabel(contact: Contact, geo?: GeoInfo): string | null {
  if (!contact.grid) return null;
  const place = geo ? [geo.flag, geo.city].filter(Boolean).join(' ') : '';
  return place ? `${place} - ${contact.grid}` : contact.grid;
}

function qrzUrl(callsign: string): string {
  return `https://www.qrz.com/db/${encodeURIComponent(callsign.split('/')[0])}`;
}

// ── Contact card ──────────────────────────────────────────────────────────────

function ContactCard({
  contact, expanded, onToggle, onSelect, contactMap, geo, op,
}: {
  contact: Contact;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (callsign: string) => void;
  contactMap: Map<string, Contact>;
  geo?: GeoInfo;
  op?: OperatorInfo;
}) {
  const txMsgs = contact.msgs.filter(m => m.role === 'tx');
  const rxMsgs = contact.msgs.filter(m => m.role === 'rx');

  // Collapse runs of identical repeated messages into one entry with a counter,
  // then show the 12 most recent groups
  const groups: ContactMsg[][] = [];
  for (const m of contact.msgs) {
    const last = groups[groups.length - 1];
    if (last && last[0].raw === m.raw && last[0].role === m.role) last.push(m);
    else groups.push([m]);
  }
  const history = groups.slice(-12);

  const loc = locationLabel(contact, geo);

  return (
    <div
      className="mb-1.5 rounded-md overflow-hidden border border-[#21262d]"
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
        {loc && (
          <span className="font-mono text-[10px] text-[#484f58] truncate min-w-0">({loc})</span>
        )}
        <span className="flex-1 min-w-0" />
        {/* TX/RX/worked counts — always shown so every row reads the same */}
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
          {contact.peers.size}wkd
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
          {op && (op.name || op.email) && (
            <div className="mb-1.5 pb-1.5 border-b border-[#21262d] text-[10px] font-mono flex items-center gap-1.5 flex-wrap">
              <span className="text-[#484f58]">op:</span>
              {op.name && <span className="text-[#c9d1d9]">{op.name}</span>}
              {op.email && (
                <a href={`mailto:${op.email}`} className="text-[#79c0ff] hover:underline">{op.email}</a>
              )}
            </div>
          )}

          {history.length === 0 ? (
            <p className="text-[10px] font-mono text-[#484f58]">no messages</p>
          ) : (
            <div className="space-y-1">
              {history.map((group, i) => {
                const m = group[group.length - 1]; // latest occurrence
                const isTx = m.role === 'tx';
                const peerCs = isTx ? m.parsed.callee : m.parsed.caller;
                const peerColor = peerCs ? contactMap.get(peerCs)?.color : undefined;
                const repeatsTitle = group
                  .map(g => `${utcHMS(g.windowStart)}z  ${g.raw}`)
                  .join('\n');
                return (
                  <div key={i} className="font-mono text-[10px] flex items-center gap-1.5 min-w-0">
                    <span className="text-[#30363d] shrink-0 w-[56px]">
                      {utcHMS(m.windowStart)}z
                    </span>
                    {/* Classifier badge — colored by message type, same in every log */}
                    {isTx ? (
                      <span
                        className="shrink-0 px-1 py-px rounded text-[8px] font-bold w-[34px] text-center"
                        style={{
                          background: `${MSG_TYPE_COLOR[m.parsed.type]}1a`,
                          color: MSG_TYPE_COLOR[m.parsed.type],
                        }}
                      >
                        {MSG_TYPE_LABEL[m.parsed.type]}
                      </span>
                    ) : (
                      /* RX variant (contact was addressed) — bordered, arrowed */
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
                    {group.length > 1 && (
                      <span
                        className="shrink-0 px-1 py-px rounded text-[8px] font-bold bg-[#30363d] text-[#8b949e] cursor-help"
                        title={repeatsTitle}
                      >
                        ×{group.length}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {contact.peers.size > 0 && (
            <div className="mt-2 pt-1.5 border-t border-[#21262d] flex flex-wrap gap-x-2 gap-y-0.5 items-center">
              <span className="text-[9px] text-[#484f58]">worked:</span>
              {Array.from(contact.peers).map(p => {
                const pc = contactMap.get(p);
                return (
                  <button
                    key={p}
                    onClick={() => onSelect(p)}
                    className="text-[9px] font-mono font-bold hover:underline"
                    style={{ color: pc?.color ?? '#8b949e' }}
                  >
                    {p}{pc?.grid ? ` ${pc.grid}` : ''}
                  </button>
                );
              })}
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
  onClearContacts: () => void;
}

type SortKey = 'date' | 'tx' | 'alpha';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'date',  label: 'time' },
  { key: 'tx',    label: 'tx' },
  { key: 'alpha', label: 'a–z' },
];

export default function FTContactsPanel({ contacts, mode, onClearContacts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey,  setSortKey]  = useState<SortKey>('date');
  const [sortRev,  setSortRev]  = useState(false);

  // Async enrichment results — filled in as remote lookups resolve
  const [geoMap, setGeoMap] = useState<Map<string, GeoInfo>>(new Map());
  const [opMap,  setOpMap]  = useState<Map<string, OperatorInfo>>(new Map());
  const geoRequested = useRef(new Set<string>());
  const opRequested  = useRef(new Set<string>());

  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    for (const c of contacts.values()) {
      if (c.grid && c.latLon && !geoRequested.current.has(c.grid)) {
        geoRequested.current.add(c.grid);
        const grid = c.grid;
        resolveGridLocation(grid, c.latLon).then(info => {
          if (info) setGeoMap(prev => new Map(prev).set(grid, info));
        });
      }
      if (!opRequested.current.has(c.callsign)) {
        opRequested.current.add(c.callsign);
        const callsign = c.callsign;
        lookupOperator(callsign).then(info => {
          if (info) setOpMap(prev => new Map(prev).set(callsign, info));
        });
      }
    }
  }, [contacts]);

  // Jump to a contact from anywhere it's shown (peer chips, map popups, …)
  const select = useCallback((callsign: string) => {
    if (contacts.has(callsign)) setExpanded(callsign);
  }, [contacts]);

  useEffect(() => {
    if (expanded) {
      cardRefs.current.get(expanded)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [expanded]);

  const txCount = (c: Contact) => c.msgs.filter(m => m.role === 'tx').length;
  const sorted = Array.from(contacts.values()).sort((a, b) => {
    let cmp: number;
    if (sortKey === 'date')    cmp = b.lastSeen.getTime() - a.lastSeen.getTime();
    else if (sortKey === 'tx') cmp = txCount(b) - txCount(a);
    else                       cmp = a.callsign.localeCompare(b.callsign);
    return sortRev ? -cmp : cmp;
  });

  const withLocation = sorted.filter(c => c.latLon).length;

  function downloadADIF() {
    const content = generateADIF(contacts, mode);
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
        <h2 className="text-lg sm:text-xl font-semibold">Contacts</h2>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="text-xs font-mono text-[#8b949e]">
            {contacts.size} found
            {withLocation > 0 && <span className="text-[#484f58]"> · {withLocation} located</span>}
          </span>
          {contacts.size > 0 && (
            <>
              <button
                onClick={downloadADIF}
                className="text-xs px-2 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#79c0ff] hover:border-[#79c0ff]/40 transition-colors font-mono"
                title="Download ADIF log (.adi)"
              >
                .adi
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

      {/* Map — at the top, always visible */}
      <div className="shrink-0 mb-2">
        <div className="text-[10px] text-[#484f58] font-mono mb-1 flex items-center justify-between">
          <span>World Map</span>
          <span className="text-[#30363d]">
            {withLocation > 0 ? `${withLocation} located` : 'no positions yet'}
          </span>
        </div>
        <div className="rounded overflow-hidden border border-[#21262d]" style={{ height: 210 }}>
          <FTLeafletMap contacts={contacts} onSelect={select} />
        </div>
      </div>

      {/* Sort controls */}
      {contacts.size > 1 && (
        <div className="flex items-center gap-1 mb-1.5 shrink-0">
          <span className="text-[9px] text-[#484f58] font-mono">sort:</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (sortKey === key) setSortRev(r => !r);
                else { setSortKey(key); setSortRev(false); }
              }}
              title={sortKey === key ? 'Click again to reverse' : `Sort by ${label}`}
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

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto min-h-0 max-h-[50vh] lg:max-h-none">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 gap-2">
            <div className="text-3xl select-none">🌍</div>
            <div className="text-xs text-[#484f58] font-mono">No contacts yet</div>
          </div>
        ) : (
          sorted.map(c => (
            <div
              key={c.callsign}
              ref={el => {
                if (el) cardRefs.current.set(c.callsign, el);
                else cardRefs.current.delete(c.callsign);
              }}
            >
              <ContactCard
                contact={c}
                expanded={expanded === c.callsign}
                onToggle={() => setExpanded(p => p === c.callsign ? null : c.callsign)}
                onSelect={select}
                contactMap={contacts}
                geo={c.grid ? geoMap.get(c.grid) : undefined}
                op={opMap.get(c.callsign)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
