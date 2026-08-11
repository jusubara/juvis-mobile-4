import { Platform } from 'react-native';
import { Paths, File as EXFile } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAllEntries, LogbookEntry } from './database';

const FILE_NAME = 'logbook_autobackup.csv';
const ANDROID_DIR_URI_KEY = 'autoBackupAndroidDirUri';
const LAST_BACKUP_AT_KEY = 'autoBackupLastAt';

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
// 완전한 변환이 불가능한 형식이면 디코딩된 원본 URI를 그대로 반환.
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

async function buildCsv(entries: LogbookEntry[]): Promise<string> {
  const headers = ['id', 'date', 'ac_type', 'ac_ident', 'flt_no', 'from_apt', 'to_apt',
    'pic', 'picus', 'cop', 'ip', 'tr', 'block', 'night', 'inst', 'app_type',
    'to_d', 'to_n', 'ld_d', 'ld_n', 'remark', 'crew', 'created_at', 'sort_order'];
  const exportData = [...entries].sort((a, b) => {
    if (a.date !== b.date) return (a.date ?? '').localeCompare(b.date ?? '');
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  const rows = exportData.map(e => [
    e.id, e.date, e.ac_type, e.ac_ident, e.flt_no, e.from_apt, e.to_apt,
    e.pic, e.picus, e.cop, e.ip, e.tr, e.block, e.night, e.inst, e.app_type,
    e.to_d, e.to_n, e.ld_d, e.ld_n, e.remark, e.crew ?? '', e.created_at, e.sort_order,
  ]);
  return '﻿' + [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

async function backupIOS(csv: string): Promise<void> {
  const file = new EXFile(Paths.document, FILE_NAME);
  file.write(csv);
}

async function backupAndroid(csv: string): Promise<void> {
  const dirUri = await getAndroidBackupDirUri();
  if (!dirUri) return; // 사용자가 아직 자동 백업 폴더를 설정하지 않음 — 조용히 스킵

  const existingFiles = await StorageAccessFramework.readDirectoryAsync(dirUri);
  const existing = existingFiles.find(uri => decodeURIComponent(uri).endsWith(FILE_NAME));

  const fileUri = existing ?? await StorageAccessFramework.createFileAsync(dirUri, 'logbook_autobackup', 'text/csv');
  await StorageAccessFramework.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
}

// 저장된 백업 위치에서 logbook_autobackup.csv를 찾아 읽어옴.
// 파일이 없거나(안드로이드는 폴더 미설정 포함) 찾을 수 없으면 null 반환.
export async function readBackupCsv(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const file = new EXFile(Paths.document, FILE_NAME);
    if (!file.exists) return null;
    return file.text();
  }

  if (Platform.OS === 'android') {
    const dirUri = await getAndroidBackupDirUri();
    if (!dirUri) return null;
    const existingFiles = await StorageAccessFramework.readDirectoryAsync(dirUri);
    const existing = existingFiles.find(uri => decodeURIComponent(uri).endsWith(FILE_NAME));
    if (!existing) return null;
    return StorageAccessFramework.readAsStringAsync(existing, { encoding: 'utf8' });
  }

  return null;
}

export async function autoBackup(): Promise<void> {
  try {
    const entries = await getAllEntries();
    const csv = await buildCsv(entries);

    if (Platform.OS === 'ios') {
      await backupIOS(csv);
    } else if (Platform.OS === 'android') {
      await backupAndroid(csv);
    } else {
      return;
    }

    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, new Date().toISOString());
  } catch (e) {
    console.log('[AutoBackup] failed:', String(e));
  }
}
