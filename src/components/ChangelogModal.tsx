import React, { useState } from 'react';
import Constants from 'expo-constants';
import {
  View, Text, Modal, TouchableOpacity,
  ScrollView, StyleSheet,
} from 'react-native';

const RED  = '#DC1E28';
const DARK = '#1a2332';
const MUTED = '#6b7a8d';
const BG   = '#ffffff';
const BORDER = '#e2e8f0';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.1',
    date: '2026-07-22',
    changes: [
      '파일 불러오기를 병합 방식으로 개선 (중복 기록은 확인 후 덮어쓰기/유지하기 선택 가능, 기존 데이터를 삭제하지 않고 안전하게 추가)',
      'CSV 파일 병합 시 UTC/로컬시간 표기 차이로 인한 날짜 하루 오차도 중복으로 인식하도록 개선 (편명·블록타임 일치 시 날짜 ±1일 허용)',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-21',
    changes: [
      '로그북 리스트에 검색 기능 추가 (편명/기재/출발지/도착지/편조 이름으로 검색 가능)',
      '빈 로그북 화면에 샘플 데이터로 둘러보기 기능 추가',
      '업데이트 확인 팝업에서 "확인" 버튼을 눌러도 다음 실행 시 팝업이 다시 뜨던 문제 수정',
    ],
  },
  {
    version: '1.1.2',
    date: '2026-07-20',
    changes: [
      '빈 로그북 화면에 샘플 데이터로 둘러보기 기능 추가',
      '업데이트 확인 팝업에서 "확인" 버튼을 눌러도 다음 실행 시 팝업이 다시 뜨던 문제 수정',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-07-19',
    changes: [
      'CSV 불러오기 시 "SUM"(합계) 행이 연도로 잘못 인식되던 문제 수정',
      '비행시간 셀 중 IP/TR 컬럼이 좁아서 두 줄로 표시되던 문제 수정',
      '안드로이드에서 빠른 스크롤 시 진동+정지, 이후 삭제/불러오기 실패하던 문제 수정',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-16',
    changes: [
      '앱 이름을 "모바일 파일럿 로그북"으로 변경',
      '기재 등록번호 입력을 자유 텍스트 방식으로 변경',
      'PDF 저장 시 공유 시트가 뜨지 않던 문제 수정',
      '스플래시 화면 레이아웃 중앙 정렬',
      '안드로이드 상태바/내비게이션바 겹침 문제 수정',
      '안드로이드에서 로그북 목록 가로 스크롤이 제대로 동작하지 않던 문제 수정',
      'CSV 내보내기 후 다시 불러올 때 편조 정보가 사라지던 문제 수정',
      '앱 삭제 후 재설치 시 데이터가 남지 않도록 개선',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-07-14',
    changes: [
      'PDF 저장 시 파일명 충돌 오류 수정',
      'PDF 페이지 사이즈(B5/A4/Letter) 선택 기능 추가',
      'A4/Letter 선택 시 페이지당 줄 수(10~20) 직접 선택 가능',
      '상태바/내비게이션바가 화면을 가리던 문제 수정 (안드로이드 포함)',
      '드래그 핸들 애니메이션 및 햅틱 피드백 개선',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-10',
    changes: ['최초 출시'],
  },
];

export const CURRENT_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// ─── 다음 버전에 포함될 예정 항목 (UI에는 미노출) ───────────────────────────
// 정식 버전 전환 시 CHANGELOG 최상단에 새 entry로 이동할 것
export const CHANGELOG_PENDING: { date: string; change: string }[] = [];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ChangelogModal({ visible, onClose }: Props) {
  const [openIdx, setOpenIdx] = useState(0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* 헤더 */}
          <View style={s.header}>
            <Text style={s.headerTitle}>업데이트 전체 내역</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 버전 아코디언 */}
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            {CHANGELOG.map((entry, idx) => (
              <View key={entry.version} style={[s.entry, idx < CHANGELOG.length - 1 && s.entryBorder]}>
                <TouchableOpacity
                  style={s.entryHeader}
                  onPress={() => setOpenIdx(openIdx === idx ? -1 : idx)}
                  activeOpacity={0.7}
                >
                  <View style={s.entryLeft}>
                    <View style={[s.badge, idx === 0 && s.badgeLatest]}>
                      <Text style={[s.badgeText, idx === 0 && s.badgeTextLatest]}>
                        v{entry.version}
                      </Text>
                    </View>
                    <Text style={s.dateText}>{entry.date}</Text>
                  </View>
                  <Text style={s.chevron}>{openIdx === idx ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {openIdx === idx && (
                  <View style={s.changeList}>
                    {entry.changes.map((item, i) => (
                      <View key={i} style={s.changeRow}>
                        <Text style={s.bullet}>•</Text>
                        <Text style={s.changeText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {/* 푸터 */}
          <View style={s.footer}>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: BG,
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: DARK },
  closeX: { fontSize: 16, color: MUTED, fontWeight: '600' },

  scroll: { maxHeight: 420 },

  entry: {},
  entryBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  entryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, backgroundColor: '#f1f5f9',
  },
  badgeLatest: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 12, fontWeight: '700', color: MUTED },
  badgeTextLatest: { color: RED },
  dateText: { fontSize: 12, color: MUTED },
  chevron: { fontSize: 10, color: MUTED },

  changeList: { paddingHorizontal: 20, paddingBottom: 14, gap: 6 },
  changeRow: { flexDirection: 'row', gap: 8 },
  bullet: { color: RED, fontSize: 13, lineHeight: 20 },
  changeText: { fontSize: 13, color: DARK, lineHeight: 20, flex: 1 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: BORDER },
  closeBtn: {
    backgroundColor: DARK, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
