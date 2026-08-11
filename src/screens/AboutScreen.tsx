import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import ChangelogModal, { CURRENT_VERSION } from '../components/ChangelogModal';
import ImportConfirmModal from '../components/ImportConfirmModal';
import {
  getAndroidBackupDirUri, setAndroidBackupDirUri, getLastBackupAt,
  humanizeAndroidDirUri, readBackupCsv,
} from '../lib/autoBackup';
import { csvToEntries } from '../lib/csv-parser';
import {
  LogbookEntry, DuplicateEntry,
  classifyImportEntries, mergeImportEntries,
} from '../lib/database';

const RED = '#DC1E28';

function formatBackupTime(iso: string | null): string {
  if (!iso) return '없음';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '없음';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
  onRestored?: () => void;
}

export default function AboutScreen({ onBack, onNavigate, onRestored }: Props) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [androidDirSet, setAndroidDirSet] = useState(false);
  const [androidDirLabel, setAndroidDirLabel] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    newEntries: LogbookEntry[];
    duplicates: DuplicateEntry[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        const dirUri = await getAndroidBackupDirUri();
        setAndroidDirSet(!!dirUri);
        setAndroidDirLabel(dirUri ? humanizeAndroidDirUri(dirUri) : null);
      }
      setLastBackupAt(await getLastBackupAt());
    })();
  }, []);

  const handleSetupAutoBackup = async () => {
    try {
      const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return;
      await setAndroidBackupDirUri(result.directoryUri);
      setAndroidDirSet(true);
      setAndroidDirLabel(humanizeAndroidDirUri(result.directoryUri));
      Alert.alert('완료', '자동 백업 폴더가 설정되었습니다.');
    } catch (e) {
      Alert.alert('오류', `자동 백업 설정 실패: ${String(e)}`);
    }
  };

  // ─── 백업에서 복원 ───────────────────────────────────────────────────────

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const csv = await readBackupCsv();
      if (!csv) {
        Alert.alert('알림', '복원할 백업이 없습니다.');
        return;
      }
      const parsed = csvToEntries(csv);
      if (parsed.entries.length === 0) {
        Alert.alert('알림', '복원할 백업이 없습니다.');
        return;
      }
      const classified = await classifyImportEntries(parsed.entries);
      if (classified.duplicates.length === 0) {
        const result = await mergeImportEntries(classified.newEntries, [], false);
        Alert.alert(
          '복원 완료',
          `${result.inserted}건 추가됨`,
          [{ text: '확인', onPress: onRestored }]
        );
      } else {
        setConfirmData(classified);
      }
    } catch (e) {
      Alert.alert('오류', `백업 복원 실패: ${String(e)}`);
    } finally {
      setRestoring(false);
    }
  };

  const handleMergeConfirm = async (overwrite: boolean) => {
    if (!confirmData) return;
    const data = confirmData;
    setConfirmData(null);
    setRestoring(true);
    try {
      const result = await mergeImportEntries(data.newEntries, data.duplicates, overwrite);
      const kept = overwrite ? 0 : data.duplicates.length;
      const parts: string[] = [];
      if (result.inserted > 0) parts.push(`${result.inserted}건 추가됨`);
      if (result.updated > 0) parts.push(`${result.updated}건 업데이트됨`);
      if (kept > 0) parts.push(`중복 ${kept}건 유지`);
      Alert.alert(
        '복원 완료',
        parts.join(', ') || '완료',
        [{ text: '확인', onPress: onRestored }]
      );
    } catch (e) {
      Alert.alert('오류', `백업 복원 실패: ${String(e)}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backText}>← 메인메뉴</Text>
        </TouchableOpacity>
        <Text style={s.title}>저작권 및 문의</Text>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.section}>모바일 파일럿 로그북</Text>
        <Text style={s.line}>Mobile Pilot&apos;s Logbook</Text>
        <View style={s.divider} />
        <Text style={s.label}>버전</Text>
        <Text style={s.value}>{CURRENT_VERSION}</Text>
        <Text style={s.label}>개발</Text>
        <Text style={s.value}>파일럿 전용 비행 기록 앱</Text>
        <Text style={s.label}>문의</Text>
        <Text style={s.value}>jujusangsacompany@gmail.com</Text>
        <View style={s.divider} />

        {/* ─── 업데이트 내역 ─── */}
        <TouchableOpacity
          style={s.changelogBtn}
          onPress={() => setShowChangelog(true)}
        >
          <Text style={s.changelogBtnText}>업데이트 내역 보기</Text>
        </TouchableOpacity>

        {/* ─── 자동 백업 ─── */}
        <View style={s.divider} />
        <Text style={s.label}>자동 백업</Text>
        {Platform.OS === 'android' ? (
          <>
            <TouchableOpacity
              style={s.changelogBtn}
              onPress={handleSetupAutoBackup}
            >
              <Text style={s.changelogBtnText}>
                {androidDirSet ? '자동 백업 활성화됨 (재설정)' : '자동 백업 설정하기'}
              </Text>
            </TouchableOpacity>
            {androidDirSet && androidDirLabel && (
              <Text style={s.backupPathText}>백업 위치: {androidDirLabel}</Text>
            )}
          </>
        ) : (
          <Text style={s.value}>앱 내부에 자동 저장됨</Text>
        )}
        <Text style={[s.line, { marginTop: 8 }]}>마지막 백업: {formatBackupTime(lastBackupAt)}</Text>

        <TouchableOpacity
          style={[s.changelogBtn, { marginTop: 10 }, restoring && { opacity: 0.5 }]}
          onPress={handleRestore}
          disabled={restoring}
        >
          <Text style={s.changelogBtnText}>
            {restoring ? '복원 중...' : '백업에서 복원하기'}
          </Text>
        </TouchableOpacity>

        {/* ─── 개인정보처리방침 ─── */}
        <TouchableOpacity
          style={s.privacyBtn}
          onPress={() => onNavigate?.('privacy')}
        >
          <Text style={s.privacyBtnText}>개인정보처리방침 보기</Text>
        </TouchableOpacity>

        <View style={s.divider} />
        <Text style={s.copyright}>
          © 2026 JUJUSANGSA. All rights reserved.{'\n'}
          본 앱은 파일럿 전용 모바일 로그북입니다.
        </Text>
      </ScrollView>

      <ChangelogModal visible={showChangelog} onClose={() => setShowChangelog(false)} />

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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: RED,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: { paddingVertical: 2 },
  backText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  body: { padding: 28 },
  section: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  line: { fontSize: 13, color: '#888' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 20 },
  label: { fontSize: 12, color: '#999', marginTop: 12, fontWeight: '600', letterSpacing: 0.3 },
  value: { fontSize: 15, color: '#333', marginTop: 2 },
  changelogBtn: {
    borderWidth: 1,
    borderColor: '#3b6fd4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  changelogBtnText: { color: '#3b6fd4', fontSize: 14, fontWeight: '600' },
  backupPathText: { fontSize: 11, color: '#999', marginTop: 6, textAlign: 'center' },
  privacyBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  privacyBtnText: { color: RED, fontSize: 14, fontWeight: '600' },
  copyright: { fontSize: 12, color: '#aaa', lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
