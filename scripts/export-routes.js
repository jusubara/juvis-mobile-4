#!/usr/bin/env node
/**
 * export-routes.js
 * Supabase flt_route_db 전체를 조회해 assets/flt-route-db.json으로 저장.
 * 실행: node scripts/export-routes.js
 */

const SUPABASE_URL  = 'https://nzbecoyxkuxaxxyjjfkp.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56YmVjb3l4a3V4YXh4eWpqZmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Nzc5MjksImV4cCI6MjA4OTU1MzkyOX0.Gj0pIFDzooAac1eBr2gBA6mNUiHvtF_8KlH_9X0Dr64';
const OUTPUT_PATH   = './assets/flt-route-db.json';

const fs   = require('fs');
const path = require('path');

async function main() {
  console.log('[export-routes] Fetching flt_route_db from Supabase...');

  let allRows = [];
  let offset  = 0;
  const limit = 1000;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/flt_route_db?select=flt_no,from_apt,to_apt,count&order=count.desc&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey:        SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept:        'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase error ${res.status}: ${text}`);
    }

    const rows = await res.json();
    console.log(`[export-routes] fetched ${rows.length} rows (offset=${offset})`);
    allRows = allRows.concat(rows);

    if (rows.length < limit) break;
    offset += limit;
  }

  console.log(`[export-routes] total rows: ${allRows.length}`);

  // flt_no가 같은 항목은 count가 가장 높은 것 하나만 유지
  const deduped = new Map();
  for (const row of allRows) {
    if (!row.flt_no) continue;
    const key = row.flt_no.toUpperCase();
    const existing = deduped.get(key);
    if (!existing || (row.count ?? 0) > (existing.count ?? 0)) {
      deduped.set(key, {
        flt_no:   key,
        from_apt: row.from_apt ?? '',
        to_apt:   row.to_apt ?? '',
        count:    row.count ?? 1,
      });
    }
  }

  const result = Array.from(deduped.values()).sort((a, b) =>
    a.flt_no.localeCompare(b.flt_no)
  );

  console.log(`[export-routes] deduplicated: ${result.length} unique flt_no entries`);

  const outPath = path.resolve(__dirname, '..', OUTPUT_PATH.replace('./', ''));
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[export-routes] written to: ${outPath}`);
  console.log('[export-routes] done.');
}

main().catch(err => {
  console.error('[export-routes] FAILED:', err.message);
  process.exit(1);
});
