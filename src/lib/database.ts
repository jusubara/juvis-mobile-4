import * as SQLite from 'expo-sqlite';

export interface LogbookEntry {
  id: string;
  date: string;
  ac_type: string;
  ac_ident: string;
  flt_no: string;
  from_apt: string;
  to_apt: string;
  pic: string;
  picus: string;
  cop: string;
  ip: string;
  tr: string;
  block: string;
  night: string;
  inst: string;
  app_type: string;
  to_d: number;
  to_n: number;
  ld_d: number;
  ld_n: number;
  remark: string;
  crew: string; // JSON: [{name: string, duty: string}]
  ramp_out: string;
  ramp_in: string;
  sort_order: number;
  created_at: string;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS logbook (
    id TEXT PRIMARY KEY,
    date TEXT,
    ac_type TEXT,
    ac_ident TEXT,
    flt_no TEXT,
    from_apt TEXT,
    to_apt TEXT,
    pic TEXT,
    picus TEXT,
    cop TEXT,
    ip TEXT,
    tr TEXT,
    block TEXT,
    night TEXT,
    inst TEXT,
    app_type TEXT,
    to_d INTEGER DEFAULT 0,
    to_n INTEGER DEFAULT 0,
    ld_d INTEGER DEFAULT 0,
    ld_n INTEGER DEFAULT 0,
    remark TEXT,
    crew TEXT DEFAULT '',
    ramp_out TEXT,
    ramp_in TEXT,
    sort_order INTEGER,
    created_at TEXT
  );
`;

const CREATE_FLT_ROUTE_SQL = `
  CREATE TABLE IF NOT EXISTS flt_route_db (
    flt_no TEXT PRIMARY KEY,
    from_apt TEXT,
    to_apt TEXT,
    count INTEGER DEFAULT 1
  );
`;

const CREATE_MIGRATIONS_SQL = `
  CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    run_at TEXT NOT NULL
  );
