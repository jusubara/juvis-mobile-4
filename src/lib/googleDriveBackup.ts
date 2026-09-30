/**
 * Google Drive 백업/복원 모듈
 *
 * 사용 전 아래 두 상수에 Google Cloud Console에서 발급받은 클라이언트 ID를 입력하세요.
 * 발급 절차: Google Cloud Console 설정 안내 참조 (AboutScreen 또는 README)
 *
 * IOS_CLIENT_ID / ANDROID_CLIENT_ID: ".apps.googleusercontent.com" 앞부분만 입력
 *   예) "123456789012-abcdefghijklmnopqrstuvwxyz012345" (따옴표 안에)
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { AuthRequest, exchangeCodeAsync } from 'expo-auth-session';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// ── Google Cloud Console OAuth 클라이언트 ID ──────────────────────────────────
// iOS 앱 타입으로 생성 (번들 ID: com.jusubara.juvismobile4)
const IOS_CLIENT_ID = '912302050883-qisj5mrj1l7aj7o2v3egjenq16j3dmiq';
// Android 앱 타입으로 생성 (패키지명: com.jusubara.juvismobile4 + SHA-1)
const ANDROID_CLIENT_ID = '912302050883-9hnf8u7ql4ve4escemmte9l1139iq13v';

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const SECURE_KEY_TOKEN = 'gdrive_access_token';
const SECURE_KEY_EMAIL = 'gdrive_user_email';
const STORAGE_KEY_FILE_ID = 'gdrive_backup_file_id';
const DRIVE_API_BASE = 'https://www.googleapis.com';

function getClientId(): string {
  return `${Platform.OS === 'ios' ? IOS_CLIENT_ID : ANDROID_CLIENT_ID}.apps.googleusercontent.com`;
}

// Google native 클라이언트의 리다이렉트 URI = "com.googleusercontent.apps.{클라이언트ID}:/"
function getRedirectUri(): string {
  const id = Platform.OS === 'ios' ? IOS_CLIENT_ID : ANDROID_CLIENT_ID;
  return `com.googleusercontent.apps.${id}:/`;
}

// ── 로그인 ────────────────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<void> {
  const clientId = getClientId();
  const redirectUri = getRedirectUri();

  const request = new AuthRequest({
    clientId,
    redirectUri,
    scopes: ['https://www.googleapis.com/auth/drive.file', 'email'],
    usePKCE: true,
    extraParams: { access_type: 'online' },
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success') return;

  const tokenResponse = await exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
    },
    DISCOVERY
  );

  await SecureStore.setItemAsync(SECURE_KEY_TOKEN, tokenResponse.accessToken);

  try {
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    }).then((r) => r.json());
    if (userInfo.email) {
      await SecureStore.setItemAsync(SECURE_KEY_EMAIL, userInfo.email);
    }
  } catch {}
}

// ── 상태 확인 ─────────────────────────────────────────────────────────────────

export async function isGoogleSignedIn(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(SECURE_KEY_TOKEN);
  return !!token;
}

export async function getGoogleUserEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEY_EMAIL);
}

// ── 업로드 ────────────────────────────────────────────────────────────────────
// 저장된 파일 ID가 있으면 업데이트, 없으면 새로 생성 후 파일 ID를 로컬에 저장.
// 네트워크/API 에러 시 예외를 던짐 (호출부에서 catch).

export async function uploadBackupToDrive(csvContent: string, fileName: string): Promise<void> {
  const token = await SecureStore.getItemAsync(SECURE_KEY_TOKEN);
  if (!token) throw new Error('Google Drive 로그인이 필요합니다.');

  const existingFileId = await AsyncStorage.getItem(STORAGE_KEY_FILE_ID);

  if (existingFileId) {
    // 기존 파일 내용 업데이트
    const res = await fetch(
      `${DRIVE_API_BASE}/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/csv; charset=utf-8',
        },
        body: csvContent,
      }
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await SecureStore.deleteItemAsync(SECURE_KEY_TOKEN);
      }
      throw new Error(`Drive 업로드 실패 (${res.status})`);
    }
  } else {
    // 신규 파일 생성 (multipart)
    const boundary = 'logbook_backup_boundary';
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name: fileName, mimeType: 'text/csv' })}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/csv; charset=utf-8\r\n\r\n` +
      `${csvContent}\r\n` +
      `--${boundary}--`;

    const res = await fetch(
      `${DRIVE_API_BASE}/upload/drive/v3/files?uploadType=multipart`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await SecureStore.deleteItemAsync(SECURE_KEY_TOKEN);
      }
      throw new Error(`Drive 파일 생성 실패 (${res.status})`);
    }
    const data = await res.json();
    if (data.id) {
      await AsyncStorage.setItem(STORAGE_KEY_FILE_ID, data.id);
    }
  }
}

// ── 다운로드 ──────────────────────────────────────────────────────────────────
// 저장된 파일 ID로 CSV 다운로드. 파일 ID 없거나 실패 시 null 반환.

export async function downloadBackupFromDrive(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(SECURE_KEY_TOKEN);
  if (!token) return null;

  const fileId = await AsyncStorage.getItem(STORAGE_KEY_FILE_ID);
  if (!fileId) return null;

  const res = await fetch(`${DRIVE_API_BASE}/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await SecureStore.deleteItemAsync(SECURE_KEY_TOKEN);
    }
    return null;
  }
  return res.text();
}

// ── 로그아웃 ──────────────────────────────────────────────────────────────────

export async function signOutGoogle(): Promise<void> {
  const token = await SecureStore.getItemAsync(SECURE_KEY_TOKEN);
  if (token) {
    // 토큰 revoke 시도 (실패해도 무시)
    fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {});
  }
  await SecureStore.deleteItemAsync(SECURE_KEY_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_KEY_EMAIL);
  // 파일 ID는 유지 (재연결 시 같은 파일 계속 사용)
}
