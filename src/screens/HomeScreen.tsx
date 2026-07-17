import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert, ScrollView, PanResponder,
  LayoutAnimation, UIManager, Platform, Image, Animated, InteractionManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

// Enable LayoutAnimation on Android for smooth drag reordering
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Paths, File as EXFile } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { printToFileAsync } from 'expo-print';
import {
  LogbookEntry, getAllEntries, deleteEntry,
  parseTimeToMinutes, minutesToTimeStr, updateSortOrders,
  runMigrationReverseSortOrderIfNeeded,
  runMigrationFixSortOrderGlobalIfNeeded,
} from '../lib/database';


// ─── Brand Colors ──────────────────────────────────────────────────────────────
const RED = '#DC1E28';
const BG = '#FFFFFF';
const CARD_BG = '#F5F5F5';
const BORDER = '#E0E0E0';
const TEXT = '#1A1A1A';
const TEXT_DIM = '#666666';
const TH_BG = '#EDEDE6';
const TF_BG = '#DDE4F0';

// ─── PDF Page size config ─────────────────────────────────────────────────────
const MM_TO_PT = 2.8346;
type PageSizeKey = 'B5' | 'A4' | 'Letter';
const PAGE_SIZES: Record<PageSizeKey, { label: string; mmW: number; mmH: number; defaultRows: number; fixedRows: boolean }> = {
  B5:     { label: 'B5',     mmW: 250, mmH: 176, defaultRows: 12, fixedRows: true  },
  A4:     { label: 'A4',     mmW: 297, mmH: 210, defaultRows: 14, fixedRows: false },
  Letter: { label: 'Letter', mmW: 279, mmH: 216, defaultRows: 15, fixedRows: false },
};
const PDF_ROW_OPTS = [10, 11, 12, 13, 14, 15, 16, 18, 20];

// ─── Table column widths ──────────────────────────────────────────────────────
const COL = {
  drag: 32,
  date: 44, type: 40, ident: 52, flt: 46,
  from: 36, to: 36,
  pic: 42, picus: 42, cop: 42, ip: 36, tr: 36,
  block: 42, night: 36, inst: 36, app: 76,
  tod: 24, ton: 24, ldd: 24, ldn: 24,
  remark: 100,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  block: string; night: string;
  pic: string; picus: string; cop: string; ip: string; tr: string; inst: string;
  toDay: number; toNight: number; ldDay: number; ldNight: number;
  count: number;
}