`;

const CREATE_APP_SETTINGS_SQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// Promise-based singleton: 동시 다발적 getDatabase() 호출이 와도
// openDatabaseAsync는 단 한 번만 실행됨 (Android GC 레이스 컨디션 방지)
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function _initDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('logbook.db');
  await db.execAsync(CREATE_TABLE_SQL);
  await db.execAsync(CREATE_FLT_ROUTE_SQL);
  await db.execAsync(CREATE_MIGRATIONS_SQL);
  await db.execAsync(CREATE_APP_SETTINGS_SQL);
  // Migration: add crew column for existing DBs
  try {
    await db.execAsync(`ALTER TABLE logbook ADD COLUMN crew TEXT DEFAULT ''`);
  } catch {
    // Column already exists — ignore
  }
  // Migration: add sort_order column for existing DBs
  try {
    await db.execAsync(`ALTER TABLE logbook ADD COLUMN sort_order INTEGER`);
  } catch {
    // Column already exists — ignore
  }
  return db;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = _initDatabase();
  }
  return _dbPromise;
}

// ─── One-time migration: reverse sort_order within each date group ─────────────
// Old JUVIS web exports were in date-DESC order (newest row first), so the
// initial import assigned sort_order 1 to the LAST flight of the day.
// This migration inverts sort_orders within each date so the first CSV row
// (chronologically earliest) gets the smallest sort_order.
// Guard: runs once, result recorded in `migrations` table.

export async function runMigrationReverseSortOrderIfNeeded(): Promise<void> {
  const db = await getDatabase();

  // Check if already done
  const done = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM migrations WHERE name = 'reverse_sort_order_v1'"
  );
  if (done.length > 0) {
    console.log('[Migration] reverse_sort_order_v1 already ran — skipping');
    return;
  }

  console.log('[Migration] running reverse_sort_order_v1...');

  const rows = await db.getAllAsync<{ id: string; date: string; sort_order: number }>(
    'SELECT id, date, sort_order FROM logbook ORDER BY date ASC, sort_order ASC'
  );

  if (rows.length === 0) {
    await db.runAsync(
      "INSERT INTO migrations (name, run_at) VALUES ('reverse_sort_order_v1', ?)",
      [new Date().toISOString()]
    );
    console.log('[Migration] reverse_sort_order_v1 done (no rows)');
    return;
  }

  // Group by date
  const byDate = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }

  // Build updates: within each date, swap sort_orders so first row gets smallest value
  const updates: { id: string; sort_order: number }[] = [];
  for (const group of byDate.values()) {
    if (group.length <= 1) continue;
    const sortOrders = group.map((r) => r.sort_order);
    group.forEach((r, i) => {
      const newSo = sortOrders[sortOrders.length - 1 - i]; // mirror position
      if (newSo !== r.sort_order) updates.push({ id: r.id, sort_order: newSo });
    });
  }

  console.log('[Migration] reverse_sort_order_v1 updating', updates.length, 'rows');

  await db.withTransactionAsync(async () => {
    for (const u of updates) {
      await db.runAsync('UPDATE logbook SET sort_order = ? WHERE id = ?', [u.sort_order, u.id]);
    }
    await db.runAsync(
      "INSERT INTO migrations (name, run_at) VALUES ('reverse_sort_order_v1', ?)",
      [new Date().toISOString()]
    );
  });

  console.log('[Migration] reverse_sort_order_v1 complete');
}

// ─── One-time migration: reassign sort_order globally (no per-year reset) ─────
// Old imports assigned sort_order 1..N per year, causing duplicates across years.
// This migration sorts all entries by date ASC + sort_order ASC, then reassigns
// sort_order = 1, 2, 3, ... globally so they're unique and continuous.

export async function runMigrationFixSortOrderGlobalIfNeeded(): Promise<void> {
  const db = await getDatabase();

  const done = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM migrations WHERE name = 'fix_sort_order_global_v1'"
  );
  if (done.length > 0) {
    console.log('[Migration] fix_sort_order_global_v1 already ran — skipping');
    return;
  }

  console.log('[Migration] running fix_sort_order_global_v1...');

  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM logbook ORDER BY date ASC, sort_order ASC'
  );

  if (rows.length === 0) {
    await db.runAsync(
      "INSERT INTO migrations (name, run_at) VALUES ('fix_sort_order_global_v1', ?)",
      [new Date().toISOString()]
    );
    console.log('[Migration] fix_sort_order_global_v1 done (no rows)');
    return;
  }

  await db.withTransactionAsync(async () => {
    for (let i = 0; i < rows.length; i++) {
      await db.runAsync('UPDATE logbook SET sort_order = ? WHERE id = ?', [i + 1, rows[i].id]);
    }
    await db.runAsync(
      "INSERT INTO migrations (name, run_at) VALUES ('fix_sort_order_global_v1', ?)",
      [new Date().toISOString()]
    );
  });

  console.log('[Migration] fix_sort_order_global_v1 complete —', rows.length, 'rows renumbered');
}

export async function getAllEntries(): Promise<LogbookEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<LogbookEntry>(
    'SELECT * FROM logbook ORDER BY sort_order ASC'
  );
}

export async function getNextSortOrder(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getAllAsync<{ max_so: number | null }>(
    'SELECT MAX(sort_order) AS max_so FROM logbook'
  );
  return (result[0]?.max_so ?? 0) + 1;
}

export async function getEntriesByMonth(
  year: string,
  month: string
): Promise<LogbookEntry[]> {
  const db = await getDatabase();
  const prefix = `${year}-${month.padStart(2, '0')}`;
  return db.getAllAsync<LogbookEntry>(
    'SELECT * FROM logbook WHERE date LIKE ? ORDER BY date ASC, sort_order DESC',
    [`${prefix}%`]
  );
}

export async function getDistinctIdents(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ ac_ident: string }>(
    "SELECT DISTINCT ac_ident FROM logbook WHERE ac_ident IS NOT NULL AND ac_ident != '' ORDER BY ac_ident"
  );
  return rows.map((r) => r.ac_ident);
}

export async function insertEntry(entry: LogbookEntry): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO logbook
      (id, date, ac_type, ac_ident, flt_no, from_apt, to_apt,
       pic, picus, cop, ip, tr, block, night, inst, app_type,
       to_d, to_n, ld_d, ld_n, remark, crew, ramp_out, ramp_in,
       sort_order, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      entry.id   ?? null, entry.date ?? null,
      entry.ac_type  ?? null, entry.ac_ident ?? null, entry.flt_no   ?? null,
      entry.from_apt ?? null, entry.to_apt   ?? null,
      entry.pic   ?? null, entry.picus ?? null, entry.cop ?? null,
      entry.ip    ?? null, entry.tr    ?? null,
      entry.block ?? null, entry.night ?? null, entry.inst ?? null,
      entry.app_type ?? null,
      entry.to_d  ?? 0, entry.to_n ?? 0, entry.ld_d ?? 0, entry.ld_n ?? 0,
      entry.remark   ?? null, entry.crew     ?? null,
      entry.ramp_out ?? null, entry.ramp_in  ?? null,
      entry.sort_order ?? null, entry.created_at ?? null,
    ]
  );
}

export async function insertEntries(entries: LogbookEntry[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await db.runAsync(
        `INSERT OR REPLACE INTO logbook
          (id, date, ac_type, ac_ident, flt_no, from_apt, to_apt,
           pic, picus, cop, ip, tr, block, night, inst, app_type,
           to_d, to_n, ld_d, ld_n, remark, crew, ramp_out, ramp_in,
           sort_order, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          entry.id   ?? null, entry.date ?? null,
          entry.ac_type  ?? null, entry.ac_ident ?? null, entry.flt_no   ?? null,
          entry.from_apt ?? null, entry.to_apt   ?? null,
          entry.pic   ?? null, entry.picus ?? null, entry.cop ?? null,
          entry.ip    ?? null, entry.tr    ?? null,
          entry.block ?? null, entry.night ?? null, entry.inst ?? null,
          entry.app_type ?? null,
          entry.to_d  ?? 0, entry.to_n ?? 0, entry.ld_d ?? 0, entry.ld_n ?? 0,
          entry.remark   ?? null, entry.crew     ?? null,
          entry.ramp_out ?? null, entry.ramp_in  ?? null,
          entry.sort_order ?? null, entry.created_at ?? null,
        ]
      );
    }
  });
}

