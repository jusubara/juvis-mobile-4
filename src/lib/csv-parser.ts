import { LogbookEntry, generateId } from './database';

export interface ParseResult {
  entries: LogbookEntry[];
  errors: string[];
  headers: string[];
}

// ─── CSV line parser (handles quoted fields) ──────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Normalize header: strip whitespace/newlines + lowercase for case-insensitive matching
const normalizeHdr = (h: string) =>
  h.replace(/[\r\n\s]+/g, '').toLowerCase().trim();

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
  't/o':                  'to_d',          // 'T/O' takeoff → day takeoff
  'ldg':                  'ld_d',          // 'LDG' landing → day landing
  'out(utc)':             'ramp_out',      // 'OUT(UTC)'
  'in(utc)':              'ramp_in',       // 'IN(UTC)'
  'crews':                'remark',        // 'CREWS' Korean crew name → remark
  // ── logbook2 web export headers ───────────────────────────────────────────
  'co-pilot':             'cop',           // 'CO-PILOT'
  'apptype':              'app_type',      // 'APP TYPE' after space removal
  'today':                'to_d',          // 'TO DAY' after space removal
  'tonight':              'to_n',          // 'TO NIGHT' after space removal
  'ldday':                'ld_d',          // 'LD DAY' after space removal
  'ldnight':              'ld_n',          // 'LD NIGHT' after space removal
  'remarks':              'remark',        // old JUVIS / logbook2 uses 'REMARKS'
};

// ─── Unified csvToEntries ─────────────────────────────────────────────────────
// Handles: JUVIS mobile export, logbook2 web export, FlightLog external format

export function csvToEntries(csvText: string): ParseResult {
  // Strip BOM if present
  const raw = csvText.replace(/^\uFEFF/, '');
  const lines = raw.trim().split('\n');

  if (lines.length < 2) {
    return { entries: [], errors: ['CSV 파일이 비어 있거나 헤더만 있습니다.'], headers: [] };
  }

  // Parse header row: strip quotes and normalise
  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map((h) => h.replace(/"/g, '').trim());
  // headerMap: normalised-lowercase-header → column index
  const headerMap = new Map(headers.map((h, i) => [normalizeHdr(h), i]));

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

  lines.slice(1).filter((l) => l.trim()).forEach((line, index) => {
    try {
      const cols = parseCSVLine(line);
      const entry: Record<string, unknown> = {};

      JUVIS_HEADERS.forEach((h) => {
        const idx = fieldColIdx.get(h as string);
        const val = idx !== undefined ? (cols[idx] ?? '').trim() : '';

        if (h === 'to_d' || h === 'to_n' || h === 'ld_d' || h === 'ld_n') {
          // boolean ('true'/'1'/'*') → SQLite INTEGER
          // FlightLog CSV uses '*' to indicate a takeoff/landing occurred
          entry[h as string] = val === 'true' || val === '1' || val === '*' ? 1 : 0;

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

      // Default crew to empty JSON array if not provided
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