interface Props {
  onNavigate: (screen: 'import' | 'newEntry' | 'mainMenu') => void;
  onEdit: (entry: LogbookEntry) => void;
  refreshTrigger: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcStats(entries: LogbookEntry[]): Stats {
  let block = 0, night = 0, pic = 0, picus = 0, cop = 0, ip = 0, tr = 0, inst = 0;
  let toDay = 0, toNight = 0, ldDay = 0, ldNight = 0;
  for (const e of entries) {
    block += parseTimeToMinutes(e.block);
    night += parseTimeToMinutes(e.night);
    pic += parseTimeToMinutes(e.pic);
    picus += parseTimeToMinutes(e.picus);
    cop += parseTimeToMinutes(e.cop);
    ip += parseTimeToMinutes(e.ip);
    tr += parseTimeToMinutes(e.tr);
    inst += parseTimeToMinutes(e.inst);
    toDay += e.to_d ? 1 : 0;
    toNight += e.to_n ? 1 : 0;
    ldDay += e.ld_d ? 1 : 0;
    ldNight += e.ld_n ? 1 : 0;
  }
  const fmt = (m: number) => (m > 0 ? minutesToTimeStr(m) : '—');
  return {
    block: fmt(block), night: fmt(night),
    pic: fmt(pic), picus: fmt(picus), cop: fmt(cop), ip: fmt(ip), tr: fmt(tr), inst: fmt(inst),
    toDay, toNight, ldDay, ldNight, count: entries.length,
  };
}

function getStatItems(stats: Stats) {
  return [
    { label: 'PIC',      value: stats.pic     },
    { label: 'PICUS',    value: stats.picus   },
    { label: 'CO-PILOT', value: stats.cop     },
    { label: 'IP',       value: stats.ip      },
    { label: 'TR',       value: stats.tr      },
    { label: 'BLOCK',    value: stats.block   },
    { label: 'NIGHT',    value: stats.night   },
    { label: 'INST',     value: stats.inst    },
    { label: 'TO-D',     value: stats.toDay   > 0 ? String(stats.toDay)   : '' },
    { label: 'TO-N',     value: stats.toNight > 0 ? String(stats.toNight) : '' },
    { label: 'LD-D',     value: stats.ldDay   > 0 ? String(stats.ldDay)   : '' },
    { label: 'LD-N',     value: stats.ldNight > 0 ? String(stats.ldNight) : '' },
  ].filter(item => item.value && item.value !== '—');
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

// Strip leading zero from H+MM display: "02+49" → "2+49", "0+50" → "0+50"
function fmtTime(t: string): string {
  if (!t) return '';
  const m = t.match(/^(\d+)\+(\d{2})$/);
  if (!m) return t;
  return `${parseInt(m[1], 10)}+${m[2]}`;
}

function getYear(e: LogbookEntry): string {
  const y = e.date?.slice(0, 4) ?? '';
  return /^\d{4}$/.test(y) ? y : '';
}
function getMonth(e: LogbookEntry): string { return e.date?.slice(5, 7) ?? ''; }

function parseCrew(crewJson: string): string {
  if (!crewJson) return '';
  try {
    const arr = JSON.parse(crewJson) as { name: string; duty: string }[];
    return arr.filter((c) => c.name).map((c) => `${c.name}${c.duty ? '/' + c.duty : ''}`).join(', ');
  } catch { return ''; }
}

function crewAndRemark(e: LogbookEntry): string {
  return [parseCrew(e.crew ?? ''), e.remark].filter(Boolean).join(' | ');
}

// ─── PDF HTML Generator ───────────────────────────────────────────────────────

function generatePrintHTML(entries: LogbookEntry[], rowsPerPage: number = 12, pageSize: PageSizeKey = 'B5'): string {
  const parseTime = (s: string) => {
    if (!s) return 0;
    const m = s.match(/^(\d+)\+(\d{2})$/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
  };
  const T = (min: number) => min > 0 ? `${Math.floor(min / 60)}+${String(min % 60).padStart(2, '0')}` : '';
  const Nc = (n: number) => n > 0 ? String(n) : '';
  const fD = (iso: string) => {
    if (!iso) return '';
    const p = iso.split('-');
    return p.length >= 3 ? `${parseInt(p[1])}/${parseInt(p[2])}` : '';
  };

  interface PS {
    block: number; night: number; inst: number;
    pic: number; picus: number; cop: number; ip: number; tr: number;
    toD: number; toN: number; ldD: number; ldN: number;
  }
  const emptyPS = (): PS => ({ block:0,night:0,inst:0,pic:0,picus:0,cop:0,ip:0,tr:0,toD:0,toN:0,ldD:0,ldN:0 });
  const addPS = (a: PS, b: PS): PS => ({
    block:a.block+b.block, night:a.night+b.night, inst:a.inst+b.inst,
    pic:a.pic+b.pic, picus:a.picus+b.picus, cop:a.cop+b.cop,
    ip:a.ip+b.ip, tr:a.tr+b.tr,
    toD:a.toD+b.toD, toN:a.toN+b.toN, ldD:a.ldD+b.ldD, ldN:a.ldN+b.ldN,
  });
  const fromEntry = (e: LogbookEntry): PS => ({
    block:parseTime(e.block), night:parseTime(e.night), inst:parseTime(e.inst),
    pic:parseTime(e.pic), picus:parseTime(e.picus), cop:parseTime(e.cop),
    ip:parseTime(e.ip), tr:parseTime(e.tr),
    toD:e.to_d?1:0, toN:e.to_n?1:0, ldD:e.ld_d?1:0, ldN:e.ld_n?1:0,
  });
  const sumPS = (es: LogbookEntry[]) => es.reduce((acc, e) => addPS(acc, fromEntry(e)), emptyPS());

  const sorted = [...entries].sort((a, b) => {
    const dateCmp = (a.date ?? '').localeCompare(b.date ?? '');
    if (dateCmp !== 0) return dateCmp;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  const ROWS = rowsPerPage;
  const chunks: LogbookEntry[][] = [];
  for (let i = 0; i < Math.max(sorted.length, 1); i += ROWS) chunks.push(sorted.slice(i, i + ROWS));
  if (chunks.length === 0) chunks.push([]);

  // 페이지별 순서 진단 로그
  chunks.forEach((chunk, pi) => {
    if (chunk.length === 0) return;
    const first = chunk[0];
    const last  = chunk[chunk.length - 1];
    console.log(
      `[PDF] page ${pi + 1}/${chunks.length}` +
      ` | first: ${first.date} so=${first.sort_order}` +
      ` | last: ${last.date} so=${last.sort_order}`
    );
  });

  const ps = PAGE_SIZES[pageSize];
  // 고정 오버헤드: padTop(10) + padBot(8) + 로고(8) + thead(실측~21) + tfoot(18) = 65mm
  const overheadMm = 65;
  const availableHeightMm = ps.mmH - overheadMm;
  // 순서 중요: 비례 계산 먼저 → Math.floor → 마지막에 최솟값 clamp
  const rawRowHmm = availableHeightMm / ROWS;
  const rowHmm = Math.max(5, Math.floor(rawRowHmm));
  const dataFontPt = rowHmm >= 9 ? 8 : 7;
  console.log(
    '[PDF] rowsPerPage:', ROWS,
    'rowHmm:', rowHmm,
    'dataFontPt:', dataFontPt,
    'totalHeight:', rowHmm * ROWS,
    '/ available:', availableHeightMm
  );

  const css = `
    @page { size: ${ps.mmW}mm ${ps.mmH}mm landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
    .lb-page { width: 100%; margin: 0; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid #555; font-size: 6.5pt; padding: 0 1pt; text-align: center; vertical-align: middle; line-height: 1.2; color: #000; }
    .th-g { background: #d4d4d4; font-weight: 700; }
    .th-s { background: #e8e8e8; font-weight: 600; }
    .dr { height: ${rowHmm}mm; }
    .dr-even { background: #fff; }
    .dr-odd { background: #f8f8f8; }
    .dr td { font-size: ${dataFontPt}pt; line-height: 1.4; }
    .fr { background: #dde4f0; }
    .fl { text-align: left; font-weight: 700; font-size: 6pt; padding-left: 2pt; }
    .fb { font-size: 7pt; font-weight: 700; display: block; }
    .sig { text-align: left; vertical-align: top; padding: 3pt 4pt; font-size: 6pt; height: 18mm; max-height: 18mm; }
    .fr-row { height: 6mm; max-height: 6mm; }
    tfoot { display: table-footer-group; height: 18mm; max-height: 18mm; }
    .td-remark { text-align: left; font-size: 6.5pt; white-space: normal; word-break: break-all; overflow: hidden; vertical-align: middle; padding: 1pt; }
    .pagebreak { page-break-after: always; }
  `;

  const colgroup = `<colgroup>
    <col style="width:9mm"/><col style="width:9mm"/><col style="width:11mm"/>
    <col style="width:8mm"/><col style="width:7mm"/><col style="width:7mm"/>
    <col style="width:8mm"/><col style="width:8mm"/><col style="width:8mm"/>
    <col style="width:7mm"/><col style="width:7mm"/>
    <col style="width:8mm"/><col style="width:8mm"/><col style="width:8mm"/>
    <col style="width:20mm"/>
    <col style="width:5mm"/><col style="width:5mm"/><col style="width:5mm"/><col style="width:5mm"/>
    <col style="width:26mm"/>
  </colgroup>`;

  function theadHTML(year: number): string {
    return `<thead>
      <tr>
        <th rowspan="3" class="th-s"><span style="display:block;font-size:5.5pt;font-weight:600">YEAR</span><span style="display:block;font-size:9pt;font-weight:700">${year}</span><span style="display:block;font-size:5.5pt">DATE<br/>(M/D)</span></th>
        <th colspan="2" class="th-g">AIRCRAFT</th>
        <th colspan="3" class="th-g">ROUTE OF FLIGHT</th>
        <th colspan="5" class="th-g">TYPE OF PILOTING TIME</th>
        <th colspan="8" class="th-g">CONDITIONS OF FLIGHT</th>
        <th rowspan="3" class="th-s" style="text-align:left;padding-left:2pt;font-size:6pt">REMARK</th>
      </tr>
      <tr>
        <th rowspan="2" class="th-s">A/C<br/>TYPE</th><th rowspan="2" class="th-s">A/C<br/>IDENT</th>
        <th rowspan="2" class="th-s">FLT<br/>NO.</th><th rowspan="2" class="th-s">FROM</th><th rowspan="2" class="th-s">TO</th>
        <th rowspan="2" class="th-s">PIC</th><th rowspan="2" class="th-s" style="font-size:5.5pt">PIC<br/>UNDER<br/>SUPVSN</th>
        <th rowspan="2" class="th-s" style="font-size:6pt">CO-<br/>PILOT</th>
        <th rowspan="2" class="th-s">IP</th><th rowspan="2" class="th-s">TR</th>
        <th rowspan="2" class="th-s">BLOCK<br/>TIME</th><th rowspan="2" class="th-s">NIGHT</th><th rowspan="2" class="th-s">INST</th>
        <th rowspan="2" class="th-s" style="font-size:6pt">APP<br/>TYPE</th>
        <th colspan="2" class="th-s">T/O</th><th colspan="2" class="th-s">L/D</th>
      </tr>
      <tr>
        <th class="th-s">D</th><th class="th-s">N</th><th class="th-s">D</th><th class="th-s">N</th>
      </tr>
    </thead>`;
  }

  function dataRowHTML(e: LogbookEntry | null, idx: number): string {
    const cls = `dr ${idx % 2 === 0 ? 'dr-even' : 'dr-odd'}`;
    if (!e) return `<tr class="${cls}">${'<td></td>'.repeat(20)}</tr>`;
    let crewArr: { name: string; duty: string }[] = [];
    try { crewArr = e.crew ? JSON.parse(e.crew) : []; } catch {}
    const crewStr = crewArr.filter(c => c.name).map(c => `${c.name}${c.duty ? '/' + c.duty : ''}`).join(', ');
    const remark = [crewStr, e.remark].filter(Boolean).join(' | ');
    return `<tr class="${cls}">
      <td>${fD(e.date)}</td><td>${e.ac_type||''}</td><td>${e.ac_ident||''}</td>
      <td>${e.flt_no||''}</td><td>${e.from_apt||''}</td><td>${e.to_apt||''}</td>
      <td style="font-weight:${e.pic?'700':'400'}">${e.pic||''}</td>
      <td style="font-weight:${e.picus?'700':'400'}">${e.picus||''}</td>
      <td style="font-weight:${e.cop?'700':'400'}">${e.cop||''}</td>
      <td>${e.ip||''}</td><td>${e.tr||''}</td>
      <td style="font-weight:700">${e.block||''}</td>
      <td>${e.night||''}</td><td>${e.inst||''}</td>
      <td style="text-align:left">${e.app_type||''}</td>
      <td>${e.to_d?'&#10003;':''}</td><td>${e.to_n?'&#10003;':''}</td>
      <td>${e.ld_d?'&#10003;':''}</td><td>${e.ld_n?'&#10003;':''}</td>
      <td class="td-remark">${remark}</td>
    </tr>`;
  }

  function footerHTML(pageSt: PS, fwdSt: PS, totalSt: PS): string {
    const tk: (keyof PS)[] = ['pic','picus','cop','ip','tr','block','night','inst'];
    const ck: (keyof PS)[] = ['toD','toN','ldD','ldN'];
    const FV = (v: string) => `<td class="fr"><span class="fb">${v}</span></td>`;
    const r = (st: PS, keys: (keyof PS)[], isCnt: boolean) =>
      keys.map(k => FV(isCnt ? Nc(st[k] as number) : T(st[k] as number))).join('');
    return `
      <tr class="fr-row">
        <td colspan="3" rowspan="3" class="sig"><div style="display:flex;flex-direction:column;justify-content:space-between;height:14mm;"><span>PILOT'S SIGNATURE</span><span style="font-size:5.5pt">THIS RECORD IS CERTIFIED TRUE AND CORRECT</span></div></td>
        <td colspan="3" class="fr fl">PAGE TOTALS</td>${r(pageSt,tk,false)}<td class="fr"></td>${r(pageSt,ck,true)}<td class="fr"></td>
      </tr>
      <tr class="fr-row">
        <td colspan="3" class="fr fl">AMT. FORWARDED</td>${r(fwdSt,tk,false)}<td class="fr"></td>${r(fwdSt,ck,true)}<td class="fr"></td>
      </tr>
      <tr class="fr-row">
        <td colspan="3" class="fr fl">TOTALS TO DATE</td>${r(totalSt,tk,false)}<td class="fr"></td>${r(totalSt,ck,true)}<td class="fr"></td>
      </tr>`;
  }

  let pagesHTML = '';
  let cum = emptyPS();
  chunks.forEach((chunk, pi) => {
    const rows = [...chunk];
    while (rows.length < ROWS) rows.push(null as unknown as LogbookEntry);
    const pageSt = sumPS(chunk);
    const fwdSt = cum;
    const totalSt = addPS(fwdSt, pageSt);
    cum = totalSt;
    const year = chunk.find(e => e?.date) ? parseInt(chunk.find(e => e?.date)!.date.substring(0, 4)) || new Date().getFullYear() : new Date().getFullYear();
    const isLast = pi === chunks.length - 1;
    const padLeft  = pi % 2 === 0 ? '15mm' : '5mm';
    const padRight = pi % 2 === 0 ? '5mm'  : '15mm';
    console.log('[PDF] page ' + (pi + 1) + ': paddingLeft=' + padLeft + ', paddingRight=' + padRight);
    pagesHTML += `<div class="lb-page${!isLast ? ' pagebreak' : ''}" style="padding: 10mm ${padRight} 8mm ${padLeft};">
      <table>${colgroup}${theadHTML(year)}<tbody>${rows.map((e, i) => dataRowHTML(e, i)).join('')}</tbody>
      <tfoot>${footerHTML(pageSt, fwdSt, totalSt)}</tfoot></table>
    </div>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${pagesHTML}</body></html>`;
}

// ─── AppHeader ────────────────────────────────────────────────────────────────

function AppHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
        <Text style={s.backToMenu}>← 메뉴</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.appTitle}>모바일 파일럿 로그북</Text>
        <Text style={s.appSub}>Mobile Pilot&apos;s Logbook</Text>
      </View>
    </View>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function Dropdown({
  value, options, labels, onSelect, width = 100,
}: {
  value: string; options: string[]; labels?: string[];
  onSelect: (v: string) => void; width?: number;
}) {
  const [open, setOpen] = useState(false);
  const displayLabel = labels ? labels[options.indexOf(value)] ?? value : value;
  return (
    <>
      <TouchableOpacity style={[s.dropdown, { width }]} onPress={() => setOpen(true)}>
        <Text style={s.dropdownText}>{displayLabel}</Text>
        <Text style={s.dropdownArrow}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[s.dropdownMenu, { minWidth: width }]}>
            {options.map((opt, i) => (
              <TouchableOpacity
                key={opt || '_all'}
                style={[s.dropdownItem, opt === value && s.dropdownItemActive]}
                onPress={() => { onSelect(opt); setOpen(false); }}
              >
                <Text style={[s.dropdownItemText, opt === value && s.dropdownItemTextActive]}>
                  {labels ? labels[i] : opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value || '—'}</Text>
    </View>
  );
}

// ─── Drag handle icon (visual hint only — no touch handlers) ─────────────────

const ROW_HEIGHT = 36;

function DragHandleIcon() {
  return (
    <View style={s.dragHandle}>
      <Text style={s.dragHandleText}>☰</Text>
    </View>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function EntryRow({
  entry, rowIndex, isDragged, isAnyDragActive, onPress,
  onDragStart, onDragMove, onDragEnd,
}: {
  entry: LogbookEntry;
  rowIndex: number;
  isDragged: boolean;
  isAnyDragActive: boolean;
  onPress: () => void;
  onDragStart: (fromIdx: number) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shadowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isDragged ? 1.03 : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 180,
    }).start();
    Animated.spring(shadowAnim, {
      toValue: isDragged ? 1 : 0,
      useNativeDriver: false,
      friction: 6,
      tension: 180,
    }).start();
  }, [isDragged]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs to keep callbacks fresh inside PanResponder closure
  const isDragActiveRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const activateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowIndexRef = useRef(rowIndex);
  const isAnyDragActiveRef = useRef(isAnyDragActive);
  const onPressRef = useRef(onPress);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);

  // Keep refs current; freeze rowIndex once drag starts
  if (!isDragActiveRef.current) rowIndexRef.current = rowIndex;
  isAnyDragActiveRef.current = isAnyDragActive;
  onPressRef.current = onPress;
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;

  const panResponder = useRef(
    PanResponder.create({
      // Don't grab touch on start — let the horizontal ScrollView handle horizontal swipes.
      // PanResponder only takes over once drag mode is confirmed (isDragActiveRef = true).
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => isDragActiveRef.current,
      onMoveShouldSetPanResponderCapture: () => isDragActiveRef.current,
      onPanResponderTerminationRequest: () => !isDragActiveRef.current,

      onPanResponderMove: (e) => {
        if (!isDragActiveRef.current) return;
        onDragMoveRef.current(e.nativeEvent.pageY - startYRef.current);
      },

      onPanResponderRelease: (e) => {
        if (!isDragActiveRef.current) return;
        isDragActiveRef.current = false;
        onDragEndRef.current(e.nativeEvent.pageY - startYRef.current);
      },

      onPanResponderTerminate: () => {
        if (activateTimerRef.current) {
          clearTimeout(activateTimerRef.current);
          activateTimerRef.current = null;
        }
        if (isDragActiveRef.current) {
          onDragEndRef.current(0);
        }
        isDragActiveRef.current = false;
      },
    })
  ).current;

  const remark = crewAndRemark(entry);
  // shadowOpacity/elevation: layout 속성 → useNativeDriver:false (JS driver)
  const shadowOpacity = shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] });
  const elevation = shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });

  // 두 드라이버를 분리: 외부 View(JS driver, shadow) → 내부 View(native driver, scale)
  return (
    <Animated.View
      style={[s.dataRow, isDragged && s.dataRowDragging, { shadowOpacity, elevation }]}
      {...panResponder.panHandlers}
      onTouchStart={(e) => {
        if (isAnyDragActiveRef.current) return;
        startYRef.current = e.nativeEvent.pageY;
        startXRef.current = e.nativeEvent.pageX;
        activateTimerRef.current = setTimeout(() => {
          activateTimerRef.current = null;
          isDragActiveRef.current = true;
          console.log('[Drag] long-press activated, rowIndex:', rowIndexRef.current);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onDragStartRef.current(rowIndexRef.current);
        }, 300);
      }}
      onTouchMove={(e) => {
        if (!activateTimerRef.current) return;
        const dx = Math.abs(e.nativeEvent.pageX - startXRef.current);
        const dy = Math.abs(e.nativeEvent.pageY - startYRef.current);
        // Any meaningful movement cancels the long-press timer;
        // horizontal movement especially must yield to the parent ScrollView.
        if (dx > 5 || dy > 5) {
          clearTimeout(activateTimerRef.current);
          activateTimerRef.current = null;
        }
      }}
      onTouchCancel={() => {
        // Android: parent ScrollView intercepts fast scroll → fires touchcancel instead of touchend.
        // Without this handler the 300ms timer would run to completion and spuriously activate drag.
        if (activateTimerRef.current) {
          clearTimeout(activateTimerRef.current);
          activateTimerRef.current = null;
        }
        if (isDragActiveRef.current) {
          isDragActiveRef.current = false;
          onDragEndRef.current(0);
        }
      }}
      onTouchEnd={(e) => {
        if (activateTimerRef.current) {
          clearTimeout(activateTimerRef.current);
          activateTimerRef.current = null;
          if (!isDragActiveRef.current) {
            console.log('[Tap] onPress — rowIndex:', rowIndexRef.current);
            onPressRef.current();
          }
        }
        // Edge case: long-press fired but no move events (finger held still, then released).
        // PanResponder won't have claimed the touch, so we clean up here.
        if (isDragActiveRef.current) {
          isDragActiveRef.current = false;
          onDragEndRef.current(e.nativeEvent.pageY - startYRef.current);
        }
      }}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }], flex: 1, flexDirection: 'row' }}>
        <DragHandleIcon />
        <View style={{ flexDirection: 'row' }}>
          <Text style={[s.td, { width: COL.date }]}>{fmtDate(entry.date)}</Text>
          <Text style={[s.td, { width: COL.type }]}>{entry.ac_type}</Text>
          <Text style={[s.td, { width: COL.ident, fontSize: 10 }]}>{entry.ac_ident}</Text>
          <Text style={[s.td, { width: COL.flt }]}>{entry.flt_no}</Text>
          <Text style={[s.td, { width: COL.from }]}>{entry.from_apt}</Text>
          <Text style={[s.td, { width: COL.to }]}>{entry.to_apt}</Text>
          <Text style={[s.td, { width: COL.pic, fontWeight: entry.pic ? '700' : '400' }]}>{fmtTime(entry.pic)}</Text>
          <Text style={[s.td, { width: COL.picus, fontWeight: entry.picus ? '700' : '400' }]}>{fmtTime(entry.picus)}</Text>
          <Text style={[s.td, { width: COL.cop, fontWeight: entry.cop ? '700' : '400' }]}>{fmtTime(entry.cop)}</Text>
          <Text style={[s.td, { width: COL.ip }]}>{fmtTime(entry.ip)}</Text>
          <Text style={[s.td, { width: COL.tr }]}>{fmtTime(entry.tr)}</Text>
          <Text style={[s.td, { width: COL.block, fontWeight: '700' }]}>{fmtTime(entry.block)}</Text>
          <Text style={[s.td, { width: COL.night }]}>{fmtTime(entry.night)}</Text>
          <Text style={[s.td, { width: COL.inst }]}>{fmtTime(entry.inst)}</Text>
          <Text style={[s.td, { width: COL.app, textAlign: 'left', paddingLeft: 3, fontSize: 10 }]}>{entry.app_type || ''}</Text>
          <Text style={[s.td, { width: COL.tod, color: RED }]}>{entry.to_d ? '✓' : ''}</Text>
          <Text style={[s.td, { width: COL.ton, color: RED }]}>{entry.to_n ? '✓' : ''}</Text>
          <Text style={[s.td, { width: COL.ldd, color: '#7C3AED' }]}>{entry.ld_d ? '✓' : ''}</Text>
          <Text style={[s.td, { width: COL.ldn, color: '#7C3AED' }]}>{entry.ld_n ? '✓' : ''}</Text>
          <Text style={[s.td, { width: COL.remark, textAlign: 'left', paddingLeft: 3, fontSize: 10 }]} numberOfLines={1}>{remark}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function HomeScreen({ onNavigate, onEdit, refreshTrigger }: Props) {
  const insets = useSafeAreaInsets();
  const [allEntries, setAllEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfPageSize, setPdfPageSize] = useState<PageSizeKey>('B5');
  const [pdfRowsPerPage, setPdfRowsPerPage] = useState(12);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Run one-time migrations on very first call
      await runMigrationReverseSortOrderIfNeeded();
      await runMigrationFixSortOrderGlobalIfNeeded();
      const data = await getAllEntries();
      setAllEntries(data);
      if (data.length > 0 && !selectedYear) {
        const years = Array.from(new Set(data.map(getYear).filter(Boolean))).sort().reverse();
        if (years.length > 0) setSelectedYear(years[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll, refreshTrigger]);

  const availableYears = useMemo(() => {
    const s = new Set(allEntries.map(getYear).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [allEntries]);

  const yearOptions = useMemo(() => ['', ...availableYears], [availableYears]);
  const yearLabels = useMemo(() => ['전체', ...availableYears.map((y) => `${y}년`)], [availableYears]);

  const availableMonths = useMemo(() => {
    const src = selectedYear ? allEntries.filter((e) => getYear(e) === selectedYear) : allEntries;
    const s = new Set(src.map(getMonth).filter(Boolean));
    return Array.from(s).sort();
  }, [allEntries, selectedYear]);

  useEffect(() => {
    if (selectedMonth && !availableMonths.includes(selectedMonth)) setSelectedMonth('');
  }, [availableMonths]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flat list of PDF export options: total → per year → per month
  const pdfOptions = useMemo(() => {
    type Opt = { label: string; entries: LogbookEntry[]; isSection: boolean };
    const opts: Opt[] = [];
    opts.push({ label: `전체 저장 (${allEntries.length}편)`, entries: allEntries, isSection: false });
    for (const year of availableYears) {
      const ye = allEntries.filter((e) => getYear(e) === year);
      opts.push({ label: `${year}년 전체 (${ye.length}편)`, entries: ye, isSection: true });
      const months = Array.from(new Set(ye.map(getMonth).filter(Boolean))).sort();
      for (const m of months) {
        const me = ye.filter((e) => getMonth(e) === m);
        opts.push({ label: `    ${year}년 ${parseInt(m)}월 (${me.length}편)`, entries: me, isSection: false });
      }
    }
    return opts;
  }, [allEntries, availableYears]);

  const filteredEntries = useMemo(() => {
    let r = allEntries;
    if (selectedYear) r = r.filter((e) => getYear(e) === selectedYear);
    if (selectedMonth) r = r.filter((e) => getMonth(e) === selectedMonth);
    const out = [...r].sort((a, b) => {
      const dateCmp = sortDesc
        ? (b.date ?? '').localeCompare(a.date ?? '')
        : (a.date ?? '').localeCompare(b.date ?? '');
      if (dateCmp !== 0) return dateCmp;
      // 같은 날짜 내에서도 정렬 방향 동일 적용
      return sortDesc
        ? (b.sort_order ?? 0) - (a.sort_order ?? 0)  // 최신순: 나중 입력(높은 so)이 위
        : (a.sort_order ?? 0) - (b.sort_order ?? 0); // 과거순: 먼저 입력(낮은 so)이 위
    });
    return out;
  }, [allEntries, selectedYear, selectedMonth, sortDesc]);

  const totalStats = useMemo(() => calcStats(allEntries), [allEntries]);
  const filteredStats = useMemo(() => calcStats(filteredEntries), [filteredEntries]);

  const isFiltered = selectedYear !== '' || selectedMonth !== '';
  const filterLabel = selectedYear
    ? `${selectedYear}${selectedMonth ? `년 ${parseInt(selectedMonth)}월` : '년'}`
    : '전체';

  const handleDelete = async (entry: LogbookEntry) => {
    Alert.alert(
      '삭제',
      `${entry.flt_no || entry.date} 기록을 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            await deleteEntry(entry.id);
            setAllEntries((prev) => prev.filter((e) => e.id !== entry.id));
          },
        },
      ]
    );
  };

  // ─── Drag-and-drop reorder ────────────────────────────────────────────────────

  const [dragInfo, setDragInfo] = useState<{ fromIdx: number; toIdx: number } | null>(null);
  const dragFromIdxRef = useRef<number | null>(null);

  // 순서 변경 감지 → Light 햅틱
  const prevToIdxRef = useRef<number | null>(null);
  useEffect(() => {
    const cur = dragInfo?.toIdx ?? null;
    if (cur !== null && prevToIdxRef.current !== null && prevToIdxRef.current !== cur) {
      console.log('[Drag] order swap haptic, toIdx:', cur);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    prevToIdxRef.current = cur;
  }, [dragInfo?.toIdx]);

  const displayEntries = useMemo(() => {
    if (!dragInfo || dragInfo.fromIdx === dragInfo.toIdx) return filteredEntries;
    const arr = [...filteredEntries];
    const [moved] = arr.splice(dragInfo.fromIdx, 1);
    arr.splice(dragInfo.toIdx, 0, moved);
    return arr;
  }, [filteredEntries, dragInfo]);

  const handleDragStart = useCallback((fromIdx: number) => {
    dragFromIdxRef.current = fromIdx;
    setDragInfo({ fromIdx, toIdx: fromIdx });
  }, []);

  const handleDragMove = useCallback((dy: number) => {
    setDragInfo(prev => {
      if (!prev) return null;
      const toIdx = Math.max(0, Math.min(filteredEntries.length - 1, prev.fromIdx + Math.round(dy / ROW_HEIGHT)));
      if (toIdx === prev.toIdx) return prev;
      // Animate the row shuffle when the target slot changes
      LayoutAnimation.configureNext({
        duration: 180,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'spring', springDamping: 0.7 },
        delete: { type: 'easeInEaseOut', property: 'opacity' },
      });
      return { ...prev, toIdx };
    });
  }, [filteredEntries.length]);

  const handleDragEndCommit = useCallback(async (dy: number) => {
    const fromIdx = dragFromIdxRef.current;
    setDragInfo(null);
    if (fromIdx === null) return;
    dragFromIdxRef.current = null;
    const toIdx = Math.max(0, Math.min(filteredEntries.length - 1, fromIdx + Math.round(dy / ROW_HEIGHT)));
    if (fromIdx === toIdx) return;

    // 드래그 후 화면 표시 순서
    const newFiltered = [...filteredEntries];
    const [moved] = newFiltered.splice(fromIdx, 1);
    newFiltered.splice(toIdx, 0, moved);

    console.log('[Drag] moved:', moved.flt_no, 'from idx', fromIdx, '→', toIdx);
    console.log('[Drag] before so:', filteredEntries.map(e => `${e.flt_no}(${e.sort_order})`).join(', '));

    // filteredEntries가 차지하는 sort_order 슬롯을 ASC로 수집
    const slots = [...filteredEntries]
      .map(e => e.sort_order ?? 0)
      .sort((a, b) => a - b);

    // 화면 표시 순서 → 절대 순서(sort_order ASC) 변환:
    // date가 다른 항목은 date ASC가 절대 우선.
    // 같은 date 내에서는 드래그 후 화면 위치(displayPos)로 결정하되,
    // sortDesc=true면 displayPos가 sort_order DESC를 의미하므로 역방향.
    const displayPos = new Map(newFiltered.map((e, i) => [e.id, i]));
    const absOrdered = [...newFiltered].sort((a, b) => {
      const dc = (a.date ?? '').localeCompare(b.date ?? '');
      if (dc !== 0) return dc;
      const dpCmp = (displayPos.get(a.id) ?? 0) - (displayPos.get(b.id) ?? 0);
      return sortDesc ? -dpCmp : dpCmp;
    });

    // 슬롯을 절대 순서대로 재배정
    const idToSortOrder = new Map<string, number>(
      absOrdered.map((e, i) => [e.id, slots[i]])
    );

    console.log('[Drag] after so:', absOrdered.map(e => `${e.flt_no}(${idToSortOrder.get(e.id)})`).join(', '));

    const updatedAll = allEntries.map(e =>
      idToSortOrder.has(e.id) ? { ...e, sort_order: idToSortOrder.get(e.id)! } : e
    );

    console.log('[Drag] drop settled');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    prevToIdxRef.current = null;

    setAllEntries(updatedAll);
    await updateSortOrders(
      [...idToSortOrder.entries()].map(([id, sort_order]) => ({ id, sort_order }))
    );
  }, [filteredEntries, allEntries, sortDesc]);

  // ─── CSV Export ──────────────────────────────────────────────────────────────

  const handleExportCSV = async () => {
    console.log('[CSV Export] button pressed, entries:', allEntries.length);
    if (allEntries.length === 0) { Alert.alert('알림', '내보낼 기록이 없습니다.'); return; }
    setExporting(true);
    try {
      const headers = ['id','date','ac_type','ac_ident','flt_no','from_apt','to_apt',
        'pic','picus','cop','ip','tr','block','night','inst','app_type',
        'to_d','to_n','ld_d','ld_n','remark','crew','created_at','sort_order'];
      // 화면 정렬 상태(sortDesc)와 무관하게 항상 과거순 고정
      const exportData = [...allEntries].sort((a, b) => {
        if (a.date !== b.date) return (a.date ?? '').localeCompare(b.date ?? '');
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      const head = exportData.slice(0, 5).map(e => e.date);
      const tail = exportData.slice(-5).map(e => e.date);
      console.log('[CSV Export] export order fixed: date ASC + sort_order ASC');
      console.log('[CSV Export] first 5 dates:', head.join(', '));
      console.log('[CSV Export] last 5 dates:', tail.join(', '));
      const rows = exportData.map(e => [
        e.id, e.date, e.ac_type, e.ac_ident, e.flt_no, e.from_apt, e.to_apt,
        e.pic, e.picus, e.cop, e.ip, e.tr, e.block, e.night, e.inst, e.app_type,
        e.to_d, e.to_n, e.ld_d, e.ld_n, e.remark, e.crew ?? '', e.created_at, e.sort_order,
      ]);
      const csv = '\uFEFF' + [headers, ...rows]
        .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const csvFileName = `logbook_export_${Date.now()}.csv`;
      const csvFile = new EXFile(Paths.cache, csvFileName);
      console.log('[CSV Export] writing to:', csvFile.uri);
      csvFile.write(csv);
      console.log('[CSV Export] write done, calling shareAsync...');
      await Sharing.shareAsync(csvFile.uri, { mimeType: 'text/csv', dialogTitle: 'CSV 내보내기' });
      console.log('[CSV Export] shareAsync returned');
    } catch (e) {
      console.error('[CSV Export] error:', String(e));
      Alert.alert('오류', `CSV 내보내기 실패: ${String(e)}`);
    } finally {
      console.log('[CSV Export] finally: setExporting(false)');
      setExporting(false);
    }
  };

  // ─── PDF Export ───────────────────────────────────────────────────────────────

  const doExportPDF = async (entries: LogbookEntry[]) => {
    console.log('[PDF Export] called, entries:', entries.length);
    if (entries.length === 0) { Alert.alert('알림', '내보낼 기록이 없습니다.'); return; }
    setExporting(true);
    try {
      console.log('[PDF Export] generating HTML...');
      const html = generatePrintHTML(entries, pdfRowsPerPage, pdfPageSize);
      const pageDims = PAGE_SIZES[pdfPageSize];
      const ptW = Math.round(pageDims.mmW * MM_TO_PT);
      const ptH = Math.round(pageDims.mmH * MM_TO_PT);
      console.log('[PDF Export] pageSize:', pdfPageSize, 'rows:', pdfRowsPerPage, 'dims:', ptW, 'x', ptH, 'pt');
      console.log('[PDF Export] HTML length:', html.length, '— calling printToFileAsync (60s timeout)');
      const { uri } = await Promise.race([
        printToFileAsync({ html, base64: false, width: ptW, height: ptH }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PDF 생성 시간 초과 (60초)')), 60000)
        ),
      ]);
      console.log('[PDF Export] printToFileAsync done, uri:', uri);

      // ── 진단: PDF 파일 유효성 확인 ──────────────────────────────────────────
      const pdfFile = new EXFile(uri);
      console.log('[PDF Export] file size:', pdfFile.size);

      // ── cacheDirectory 로 복사 (named URI 사용) ──────────────────────────────
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ms = String(now.getMilliseconds()).padStart(3, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${ms}`;
      const fileName = `logbook_${stamp}.pdf`;
      const namedFile = new EXFile(Paths.cache, fileName);
      console.log('[PDF Export] copying to:', namedFile.uri);
      pdfFile.copy(namedFile);
      console.log('[PDF Export] copied file size:', namedFile.size);

      const sharingAvailable = await Sharing.isAvailableAsync();
      console.log('[PDF Export] Sharing.isAvailableAsync():', sharingAvailable);
      if (!sharingAvailable) {
        Alert.alert('공유 불가', '이 기기에서는 파일 공유 기능을 사용할 수 없습니다.');
        return;
      }
      // iOS: printToFileAsync 직후 네이티브 WKWebView 정리에 시간이 필요.
      // presentedViewController가 nil이 되기 전에 shareAsync를 호출하면 silent hang 발생.
      await new Promise<void>(resolve => setTimeout(resolve, 300));
      console.log('[PDF Export] calling shareAsync...');
      await Sharing.shareAsync(namedFile.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
      console.log('[PDF Export] shareAsync returned ✓');
    } catch (e) {
      console.error('[PDF Export] error:', String(e));
      Alert.alert('PDF 오류', String(e));
    } finally {
      console.log('[PDF Export] finally: setExporting(false)');
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <AppHeader onBack={() => onNavigate('mainMenu')} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} scrollEnabled={!dragInfo}>

        {/* ─── Year / Month Filter ─── */}
        <View style={s.filterSection}>
          <View style={s.yearRow}>
            <Text style={s.filterLabel}>연도</Text>
            <Dropdown
              value={selectedYear}
              options={yearOptions}
              labels={yearLabels}
              onSelect={(v) => { setSelectedYear(v); setSelectedMonth(''); }}
              width={100}
            />
            {loading && <ActivityIndicator size="small" color={RED} style={{ marginLeft: 8 }} />}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={s.sortBtn}
              onPress={() => setSortDesc((prev) => !prev)}
            >
              <Text style={s.sortBtnText}>{sortDesc ? '최신순 ↓' : '과거순 ↑'}</Text>
            </TouchableOpacity>
            <Text style={s.entryCount}>{filteredEntries.length}편</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthRow}>
            {(['', ...availableMonths] as string[]).map((m) => {
              const active = selectedMonth === m;
              return (
                <TouchableOpacity
                  key={m || '_all'}
                  style={[s.monthBtn, active && s.monthBtnActive]}
                  onPress={() => setSelectedMonth(m)}
                >
                  <Text style={[s.monthBtnText, active && s.monthBtnTextActive]}>
                    {m ? `${parseInt(m)}월` : '전체'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── Total Stats ─── */}
        <View style={s.statsSection}>
          <Text style={s.statsTitle}>전체 합계 ({allEntries.length}편)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.statsRow}>
              {getStatItems(totalStats).map(item => (
                <StatCard key={item.label} label={item.label} value={item.value} />
              ))}
            </View>
          </ScrollView>
        </View>

        {/* ─── Filtered Stats (when filter applied) ─── */}
        {isFiltered && (
          <View style={[s.statsSection, { backgroundColor: '#EFF6FF' }]}>
            <Text style={[s.statsTitle, { color: '#1D4ED8' }]}>{filterLabel} 합계 ({filteredEntries.length}편)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.statsRow}>
                {getStatItems(filteredStats).map(item => (
                  <StatCard key={item.label} label={item.label} value={item.value} />
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ─── Table ─── */}
        {filteredEntries.length === 0 && !loading ? (
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>기록이 없습니다.</Text>
            <Text style={s.emptyHint}>+ 새 기록을 추가하거나 CSV를 불러오세요.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.th, { width: COL.drag }]} />
                <Text style={[s.th, { width: COL.date }]}>M/D</Text>
                <Text style={[s.th, { width: COL.type }]}>TYPE</Text>
                <Text style={[s.th, { width: COL.ident }]}>IDENT</Text>
                <Text style={[s.th, { width: COL.flt }]}>FLT</Text>
                <Text style={[s.th, { width: COL.from }]}>FROM</Text>
                <Text style={[s.th, { width: COL.to }]}>TO</Text>
                <Text style={[s.th, { width: COL.pic }]}>PIC</Text>
                <Text style={[s.th, { width: COL.picus }]}>PICUS</Text>
                <Text style={[s.th, { width: COL.cop }]}>COP</Text>
                <Text style={[s.th, { width: COL.ip }]}>IP</Text>
                <Text style={[s.th, { width: COL.tr }]}>TR</Text>
                <Text style={[s.th, { width: COL.block }]}>BLOCK</Text>
                <Text style={[s.th, { width: COL.night }]}>NIGHT</Text>
                <Text style={[s.th, { width: COL.inst }]}>INST</Text>
                <Text style={[s.th, { width: COL.app }]}>APP TYPE</Text>
                <Text style={[s.th, { width: COL.tod }]}>T/D</Text>
                <Text style={[s.th, { width: COL.ton }]}>T/N</Text>
                <Text style={[s.th, { width: COL.ldd }]}>L/D</Text>
                <Text style={[s.th, { width: COL.ldn }]}>L/N</Text>
                <Text style={[s.th, { width: COL.remark, textAlign: 'left', paddingLeft: 3 }]}>REMARK</Text>
              </View>

              {displayEntries.map((entry, index) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  rowIndex={index}
                  isDragged={dragInfo !== null && entry.id === filteredEntries[dragInfo.fromIdx]?.id}
                  isAnyDragActive={dragInfo !== null}
                  onPress={() => {
                    Alert.alert(
                      entry.flt_no || entry.date || '기록',
                      undefined,
                      [
                        { text: '수정', onPress: () => onEdit(entry) },
                        { text: '삭제', style: 'destructive', onPress: () => handleDelete(entry) },
                        { text: '취소', style: 'cancel' },
                      ]
                    );
                  }}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEndCommit}
                />
              ))}

              {filteredEntries.length > 0 && (
                <View style={s.footerRow}>
                  <Text style={[s.tf, { width: COL.drag + COL.date + COL.type + COL.ident + COL.flt + COL.from + COL.to, textAlign: 'left', paddingLeft: 6, fontSize: 9 }]} numberOfLines={1}>
                    TOTALS ({filteredEntries.length})
                  </Text>
                  <Text style={[s.tf, { width: COL.pic, fontSize: 10 }]} numberOfLines={1}>{filteredStats.pic !== '—' ? filteredStats.pic : ''}</Text>
                  <Text style={[s.tf, { width: COL.picus, fontSize: 10 }]} numberOfLines={1}>{filteredStats.picus !== '—' ? filteredStats.picus : ''}</Text>
                  <Text style={[s.tf, { width: COL.cop, fontSize: 10 }]} numberOfLines={1}>{filteredStats.cop !== '—' ? filteredStats.cop : ''}</Text>
                  <Text style={[s.tf, { width: COL.ip, fontSize: 10 }]} numberOfLines={1}>{filteredStats.ip !== '—' ? filteredStats.ip : ''}</Text>
                  <Text style={[s.tf, { width: COL.tr, fontSize: 10 }]} numberOfLines={1}>{filteredStats.tr !== '—' ? filteredStats.tr : ''}</Text>
                  <Text style={[s.tf, { width: COL.block, fontSize: 10 }]} numberOfLines={1}>{filteredStats.block !== '—' ? filteredStats.block : ''}</Text>
                  <Text style={[s.tf, { width: COL.night, fontSize: 10 }]} numberOfLines={1}>{filteredStats.night !== '—' ? filteredStats.night : ''}</Text>
                  <Text style={[s.tf, { width: COL.inst, fontSize: 10 }]} numberOfLines={1}>{filteredStats.inst !== '—' ? filteredStats.inst : ''}</Text>
                  <Text style={[s.tf, { width: COL.app }]} />
                  <Text style={[s.tf, { width: COL.tod }]} numberOfLines={1}>{filteredStats.toDay || ''}</Text>
                  <Text style={[s.tf, { width: COL.ton }]} numberOfLines={1}>{filteredStats.toNight || ''}</Text>
                  <Text style={[s.tf, { width: COL.ldd }]} numberOfLines={1}>{filteredStats.ldDay || ''}</Text>
                  <Text style={[s.tf, { width: COL.ldn }]} numberOfLines={1}>{filteredStats.ldNight || ''}</Text>
                  <Text style={[s.tf, { width: COL.remark }]} />
                </View>
              )}
            </View>
          </ScrollView>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ─── Bottom Buttons ─── */}
      <View style={s.bottomBar}>
        <View style={s.btnRow}>
          <TouchableOpacity style={[s.bottomBtn, s.btnPrimary]} onPress={() => onNavigate('newEntry')}>
            <Text style={s.btnPrimaryText}>+ 새 기록</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bottomBtn, s.btnSecondary]} onPress={() => onNavigate('import')}>
            <Text style={s.btnSecondaryText}>파일 불러오기</Text>
          </TouchableOpacity>
        </View>
        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.bottomBtn, s.btnExport, exporting && { opacity: 0.5 }]}
            onPress={handleExportCSV}
            disabled={exporting}
          >
            <Text style={s.btnExportText}>{exporting ? '처리 중...' : 'CSV 내보내기'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.bottomBtn, s.btnPdf, exporting && { opacity: 0.5 }]}
            onPress={() => {
              console.log('[PDF] 버튼 눌림 (exporting=' + exporting + ') — 모달 오픈');
              setShowPdfModal(true);
            }}
            disabled={exporting}
          >
            <Text style={s.btnPdfText}>{exporting ? '처리 중...' : 'PDF 저장'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── PDF Range Bottom Sheet ─── */}
      <Modal
        visible={showPdfModal}
        transparent
        animationType="slide"
      >
        <TouchableOpacity style={s.pdfOverlay} activeOpacity={1} onPress={() => setShowPdfModal(false)}>
          <View style={[s.pdfSheet, { paddingBottom: 32 + insets.bottom }]} onStartShouldSetResponder={() => true}>
            <View style={s.pdfSheetHandle} />
            <Text style={s.pdfSheetTitle}>PDF 출력 설정</Text>

            {/* ─── 용지 크기 ─── */}
            <View style={s.pdfSetting}>
              <Text style={s.pdfSettingLabel}>용지 크기</Text>
              <View style={s.pdfSegment}>
                {(Object.keys(PAGE_SIZES) as PageSizeKey[]).map(k => (
                  <TouchableOpacity
                    key={k}
                    style={[s.pdfSegBtn, pdfPageSize === k && s.pdfSegBtnActive]}
                    onPress={() => {
                      setPdfPageSize(k);
                      setPdfRowsPerPage(PAGE_SIZES[k].defaultRows);
                    }}
                  >
                    <Text style={[s.pdfSegBtnText, pdfPageSize === k && s.pdfSegBtnTextActive]}>
                      {PAGE_SIZES[k].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ─── 행 수 (B5는 고정) ─── */}
            <View style={s.pdfSetting}>
              <Text style={s.pdfSettingLabel}>
                {PAGE_SIZES[pdfPageSize].fixedRows
                  ? `페이지당 행 수: ${pdfRowsPerPage} (고정)`
                  : '페이지당 행 수'}
              </Text>
              {!PAGE_SIZES[pdfPageSize].fixedRows && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pdfRowOptsScroll}>
                  {PDF_ROW_OPTS.map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[s.pdfRowOptBtn, pdfRowsPerPage === n && s.pdfRowOptBtnActive]}
                      onPress={() => setPdfRowsPerPage(n)}
                    >
                      <Text style={[s.pdfRowOptBtnText, pdfRowsPerPage === n && s.pdfRowOptBtnTextActive]}>
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={s.pdfDivider} />
            <Text style={[s.pdfSheetTitle, { marginBottom: 4 }]}>저장 범위 선택</Text>

            <ScrollView style={s.pdfSheetScroll} showsVerticalScrollIndicator={false} bounces={false}>
              {pdfOptions.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.pdfMenuItem, opt.isSection && s.pdfMenuItemSection]}
                  onPress={() => {
                    const entries = opt.entries;
                    setShowPdfModal(false);
                    console.log('[PDF Export] 범위 선택됨, InteractionManager 대기 후 export 시작');
                    InteractionManager.runAfterInteractions(() => doExportPDF(entries));
                  }}
                >
                  <Text style={[s.pdfMenuItemText, opt.isSection && s.pdfMenuItemTextSection]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.pdfCancelBtn} onPress={() => setShowPdfModal(false)}>
              <Text style={s.pdfCancelBtnText}>취소</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: BG, borderBottomWidth: 2, borderBottomColor: RED, gap: 12,
  },
  backToMenu: { fontSize: 13, fontWeight: '600', color: RED, paddingRight: 8 },
  appTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  appSub: { fontSize: 11, color: TEXT_DIM, marginTop: 1 },

  // Filter
  filterSection: {
    backgroundColor: '#FAFAF8', borderBottomWidth: 1, borderBottomColor: BORDER,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6,
  },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  filterLabel: { fontSize: 10, color: TEXT_DIM, fontWeight: '700' },
  entryCount: { color: TEXT_DIM, fontSize: 13 },
  sortBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4,
    borderWidth: 1, borderColor: BORDER, backgroundColor: BG, marginRight: 8,
  },
  sortBtnText: { fontSize: 11, color: TEXT_DIM, fontWeight: '600' },
  monthRow: { flexDirection: 'row' },
  monthBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 4,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: BG, marginRight: 6,
  },
  monthBtnActive: { borderColor: RED, backgroundColor: RED },
  monthBtnText: { color: TEXT_DIM, fontSize: 12 },
  monthBtnTextActive: { color: '#FFF', fontWeight: '700' },

  // Dropdown
  dropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
    borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6,
  },
  dropdownText: { color: TEXT, fontSize: 13 },
  dropdownArrow: { color: TEXT_DIM, fontSize: 11, marginLeft: 4 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  dropdownMenu: {
    backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden', maxHeight: 320,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
  },
  dropdownItem: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  dropdownItemActive: { backgroundColor: RED },
  dropdownItemText: { color: TEXT, fontSize: 14 },
  dropdownItemTextActive: { color: '#FFF', fontWeight: '600' },

  // Stats
  statsSection: {
    padding: 10, backgroundColor: BG,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  statsTitle: { fontSize: 10, color: TEXT_DIM, fontWeight: '700', marginBottom: 6 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    backgroundColor: CARD_BG, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7,
    alignItems: 'center', minWidth: 68,
    borderWidth: 1, borderColor: BORDER,
  },
  statLabel: { color: TEXT_DIM, fontSize: 9, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  statValue: { color: RED, fontSize: 14, fontWeight: '700' },

  // Table
  tableHeader: {
    flexDirection: 'row', backgroundColor: TH_BG,
    borderBottomWidth: 1.5, borderBottomColor: '#CCC',
  },
  th: {
    paddingHorizontal: 2, paddingVertical: 6,
    fontSize: 9, fontWeight: '700', color: '#555',
    textAlign: 'center', borderRightWidth: 1, borderRightColor: '#CCC',
  },
  dataRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: BG,
  },
  dataRowDragging: {
    backgroundColor: '#FFF8E1', shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  dragHandle: {
    width: COL.drag, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderRightWidth: 1, borderRightColor: BORDER,
  },
  dragHandleText: { fontSize: 14, color: '#888' },
  td: {
    paddingHorizontal: 2, paddingVertical: 5,
    fontSize: 11, color: TEXT, textAlign: 'center',
    borderRightWidth: 1, borderRightColor: BORDER,
  },
  footerRow: {
    flexDirection: 'row', backgroundColor: TF_BG,
    borderTopWidth: 1.5, borderTopColor: '#AAA',
  },
  tf: {
    paddingHorizontal: 2, paddingVertical: 6,
    fontSize: 11, fontWeight: '700', color: TEXT, textAlign: 'center',
    borderRightWidth: 1, borderRightColor: '#C0C8D8',
  },

  // Empty
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { color: TEXT_DIM, fontSize: 16 },
  emptyHint: { color: '#AAAAAA', fontSize: 13 },

  // Bottom
  bottomBar: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  bottomBtn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: RED },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  btnSecondary: { backgroundColor: BG, borderWidth: 1.5, borderColor: RED },
  btnSecondaryText: { color: RED, fontWeight: '600', fontSize: 14 },
  btnExport: { backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#16A34A' },
  btnExportText: { color: '#15803D', fontWeight: '600', fontSize: 13 },
  btnPdf: { backgroundColor: '#FFFBEB', borderWidth: 1.5, borderColor: '#B45309' },
  btnPdfText: { color: '#92400E', fontWeight: '600', fontSize: 13 },

  // PDF Bottom Sheet
  pdfOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end',
  },
  pdfSheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 10,
  },
  pdfSheetHandle: {
    width: 40, height: 4, backgroundColor: BORDER,
    borderRadius: 2, alignSelf: 'center', marginBottom: 12,
  },
  pdfSheetTitle: {
    fontSize: 12, fontWeight: '700', color: TEXT_DIM, letterSpacing: 0.5,
    textAlign: 'center', marginBottom: 6, paddingHorizontal: 16,
  },
  pdfSheetScroll: { maxHeight: 360 },
  pdfMenuItem: {
    paddingVertical: 13, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  pdfMenuItemSection: { backgroundColor: '#FAFAF8' },
  pdfMenuItemText: { fontSize: 15, color: TEXT },
  pdfMenuItemTextSection: { fontWeight: '700' },
  pdfCancelBtn: { paddingVertical: 15, alignItems: 'center' },
  pdfCancelBtnText: { color: RED, fontSize: 16, fontWeight: '600' },

  // PDF 설정 (용지 크기 / 행 수)
  pdfSetting: { paddingHorizontal: 16, marginBottom: 10 },
  pdfSettingLabel: { fontSize: 11, fontWeight: '700', color: TEXT_DIM, letterSpacing: 0.3, marginBottom: 6 },
  pdfSegment: { flexDirection: 'row', gap: 8 },
  pdfSegBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: BORDER, alignItems: 'center',
  },
  pdfSegBtnActive: { borderColor: RED, backgroundColor: '#FFF0F0' },
  pdfSegBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_DIM },
  pdfSegBtnTextActive: { color: RED },
  pdfRowOptsScroll: { marginTop: 2 },
  pdfRowOptBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: BORDER, marginRight: 6, alignItems: 'center',
  },
  pdfRowOptBtnActive: { borderColor: RED, backgroundColor: '#FFF0F0' },
  pdfRowOptBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_DIM },
  pdfRowOptBtnTextActive: { color: RED },
  pdfDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 16, marginBottom: 10, marginTop: 4 },
});