// ─── Merge-import helpers ─────────────────────────────────────────────────────

export interface DuplicateEntry {
  incoming: LogbookEntry;
  existingId: string;
  existingDate: string;  // DB에 저장된 날짜 (±1일 매칭 시 표시용)
  dateDiff: number;      // 0 = 정확 일치, ±1 = 하루 차이 (UTC/KST 표기 차이)
}

export interface MergeImportResult {
  inserted: number;
  updated: number;
}

// ─── 중복 판단 헬퍼 ───────────────────────────────────────────────────────────
//
// 규칙: 편명 + 블록타임이 정확히 일치하고, 날짜 차이가 ±1일 이내이면 동일 기록.
// - block이 다르면 별개 기록으로 처리 (램프리턴 재출발 시나리오).
// - 날짜 ±1일 허용: UTC/KST 표기 차이 (예: UTC 23:30 출발 → UTC 7/9 vs KST 7/10).

function normalizeFlt(f: string | null | undefined): string {
  return (f ?? '').trim();
}

function normalizeBlock(b: string | null | undefined): string {
  const raw = (b ?? '').trim();
  const mins = parseTimeToMinutes(raw);
  return mins > 0 ? minutesToTimeStr(mins) : raw;
}

function normalizeDate(d: string | null | undefined): string {
  return (d ?? '').trim().replace(/\//g, '-');
}

/** YYYY-MM-DD 두 날짜의 차이(일). b - a 순서. 파싱 실패 시 999 반환. */
function dateDiffDays(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 999;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export async function classifyImportEntries(
  incoming: LogbookEntry[]
): Promise<{ newEntries: LogbookEntry[]; duplicates: DuplicateEntry[] }> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; date: string; flt_no: string | null; block: string | null }>(
    'SELECT id, date, flt_no, block FROM logbook'
  );

  // Phase 1 map: "date|flt|block" → {id, date}  (정확 일치)
  const exactMap = new Map<string, { id: string; date: string }>();
  // Phase 2 map: "flt|block" → [{id, date}]  (날짜 퍼지 매칭용)
  const fltBlockMap = new Map<string, { id: string; date: string }[]>();

  for (const row of rows) {
    const d = normalizeDate(row.date);
    const f = normalizeFlt(row.flt_no);
    const b = normalizeBlock(row.block);
    exactMap.set(`${d}|${f}|${b}`, { id: row.id, date: d });
    const fb = `${f}|${b}`;
    if (!fltBlockMap.has(fb)) fltBlockMap.set(fb, []);
    fltBlockMap.get(fb)!.push({ id: row.id, date: d });
  }

  const newEntries: LogbookEntry[] = [];
  const duplicates: DuplicateEntry[] = [];

  for (const entry of incoming) {
    const d = normalizeDate(entry.date);
    const f = normalizeFlt(entry.flt_no);
    const b = normalizeBlock(entry.block);

    // Phase 1: 날짜까지 정확 일치
    const exactHit = exactMap.get(`${d}|${f}|${b}`);
    if (exactHit) {
      duplicates.push({ incoming: entry, existingId: exactHit.id, existingDate: exactHit.date, dateDiff: 0 });
      continue;
    }

    // Phase 2: 편명+블록 일치 + 날짜 ±1일 (UTC/KST 표기 차이 허용)
    const candidates = fltBlockMap.get(`${f}|${b}`) ?? [];
    let best: { id: string; date: string; diff: number } | null = null;
    for (const cand of candidates) {
      const diff = dateDiffDays(cand.date, d); // incoming - existing
      if (Math.abs(diff) === 1) {
        // ±1일 후보 중 가장 가까운 것 선택 (복수 후보는 드물지만 방어)
        if (!best || Math.abs(diff) < Math.abs(best.diff)) {
          best = { id: cand.id, date: cand.date, diff };
        }
      }
    }

    if (best) {
      console.log(`[Import] ±1일 매칭: ${best.date} ↔ ${d} | ${f} | ${b} (diff=${best.diff})`);
      duplicates.push({ incoming: entry, existingId: best.id, existingDate: best.date, dateDiff: best.diff });
    } else {
      newEntries.push(entry);
    }
  }

  console.log(`[Import] classify — new: ${newEntries.length}, duplicates: ${duplicates.length}`);
  return { newEntries, duplicates };
}

