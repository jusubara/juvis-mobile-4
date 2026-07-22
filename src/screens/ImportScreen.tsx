import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File as EXFile } from 'expo-file-system';
import * as iconv from 'iconv-lite';
import { Buffer } from 'buffer';
import { csvToEntries, ParseResult } from '../lib/csv-parser';
import {
  deleteAllEntries,
  classifyImportEntries, mergeImportEntries,
  DuplicateEntry,
} from '../lib/database';
import ImportConfirmModal from '../components/ImportConfirmModal';

// ─── Encoding-aware file reader ───────────────────────────────────────────────
// Tries UTF-8 first. If the decoded text contains U+FFFD replacement characters
// (which appear when EUC-KR/CP949 bytes are misread as UTF-8), falls back to
// reading the file as binary (base64) and decoding with iconv-lite/cp949.

async function readTextWithEncodingFallback(uri: string): Promise<string> {
  // Use FileSystem API (not fetch) — fetch('file://') returns undefined on iOS
  let utf8Text = '';
  try {
    utf8Text = await new EXFile(uri).text();
  } catch {
    // EUC-KR/CP949 binary: NSString UTF-8 decode fails — fall through to iconv
    utf8Text = '';
  }

  // U+FFFD = Unicode replacement character — signals invalid UTF-8 byte sequences
  if (utf8Text && !utf8Text.includes('\uFFFD')) {
    return utf8Text; // Valid UTF-8
  }

  // Re-read as binary (base64) and decode as CP949 (superset of EUC-KR)
  console.log('[Import] UTF-8 read failed or garbled — retrying as CP949');
  const base64 = await new EXFile(uri).base64();
  const bytes = Buffer.from(base64, 'base64');
  return iconv.decode(bytes, 'cp949');
}

// ─── Brand Colors ──────────────────────────────────────────────────────────────
const RED = '#DC1E28';
const BG = '#FFFFFF';
const CARD_BG = '#F5F5F5';
const BORDER = '#E0E0E0';
const TEXT = '#1A1A1A';
const TEXT_DIM = '#666666';

interface Props {
  onBack: () => void;
  onImported: () => void;
}

// ─── AppHeader ────────────────────────────────────────────────────────────────

function AppHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={{ paddingVertical: 4, paddingRight: 4 }}>
        <Text style={{ color: RED, fontSize: 15, fontWeight: '600' }}>← 뒤로</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>파일 불러오기</Text>
    </View>
  );
}

// ─── Preview table row ────────────────────────────────────────────────────────

