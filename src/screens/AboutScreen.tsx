import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChangelogModal, { CURRENT_VERSION } from '../components/ChangelogModal';

const RED = '#DC1E28';

export default function AboutScreen({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (screen: string) => void }) {
  const [showChangelog, setShowChangelog] = useState(false);

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
