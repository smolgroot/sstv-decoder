import type { FTMode } from './decoder';

export type MsgType = 'cq' | 'answer' | 'report' | 'r_report' | 'rrr' | 'rr73' | 'tx73' | 'other';

export interface ParsedFTMsg {
  type: MsgType;
  caller: string;   // the transmitting station (second callsign in standard messages)
  callee?: string;  // the addressed station (first callsign)
  grid?: string;    // Maidenhead grid — always belongs to the caller
  report?: number;  // signal report in dB
  raw: string;
  clean: boolean;   // every word classified as a known FT token — safe to track
}

const CS = '[A-Z0-9]{1,3}[0-9][A-Z]{1,4}(?:/[A-Z0-9]+)?';
const CS_EXACT = new RegExp(`^${CS}$`);
// "RR73" is lexically a valid Maidenhead square but is reserved as a QSO
// sign-off message and must never be read as a locator (same as WSJT-X)
const GRID_EXACT = /^(?!RR73)[A-R]{2}[0-9]{2}$/;
// Signal report: optional R (roger) + signed dB value
const RPT_EXACT = /^(R?)([+-][0-9]{1,2})$/;

// "<...>" hashed-callsign placeholders stand for a callsign that didn't fit the
// payload — a legitimate token, but not a usable callsign
const isPlaceholder = (w: string) => w.includes('<') || w.includes('>');
const isCallsignish = (w: string | undefined): boolean =>
  !!w && (CS_EXACT.test(w) || isPlaceholder(w));

// "<...>" placeholders and the literal "CQ" are not callsigns
export function isValidCallsign(cs: string | undefined): cs is string {
  if (!cs) return false;
  if (cs === 'CQ' || cs.includes('<') || cs.includes('>')) return false;
  return CS_EXACT.test(cs);
}

// Parse results memoized by message text. The messages table re-renders on
// every streamed partial and used to re-parse its entire history each time
// (O(n²) per window on busy bands); the cache makes repeat parses O(1).
// Bounded: cleared wholesale when it outgrows its cap — messages repeat
// heavily (CQ cycles), so hit rates stay high even after a reset.
const parseCache = new Map<string, ParsedFTMsg>();
const PARSE_CACHE_MAX = 20_000;

export function parseFTMsgCached(raw: string): ParsedFTMsg {
  let p = parseCache.get(raw);
  if (!p) {
    if (parseCache.size >= PARSE_CACHE_MAX) parseCache.clear();
    p = parseFTMsg(raw);
    parseCache.set(raw, p);
  }
  return p;
}

// Every FT message is a handful of words, each one of: a callsign (or <...>
// placeholder), a Maidenhead grid, a signal report (R±nn / ±nn), or a short
// sign-off (73 / RRR / RR73). Classify word-by-word instead of whole-message
// regexes so partially-captured messages still yield their usable parts —
// e.g. "<...> PU7FTW HI72" must still record PU7FTW's locator.
export function parseFTMsg(raw: string): ParsedFTMsg {
  const words = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);

  // CQ form: CQ [DIR] CALLER [GRID]
  if (words[0] === 'CQ') {
    let i = 1;
    // Directed-CQ tag (DX, NA, POTA, …) — letters only, not a callsign or grid
    if (words[i] && /^[A-Z]{1,4}$/.test(words[i]) && !CS_EXACT.test(words[i]) && !GRID_EXACT.test(words[i])) i++;
    const caller = words[i] ?? raw;
    const grid   = words[i + 1] && GRID_EXACT.test(words[i + 1]) ? words[i + 1] : undefined;
    const clean  = words.length <= i + 2 && isCallsignish(caller) &&
                   (words[i + 1] === undefined || grid !== undefined);
    return { type: 'cq', caller, grid, raw, clean };
  }

  // Partial-capture fragment "CALLER GRID" (e.g. a CQ with the CQ word lost,
  // or a 3-word message missing its addressee): the locator follows its owner,
  // so the location info is still usable
  if (words.length === 2 && isCallsignish(words[0]) && GRID_EXACT.test(words[1])) {
    return { type: 'answer', caller: words[0], grid: words[1], raw, clean: isValidCallsign(words[0]) };
  }

  // Standard form: CALLEE CALLER PAYLOAD — the SECOND callsign is the
  // transmitting station; any grid/report in the payload is theirs
  const [callee, caller, payload] = words;
  const clean = words.length === 3 && isCallsignish(callee) && isCallsignish(caller) &&
                (isValidCallsign(callee) || isValidCallsign(caller));
  const base = { caller: caller ?? words[0] ?? raw, callee, raw };

  if (payload !== undefined) {
    let m: RegExpMatchArray | null;
    if (GRID_EXACT.test(payload))       return { type: 'answer',  ...base, grid: payload, clean };
    if ((m = payload.match(RPT_EXACT))) return { type: m[1] ? 'r_report' : 'report', ...base, report: parseInt(m[2]), clean };
    if (payload === 'RR73')             return { type: 'rr73', ...base, clean };
    if (payload === 'RRR')              return { type: 'rrr',  ...base, clean };
    if (payload === '73')               return { type: 'tx73', ...base, clean };
  }
  return { type: 'other', ...base, clean: false };
}