function PreviewRow({
  date, flt, route, block, isHeader,
}: {
  date: string; flt: string; route: string; block: string; isHeader?: boolean;
}) {
  const cellStyle = isHeader ? s.previewHeaderCell : s.previewCell;
  return (
    <View style={[s.previewRow, isHeader && s.previewHeaderRow]}>
      <Text style={[cellStyle, { width: 64 }]}>{date}</Text>
      <Text style={[cellStyle, { width: 80 }]}>{flt}</Text>
      <Text style={[cellStyle, { flex: 1 }]}>{route}</Text>
      <Text style={[cellStyle, { width: 60, textAlign: 'right' }]}>{block}</Text>
    </View>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ImportScreen({ onBack, onImported }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [confirmData, setConfirmData] = useState<{
    newEntries: import('../lib/database').LogbookEntry[];
    duplicates: DuplicateEntry[];
  } | null>(null);

  // ─── 파싱된 CSV에서 연도/월 목록 ──────────────────────────────────────────

  const availableYears = useMemo(() => {
    if (!result) return [];
    const s = new Set(result.entries.map(e => e.date?.slice(0, 4)).filter(Boolean) as string[]);
    return Array.from(s).sort().reverse();
  }, [result]);

  const availableMonths = useMemo(() => {
    if (!result) return [];
    const src = filterYear
      ? result.entries.filter(e => e.date?.startsWith(filterYear))
      : result.entries;
    const s = new Set(src.map(e => e.date?.slice(5, 7)).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [result, filterYear]);

  const filteredEntries = useMemo(() => {
    if (!result) return [];
    let entries = result.entries;
    if (filterYear) entries = entries.filter(e => e.date?.startsWith(filterYear));
    if (filterMonth) entries = entries.filter(e => e.date?.slice(5, 7) === filterMonth);
    return entries;
  }, [result, filterYear, filterMonth]);

  // ─── 파일 선택 ────────────────────────────────────────────────────────────

  const handlePickFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });

      if (picked.canceled || !picked.assets || picked.assets.length === 0) return;

      const asset = picked.assets[0];
      setFileName(asset.name);
      setResult(null);
      setFilterYear('');
      setFilterMonth('');
      setLoading(true);

      const content = await readTextWithEncodingFallback(asset.uri);
      console.log('[Import] file content length:', content.length, 'first 80 chars:', content.slice(0, 80));

      const parsed = csvToEntries(content);
      console.log('[Import] parsed entries:', parsed.entries.length, 'errors:', parsed.errors);
      console.log('[Import] sample crew/remark:', parsed.entries.slice(0, 3).map(e => ({
        flt: e.flt_no, crew: e.crew, remark: e.remark,
      })));
      // Log sort_order for first 10 entries to verify assignment
      parsed.entries.slice(0, 10).forEach(e =>
        console.log('[Import] row:', e.date, e.flt_no, '→ sort_order:', e.sort_order)
      );
      setResult(parsed);

      // 기본값: 가장 최근 연도 선택
      const years = Array.from(new Set(parsed.entries.map(e => e.date?.slice(0, 4)).filter(Boolean) as string[])).sort().reverse();
      if (years.length > 0) setFilterYear(years[0]);
    } catch (e) {
      Alert.alert('오류', `파일을 읽을 수 없습니다: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── 가져오기 (병합 방식) ──────────────────────────────────────────────────

  const handleImport = async () => {
    if (filteredEntries.length === 0) return;
    setImporting(true);
    try {
      const classified = await classifyImportEntries(filteredEntries);
      setImporting(false);

      if (classified.duplicates.length === 0) {
        // 중복 없음 → 바로 삽입
        setImporting(true);
        const result = await mergeImportEntries(classified.newEntries, [], false);
        Alert.alert(
          '가져오기 완료',
          `${result.inserted}건 추가됨`,
          [{ text: '확인', onPress: onImported }]
        );
      } else {
        // 중복 있음 → 확인 모달 표시
        setConfirmData(classified);
      }
    } catch (e) {
      Alert.alert('오류', `가져오기 실패: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const handleMergeConfirm = async (overwrite: boolean) => {
    if (!confirmData) return;
    const data = confirmData;
    setConfirmData(null);
    setImporting(true);
    try {
      const result = await mergeImportEntries(data.newEntries, data.duplicates, overwrite);
      const kept = overwrite ? 0 : data.duplicates.length;
      const parts: string[] = [];
      if (result.inserted > 0) parts.push(`${result.inserted}건 추가됨`);
      if (result.updated > 0) parts.push(`${result.updated}건 업데이트됨`);
      if (kept > 0) parts.push(`중복 ${kept}건 유지`);
      Alert.alert(
        '가져오기 완료',
        parts.join(', ') || '완료',
        [{ text: '확인', onPress: onImported }]
      );
    } catch (e) {
      Alert.alert('오류', `가져오기 실패: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  // ─── 전체 삭제 ────────────────────────────────────────────────────────────

  const handleDeleteAll = () => {
    Alert.alert(
      '⚠ 전체 비행기록 삭제',
      '모든 비행기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 삭제', style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllEntries();
              Alert.alert('완료', '모든 비행기록이 삭제되었습니다.', [
                { text: '확인', onPress: onImported },
              ]);
            } catch (e) {
              Alert.alert('오류', `삭제 실패: ${String(e)}`);
            }
          },
        },
      ]
    );
  };

  const preview = filteredEntries.slice(0, 5);

  return (
    <SafeAreaView style={s.container}>
      <AppHeader onBack={onBack} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* ─── 파일 선택 ─── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>파일 선택</Text>
          <Text style={s.hint}>
            CSV Export 파일(logbook_export_XXXXXXXXXXXXX) 또는 CMS 비행기록 파일(FlightLog-3XXXXXX-20XX)를 자동 인식합니다.
          </Text>
          <TouchableOpacity style={s.pickBtn} onPress={handlePickFile} disabled={loading}>
            <Text style={s.pickBtnText}>CSV 파일 선택</Text>
          </TouchableOpacity>
          {fileName && (
            <View style={s.fileNameBox}>
              <Text style={{ fontSize: 14 }}>📄</Text>
              <Text style={s.fileName} numberOfLines={1}>{fileName}</Text>
            </View>
          )}
        </View>

        {/* ─── 로딩 ─── */}
        {loading && (
          <View style={s.loadingRow}>
            <ActivityIndicator color={RED} />
            <Text style={s.loadingText}>파일 분석 중...</Text>
          </View>
        )}

        {/* ─── 날짜 범위 필터 ─── */}
        {result && result.entries.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>날짜 범위 선택</Text>
            <Text style={s.hint}>전체 {result.entries.length}개 중 선택한 범위만 가져옵니다.</Text>

            {/* 연도 선택 */}
            <View style={{ marginTop: 6 }}>
              <Text style={s.filterLabel}>연도</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['', ...availableYears].map(y => (
                    <TouchableOpacity
                      key={y || '_all'}
                      style={[s.filterBtn, filterYear === y && s.filterBtnActive]}
                      onPress={() => { setFilterYear(y); setFilterMonth(''); }}
                    >
                      <Text style={[s.filterBtnText, filterYear === y && s.filterBtnTextActive]}>
                        {y ? `${y}년` : '전체'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* 월 선택 */}
            {availableMonths.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={s.filterLabel}>월</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['', ...availableMonths] as string[]).map(m => (
                      <TouchableOpacity
                        key={m || '_all'}
                        style={[s.filterBtn, filterMonth === m && s.filterBtnActive]}
                        onPress={() => setFilterMonth(m)}
                      >
                        <Text style={[s.filterBtnText, filterMonth === m && s.filterBtnTextActive]}>
                          {m ? `${parseInt(m)}월` : '전체'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={s.filterSummary}>
              <Text style={s.filterSummaryText}>
                선택된 기록: <Text style={{ fontWeight: '700', color: RED }}>{filteredEntries.length}개</Text>
              </Text>
            </View>
          </View>
        )}

        {/* ─── 파싱 경고 ─── */}
        {(result?.errors ?? []).length > 0 && (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>파싱 경고 ({result!.errors.length}건)</Text>
            {result!.errors.slice(0, 5).map((e, i) => (
              <Text key={i} style={s.errorText}>{e}</Text>
            ))}
          </View>
        )}

        {/* ─── 미리보기 ─── */}
        {preview.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>
              미리보기 ({preview.length}/{filteredEntries.length}건)
            </Text>
            <PreviewRow date="DATE" flt="FLT NO" route="ROUTE" block="BLOCK" isHeader />
            {preview.map((entry, i) => {
              const dateStr = entry.date?.slice(5) ?? entry.date ?? '';
              const route = entry.from_apt && entry.to_apt
                ? `${entry.from_apt} → ${entry.to_apt}`
                : '-';
              return (
                <PreviewRow
                  key={i}
                  date={dateStr || '-'}
                  flt={entry.flt_no || '-'}
                  route={route}
                  block={entry.block || '-'}
                />
              );
            })}
          </View>
        )}

        {/* ─── 가져오기 버튼 ─── */}
        {filteredEntries.length > 0 && (
          <TouchableOpacity
            style={[s.importBtn, importing && { opacity: 0.5 }]}
            onPress={handleImport}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator color={BG} />
            ) : (
              <Text style={s.importBtnText}>
                {filteredEntries.length}개 기록 가져오기
              </Text>
            )}
          </TouchableOpacity>
        )}

        {result && result.entries.length > 0 && filteredEntries.length === 0 && !loading && (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>선택한 범위에 기록이 없습니다.</Text>
          </View>
        )}

        {result && result.entries.length === 0 && !loading && (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>가져올 기록이 없습니다.</Text>
            <Text style={s.hint}>CSV 파일 형식을 확인해주세요.</Text>
          </View>
        )}

        {/* ─── 전체 삭제 ─── */}
        <View style={s.dangerSection}>
          <Text style={s.dangerLabel}>⚠ 주의</Text>
          <TouchableOpacity style={s.deleteAllBtn} onPress={handleDeleteAll}>
            <Text style={s.deleteAllText}>전체 비행기록 삭제</Text>
          </TouchableOpacity>
          <Text style={s.hint}>모든 비행기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다. 기존 기록을 먼저 저장하세요.</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── 병합 확인 모달 ─── */}
      {confirmData && (
        <ImportConfirmModal
          visible
          newCount={confirmData.newEntries.length}
          duplicates={confirmData.duplicates}
          onKeep={() => handleMergeConfirm(false)}
          onOverwrite={() => handleMergeConfirm(true)}
        />
      )}
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
    backgroundColor: BG, borderBottomWidth: 2, borderBottomColor: RED, gap: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT },

  // Card
  card: {
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, padding: 14, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  cardLabel: { color: TEXT_DIM, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  hint: { color: TEXT_DIM, fontSize: 12, lineHeight: 18 },

  // File picker
  pickBtn: {
    borderWidth: 1.5, borderColor: RED, borderStyle: 'dashed',
    borderRadius: 8, paddingVertical: 20, alignItems: 'center',
  },
  pickBtnText: { color: RED, fontSize: 15, fontWeight: '600' },
  fileNameBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD_BG, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8,
  },
  fileName: { color: TEXT, fontSize: 13, flex: 1 },

  // Loading
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 20,
  },
  loadingText: { color: TEXT_DIM, fontSize: 13 },

  // Date filter
  filterLabel: { fontSize: 10, color: TEXT_DIM, fontWeight: '700', textTransform: 'uppercase' },
  filterBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: BG,
  },
  filterBtnActive: { borderColor: RED, backgroundColor: RED },
  filterBtnText: { color: TEXT_DIM, fontSize: 12 },
  filterBtnTextActive: { color: BG, fontWeight: '700' },
  filterSummary: {
    backgroundColor: '#FFF5F5', borderRadius: 6, padding: 8, marginTop: 4,
  },
  filterSummaryText: { color: TEXT_DIM, fontSize: 13 },

  // Errors
  errorCard: {
    backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FFAAAA',
    borderRadius: 8, padding: 12, gap: 4,
  },
  errorTitle: { color: RED, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  errorText: { color: '#CC3333', fontSize: 12 },

  // Preview table
  previewHeaderRow: { borderBottomWidth: 1.5, borderBottomColor: BORDER, paddingBottom: 7, marginBottom: 2 },
  previewRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: CARD_BG,
  },
  previewHeaderCell: { color: TEXT_DIM, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  previewCell: { color: TEXT, fontSize: 12 },

  // Import button
  importBtn: {
    backgroundColor: RED, borderRadius: 10,
    paddingVertical: 15, alignItems: 'center',
  },
  importBtnText: { color: BG, fontWeight: '700', fontSize: 16 },

  // Empty state
  emptyCard: {
    backgroundColor: CARD_BG, borderRadius: 8, padding: 20, alignItems: 'center', gap: 8,
  },
  emptyText: { color: TEXT_DIM, fontSize: 15, fontWeight: '600' },

  // Danger section
  dangerSection: {
    backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FFAAAA',
    borderRadius: 10, padding: 14, gap: 10, marginTop: 8,
  },
  dangerLabel: { color: RED, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  deleteAllBtn: {
    borderWidth: 1.5, borderColor: RED, borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', backgroundColor: BG,
  },
  deleteAllText: { color: RED, fontSize: 15, fontWeight: '700' },
});