export async function mergeImportEntries(
  newEntries: LogbookEntry[],
  duplicates: DuplicateEntry[],
  overwrite: boolean
): Promise<MergeImportResult> {
  const db = await getDatabase();

  const maxResult = await db.getFirstAsync<{ max_so: number | null }>(
    'SELECT MAX(sort_order) AS max_so FROM logbook'
  );
  let nextSo = (maxResult?.max_so ?? 0) + 1;

  await db.withTransactionAsync(async () => {
    // 신규 항목: 새 ID와 새 sort_order 부여
    for (const entry of newEntries) {
      await db.runAsync(
        `INSERT INTO logbook
          (id, date, ac_type, ac_ident, flt_no, from_apt, to_apt,
           pic, picus, cop, ip, tr, block, night, inst, app_type,
           to_d, to_n, ld_d, ld_n, remark, crew, ramp_out, ramp_in,
           sort_order, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          generateId(), entry.date ?? null,
          entry.ac_type ?? null, entry.ac_ident ?? null, entry.flt_no ?? null,
          entry.from_apt ?? null, entry.to_apt ?? null,
          entry.pic ?? null, entry.picus ?? null, entry.cop ?? null,
          entry.ip ?? null, entry.tr ?? null,
          entry.block ?? null, entry.night ?? null, entry.inst ?? null,
          entry.app_type ?? null,
          entry.to_d ?? 0, entry.to_n ?? 0, entry.ld_d ?? 0, entry.ld_n ?? 0,
          entry.remark ?? null, entry.crew ?? null,
          entry.ramp_out ?? null, entry.ramp_in ?? null,
          nextSo++, entry.created_at ?? null,
        ]
      );
    }

    if (overwrite) {
      // 중복 항목: sort_order 제외 모든 필드를 새 값으로 교체
      for (const dup of duplicates) {
        const e = dup.incoming;
        await db.runAsync(
          `UPDATE logbook SET
            date=?, ac_type=?, ac_ident=?, flt_no=?, from_apt=?, to_apt=?,
            pic=?, picus=?, cop=?, ip=?, tr=?, block=?, night=?, inst=?, app_type=?,
            to_d=?, to_n=?, ld_d=?, ld_n=?, remark=?, crew=?, ramp_out=?, ramp_in=?
           WHERE id=?`,
          [
            e.date ?? null, e.ac_type ?? null, e.ac_ident ?? null, e.flt_no ?? null,
            e.from_apt ?? null, e.to_apt ?? null,
            e.pic ?? null, e.picus ?? null, e.cop ?? null,
            e.ip ?? null, e.tr ?? null,
            e.block ?? null, e.night ?? null, e.inst ?? null,
            e.app_type ?? null,
            e.to_d ?? 0, e.to_n ?? 0, e.ld_d ?? 0, e.ld_n ?? 0,
            e.remark ?? null, e.crew ?? null,
            e.ramp_out ?? null, e.ramp_in ?? null,
            dup.existingId,
          ]
        );
      }
    }
  });

  const result = { inserted: newEntries.length, updated: overwrite ? duplicates.length : 0 };
  console.log(`[Import] merge done — inserted: ${result.inserted}, updated: ${result.updated}`);
  return result;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM logbook WHERE id = ?', [id]);
}

export async function updateEntry(
  id: string,
  changes: Partial<LogbookEntry>
): Promise<void> {
  const db = await getDatabase();
  const fields = Object.keys(changes) as (keyof LogbookEntry)[];
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${String(f)} = ?`).join(', ');
  const values = fields.map((f) => changes[f] ?? null);
  await db.runAsync(`UPDATE logbook SET ${setClause} WHERE id = ?`, [
    ...values,
    id,
  ]);
}

// ─── Time utilities ───────────────────────────────────────────────────────────

// H+MM format, e.g. "1+23"
export function parseTimeToMinutes(t: string): number {
  if (!t) return 0;
  const parts = t.split('+');
  if (parts.length !== 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

export function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}+${m.toString().padStart(2, '0')}`;
}

export function halfTime(t: string): string {
  if (!t) return '';
  return minutesToTimeStr(Math.round(parseTimeToMinutes(t) / 2));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Route lookup ─────────────────────────────────────────────────────────────

export async function lookupRoute(fltNo: string): Promise<{ from_apt: string; to_apt: string } | null> {
  if (!fltNo) return null;
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ from_apt: string; to_apt: string }>(
    'SELECT from_apt, to_apt FROM flt_route_db WHERE flt_no = ? LIMIT 1',
    [fltNo]
  );
  if (rows.length > 0) return rows[0];
  const lb = await db.getAllAsync<{ from_apt: string; to_apt: string }>(
    "SELECT from_apt, to_apt FROM logbook WHERE flt_no = ? AND from_apt IS NOT NULL AND from_apt != '' ORDER BY date DESC LIMIT 1",
    [fltNo]
  );
  return lb.length > 0 ? lb[0] : null;
}

export async function saveRoute(fltNo: string, fromApt: string, toApt: string): Promise<void> {
  if (!fltNo || !fromApt || !toApt) return;
  const db = await getDatabase();
  const existing = await db.getAllAsync<{ count: number }>(
    'SELECT count FROM flt_route_db WHERE flt_no = ? LIMIT 1',
    [fltNo]
  );
  if (existing.length > 0) {
    await db.runAsync(
      'UPDATE flt_route_db SET from_apt = ?, to_apt = ?, count = ? WHERE flt_no = ?',
      [fromApt, toApt, existing[0].count + 1, fltNo]
    );
  } else {
    await db.runAsync(
      'INSERT INTO flt_route_db (flt_no, from_apt, to_apt, count) VALUES (?, ?, ?, 1)',
      [fltNo, fromApt, toApt]
    );
  }
}

// ─── One-time migration: seed flt_route_db from bundled JSON ─────────────────
// Loads assets/flt-route-db.json (exported from Supabase) and inserts all rows
// into the local SQLite flt_route_db table using INSERT OR IGNORE so user-saved
// routes (from saveRoute) are never overwritten.

export async function runMigrationSeedFltRouteDbIfNeeded(): Promise<void> {
  const db = await getDatabase();

  const done = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM migrations WHERE name = 'seed_flt_route_db_v1'"
  );
  if (done.length > 0) {
    console.log('[Migration] seed_flt_route_db_v1 already ran — skipping');
    return;
  }

  console.log('[Migration] seed_flt_route_db_v1 starting...');
  const t0 = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rows: { flt_no: string; from_apt: string; to_apt: string; count: number }[] =
    require('../../assets/flt-route-db.json');

  console.log('[Migration] seed_flt_route_db_v1 rows loaded:', rows.length);

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      if (!row.flt_no) continue;
      await db.runAsync(
        'INSERT OR IGNORE INTO flt_route_db (flt_no, from_apt, to_apt, count) VALUES (?, ?, ?, ?)',
        [row.flt_no, row.from_apt ?? '', row.to_apt ?? '', row.count ?? 1]
      );
    }
    await db.runAsync(
      "INSERT INTO migrations (name, run_at) VALUES ('seed_flt_route_db_v1', ?)",
      [new Date().toISOString()]
    );
  });

  console.log(`[Migration] seed_flt_route_db_v1 done — ${rows.length} rows in ${Date.now() - t0}ms`);
}

// ─── One-time migration: move FlightLog crew names from remark → crew JSON ────
// Existing rows imported from FlightLog CSV have crew names stored in remark
// (e.g. "김민준/F 이수진/CA"). This migration detects that pattern and moves
// the value into the crew JSON field, clearing remark.

// Crew remark 패턴: 한글이름/역할코드 토큰이 하나 이상 있으면 crew 문자열로 판단.
// 구분자는 공백·쉼표 모두 허용. "some" 검사로 부가 텍스트가 섞여도 통과.
function _looksLikeCrewRemark(s: string): boolean {
  if (!s || !s.includes('/')) return false;
  const tokens = s.trim().split(/[\s,]+/).filter(Boolean);
  // 한글 이름(2-5자) + / + 영문 역할코드(1-3자) 패턴이 하나라도 있으면 true
  return tokens.some((t) => /^[\uAC00-\uD7A3]{1,5}\/[A-Za-z]{1,3}$/.test(t));
}

function _parseCrewsValue(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) return '';
  // 공백·쉼표 구분자 모두 지원
  const members = trimmed.split(/[\s,]+/).filter(Boolean).map((item) => {
    const slash = item.indexOf('/');
    return slash > 0
      ? { name: item.slice(0, slash).trim(), duty: item.slice(slash + 1).trim() }
      : { name: item.trim(), duty: '' };
  }).filter((m) => m.name && m.duty); // 이름+역할 모두 있는 것만
  return members.length > 0 ? JSON.stringify(members) : '';
}

export async function runMigrationCrewFromRemarkIfNeeded(): Promise<void> {
  const db = await getDatabase();

  // v2로 버전업 — v1이 0건으로 완료된 경우 재실행 가능하게 함
  const done = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM migrations WHERE name = 'crew_from_remark_v2'"
  );
  if (done.length > 0) return;

  console.log('[Migration] running crew_from_remark_v2...');

  const rows = await db.getAllAsync<{ id: string; crew: string | null; remark: string | null }>(
    "SELECT id, crew, remark FROM logbook WHERE (crew IS NULL OR crew = '') AND remark IS NOT NULL AND remark != ''"
  );

  console.log('[Migration] crew_from_remark_v2 candidates:', rows.length);
  console.log('[Migration] sample remark values:', rows.slice(0, 5).map(r => r.remark));

  const updates: { id: string; crew: string }[] = [];
  for (const row of rows) {
    const remark = row.remark ?? '';
    if (_looksLikeCrewRemark(remark)) {
      const crew = _parseCrewsValue(remark);
      if (crew) updates.push({ id: row.id, crew });
    }
  }

  console.log('[Migration] crew_from_remark_v2 will update:', updates.length, 'rows');

  await db.withTransactionAsync(async () => {
    for (const u of updates) {
      await db.runAsync(
        "UPDATE logbook SET crew = ?, remark = '' WHERE id = ?",
        [u.crew, u.id]
      );
    }
    await db.runAsync(
      "INSERT INTO migrations (name, run_at) VALUES ('crew_from_remark_v2', ?)",
      [new Date().toISOString()]
    );
  });

  console.log('[Migration] crew_from_remark_v2 complete —', updates.length, 'rows updated');
}

export async function updateSortOrders(
  items: { id: string; sort_order: number }[]
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        'UPDATE logbook SET sort_order = ? WHERE id = ?',
        [item.sort_order, item.id]
      );
    }
  });
}

export async function deleteAllEntries(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM logbook');
}

// ─── App Settings (버전 추적 등) ──────────────────────────────────────────────

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`, [key]
  );
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, [key, value]
  );
}

// ─── 샘플 데이터 (Apple 심사 대응용 데모) ────────────────────────────────────
export async function insertSampleData(): Promise<void> {
  const now = new Date().toISOString();
  const samples: LogbookEntry[] = [
    {
      id: 'sample-0001', date: '2026-01-05',
      ac_type: 'B738', ac_ident: 'HL8500', flt_no: '101',
      from_apt: 'ICN', to_apt: 'CJU',
      pic: '1+05', picus: '', cop: '', ip: '', tr: '',
      block: '1+05', night: '', inst: '', app_type: '',
      to_d: 1, to_n: 0, ld_d: 1, ld_n: 0,
      remark: '', crew: JSON.stringify([{ name: '김민준', duty: 'F' }]),
      ramp_out: '', ramp_in: '', sort_order: 1, created_at: now,
    },
    {
      id: 'sample-0002', date: '2026-01-05',
      ac_type: 'B738', ac_ident: 'HL8500', flt_no: '102',
      from_apt: 'CJU', to_apt: 'ICN',
      pic: '1+10', picus: '', cop: '', ip: '', tr: '',
      block: '1+10', night: '', inst: '', app_type: '',
      to_d: 1, to_n: 0, ld_d: 1, ld_n: 0,
      remark: '', crew: JSON.stringify([{ name: '김민준', duty: 'F' }]),
      ramp_out: '', ramp_in: '', sort_order: 2, created_at: now,
    },
    {
      id: 'sample-0003', date: '2026-01-08',
      ac_type: 'B38M', ac_ident: 'HL8600', flt_no: '501',
      from_apt: 'ICN', to_apt: 'NRT',
      pic: '2+15', picus: '', cop: '', ip: '', tr: '',
      block: '2+15', night: '0+40', inst: '', app_type: '',
      to_d: 1, to_n: 0, ld_d: 1, ld_n: 0,
      remark: '', crew: JSON.stringify([{ name: '이서연', duty: 'F' }]),
      ramp_out: '', ramp_in: '', sort_order: 3, created_at: now,
    },
    {
      id: 'sample-0004', date: '2026-01-08',
      ac_type: 'B38M', ac_ident: 'HL8600', flt_no: '502',
      from_apt: 'NRT', to_apt: 'ICN',
      pic: '2+20', picus: '', cop: '', ip: '', tr: '',
      block: '2+20', night: '', inst: '', app_type: '',
      to_d: 1, to_n: 0, ld_d: 1, ld_n: 0,
      remark: '', crew: JSON.stringify([{ name: '이서연', duty: 'F' }]),
      ramp_out: '', ramp_in: '', sort_order: 4, created_at: now,
    },
    {
      id: 'sample-0005', date: '2026-01-10',
      ac_type: 'B738', ac_ident: 'HL8510', flt_no: '205',
      from_apt: 'GMP', to_apt: 'CJU',
      pic: '1+00', picus: '', cop: '', ip: '', tr: '',
      block: '1+00', night: '', inst: '', app_type: '',
      to_d: 1, to_n: 0, ld_d: 1, ld_n: 0,
      remark: '', crew: JSON.stringify([{ name: '박지호', duty: 'F' }]),
      ramp_out: '', ramp_in: '', sort_order: 5, created_at: now,
    },
  ];
  await insertEntries(samples);
}