export function gridToLatLon(grid: string): [number, number] | null {
  if (grid.length < 4) return null;
  const g  = grid.toUpperCase();
  const A  = 'A'.charCodeAt(0);
  const c0 = g.charCodeAt(0) - A;
  const c1 = g.charCodeAt(1) - A;
  const n0 = parseInt(g[2]);
  const n1 = parseInt(g[3]);
  if (c0 < 0 || c0 > 17 || c1 < 0 || c1 > 17 || isNaN(n0) || isNaN(n1)) return null;
  return [c1 * 10 - 90 + n1 + 0.5, c0 * 20 - 180 + n0 * 2 + 1];
}

// Great-circle distance between two [lat, lon] points
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const CONTACT_PALETTE = [
  '#79c0ff', '#ffa657', '#7ee787', '#ff7b72', '#d2a8ff',
  '#e3b341', '#39d353', '#58a6ff', '#bc8cff', '#ff6e64',
  '#f0883e', '#56d364', '#a5d6ff', '#ffab70', '#cae8ff',
];

export interface ContactMsg {
  windowStart: Date;
  raw: string;
  parsed: ParsedFTMsg;
  freq: number;
  snr: number;
  role: 'tx' | 'rx'; // tx = this station was transmitting; rx = this station was addressed
}

export interface Contact {
  callsign: string;
  grid?: string;             // most recently reported locator
  grids: string[];           // every locator seen, in order of first appearance
  latLon?: [number, number]; // position of the most recent locator
  color: string;
  msgs: ContactMsg[];
  peers: Set<string>;
  firstSeen: Date;
  lastSeen: Date;
}

// Maximum unique callsigns to keep in memory at once.
// On a busy band (20m FT8) you can hear 200+ unique calls/hour — cap prevents
// unbounded growth. Oldest-seen contacts are evicted first when the limit is hit.
// 1200 gives headroom over the validated 1000-contact performance target
// (virtualized lists keep render cost independent of contact count).
const MAX_CONTACTS = 1200;

