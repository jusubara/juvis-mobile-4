import React from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const RED   = '#DC1E28';
const DARK  = '#1a2332';
const MUTED = '#6b7a8d';
const BG    = '#ffffff';
const SECTION_BG = '#f8fafc';

const SECTIONS = [
  {
    num: '1',
    title: '수집하는 개인정보',
    body: '본 앱은 이용자의 개인정보를 수집하거나 서버로 전송하지 않습니다. 이용자가 입력한 비행 기록(날짜, 편명, 노선, 비행시간, 편조 이름 등)은 모두 이용자의 기기 내부에만 저장됩니다. 개발자는 이 데이터에 접근할 수 없습니다.',
  },
  {
    num: '2',
    title: '기기 내 자동 백업',
    body: '데이터가 변경되면 앱이 백업용 CSV 파일을 기기에 자동으로 저장합니다. 이 파일은 이용자의 기기(앱 내부 저장소 또는 이용자가 직접 선택한 폴더)에만 저장되며, 외부로 전송되지 않습니다.',
  },
  {
    num: '3',
    title: 'Google Drive 백업 (선택 기능)',
    body: '이용자가 직접 선택하는 경우에 한해, 본인의 Google 계정으로 로그인하여 비행 기록 백업 파일(CSV)을 본인의 Google Drive에 저장할 수 있습니다.\n\n• 이 기능은 이용자가 연결하기 전까지 사용되지 않습니다.\n• 요청하는 권한은 drive.file 하나이며, 본 앱이 생성한 백업 파일에만 접근합니다. 이용자의 Drive에 있는 다른 파일은 열람하거나 수정할 수 없습니다.\n• Google 로그인 인증 정보(액세스 토큰)는 이용자의 기기 보안 저장소에만 저장됩니다.\n• 개발자는 이용자의 Google 계정 정보, 이메일 주소, 백업 파일 내용을 수집, 저장, 열람하지 않으며 제3자에게 제공하지 않습니다. 백업 파일은 이용자의 기기와 이용자 본인의 Google Drive 사이에서만 전송됩니다.\n• 앱의 "저작권 및 문의" 화면에서 언제든 연결을 해제할 수 있으며, 연결 해제 시 기기에 저장된 인증 정보가 삭제됩니다. Drive에 올라간 백업 파일은 이용자가 Drive에서 직접 삭제하실 수 있습니다.\n\nGoogle API 서비스 이용자 데이터 정책 준수 안내\n모바일 파일럿 로그북이 Google API를 통해 받은 정보를 사용하고 다른 앱으로 전송할 때는 제한적 사용 요건을 포함한 Google API 서비스 사용자 데이터 정책(Google API Services User Data Policy)을 준수합니다.',
  },
  {
    num: '4',
    title: '데이터 삭제',
    body: '앱을 삭제하면 기기에 저장된 데이터가 함께 삭제됩니다. 기기 내 백업 파일과 Google Drive에 저장된 백업 파일은 이용자가 직접 삭제하셔야 합니다.',
  },
  {
    num: '5',
    title: '문의',
    body: '개인정보 관련 문의:',
    contact: true,
  },
];

export default function PrivacyPolicyScreen({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backText}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={s.title}>개인정보처리방침</Text>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.revised}>최종 수정일: 2026년 10월 7일</Text>

        {SECTIONS.map((sec) => (
          <View key={sec.num} style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.numBadge}>
                <Text style={s.numText}>{sec.num}</Text>
              </View>
              <Text style={s.sectionTitle}>{sec.title}</Text>
            </View>
            <Text style={s.sectionBody}>{sec.body}</Text>
            {sec.contact && (
              <View style={s.contactBox}>
                <View style={s.contactRow}>
                  <Text style={s.contactLabel}>개발자</Text>
                  <Text style={s.contactValue}>Jusub Kim</Text>
                </View>
                <View style={s.contactRow}>
                  <Text style={s.contactLabel}>이메일</Text>
                  <Text style={s.contactValue}>jujusangsacompany@gmail.com</Text>
                </View>
              </View>
            )}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

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

  body: { padding: 20, gap: 4 },

  revised: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
    marginBottom: 14,
  },

  intro: {
    backgroundColor: '#fff5f5',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: RED,
    padding: 16,
    marginBottom: 12,
  },
  introText: {
    fontSize: 14,
    color: DARK,
    lineHeight: 22,
  },

  section: {
    backgroundColor: SECTION_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  numBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: DARK },
  sectionBody: { fontSize: 14, color: '#444', lineHeight: 23 },

  contactBox: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  contactRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  contactLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    width: 48,
    letterSpacing: 0.3,
  },
  contactValue: { fontSize: 14, color: DARK },
});
