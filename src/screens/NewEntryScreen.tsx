import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  insertEntry, updateEntry, generateId,
  parseTimeToMinutes, minutesToTimeStr, halfTime,
  lookupRoute, saveRoute, getNextSortOrder, getDistinctIdents,
  LogbookEntry,
} from '../lib/database';

// ─── Brand Colors ──────────────────────────────────────────────────────────────
const RED = '#DC1E28';
const BG = '#FFFFFF';
const CARD_BG = '#F5F5F5';
const BORDER = '#E0E0E0';
const TEXT = '#1A1A1A';
const TEXT_DIM = '#666666';
const BLUE = '#1D4ED8';

// ─── Constants ────────────────────────────────────────────────────────────────

const AC_LIST = [
  'HL8374','HL8375','HL8507','HL8545','HL8546','HL8578','HL8587','HL8588','HL8700',
  'HL8541','HL8542','HL8543','HL8544','HL8599','HL8715','HL8716','HL8717','HL8718','HL8759',
];

const AC_TYPE_MAP: Record<string, string> = {
  HL8374:'B738',HL8375:'B738',HL8507:'B738',HL8545:'B738',HL8546:'B738',
  HL8578:'B738',HL8587:'B738',HL8588:'B738',HL8700:'B738',
  HL8541:'B38M',HL8542:'B38M',HL8543:'B38M',HL8544:'B38M',HL8599:'B38M',
  HL8715:'B38M',HL8716:'B38M',HL8717:'B38M',HL8718:'B38M',HL8759:'B38M',
};

const APP_TYPE_OPTIONS = ['', 'ILS', 'RNP', 'VOR', 'LDA', 'VISUAL'];
const APP_SUFFIX_OPTIONS = ['', 'Z', 'Y', 'X', 'W', 'V', 'A'];
const DUTY_CODES = ['', 'C', 'F', 'EC', 'EF', 'A', 'L', 'H', 'K', 'M', 'O', 'R'];

const PILOTING_TYPES = [
  { key: 'PIC',   label: 'PIC' },
  { key: 'PICUS', label: 'PIC under SV' },
  { key: 'COP',   label: 'CO-PILOT' },
  { key: 'IP',    label: 'IP' },
  { key: 'TR',    label: 'TR' },
] as const;