export function mergeContacts(
  existing: Map<string, Contact>,
  windowStart: Date,
  messages: Array<{ msg: string; freq: number; snr: number }>,
  colorOffset: number,
): Map<string, Contact> {
  const contacts = new Map(existing);

  const getOrCreate = (callsign: string): Contact => {
    if (!contacts.has(callsign)) {
      const idx = (contacts.size + colorOffset) % CONTACT_PALETTE.length;
      contacts.set(callsign, {
        callsign,
        grids: [],
        color: CONTACT_PALETTE[idx],
        msgs: [],
        peers: new Set(),
        firstSeen: windowStart,
        lastSeen: windowStart,
      });
    }
    return contacts.get(callsign)!;
  };

  for (const { msg: raw, freq, snr } of messages) {
    const parsed = parseFTMsg(raw);
    // Garbled decodes (any unclassifiable word) are not tracked. Partial
    // captures with <...> placeholders ARE clean — their valid side is used.
    if (!parsed.clean) continue;

    const callerValid = isValidCallsign(parsed.caller);
    const calleeValid = isValidCallsign(parsed.callee);
    if (!callerValid && !calleeValid) continue;

    if (callerValid) {
      const caller = getOrCreate(parsed.caller);
      caller.msgs.push({ windowStart, raw, parsed, freq, snr, role: 'tx' });
      // Keep only the last 60 messages per contact — enough for full QSO history
      if (caller.msgs.length > 60) caller.msgs.splice(0, caller.msgs.length - 60);
      caller.lastSeen = windowStart;

      // The grid always belongs to the transmitting station. A station can
      // legitimately report several locators (portable/rover) — keep them all,
      // with `grid`/`latLon` tracking the most recent one
      if (parsed.grid) {
        if (!caller.grids.includes(parsed.grid)) caller.grids.push(parsed.grid);
        if (caller.grids.length > 10) caller.grids.splice(0, caller.grids.length - 10);
        if (caller.grid !== parsed.grid) {
          caller.grid   = parsed.grid;
          caller.latLon = gridToLatLon(parsed.grid) ?? undefined;
        }
      }
      if (calleeValid) {
        caller.peers.add(parsed.callee!);
        if (caller.peers.size > 50) {
          const first = caller.peers.values().next().value;
          if (first !== undefined) caller.peers.delete(first);
        }
      }
    }

    if (calleeValid) {
      const callee = getOrCreate(parsed.callee!);
      if (callerValid) {
        callee.peers.add(parsed.caller);
        if (callee.peers.size > 50) {
          const first = callee.peers.values().next().value;
          if (first !== undefined) callee.peers.delete(first);
        }
      }
      callee.msgs.push({ windowStart, raw, parsed, freq, snr, role: 'rx' });
      if (callee.msgs.length > 60) callee.msgs.splice(0, callee.msgs.length - 60);
      callee.lastSeen = windowStart;
    }
  }

  // Evict oldest contacts when over the limit — sort by lastSeen ascending,
  // drop the stalest ones. Never evict a contact that has messages in this window
  // (they're active right now).
  if (contacts.size > MAX_CONTACTS) {
    const sorted = [...contacts.values()].sort(
      (a, b) => a.lastSeen.getTime() - b.lastSeen.getTime()
    );
    for (const c of sorted) {
      if (contacts.size <= MAX_CONTACTS) break;
      if (c.lastSeen.getTime() === windowStart.getTime()) continue; // active this window
      contacts.delete(c.callsign);
    }
  }

  return contacts;
}

export const MSG_TYPE_LABEL: Record<MsgType, string> = {
  cq:       'CQ',
  answer:   'ANS',
  report:   'RPT',
  r_report: 'R+RPT',
  rrr:      'RRR',
  rr73:     'RR73',
  tx73:     '73',
  other:    '?',
};

// One fixed color per message type so classifier tags read the same in every log
export const MSG_TYPE_COLOR: Record<MsgType, string> = {
  cq:       '#2ea043', // green — calling
  answer:   '#79c0ff', // blue — grid answer
  report:   '#e3b341', // yellow — signal report
  r_report: '#f0883e', // orange — roger + report
  rrr:      '#d2a8ff', // lilac — roger roger
  rr73:     '#bc8cff', // purple — rogers + 73
  tx73:     '#ff7b72', // red — sign-off
  other:    '#8b949e', // grey — unclassified
};

// ── Message builder ───────────────────────────────────────────────────────────
// Produces valid FT8/FT4 message strings for transmission.

export type TxMsgType = 'cq' | 'answer' | 'report' | 'r_report' | 'rr73' | 'tx73';

export function buildFTMessage(
  type: TxMsgType,
  myCall: string,
  theirCall = '',
  reportDb?: number,
  myGrid = '',
): string {
  const rpt = reportDb !== undefined
    ? (reportDb >= 0 ? `+${String(reportDb).padStart(2, '0')}` : `-${String(Math.abs(reportDb)).padStart(2, '0')}`)
    : '+00';
  switch (type) {
    case 'cq':       return myGrid ? `CQ ${myCall} ${myGrid}` : `CQ ${myCall}`;
    case 'answer':   return myGrid ? `${theirCall} ${myCall} ${myGrid}` : `${theirCall} ${myCall}`;
    case 'report':   return `${theirCall} ${myCall} ${rpt}`;
    case 'r_report': return `${theirCall} ${myCall} R${rpt}`;
    case 'rr73':     return `${theirCall} ${myCall} RR73`;
    case 'tx73':     return `${theirCall} ${myCall} 73`;
  }
}

