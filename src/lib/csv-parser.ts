import { LogbookEntry, generateId } from './database';

export interface ParseResult {
  entries: LogbookEntry[];
  errors: string[];
  headers: string[];
}

// ─── RFC4180 full-text CSV parser ─────────────────────────────────────────────
// Parses entire text at once so quoted fields containing \r\n are handled correctly.

function parseCSVRecords(text: string): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; }  // escaped quote
        else { inQuotes = false; i++; }                    // end of quoted field
      } else { cell += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { cells.push(cell.trim()); cell = ''; i++; }
      else if (ch === '\r' && text[i + 1] === '\n') {      // CRLF record separator
        cells.push(cell.trim()); cell = '';
        records.push(cells); cells = []; i += 2;
      } else if (ch === '\n' || ch === '\r') {             // LF or bare CR record separator
        cells.push(cell.trim()); cell = '';
        records.push(cells); cells = []; i++;
      } else { cell += ch; i++; }
    }
  }
  // flush last record
  cells.push(cell.trim());
  if (cells.some((c) => c.length > 0)) records.push(cells);

  // skip all-empty records
  return records.filter((r) => r.some((c) => c.length > 0));
}

// Normalize header: strip whitespace/newlines + lowercase for case-insensitive matching
const normalizeHdr = (h: string) =>
  h.replace(/[\r\n\s]+/g, '').toLowerCase().trim();

// Normalize H+MM time string: strip leading zeros from hours ("00+56" → "0+56", "01+23" → "1+23")
function normalizeTimeStr(val: string): string {
  const plus = val.indexOf('+');
  if (plus < 0) return val;
  const h = parseInt(val.slice(0, plus), 10);
  const mStr = val.slice(plus + 1);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return val;
  return `${h}+${String(m).padStart(2, '0')}`;
}

// ─── Field definitions ────────────────────────────────────────────────────────

// Primary lookup: internal LogbookEntry field names (already lowercase)
const JUVIS_HEADERS: (keyof LogbookEntry)[] = [
  'id', 'date', 'ac_type', 'ac_ident', 'flt_no', 'from_apt', 'to_apt',
  'pic', 'picus', 'cop', 'ip', 'tr', 'block', 'night', 'inst',
  'app_type', 'to_d', 'to_n', 'ld_d', 'ld_n',
  'remark', 'crew', 'created_at', 'sort_order', 'ramp_out', 'ramp_in',
];

// Secondary lookup: alternative / human-readable header names
// Keys are normalised with normalizeHdr() before lookup
const EXTERNAL_HEADER_MAP: Record<string, keyof LogbookEntry> = {
  // ── FlightLog / old JUVIS export ──────────────────────────────────────────
  'date(utc)':            'date',
  'date(lcl)':            'date',
  'a/ctype':              'ac_type',       // 'A/C TYPE' after space removal
  'a/cident':             'ac_ident',      // 'A/C IDENT' after space removal
  'fltno.':               'flt_no',        // 'FLT NO.' after space removal
  'from':                 'from_apt',
  'to':                   'to_apt',
  'blocktime(auto)':      'block',
  'nighttime(converted)': 'night',
  'instrumenttime(auto)': 'inst',
  'typeofapproach':       'app_type',
  // ── Company FlightLog CSV (EUC-KR/CP949) column names ────────────────────
  'typecode':             'ac_type',       // 'TYPECODE'
  'acft':                 'ac_ident',      // 'ACFT'
  'fltnr':                'flt_no',        // 'FLTNR'
  'copilot':              'cop',           // 'COPILOT' (no hyphen)
  'trng':                 'tr',            // 'TRNG'
  'b/t':                  'block',         // 'B/T' (block time)
  'instru-ment':          'inst',          // 'INSTRU-MENT'
  't/o':                  'to_d',          // 'T/O' takeoff → day takeoff (old format)
  'ldg':                  'ld_d',          // 'LDG' landing → day landing (old format)
  'dayt/o':               'to_d',          // 'DAY T/O' → day takeoff (new format)
  'n/tt/o':               'to_n',          // 'N/T T/O' → night takeoff (new format)
  'dayldg':               'ld_d',          // 'DAY LDG' → day landing (new format)
  'n/tldg':               'ld_n',          // 'N/T LDG' → night landing (new format)
  'out(utc)':             'ramp_out',      // 'OUT(UTC)'
  'in(utc)':              'ramp_in',       // 'IN(UTC)'
  'crews':                'crew',           // 'CREWS' Korean crew name → crew JSON
  // ── logbook2 web export headers ───────────────────────────────────────────
  'co-pilot':             'cop',           // 'CO-PILOT'
  'apptype':              'app_type',      // 'APP TYPE' after space removal
  'today':                'to_d',          // 'TO DAY' after space removal
  'tonight':              'to_n',          // 'TO NIGHT' after space removal
  'ldday':                'ld_d',          // 'LD DAY' after space removal
  'ldnight':              'ld_n',          // 'LD NIGHT' after space removal
  'remarks':              'remark',        // old JUVIS / logbook2 uses 'REMARKS'
};

