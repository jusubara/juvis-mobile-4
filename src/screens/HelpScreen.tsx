import React from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const RED  = '#DC1E28';
const DARK = '#1a2332';
const MUTED = '#6b7a8d';
const BG   = '#ffffff';
const SECTION_BG = '#f8fafc';

export default function HelpScreen({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backText}>← 메인메뉴</Text>
        </TouchableOpacity>
        <Text style={s.title}>사용 설명서</Text>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>파일럿 로그북 사용설명서</Text>

        {/* ─── 섹션 1 ─── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>파일 불러오기</Text>
          <Text style={s.para}>
            <Text style={s.keyword}>파일에서 불러오기</Text>
            <Text style={s.text}> 버튼을 통해 비행기록을 불러올 수 있습니다.</Text>
          </Text>
          <View style={s.numberedList}>
            <View style={s.listRow}>
              <Text style={s.listNum}>1.</Text>
              <Text style={s.listText}>
                CMS에서 다운로드한 CSV 파일을 불러오면 비행기록이 자동으로 입력됩니다.
              </Text>
            </View>
            <View style={s.listRow}>
              <Text style={s.listNum}>2.</Text>
              <Text style={s.listText}>
                이 앱에서 "CSV 내보내기"로 저장해둔 이전 데이터도 다시 불러올 수 있습니다.{'\n'}
                <Text style={s.note}>단, 내보내기 시 정렬은 "과거순"으로 선택하시길 추천합니다.</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* ─── 섹션 2 ─── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>파일 저장하기</Text>
          <Text style={s.para}>
            <Text style={s.keyword}>CSV 내보내기</Text>
            <Text style={s.text}>: 비행기록을 CSV 파일로 저장할 수 있습니다. Excel에서도 열어서 수정 가능합니다.</Text>
          </Text>
        </View>

        {/* ─── 섹션 3 ─── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>출력하기</Text>
          <Text style={s.para}>
            <Text style={s.keyword}>PDF 저장</Text>
            <Text style={s.text}>: 출력 가능한 형태로 저장됩니다. 현재는 B5 사이즈로 제본 가능한 형태로 출력되며, 앞으로 다양한 사이즈와 열 선택 기능을 추가할 예정입니다.</Text>
          </Text>
        </View>

        {/* ─── 섹션 4 ─── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>기록 순서 바꾸기</Text>
          <Text style={s.para}>
            <Text style={s.text}>행을 </Text>
            <Text style={s.keyword}>길게 누르면</Text>
            <Text style={s.text}> 위치를 옮길 수 있습니다.</Text>
          </Text>
        </View>

        {/* ─── 섹션 5 ─── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>기록 수정 및 삭제</Text>
          <Text style={s.para}>
            <Text style={s.text}>행을 </Text>
            <Text style={s.keyword}>짧게 터치하면</Text>
            <Text style={s.text}> 수정 또는 삭제를 선택할 수 있습니다.</Text>
          </Text>
        </View>

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

  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: DARK,
    marginBottom: 20,
    letterSpacing: 0.3,
  },

  section: {
    backgroundColor: SECTION_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: RED,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DARK,
    marginBottom: 10,
  },

  para: {
    lineHeight: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  text: {
    fontSize: 14,
    color: DARK,
    lineHeight: 24,
  },
  keyword: {
    fontSize: 14,
    fontWeight: '700',
    color: RED,
    lineHeight: 24,
  },
  note: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 22,
  },

  numberedList: {
    marginTop: 4,
    gap: 10,
  },
  listRow: {
    flexDirection: 'row',
    gap: 6,
  },
  listNum: {
    fontSize: 14,
    fontWeight: '700',
    color: RED,
    lineHeight: 24,
    width: 18,
  },
  listText: {
    flex: 1,
    fontSize: 14,
    color: DARK,
    lineHeight: 24,
  },
});
