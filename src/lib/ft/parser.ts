import type { FTMode } from './decoder';

export type MsgType = 'cq' | 'answer' | 'report' | 'r_report' | 'rrr' | 'rr73' | 'tx73' | 'other';

export interface ParsedFTMsg {
  type: MsgType;
  caller: string;
  callee?: string;
  grid?: string;    // Maidenhead grid — belongs to the caller (the transmitting station)
  report?: number;  // signal report in dB
  raw: string;
}

const CS   = '[A-Z0-9]{1,3}[0-9][A-Z]{1,4}(?:/[A-Z0-9]+)?';
// "RR73" is lexically a valid Maidenhead square but is reserved as a QSO
// sign-off message and must never be read as a locator (same as WSJT-X)
const GRID = '(?!RR73)[A-R]{2}[0-9]{2}';
const RPT  = '([+-][0-9]{2})';

const RE: Record<string, RegExp> = {
  cq_grid:   new RegExp(`^CQ(?:\\s+[A-Z]{1,4})?\\s+(${CS})\\s+(${GRID})$`),
  cq:        new RegExp(`^CQ(?:\\s+[A-Z]{1,4})?\\s+(${CS})$`),
  answer:    new RegExp(`^(${CS})\\s+(${CS})\\s+(${GRID})$`),
  r_report:  new RegExp(`^(${CS})\\s+(${CS})\\s+R${RPT}$`),
  report:    new RegExp(`^(${CS})\\s+(${CS})\\s+${RPT}$`),
  rr73:      new RegExp(`^(${CS})\\s+(${CS})\\s+RR73$`),
  rrr:       new RegExp(`^(${CS})\\s+(${CS})\\s+RRR$`),
  tx73:      new RegExp(`^(${CS})\\s+(${CS})\\s+73$`),
};

export function parseFTMsg(raw: string): ParsedFTMsg {
  let m: RegExpMatchArray | null;
  if ((m = raw.match(RE.cq_grid)))  return { type: 'cq',      caller: m[1], grid: m[2], raw };
  if ((m = raw.match(RE.cq)))       return { type: 'cq',      caller: m[1], raw };
  // Sign-off / roger messages before "answer" so RR73 etc. never read as grids
  if ((m = raw.match(RE.rr73)))     return { type: 'rr73',    caller: m[1], callee: m[2], raw };
  if ((m = raw.match(RE.rrr)))      return { type: 'rrr',     caller: m[1], callee: m[2], raw };
  if ((m = raw.match(RE.tx73)))     return { type: 'tx73',    caller: m[1], callee: m[2], raw };
  if ((m = raw.match(RE.answer)))   return { type: 'answer',  caller: m[1], callee: m[2], grid: m[3], raw };
  if ((m = raw.match(RE.r_report))) return { type: 'r_report',caller: m[1], callee: m[2], report: parseInt(m[3]), raw };
  if ((m = raw.match(RE.report)))   return { type: 'report',  caller: m[1], callee: m[2], report: parseInt(m[3]), raw };
  const parts = raw.trim().split(/\s+/);
  return { type: 'other', caller: parts[0] ?? raw, raw };
}

const CS_EXACT = new RegExp(`^${CS}$`);

// "<...>" hashed-callsign placeholders and the literal "CQ" are not callsigns
export function isValidCallsign(cs: string | undefined): cs is string {
  if (!cs) return false;
  if (cs === 'CQ' || cs.includes('<') || cs.includes('>')) return false;
  return CS_EXACT.test(cs);
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
  grid?: string;
  latLon?: [number, number];
  color: string;
  msgs: ContactMsg[];
  peers: Set<string>;
  firstSeen: Date;
  lastSeen: Date;
}

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
    // Require ≥3 readable words ("<...>" placeholders don't count) — anything
    // shorter is a partial/garbled decode not worth tracking as a contact
    const readable = raw.trim().split(/\s+/).filter(w => !w.includes('<') && !w.includes('>'));
    if (readable.length < 3) continue;

    const parsed      = parseFTMsg(raw);
    const callerValid = isValidCallsign(parsed.caller);
    const calleeValid = isValidCallsign(parsed.callee);
    if (!callerValid && !calleeValid) continue;

    if (callerValid) {
      const caller = getOrCreate(parsed.caller);
      // Record this transmission for the sender
      caller.msgs.push({ windowStart, raw, parsed, freq, snr, role: 'tx' });
      caller.lastSeen = windowStart;

      if (parsed.grid && !caller.grid) {
        caller.grid   = parsed.grid;
        caller.latLon = gridToLatLon(parsed.grid) ?? undefined;
      }
      if (calleeValid) caller.peers.add(parsed.callee!);
    }

    if (calleeValid) {
      const callee = getOrCreate(parsed.callee!);
      if (callerValid) callee.peers.add(parsed.caller);
      // Record this message in the callee's history too — they participated as the addressee
      callee.msgs.push({ windowStart, raw, parsed, freq, snr, role: 'rx' });
      callee.lastSeen = windowStart;
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

// ── ADIF export ───────────────────────────────────────────────────────────────

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

export function generateADIF(contacts: Map<string, Contact>, ftMode: FTMode): string {
  const now       = new Date();
  const timestamp = `${adifDate(now)} ${adifTime(now)}`; // 15 chars

  const lines: string[] = [
    af('ADIF_VER', '3.0'),
    af('PROGRAMID', 'rtty-decoder'),
    af('CREATED_TIMESTAMP', timestamp),
    '<EOH>',
    '',
  ];

  for (const c of contacts.values()) {
    const txMsgs = c.msgs.filter(m => m.role === 'tx');
    const rxMsgs = c.msgs.filter(m => m.role === 'rx');
    const bestSnr = txMsgs.length > 0
      ? Math.max(...txMsgs.map(m => m.snr))
      : undefined;

    const fields: [string, string][] = [
      ['CALL',      c.callsign],
      ['MODE',      ftMode],
      ['QSO_DATE',  adifDate(c.firstSeen)],
      ['TIME_ON',   adifTime(c.firstSeen)],
    ];

    if (c.grid)            fields.push(['GRIDSQUARE', c.grid]);
    if (bestSnr !== undefined) fields.push(['RST_RCVD', String(bestSnr)]);

    const comment = txMsgs.length > 0
      ? `heard direct: ${txMsgs.length} tx; addressed: ${rxMsgs.length} rx`
      : `callsign seen as addressee only; ${rxMsgs.length} msgs`;
    fields.push(['COMMENT', comment]);

    lines.push(fields.map(([k, v]) => af(k, v)).join(' ') + ' <EOR>');
  }

  return lines.join('\n') + '\n';
}