// ─── Crew string parser ───────────────────────────────────────────────────────
// Converts FlightLog CREWS column value ("이름/역할 이름/역할 ...") to crew JSON.
// If the value already starts with '[' it is returned as-is (JUVIS self-export).
export function parseCrewsColumnValue(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[')) return trimmed;
  const members = trimmed.split(/\s+/).filter(Boolean).map((item) => {
    const slash = item.indexOf('/');
    return slash > 0
      ? { name: item.slice(0, slash).trim(), duty: item.slice(slash + 1).trim() }
      : { name: item.trim(), duty: '' };
  }).filter((m) => m.name);
  return members.length > 0 ? JSON.stringify(members) : '';
}

// ─── Unified csvToEntries ─────────────────────────────────────────────────────
// Handles: JUVIS mobile export, logbook2 web export, FlightLog external format

export function csvToEntries(csvText: string): ParseResult {
  // Strip BOM if present
  const raw = csvText.replace(/^\uFEFF/, '');
  const records = parseCSVRecords(raw);

  if (records.length < 2) {
    return { entries: [], errors: ['CSV 파일이 비어 있거나 헤더만 있습니다.'], headers: [] };
  }

  // Parse header row
  const rawHeaders = records[0];
  // Human-readable headers: replace newlines with single space for display
  const headers = rawHeaders.map((h) => h.replace(/"/g, '').replace(/[\r\n]+/g, ' ').trim());
  // headerMap: normalised-lowercase-header → column index (normalizeHdr strips all whitespace)
  const headerMap = new Map(rawHeaders.map((h, i) => [normalizeHdr(h), i]));

  // Build field → column index map
  // 1st pass: JUVIS internal field names (which are already lowercase)
  const fieldColIdx = new Map<string, number>();
  JUVIS_HEADERS.forEach((h) => {
    const idx = headerMap.get(h as string); // h is already lowercase
    if (idx !== undefined) fieldColIdx.set(h as string, idx);
  });

  // 2nd pass: external / human-readable header aliases
  Object.entries(EXTERNAL_HEADER_MAP).forEach(([extHeader, field]) => {
    if (!fieldColIdx.has(field as string)) {
      const idx = headerMap.get(normalizeHdr(extHeader));
      if (idx !== undefined) fieldColIdx.set(field as string, idx);
    }
  });

  const entries: LogbookEntry[] = [];
  const errors: string[] = [];

  records.slice(1).forEach((cols, index) => {
    try {
      const entry: Record<string, unknown> = {};

      JUVIS_HEADERS.forEach((h) => {
        const idx = fieldColIdx.get(h as string);
        const val = idx !== undefined ? (cols[idx] ?? '').trim() : '';

        if (h === 'to_d' || h === 'to_n' || h === 'ld_d' || h === 'ld_n') {
          // boolean ('true'/'1'/'*') → SQLite INTEGER
          // FlightLog CSV uses '*' to indicate a takeoff/landing occurred
          entry[h as string] = val === 'true' || val === '1' || val === '*' ? 1 : 0;

        } else if (h === 'block' || h === 'night' || h === 'inst') {
          // Normalize H+MM time: strip leading zeros from hours ("00+56" → "0+56")
          entry[h as string] = normalizeTimeStr(val);

        } else if (h === 'date') {
          if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
            // ISO date: keep as YYYY-MM-DD (SQLite range queries rely on this)
            entry['date'] = val.substring(0, 10);
          } else if (/^\d{1,2}\/\d{1,2}$/.test(val)) {
            // Old JUVIS M/D format → infer year → YYYY-MM-DD
            const [monStr, dayStr] = val.split('/');
            const mon = parseInt(monStr, 10);
            const day = parseInt(dayStr, 10);
            if (mon > 0 && day > 0) {
              const now = new Date();
              const curYear = now.getFullYear();
              const curMonth = now.getMonth() + 1;
              // If month is in the future, assume last year
              const year = mon > curMonth ? curYear - 1 : curYear;
              entry['date'] = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            } else {
              entry['date'] = val;
            }
          } else {
            entry['date'] = val;
          }

        } else if (h === 'sort_order') {
          entry['sort_order'] = parseInt(val, 10) || index + 1;

        } else {
          entry[h as string] = val;
        }
      });

      // FlightLog RTE column: "PUS-FUK" → split to from_apt / to_apt
      const rteIdx = headerMap.get('rte');
      if (rteIdx !== undefined && !entry['from_apt'] && !entry['to_apt']) {
        const rteVal = (cols[rteIdx] ?? '').trim();
        const dash = rteVal.indexOf('-');
        if (dash > 0) {
          entry['from_apt'] = rteVal.slice(0, dash).trim();
          entry['to_apt'] = rteVal.slice(dash + 1).trim();
        }
      }

      // Ensure ID
      if (!entry['id']) {
        entry['id'] = generateId();
      }

      // Infer created_at from date if missing
      if (!entry['created_at']) {
        const dateVal = (entry['date'] as string) || '';
        if (/^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
          entry['created_at'] = `${dateVal.substring(0, 10)}T00:00:00Z`;
        } else {
          entry['created_at'] = new Date().toISOString();
        }
      }

      // If crew field has raw FlightLog "이름/역할" format (not JSON), convert to JSON.
      // Normalize embedded newlines/whitespace to single space first.
      const rawCrew = (entry['crew'] as string) ?? '';
      if (rawCrew && !rawCrew.trim().startsWith('[')) {
        entry['crew'] = parseCrewsColumnValue(rawCrew.replace(/\s+/g, ' '));
      }

      // Fallback: crew가 비어있는데 remark에 "이름/역할" 패턴이 있으면 crew로 이동.
      // JUVIS self-export를 재불러오는 경우(이전에 remark에 잘못 저장된 데이터)를 처리.
      if (!entry['crew'] && entry['remark']) {
        const remarkStr = (entry['remark'] as string).trim();
        const tokens = remarkStr.split(/[\s,]+/).filter(Boolean);
        const looksLikeCrew = tokens.some((t) => /^[\uAC00-\uD7A3]{1,5}\/[A-Za-z]{1,3}$/.test(t));
        if (looksLikeCrew) {
          const crewJson = parseCrewsColumnValue(remarkStr);
          if (crewJson) {
            entry['crew'] = crewJson;
            entry['remark'] = '';
          }
        }
      }

      // Default crew to empty string if not provided
      if (!entry['crew']) {
        entry['crew'] = '';
      }

      // Skip summary/invalid rows (DATE = "SUM", empty, or any non-date value)
      if (!/^\d{4}-\d{2}-\d{2}/.test(entry['date'] as string)) {
        return;
      }

      entries.push(entry as unknown as LogbookEntry);
    } catch (e) {
      errors.push(`Line ${index + 2}: ${String(e)}`);
    }
  });

  // If CSV had no sort_order column, assign sequential order in CSV row order.
  // Do NOT re-sort by date — trust the file's row order so that within the
  // same date the original (chronological) sequence is preserved.
  if (!fieldColIdx.has('sort_order')) {
    entries.forEach((e, i) => { e.sort_order = i + 1; });
  }

  return { entries, errors, headers };
}
