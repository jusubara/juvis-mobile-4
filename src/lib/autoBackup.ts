import { Platform, AppState, AppStateStatus } from 'react-native';
import { Paths, File as EXFile } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAllEntriesForBackup, LogbookEntry } from './database';

const FILE_NAME = 'logbook_autobackup.csv';
const ANDROID_DIR_URI_KEY = 'autoBackupAndroidDirUri';
const LAST_BACKUP_AT_KEY = 'autoBackupLastAt';

// ─── Android backup dir URI helpers ──────────────────────────────────────────

export async function getAndroidBackupDirUri(): Promise<string | null> {
  return AsyncStorage.getItem(ANDROID_DIR_URI_KEY);
}

export async function setAndroidBackupDirUri(uri: string): Promise<void> {
  await AsyncStorage.setItem(ANDROID_DIR_URI_KEY, uri);
}

export async function getLastBackupAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_BACKUP_AT_KEY);
}

// SAF directoryUri(content://.../tree/primary%3ADownload%2FLogbook)를
// "내부 저장소/Download/Logbook" 같은 사람이 읽기 쉬운 형태로 변환.
export function humanizeAndroidDirUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const treeMatch = decoded.match(/tree\/(.+)$/);
    if (!treeMatch) return decoded;
    const docId = treeMatch[1];
    const colonIdx = docId.indexOf(':');
    if (colonIdx === -1) return docId;
    const volume = docId.slice(0, colonIdx);
    const path = docId.slice(colonIdx + 1);
    const volumeLabel = volume === 'primary' ? '내부 저장소' : volume;
    return path ? `${volumeLabel}/${path}` : volumeLabel;
  } catch {
    return uri;
  }
}

// ─── CSV builder ──────────────────────────────────────────────────────────────
// entries는 getAllEntriesForBackup()으로 date ASC, sort_order ASC 정렬된 상태로 전달.
// 추가 정렬이 필요 없어 동기 함수로 처리.

function buildCsv(entries: LogbookEntry[]): string {
  const headers = ['id', 'date', 'ac_type', 'ac_ident', 'flt_no', 'from_apt', 'to_apt',
    'pic', 'picus', 'cop', 'ip', 'tr', 'block', 'night', 'inst', 'app_type',
    'to_d', 'to_n', 'ld_d', 'ld_n', 'remark', 'crew', 'created_at', 'sort_order'];
  const rows = entries.map(e => [
    e.id, e.date, e.ac_type, e.ac_ident, e.flt_no, e.from_apt, e.to_apt,
    e.pic, e.picus, e.cop, e.ip, e.tr, e.block, e.night, e.inst, e.app_type,
    e.to_d, e.to_n, e.ld_d, e.ld_n, e.remark, e.crew ?? '', e.created_at, e.sort_order,
  ]);
  return '\uFEFF' + [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

// ─── Platform-specific backup ─────────────────────────────────────────────────

async function backupIOS(csv: string): Promise<void> {
  const file = new EXFile(Paths.document, FILE_NAME);
  file.write(csv);
}

// Android: 앱 내부 캐시에 먼저 기록(SAF 실패 시 복원 fallback),
// 이후 사용자가 설정한 SAF 폴더에도 기록.
// 내부 캐시 write는 EXFile API를 통해 native I/O로 직접 처리되므로
// Binder 트랜잭션을 거치지 않아 대용량에서도 안전하다.
// SAF write는 RN 0.79+ 신규 아키텍처(JSI) 경유이므로 1MB Binder 제한 없음.
async function backupAndroid(csv: string): Promise<void> {
  // Step 1: 내부 캐시에 기록 — SAF 권한 만료 등 실패 시 여기서 복원 가능
  const cacheFile = new EXFile(Paths.cache, FILE_NAME);
  cacheFile.write(csv);

  // Step 2: 사용자 지정 SAF 폴더로 복사 (미설정 시 스킵)
  const dirUri = await getAndroidBackupDirUri();
  if (!dirUri) return;

  const existingFiles = await StorageAccessFramework.readDirectoryAsync(dirUri);
  const existing = existingFiles.find(uri => decodeURIComponent(uri).endsWith(FILE_NAME));
  const fileUri = existing
    ?? await StorageAccessFramework.createFileAsync(dirUri, 'logbook_autobackup', 'text/csv');
  await StorageAccessFramework.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
}

// ─── Core backup execution ────────────────────────────────────────────────────

async function _executeBackup(): Promise<void> {
  try {
    // ramp_out/ramp_in 제외한 CSV 필수 컬럼만 조회, date/sort_order ASC 정렬
    const entries = await getAllEntriesForBackup();
    const csv = buildCsv(entries);

    if (Platform.OS === 'ios') {
      await backupIOS(csv);
    } else if (Platform.OS === 'android') {
      await backupAndroid(csv);
    } else {
      return;
    }

    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, new Date().toISOString());
    console.log(`[AutoBackup] done — ${entries.length} entries`);
  } catch (e) {
    console.log('[AutoBackup] failed:', String(e));
  }
}

// ─── Debounce ─────────────────────────────────────────────────────────────────
// 마지막 데이터 변경 후 3초간 추가 변경이 없을 때 백업을 1회 실행.
// 연속 저장(예: CSV 대량 임포트 직후)에도 백업이 한 번만 돌도록 보장.

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 3000;

// insertEntry / updateEntry / deleteEntry / mergeImportEntries 에서 호출
export function scheduleAutoBackup(): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    _executeBackup();
  }, DEBOUNCE_MS);
}

// 디바운스 없이 즉시 실행 (AppState background, 수동 트리거용)
export async function autoBackupNow(): Promise<void> {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  await _executeBackup();
}

// ─── AppState listener — 앱 백그라운드 전환 시 즉시 백업 ─────────────────────

let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// 앱 최초 마운트 시 한 번만 호출 (HomeScreen useEffect 등)
export function setupAutoBackupOnBackground(): void {
  if (_appStateSubscription) return; // 중복 등록 방지
  _appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      autoBackupNow().catch(() => {});
    }
  });
}

// ─── readBackupCsv ────────────────────────────────────────────────────────────
// iOS: Documents 폴더의 백업 파일.
// Android: SAF 폴더 우선 → 실패하거나 미설정 시 내부 캐시 fallback.

export async function readBackupCsv(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const file = new EXFile(Paths.document, FILE_NAME);
    if (!file.exists) return null;
    return file.text();
  }

  if (Platform.OS === 'android') {
    // SAF 폴더 우선
    const dirUri = await getAndroidBackupDirUri();
    if (dirUri) {
      try {
        const existingFiles = await StorageAccessFramework.readDirectoryAsync(dirUri);
        const existing = existingFiles.find(uri => decodeURIComponent(uri).endsWith(FILE_NAME));
        if (existing) {
          return StorageAccessFramework.readAsStringAsync(existing, { encoding: 'utf8' });
        }
      } catch {
        console.log('[AutoBackup] SAF read failed, falling back to cache');
      }
    }
    // fallback: 내부 캐시
    const cacheFile = new EXFile(Paths.cache, FILE_NAME);
    if (cacheFile.exists) {
      console.log('[AutoBackup] restoring from internal cache');
      return cacheFile.text();
    }
  }

  return null;
}