const EXCLUSIVE_TYPES = new Set(['PICUS', 'TR']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildAppType(type: string, suffix: string, rwy: string): string {
  if (!type) return '';
  let s = type;
  if (suffix) s += ' ' + suffix;
  if (rwy) s += ' RWY' + rwy.toUpperCase();
  return s;
}

function parseAppType(str: string): { type: string; suffix: string; rwy: string } {
  if (!str) return { type: '', suffix: '', rwy: '' };
  const rwyMatch = str.match(/RWY(\S+)/);
  const rwy = rwyMatch ? rwyMatch[1] : '';
  const withoutRwy = str.replace(/\s*RWY\S+/, '').trim();
  const parts = withoutRwy.split(' ');
  return { type: parts[0] || '', suffix: parts[1] || '', rwy };
}

// ─── TimeInput (numpad modal) ─────────────────────────────────────────────────

function TimeInput({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'h' | 'mm'>('h');
  const [hStr, setHStr] = useState('');
  const [mmStr, setMmStr] = useState('');

  useEffect(() => {
    if (!open) return;
    const m = value.match(/^(\d+)\+(\d{2})$/);
    if (m) { setHStr(m[1]); setMmStr(m[2]); }
    else { setHStr(''); setMmStr(''); }
    setMode('h');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function doConfirm() {
    const h = parseInt(hStr || '0');
    const mm = Math.min(parseInt(mmStr || '0'), 59);
    onChange(`${h}+${String(mm).padStart(2, '0')}`);
    setOpen(false);
  }

  function handleDigit(d: string) {
    if (mode === 'h') {
      if (hStr.length < 3) {
        setHStr((p) => p + d);
        if (hStr.length === 0) setMode('mm'); // 첫 자리 입력 후 mm으로 자동 이동
      }
    } else {
      // mm 첫 자리는 0-5만 허용 (60 이상 불가)
      if (mmStr.length === 0 && parseInt(d, 10) > 5) return;
      if (mmStr.length < 2) setMmStr((p) => p + d);
    }
  }

  function handleBack() {
    if (mode === 'mm' && mmStr === '') setMode('h');
    else if (mode === 'mm') setMmStr((p) => p.slice(0, -1));
    else setHStr((p) => p.slice(0, -1));
  }

  const KEYS = ['7','8','9','4','5','6','1','2','3','←','0','✓'];
  const displayVal = value || '—+——';

  return (
    <View style={{ flex: 1 }}>
      <Text style={ti.label}>{label}</Text>
      <TouchableOpacity
        style={[ti.btn, value ? ti.btnSet : {}]}
        onPress={() => setOpen(true)}
      >
        <Text style={[ti.btnText, value ? ti.btnTextSet : {}]}>{displayVal}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <View style={ti.overlay}>
          <View style={ti.modal}>
            {/* Header */}
            <View style={ti.modalHeader}>
              <Text style={ti.modalTitle}>{label} 입력</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={ti.closeBtn}>
                <Text style={ti.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Time display */}
            <View style={ti.timeDisplay}>
              <TouchableOpacity
                style={[ti.timeBox, mode === 'h' && ti.timeBoxActive]}
                onPress={() => setMode('h')}
              >
                <Text style={ti.timeBoxText}>{hStr || '0'}</Text>
              </TouchableOpacity>
              <Text style={ti.timeSep}>+</Text>
              <TouchableOpacity
                style={[ti.timeBox, mode === 'mm' && ti.timeBoxActive]}
                onPress={() => setMode('mm')}
              >
                <Text style={ti.timeBoxText}>{mmStr.padStart(2, '0') || '00'}</Text>
              </TouchableOpacity>
            </View>

            {/* Numpad */}
            <View style={ti.numpad}>
              {KEYS.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[
                    ti.key,
                    k === '←' ? ti.keyBack : k === '✓' ? ti.keyConfirm : {},
                  ]}
                  onPress={() => {
                    if (k === '←') handleBack();
                    else if (k === '✓') doConfirm();
                    else handleDigit(k);
                  }}
                >
                  <Text style={[
                    ti.keyText,
                    k === '←' ? ti.keyBackText : k === '✓' ? ti.keyConfirmText : {},
                  ]}>
                    {k}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* h→mm / 지우기 */}
            <View style={ti.actionRow}>
              <TouchableOpacity
                style={[ti.actionBtn, { borderColor: BLUE, backgroundColor: '#EFF6FF' }]}
                onPress={() => setMode('mm')}
              >
                <Text style={[ti.actionText, { color: BLUE }]}>h → mm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ti.actionBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}
                onPress={() => { onChange(''); setOpen(false); }}
              >
                <Text style={[ti.actionText, { color: '#C81E1E' }]}>지우기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ti = StyleSheet.create({
  label: { fontSize: 10, color: TEXT_DIM, fontWeight: '700', marginBottom: 3, textTransform: 'uppercase' },
  btn: {
    width: '100%', paddingVertical: 10, paddingHorizontal: 8,
    borderWidth: 2, borderColor: BORDER, borderRadius: 7,
    backgroundColor: BG, alignItems: 'center',
  },
  btnSet: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  btnText: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], color: '#CCC' },
  btnTextSet: { color: TEXT },
  // Modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modal: {
    backgroundColor: BG, borderRadius: 16, padding: 18,
    width: 260, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F0F0',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 18, color: '#555', lineHeight: 20 },
  timeDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 },
  timeBox: {
    width: 76, height: 56, borderRadius: 8, borderWidth: 2, borderColor: BORDER,
    backgroundColor: '#F8F8F8', alignItems: 'center', justifyContent: 'center',
  },
  timeBoxActive: { borderColor: BLUE, backgroundColor: '#EFF6FF' },
  timeBoxText: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'], color: TEXT },
  timeSep: { fontSize: 24, fontWeight: '900', color: '#555' },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  key: {
    width: '30%', paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 7, backgroundColor: '#F8F8F8',
    flexGrow: 1,
  },
  keyBack: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  keyConfirm: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  keyText: { fontSize: 18, fontWeight: '600', color: TEXT },
  keyBackText: { color: '#C81E1E', fontSize: 20 },
  keyConfirmText: { color: '#15803D', fontSize: 20 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderWidth: 1.5, borderRadius: 6 },
  actionText: { fontSize: 13, fontWeight: '600' },
});

// ─── PicusDialog ──────────────────────────────────────────────────────────────

function PicusDialog({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <Modal visible transparent animationType="fade">
      <View style={pd.overlay}>
        <View style={pd.box}>
          <Text style={pd.title}>PIC under SV</Text>
          <Text style={pd.body}>이륙과 착륙 중{'\n'}<Text style={{ fontWeight: '800' }}>하나만</Text> 수행하였습니까?</Text>
          <View style={pd.btnRow}>
            <TouchableOpacity style={[pd.btn, { backgroundColor: BLUE, borderColor: BLUE }]} onPress={onYes}>
              <Text style={[pd.btnText, { color: BG }]}>YES (B/T 절반)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[pd.btn, { backgroundColor: BG, borderColor: BORDER }]} onPress={onNo}>
              <Text style={[pd.btnText, { color: TEXT_DIM }]}>NO (B/T 그대로)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pd = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box: {
    backgroundColor: BG, borderRadius: 14, padding: 28, maxWidth: 340, width: '88%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
    alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 10 },
  body: { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  btnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 8, borderWidth: 2, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '700' },
});