// Derive the natural next message type given the last message we sent and the
// last message received from that station.
// Rules follow the standard FT8 QSO flow:
//   CQ → (they answer) → report → (they r_report) → rr73 → tx73
//   (we answer their CQ) → answer → (they report) → r_report → (they rr73) → tx73
// RR73 / r_report / tx73 are all treated as equivalent closing messages.
// We always close with RR73 — it confirms receipt AND signs off in one transmission.
const CLOSING: ReadonlySet<MsgType> = new Set(['r_report', 'rrr', 'rr73', 'tx73']);

export function nextTxMsgType(lastSent: MsgType | null, lastRx: MsgType | null): TxMsgType {
  if (!lastSent) return 'cq';

  // We sent CQ — reply with report once they answer (or retry report)
  if (lastSent === 'cq') return lastRx === 'answer' ? 'report' : 'report';

  // We answered their CQ — reply with r_report once they report to us (or retry answer)
  if (lastSent === 'answer') return (lastRx === 'report' || lastRx === 'r_report') ? 'r_report' : 'answer';

  // We sent a report — close with RR73 (they confirmed with r_report/rrr or we retry)
  if (lastSent === 'report') return 'rr73';

  // We sent r_report — close with RR73 unless already done
  if (lastSent === 'r_report') return CLOSING.has(lastRx!) ? 'cq' : 'rr73';

  // We sent RR73 or any other closing — QSO complete
  if (CLOSING.has(lastSent)) return 'cq';

  return 'cq';
}

// ── ADIF export / import ──────────────────────────────────────────────────────

const APP_URL = 'https://acesso.github.io/Signal-Decoder/';

function adifDate(d: Date): string {
  return d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
}
function adifTime(d: Date): string {
  return String(d.getUTCHours()).padStart(2, '0') +
    String(d.getUTCMinutes()).padStart(2, '0') +
    String(d.getUTCSeconds()).padStart(2, '0');
}
const af = (name: string, value: string) => `<${name}:${value.length}>${value}`;

// ADIF 3.1.7: FT8 is its own primary MODE; FT4 is a SUBMODE of MFSK.
function adifMode(ftMode: FTMode): [string, string][] {
  if (ftMode === 'FT8') return [['MODE', 'FT8']];
  if (ftMode === 'FT4') return [['MODE', 'MFSK'], ['SUBMODE', 'FT4']];
  return [['MODE', ftMode]];
}

// ADIF 3.1.7 BAND enumeration — maps frequency in MHz to band name.
// Ranges are inclusive lower bound, exclusive upper bound.
const BAND_RANGES: [number, number, string][] = [
  [0.1357,  0.1378,  '2190m'],
  [0.472,   0.479,   '630m'],
  [0.501,   0.504,   '560m'],
  [1.8,     2.0,     '160m'],
  [3.5,     4.0,     '80m'],
  [5.06,    5.45,    '60m'],
  [7.0,     7.3,     '40m'],
  [10.1,    10.15,   '30m'],
  [14.0,    14.35,   '20m'],
  [18.068,  18.168,  '17m'],
  [21.0,    21.45,   '15m'],
  [24.890,  24.99,   '12m'],
  [28.0,    29.7,    '10m'],
  [50.0,    54.0,    '6m'],
  [70.0,    71.0,    '4m'],
  [144.0,   148.0,   '2m'],
  [222.0,   225.0,   '1.25m'],
  [420.0,   450.0,   '70cm'],
  [902.0,   928.0,   '33cm'],
  [1240.0,  1300.0,  '23cm'],
  [2300.0,  2450.0,  '13cm'],
  [3300.0,  3500.0,  '9cm'],
  [5650.0,  5925.0,  '6cm'],
  [10000.0, 10500.0, '3cm'],
  [24000.0, 24050.0, '1.25cm'],
  [47000.0, 47200.0, '6mm'],
  [75500.0, 81000.0, '4mm'],
];

export function freqMhzToBand(mhz: number): string | undefined {
  for (const [lo, hi, band] of BAND_RANGES) {
    if (mhz >= lo && mhz < hi) return band;
  }
  return undefined;
}

export interface ADIFOptions {
  myCall?: string;
  myGrid?: string;
  // VFO frequency in Hz — used to derive FREQ and BAND for each contact.
  // Contacts store their audio offset; the absolute freq = vfoHz + audioOffsetHz.
  // If 0 / absent, FREQ and BAND are omitted.
  vfoHz?: number;
}

