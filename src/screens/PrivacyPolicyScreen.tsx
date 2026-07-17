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
    title: '수집하는 정보',
    body: '본 앱은 회원가입이나 로그인 기능이 없으며, 어떠한 개인정보도 외부 서버로 전송하거나 수집하지 않습니다.\n\n사용자가 입력하는 비행 기록(날짜, 편명, 출발/도착지, 비행시간, 동승 승무원 이름 등)은 오직 사용자의 기기 내부에만 저장되며, 개발자를 포함한 어떠한 제3자도 이 데이터에 접근할 수 없습니다.',
  },
  {
    num: '2',
    title: '데이터 저장 위치',
    body: '모든 데이터는 사용자의 iOS 기기 내 로컬 데이터베이스에 저장됩니다. 인터넷 연결 없이도 앱의 모든 기능(비행 기록 작성, 조회, PDF/CSV 내보내기)을 사용할 수 있습니다.',
  },
  {
    num: '3',
    title: '데이터 삭제',
    body: '앱을 삭제하면 기기에 저장된 모든 데이터가 함께 삭제됩니다. 앱 내에서 개별 기록의 수정 및 삭제도 가능합니다.',
  },
  {
    num: '4',
    title: '제3자 제공',
    body: '본 앱은 어떠한 개인정보도 제3자에게 제공하거나 공유하지 않습니다.',
  },
  {
    num: '5',
    title: '문의처',
    body: '본 개인정보처리방침에 대해 문의사항이 있으시면 아래 연락처로 문의해 주시기 바랍니다.',
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
        <Text style={s.revised}>최종 수정일: 2026년 7월 10일</Text>

        <View style={s.intro}>
          <Text style={s.introText}>
            모바일 파일럿 로그북(이하 "본 앱")은 사용자의 개인정보 보호를 중요하게 생각합니다.
          </Text>
        </View>

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