// ─── SheetPicker (bottom sheet modal picker) ──────────────────────────────────

function SheetPicker({
  visible, title, options, value, onSelect, onClose,
}: {
  visible: boolean; title: string; options: string[]; value: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sp.overlay}>
        <View style={sp.sheet}>
          <View style={sp.header}>
            <Text style={sp.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={sp.closeBtn}>닫기</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt || '__empty__'}
                style={[sp.option, opt === value && sp.optionActive]}
                onPress={() => { onSelect(opt); onClose(); }}
              >
                <Text style={[sp.optionText, opt === value && sp.optionTextActive]}>
                  {opt || '—'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const sp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '65%', borderTopWidth: 2, borderTopColor: RED,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  closeBtn: { color: RED, fontSize: 14, fontWeight: '600' },
  option: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  optionActive: { backgroundColor: RED },
  optionText: { fontSize: 15, color: TEXT },
  optionTextActive: { color: BG, fontWeight: '600' },
});

// ─── Inline picker button ─────────────────────────────────────────────────────

function PickBtn({
  label, value, onPress, placeholder = '—',
}: {
  label: string; value: string; onPress: () => void; placeholder?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={f.label}>{label}</Text>
      <TouchableOpacity style={f.pickerBtn} onPress={onPress}>
        <Text style={value ? f.pickerBtnText : f.pickerBtnPlaceholder} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={f.pickerArrow}>▾</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={f.section}>
      <Text style={f.sectionTitle}>{title}</Text>
      <View style={f.sectionBody}>{children}</View>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onSaved: () => void;
  initialData?: LogbookEntry;
}

interface CrewMember { name: string; duty: string; }

// ─── Main ────────────────────────────────────────────────────────────────────

export default function NewEntryScreen({ onBack, onSaved, initialData }: Props) {
  const isEdit = !!initialData;

  const _appParsed = initialData ? parseAppType(initialData.app_type) : { type: '', suffix: '', rwy: '' };

  // ── Date picker ──
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Form state ──
  const [date, setDate] = useState(initialData?.date ?? todayStr());
  const [acIdent, setAcIdent] = useState(initialData?.ac_ident ?? '');
  const [acType, setAcType] = useState(initialData?.ac_type ?? '');
  const [fltNo, setFltNo] = useState(initialData?.flt_no ?? '');
  const [fromApt, setFromApt] = useState(initialData?.from_apt ?? '');
  const [toApt, setToApt] = useState(initialData?.to_apt ?? '');
  const [block, setBlock] = useState(initialData?.block ?? '');
  const [night, setNight] = useState(initialData?.night ?? '');
  const [inst, setInst] = useState(initialData?.inst ?? '');
  const [pic, setPic] = useState(initialData?.pic ?? '');
  const [picus, setPicus] = useState(initialData?.picus ?? '');
  const [cop, setCop] = useState(initialData?.cop ?? '');
  const [ip, setIp] = useState(initialData?.ip ?? '');
  const [tr, setTr] = useState(initialData?.tr ?? '');
  const [appType, setAppType] = useState(_appParsed.type);
  const [appSuffix, setAppSuffix] = useState(_appParsed.suffix);
  const [appRwy, setAppRwy] = useState(_appParsed.rwy);
  const [toDay, setToDay] = useState(!!(initialData?.to_d));
  const [toNight, setToNight] = useState(!!(initialData?.to_n));
  const [ldDay, setLdDay] = useState(!!(initialData?.ld_d));
  const [ldNight, setLdNight] = useState(!!(initialData?.ld_n));
  const [remark, setRemark] = useState(initialData?.remark ?? '');
  const [saving, setSaving] = useState(false);

  // ── Piloting types ──
  const [pilotingTypes, setPilotingTypes] = useState<Set<string>>(() => {
    if (!initialData) return new Set();
    const s = new Set<string>();
    if (initialData.pic) s.add('PIC');
    if (initialData.picus) s.add('PICUS');
    if (initialData.cop) s.add('COP');
    if (initialData.ip) s.add('IP');
    if (initialData.tr) s.add('TR');
    return s;
  });
  const [picusDialogOpen, setPicusDialogOpen] = useState(false);

  // ── Crew ──
  const [crew, setCrew] = useState<CrewMember[]>(() => {
    if (!initialData?.crew) return [{ name: '', duty: '' }];
    try {
      const parsed = JSON.parse(initialData.crew) as CrewMember[];
      return parsed.length > 0 ? parsed : [{ name: '', duty: '' }];
    } catch {
      return [{ name: '', duty: '' }];
    }
  });

  // ── Pickers ──
  const [appTypePickerOpen, setAppTypePickerOpen] = useState(false);
  const [appSuffixPickerOpen, setAppSuffixPickerOpen] = useState(false);
  const [dutyPickerIdx, setDutyPickerIdx] = useState<number | null>(null);

  // ── A/C IDENT 자동완성 ──
  const [pastIdents, setPastIdents] = useState<string[]>([]);
  const [identSugg, setIdentSugg] = useState<string[]>([]);

  useEffect(() => {
    getDistinctIdents().then(setPastIdents).catch(() => {});
  }, []);

  useEffect(() => {
    const q = acIdent.toUpperCase().trim();
    if (q.length < 2) { setIdentSugg([]); return; }
    const pool = [...new Set([...AC_LIST, ...pastIdents])];
    setIdentSugg(pool.filter(id => id.startsWith(q) && id !== q).slice(0, 6));
  }, [acIdent, pastIdents]);

  // Auto-fill AC type from ident
  useEffect(() => {
    if (acIdent && AC_TYPE_MAP[acIdent]) setAcType(AC_TYPE_MAP[acIdent]);
  }, [acIdent]);

  // ── Piloting type selection logic (same as web) ──
  function selectPilotingType(key: string) {
    const isExclusive = EXCLUSIVE_TYPES.has(key);
    const isCurrentlySelected = pilotingTypes.has(key);
    const bt = block;

    setPilotingTypes((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(key);
      } else if (isExclusive) {
        next.clear();
        next.add(key);
      } else {
        next.delete('PICUS');
        next.delete('TR');
        next.add(key);
      }
      return next;
    });

    if (isCurrentlySelected) {
      if (key === 'PIC') setPic('');
      else if (key === 'PICUS') setPicus('');
      else if (key === 'COP') setCop('');
      else if (key === 'IP') setIp('');
      else if (key === 'TR') setTr('');
    } else if (isExclusive) {
      setPic(''); setCop(''); setIp(''); setTr(''); setPicus('');
      if (key === 'PICUS') {
        setPicus(bt);
        if (bt) setPicusDialogOpen(true);
      } else if (key === 'TR') {
        setTr(bt);
      }
    } else {
      setPicus(''); setTr('');
      if (key === 'PIC') setPic(bt);
      else if (key === 'COP') setCop(bt);
      else if (key === 'IP') setIp(bt);
    }
  }

  function handleBlockChange(v: string) {
    setBlock(v);
    if (pilotingTypes.has('PIC')) setPic(v);
    if (pilotingTypes.has('COP')) setCop(v);
    if (pilotingTypes.has('IP')) setIp(v);
    if (pilotingTypes.has('TR')) setTr(v);
    if (pilotingTypes.has('PICUS')) setPicus(v);
  }

  function handlePicusYes() { setPicus(halfTime(block)); setPicusDialogOpen(false); }
  function handlePicusNo() { setPicus(block); setPicusDialogOpen(false); }

  // ── Crew ──
  function updateCrew(idx: number, field: keyof CrewMember, val: string) {
    setCrew((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));
  }
  function addCrewRow() { setCrew((prev) => [...prev, { name: '', duty: '' }]); }
  function removeCrewRow(idx: number) { setCrew((prev) => prev.filter((_, i) => i !== idx)); }

  // ── Save ──
  async function handleSave() {
    if (!date) { Alert.alert('입력 오류', '날짜를 입력하세요.'); return; }
    setSaving(true);
    try {
      const appTypeStr = buildAppType(appType, appSuffix, appRwy);
      const crewJson = JSON.stringify(crew.filter((c) => c.name));
      const fromUp = fromApt.toUpperCase();
      const toUp = toApt.toUpperCase();
      if (fltNo && fromUp && toUp) {
        try { await saveRoute(fltNo, fromUp, toUp); } catch {}
      }
      const entry: LogbookEntry = {
        id: initialData?.id ?? generateId(),
        date, ac_type: acType, ac_ident: acIdent, flt_no: fltNo,
        from_apt: fromUp, to_apt: toUp,
        pic, picus, cop, ip, tr, block, night, inst,
        app_type: appTypeStr,
        to_d: toDay ? 1 : 0,
        to_n: toNight ? 1 : 0,
        ld_d: ldDay ? 1 : 0,
        ld_n: ldNight ? 1 : 0,
        remark, crew: crewJson,
        ramp_out: '', ramp_in: '',
        sort_order: initialData?.sort_order ?? await getNextSortOrder(),
        created_at: initialData?.created_at ?? new Date().toISOString(),
      };

      if (isEdit && initialData) {
        await updateEntry(initialData.id, entry);
      } else {
        await insertEntry(entry);
      }
      onSaved();
    } catch (e) {
      Alert.alert('오류', `저장 실패: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const appTypePreview = buildAppType(appType, appSuffix, appRwy);

  return (
    <SafeAreaView style={f.container}>
      {picusDialogOpen && <PicusDialog onYes={handlePicusYes} onNo={handlePicusNo} />}

      {/* Header */}
      <View style={f.header}>
        <TouchableOpacity onPress={onBack} style={{ paddingVertical: 4 }}>
          <Text style={{ color: TEXT_DIM, fontSize: 14 }}>← 취소</Text>
        </TouchableOpacity>
        <Text style={f.headerTitle}>{isEdit ? '기록 수정' : '새 기록'}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[f.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={f.saveBtnText}>{saving ? (isEdit ? '수정중...' : '저장중...') : (isEdit ? '수정' : '저장')}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >

          {/* 1. DATE */}
          <Section title="1. DATE">
            <TouchableOpacity
              style={[ti.btn, date ? ti.btnSet : {}]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[ti.btnText, date ? ti.btnTextSet : {}]}>
                {date || '날짜 선택'}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date ? new Date(date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event: DateTimePickerEvent, selected?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (event.type === 'dismissed') { setShowDatePicker(false); return; }
                  if (selected) {
                    const y = selected.getFullYear();
                    const m = String(selected.getMonth() + 1).padStart(2, '0');
                    const d = String(selected.getDate()).padStart(2, '0');
                    const formatted = `${y}-${m}-${d}`;
                    setDate(formatted);
                    console.log('[DatePicker] selected:', formatted);
                    if (Platform.OS === 'ios') setShowDatePicker(false);
                  }
                }}
                maximumDate={new Date(new Date().getFullYear() + 1, 11, 31)}
                minimumDate={new Date(2010, 0, 1)}
                locale="ko-KR"
              />
            )}
          </Section>

          {/* 2 & 3. A/C IDENT + A/C TYPE */}
          <Section title="2. A/C IDENT  /  3. A/C TYPE">
            <View style={f.row}>
              <View style={{ flex: 2 }}>
                <Text style={f.label}>A/C IDENT</Text>
                <View style={f.identRow}>
                  <Text style={f.identPrefix}>HL</Text>
                  <TextInput
                    value={acIdent.startsWith('HL') ? acIdent.slice(2) : acIdent}
                    onChangeText={(v) => {
                      const digits = v.replace(/[^0-9]/g, '');
                      setAcIdent(digits.length > 0 ? 'HL' + digits : '');
                    }}
                    placeholder="8500"
                    placeholderTextColor="#BBB"
                    keyboardType="number-pad"
                    maxLength={4}
                    style={[f.input, f.identInput]}
                  />
                </View>
                {identSugg.length > 0 && (
                  <View style={f.suggBox}>
                    {identSugg.map(s => (
                      <TouchableOpacity
                        key={s}
                        style={f.suggItem}
                        onPress={() => { setAcIdent(s); if (AC_TYPE_MAP[s]) setAcType(AC_TYPE_MAP[s]); setIdentSugg([]); }}
                      >
                        <Text style={f.suggText}>{s.startsWith('HL') ? s.slice(2) : s}</Text>
                        {AC_TYPE_MAP[s] ? <Text style={f.suggSub}>{AC_TYPE_MAP[s]}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={f.label}>A/C TYPE</Text>
                <TextInput
                  value={acType}
                  onChangeText={setAcType}
                  placeholder="B738"
                  placeholderTextColor="#BBB"
                  autoCapitalize="characters"
                  style={f.input}
                />
              </View>
            </View>
          </Section>

          {/* 4 & 5. FLT NO + FROM / TO */}
          <Section title="4. FLT NO  /  5. FROM · TO">
            <View style={f.row}>
              <View style={{ flex: 1 }}>
                <Text style={f.label}>FLT NO.</Text>
                <TextInput
                  value={fltNo}
                  onChangeText={(v) => setFltNo(v.toUpperCase().replace(/^ZE\s*/i, ''))}
                  onBlur={async () => {
                    if (!fltNo) return;
                    try {
                      const route = await lookupRoute(fltNo);
                      if (route) { setFromApt(route.from_apt); setToApt(route.to_apt); }
                    } catch {}
                  }}
                  placeholder="201"
                  placeholderTextColor="#BBB"
                  autoCapitalize="characters"
                  style={f.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={f.label}>FROM</Text>
                <TextInput
                  value={fromApt}
                  onChangeText={(v) => setFromApt(v.toUpperCase())}
                  placeholder="GMP"
                  placeholderTextColor="#BBB"
                  autoCapitalize="characters"
                  maxLength={4}
                  style={f.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={f.label}>TO</Text>
                <TextInput
                  value={toApt}
                  onChangeText={(v) => setToApt(v.toUpperCase())}
                  placeholder="CJU"
                  placeholderTextColor="#BBB"
                  autoCapitalize="characters"
                  maxLength={4}
                  style={f.input}
                />
              </View>
            </View>
          </Section>

          {/* 6. BLOCK / NIGHT / INST */}
          <Section title="6. BLOCK / NIGHT / INST">
            <View style={f.timeRow}>
              <TimeInput label="B/T (Block)" value={block} onChange={handleBlockChange} />
              <TimeInput label="N/T (Night)" value={night} onChange={setNight} />
              <TimeInput label="I/T (Inst)" value={inst} onChange={setInst} />
            </View>
          </Section>

          {/* 7. PILOTING TIME */}
          <Section title="7. PILOTING TIME">
            <View style={f.pilotingBtns}>
              {PILOTING_TYPES.map(({ key, label }) => {
                const sel = pilotingTypes.has(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[f.pilotingBtn, sel && f.pilotingBtnActive]}
                    onPress={() => selectPilotingType(key)}
                  >
                    <Text style={[f.pilotingBtnText, sel && f.pilotingBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {pilotingTypes.size > 0 && (
              <View style={f.pilotingTimes}>
                <Text style={f.pilotingTimesLabel}>시간 입력</Text>
                <View style={f.timeRow}>
                  {pilotingTypes.has('PIC')   && <TimeInput label="PIC" value={pic} onChange={setPic} />}
                  {pilotingTypes.has('PICUS') && <TimeInput label="PIC under SV" value={picus} onChange={setPicus} />}
                  {pilotingTypes.has('COP')   && <TimeInput label="CO-PILOT" value={cop} onChange={setCop} />}
                  {pilotingTypes.has('IP')    && <TimeInput label="IP" value={ip} onChange={setIp} />}
                  {pilotingTypes.has('TR')    && <TimeInput label="TR" value={tr} onChange={setTr} />}
                </View>
              </View>
            )}
            {pilotingTypes.size === 0 && (
              <Text style={f.pilotingHint}>역할을 선택하면 B/T 시간이 자동 입력됩니다.</Text>
            )}
          </Section>

          {/* 8. APP TYPE */}
          <Section title="8. APP TYPE">
            <View style={f.row}>
              <View style={{ flex: 2 }}>
                <PickBtn
                  label="APP TYPE"
                  value={appType}
                  placeholder="—"
                  onPress={() => setAppTypePickerOpen(true)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PickBtn
                  label="SUFFIX"
                  value={appSuffix}
                  placeholder="—"
                  onPress={() => setAppSuffixPickerOpen(true)}
                />
              </View>
              <View style={{ flex: 1.2 }}>
                <Text style={f.label}>RWY</Text>
                <TextInput
                  value={appRwy}
                  onChangeText={(v) => setAppRwy(v.toUpperCase())}
                  placeholder="34L"
                  placeholderTextColor="#BBB"
                  autoCapitalize="characters"
                  maxLength={4}
                  style={f.input}
                />
              </View>
            </View>
            {appTypePreview ? (
              <Text style={f.appTypePreview}>결과: {appTypePreview}</Text>
            ) : null}
          </Section>

          {/* 9. TO / LD */}
          <Section title="9. TO / LD">
            <View style={f.toLdRow}>
              <View style={f.toLdGroup}>
                <Text style={f.toLdGroupLabel}>TO</Text>
                <View style={f.toggleRow}>
                  <TouchableOpacity
                    style={[f.toggleBtn, toDay && f.toggleBtnToActive]}
                    onPress={() => { if (toDay) setToDay(false); else { setToDay(true); setToNight(false); } }}
                  >
                    <Text style={[f.toggleBtnText, toDay && f.toggleBtnTextActive]}>DAY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[f.toggleBtn, toNight && f.toggleBtnToActive]}
                    onPress={() => { if (toNight) setToNight(false); else { setToNight(true); setToDay(false); } }}
                  >
                    <Text style={[f.toggleBtnText, toNight && f.toggleBtnTextActive]}>NIGHT</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={f.toLdGroup}>
                <Text style={f.toLdGroupLabel}>LD</Text>
                <View style={f.toggleRow}>
                  <TouchableOpacity
                    style={[f.toggleBtn, ldDay && f.toggleBtnLdActive]}
                    onPress={() => { if (ldDay) setLdDay(false); else { setLdDay(true); setLdNight(false); } }}
                  >
                    <Text style={[f.toggleBtnText, ldDay && f.toggleBtnLdTextActive]}>DAY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[f.toggleBtn, ldNight && f.toggleBtnLdActive]}
                    onPress={() => { if (ldNight) setLdNight(false); else { setLdNight(true); setLdDay(false); } }}
                  >
                    <Text style={[f.toggleBtnText, ldNight && f.toggleBtnLdTextActive]}>NIGHT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Section>

          {/* 10. CREW */}
          <Section title="10. CREW">
            <View style={{ gap: 8 }}>
              {crew.map((c, i) => (
                <View key={i} style={f.crewRow}>
                  <TextInput
                    value={c.name}
                    onChangeText={(v) => updateCrew(i, 'name', v)}
                    placeholder="이름"
                    placeholderTextColor="#BBB"
                    style={[f.input, { flex: 2 }]}
                  />
                  <TouchableOpacity
                    style={[f.pickerBtn, { flex: 1 }]}
                    onPress={() => setDutyPickerIdx(i)}
                  >
                    <Text style={c.duty ? f.pickerBtnText : f.pickerBtnPlaceholder}>
                      {c.duty || '듀티'}
                    </Text>
                    <Text style={f.pickerArrow}>▾</Text>
                  </TouchableOpacity>
                  {crew.length > 1 && (
                    <TouchableOpacity style={f.crewRemoveBtn} onPress={() => removeCrewRow(i)}>
                      <Text style={f.crewRemoveBtnText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
            <TouchableOpacity style={f.addCrewBtn} onPress={addCrewRow}>
              <Text style={f.addCrewBtnText}>+ 크루 추가</Text>
            </TouchableOpacity>
          </Section>

          {/* 11. REMARK */}
          <Section title="11. REMARK">
            <TextInput
              value={remark}
              onChangeText={setRemark}
              placeholder="비고 입력..."
              placeholderTextColor="#BBB"
              multiline
              numberOfLines={3}
              style={[f.input, { minHeight: 72, textAlignVertical: 'top' }]}
            />
          </Section>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <SheetPicker
        visible={appTypePickerOpen}
        title="APP TYPE 선택"
        options={APP_TYPE_OPTIONS}
        value={appType}
        onSelect={setAppType}
        onClose={() => setAppTypePickerOpen(false)}
      />
      <SheetPicker
        visible={appSuffixPickerOpen}
        title="SUFFIX 선택"
        options={APP_SUFFIX_OPTIONS}
        value={appSuffix}
        onSelect={setAppSuffix}
        onClose={() => setAppSuffixPickerOpen(false)}
      />
      <SheetPicker
        visible={dutyPickerIdx !== null}
        title="듀티 선택"
        options={DUTY_CODES}
        value={dutyPickerIdx !== null ? crew[dutyPickerIdx]?.duty ?? '' : ''}
        onSelect={(v) => { if (dutyPickerIdx !== null) updateCrew(dutyPickerIdx, 'duty', v); }}
        onClose={() => setDutyPickerIdx(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const f = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F0EA' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: BG, borderBottomWidth: 2, borderBottomColor: RED, gap: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  saveBtn: { backgroundColor: RED, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { color: BG, fontWeight: '700', fontSize: 14 },

  // Section
  section: {
    backgroundColor: BG, borderWidth: 1, borderColor: '#E8E8E0',
    borderRadius: 10, overflow: 'hidden',
  },
  sectionTitle: {
    backgroundColor: '#F5F5F0', paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E0',
    fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 0.8,
  },
  sectionBody: { padding: 14, gap: 10 },

  // Inputs
  input: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
    borderRadius: 8, color: TEXT, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  identRow: { flexDirection: 'row', alignItems: 'center' },
  identPrefix: {
    fontSize: 14, fontWeight: '700', color: TEXT_DIM,
    backgroundColor: '#ECECEC', paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: BORDER, borderRightWidth: 0,
    borderTopLeftRadius: 8, borderBottomLeftRadius: 8,
  },
  identInput: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  label: { fontSize: 10, color: TEXT_DIM, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  timeRow: { flexDirection: 'row', gap: 10 },

  // Picker button (used by appType/suffix/duty pickers)
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  pickerBtnText: { color: TEXT, fontSize: 14, flex: 1 },
  pickerBtnPlaceholder: { color: '#BBB', fontSize: 14, flex: 1 },
  pickerArrow: { color: TEXT_DIM, fontSize: 12 },

  // A/C IDENT 자동완성
  suggBox: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 8,
    overflow: 'hidden', marginTop: 2, backgroundColor: BG,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4,
  },
  suggItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  suggText: { fontSize: 14, color: TEXT, fontWeight: '600' },
  suggSub: { fontSize: 11, color: TEXT_DIM },

  // Piloting
  pilotingBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pilotingBtn: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 7,
    borderWidth: 2, borderColor: BORDER, backgroundColor: '#F8F8F4',
  },
  pilotingBtnActive: { borderColor: BLUE, backgroundColor: BLUE },
  pilotingBtnText: { fontSize: 13, fontWeight: '500', color: '#444' },
  pilotingBtnTextActive: { color: BG, fontWeight: '700' },
  pilotingTimes: {
    backgroundColor: '#F0F9FF', borderWidth: 1.5, borderColor: '#BAE6FD',
    borderRadius: 8, padding: 12, marginTop: 4,
  },
  pilotingTimesLabel: { fontSize: 11, color: '#0369A1', fontWeight: '600', marginBottom: 10 },
  pilotingHint: { fontSize: 11, color: '#AAA', paddingVertical: 4 },

  // TO / LD
  toLdRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  toLdGroup: { gap: 6 },
  toLdGroupLabel: { fontSize: 11, color: '#666', fontWeight: '700', textTransform: 'uppercase' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 7,
    borderWidth: 2, borderColor: BORDER, backgroundColor: BG,
  },
  toggleBtnToActive: { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' },
  toggleBtnLdActive: { borderColor: '#8B5CF6', backgroundColor: '#F5F3FF' },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#888' },
  toggleBtnTextActive: { color: '#92400E' },
  toggleBtnLdTextActive: { color: '#5B21B6' },

  // Crew
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  crewRemoveBtn: {
    width: 32, height: 40, borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 6, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center',
  },
  crewRemoveBtnText: { color: '#C81E1E', fontSize: 18, lineHeight: 20 },
  addCrewBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: '#BBB', borderRadius: 6,
    backgroundColor: '#FAFAF8', alignSelf: 'flex-start', marginTop: 4,
  },
  addCrewBtnText: { color: '#666', fontSize: 12 },

  // App type preview
  appTypePreview: { color: BLUE, fontSize: 13, fontWeight: '600', paddingHorizontal: 4, paddingTop: 2 },
});