const REPORT_TYPES: ReadonlySet<MsgType> = new Set(['report', 'r_report']);
const CLOSING_TYPES: ReadonlySet<MsgType> = new Set(['rr73', 'rrr', 'tx73']);
const REOPEN_TYPES:  ReadonlySet<MsgType> = new Set(['cq', 'answer']);

// Segment a contact's messages into discrete QSO exchanges.
// A new segment starts at the first message and restarts whenever a closing
// message (RR73/RRR/73) is followed by a CQ or answer from either side.
function segmentQSOs(msgs: ContactMsg[]): ContactMsg[][] {
  if (msgs.length === 0) return [];
  const sorted = [...msgs].sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());
  const segments: ContactMsg[][] = [];
  let current: ContactMsg[] = [];
  let pendingClose = false;

  for (const m of sorted) {
    if (pendingClose && REOPEN_TYPES.has(m.parsed.type)) {
      if (current.length > 0) segments.push(current);
      current = [];
      pendingClose = false;
    }
    current.push(m);
    if (CLOSING_TYPES.has(m.parsed.type)) pendingClose = true;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

// Returns true if the segment/contact's messages constitute a confirmed two-way QSO.
// Rules:
//   1. Both sides must have transmitted to each other (basic handshake).
//   2. At least one signal report must have been exchanged in either direction:
//      - They sent me a report (they reported my signal), OR
//      - I sent them a report (I reported their signal).
//   This covers all standard FT8 QSO flows regardless of who called CQ.
// Without myCall we cannot determine participation, so all contacts pass through.
function segmentIsConfirmed(msgs: ContactMsg[], me: string): boolean {
  // Messages I transmitted (I am the caller, role='tx' on my contact entry)
  const iSent    = msgs.filter(m => m.role === 'tx' && m.parsed.caller?.toUpperCase() === me);
  // Messages they transmitted to me (they are the caller, callee=me, role='tx' on their entry
  // but stored as role='rx' on my contact because I was addressed)
  const theySent = msgs.filter(m => m.role === 'rx' && m.parsed.callee?.toUpperCase() === me);
  if (iSent.length === 0 || theySent.length === 0) return false;
  const iSentReport    = iSent.some(m => REPORT_TYPES.has(m.parsed.type));
  const theySentReport = theySent.some(m => REPORT_TYPES.has(m.parsed.type));
  return iSentReport || theySentReport;
}

export function isConfirmedQSO(c: Contact, myCall: string): boolean {
  if (!myCall) return true;
  return segmentIsConfirmed(c.msgs, myCall.toUpperCase());
}

function confirmedSegments(c: Contact, me: string): ContactMsg[][] {
  if (!me) return [c.msgs];
  return segmentQSOs(c.msgs).filter(seg => segmentIsConfirmed(seg, me));
}

export function generateADIF(
  contacts: Map<string, Contact>,
  ftMode: FTMode,
  opts: ADIFOptions = {},
): string {
  const { myCall, myGrid, vfoHz = 0 } = opts;
  const now       = new Date();
  const timestamp = `${adifDate(now)} ${adifTime(now)}`;

  const lines: string[] = [
    af('ADIF_VER', '3.1.7'),
    af('PROGRAMID', `Signal Decoder — ${APP_URL}`),
    af('PROGRAMVERSION', '1.0'),
    af('CREATED_TIMESTAMP', timestamp),
    '<EOH>',
    '',
  ];

  const me = (myCall ?? '').toUpperCase();

  for (const c of contacts.values()) {
    // Each confirmed QSO segment with this callsign becomes a separate ADIF record.
    for (const seg of confirmedSegments(c, me)) {
      // Messages I transmitted: role='tx' on my contact, I am the caller
      const iSentMsgs    = seg.filter(m => m.role === 'tx' && m.parsed.caller?.toUpperCase() === me);
      // Messages they transmitted to me: role='rx' on my contact (I was addressed), they are caller
      const theySentMsgs = seg.filter(m => m.role === 'rx' && m.parsed.callee?.toUpperCase() === me);

      // RST_RCVD = best SNR on signals I received from them (their tx, stored as my rx)
      const bestSnrRcvd = theySentMsgs.reduce((best, m) => m.snr > best ? m.snr : best, -99);
      // RST_SENT = the report value I sent them (in my tx messages of type report/r_report)
      const reportedSnr = iSentMsgs
        .filter(m => REPORT_TYPES.has(m.parsed.type))
        .map(m => m.parsed.report)
        .filter((v): v is number => v !== undefined);
      const bestSnrSent = reportedSnr.length > 0
        ? reportedSnr.reduce((a, b) => a > b ? a : b)
        : undefined;

      // QSO start = first exchange message in this segment
      const allExchange = [...iSentMsgs, ...theySentMsgs].sort(
        (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
      );
      const qsoStart = allExchange[0]?.windowStart ?? c.firstSeen;

      const firstMsg = allExchange[0];
      const absHz = firstMsg
        ? (firstMsg.freq > 1_000_000 ? firstMsg.freq : (vfoHz > 0 ? vfoHz + firstMsg.freq : 0))
        : (vfoHz > 0 ? vfoHz : 0);
      const freqMhz = absHz > 0 ? absHz / 1_000_000 : 0;
      const band    = freqMhz > 0 ? freqMhzToBand(freqMhz) : undefined;

      const fields: [string, string][] = [
        ['CALL',     c.callsign],
        ...adifMode(ftMode),
        ['QSO_DATE', adifDate(qsoStart)],
        ['TIME_ON',  adifTime(qsoStart)],
      ];

      if (band)       fields.push(['BAND',           band]);
      if (freqMhz > 0) fields.push(['FREQ',          freqMhz.toFixed(6)]);
      if (c.grid)     fields.push(['GRIDSQUARE',      c.grid]);
      fields.push(['RST_RCVD', `${bestSnrRcvd >= 0 ? '+' : ''}${bestSnrRcvd}`]);
      if (bestSnrSent !== undefined)
        fields.push(['RST_SENT', `${bestSnrSent >= 0 ? '+' : ''}${bestSnrSent}`]);
      if (myCall)     fields.push(['STATION_CALLSIGN', me]);
      if (myGrid)     fields.push(['MY_GRIDSQUARE',    myGrid.toUpperCase()]);
      fields.push(['COMMENT', `FT8 QSO: ${iSentMsgs.length} sent, ${theySentMsgs.length} rcvd`]);

      lines.push(fields.map(([k, v]) => af(k, v)).join(' ') + ' <EOR>');
    }
  }

  return lines.join('\n') + '\n';
}

// ── ADIF import ───────────────────────────────────────────────────────────────

export interface ADIFRecord {
  call: string;
  qsoDate?: string;   // YYYYMMDD
  timeOn?: string;    // HHMMSS
  mode?: string;
  gridsquare?: string;
  rstRcvd?: string;
  comment?: string;
}

function parseADIFValue(text: string, fieldName: string): string | undefined {
  const re = new RegExp(`<${fieldName}:(\\d+)(?::[^>]*)?>`, 'i');
  const m  = re.exec(text);
  if (!m) return undefined;
  const len   = parseInt(m[1], 10);
  const start = m.index + m[0].length;
  return text.slice(start, start + len);
}

export function parseADIF(content: string): ADIFRecord[] {
  // Split on <EOR> (end of record), case-insensitive
  const rawRecords = content.split(/<EOR>/i).map(s => s.trim()).filter(Boolean);
  const records: ADIFRecord[] = [];

  for (const raw of rawRecords) {
    // Skip header block (before <EOH>)
    if (/<EOH>/i.test(raw)) continue;
    const call = parseADIFValue(raw, 'CALL');
    if (!call || !isValidCallsign(call.trim().toUpperCase())) continue;
    records.push({
      call:        call.trim().toUpperCase(),
      qsoDate:     parseADIFValue(raw, 'QSO_DATE'),
      timeOn:      parseADIFValue(raw, 'TIME_ON'),
      mode:        parseADIFValue(raw, 'MODE'),
      gridsquare:  parseADIFValue(raw, 'GRIDSQUARE'),
      rstRcvd:     parseADIFValue(raw, 'RST_RCVD'),
      comment:     parseADIFValue(raw, 'COMMENT'),
    });
  }

  // Deduplicate by callsign — keep first occurrence
  const seen = new Set<string>();
  return records.filter(r => { if (seen.has(r.call)) return false; seen.add(r.call); return true; });
}
