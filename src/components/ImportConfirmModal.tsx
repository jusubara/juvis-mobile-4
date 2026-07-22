import React from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, StyleSheet,
} from 'react-native';
import { DuplicateEntry } from '../lib/database';

const RED = '#DC1E28';
const BG = '#FFFFFF';
const BORDER = '#E0E0E0';
const TEXT = '#1A1A1A';
const TEXT_DIM = '#666666';
const CARD_BG = '#F5F5F5';

function fmtDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

interface Props {
  visible: boolean;
  newCount: number;
  duplicates: DuplicateEntry[];
  onKeep: () => void;
  onOverwrite: () => void;
}

export default function ImportConfirmModal({ visible, newCount, duplicates, onKeep, onOverwrite }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* 헤더 */}
          <Text style={s.title}>중복 기록 발견</Text>
          <Text style={s.subtitle}>
            {'신규 '}
            <Text style={s.accent}>{newCount}건</Text>
            {'  중복 '}
            <Text style={s.accent}>{duplicates.length}건</Text>
            {' 이 발견되었습니다.'}
          </Text>
          {newCount > 0 && (
            <View style={s.hintBox}>
              <Text style={s.hint}>신규 {newCount}건은 선택과 무관하게 추가됩니다.</Text>
            </View>
          )}

          {/* 중복 목록 — 독립 스크롤 영역 */}
          <View style={s.listContainer}>
            <View style={s.listHeader}>
              <Text style={[s.listHeaderText, { width: 62 }]}>DATE</Text>
              <Text style={[s.listHeaderText, { flex: 1 }]}>FLT</Text>
              <Text style={[s.listHeaderText, { width: 52, textAlign: 'right' }]}>BLOCK</Text>
            </View>
            <FlatList
              data={duplicates}
              keyExtractor={(_, i) => String(i)}
              showsVerticalScrollIndicator
              style={{ flex: 1 }}
              renderItem={({ item, index }) => (
                <View style={[s.listItem, index % 2 === 1 && s.listItemAlt]}>
                  <View style={s.listItemDateCol}>
                    <Text style={s.listItemDate}>{fmtDate(item.incoming.date)}</Text>
                    {item.dateDiff !== 0 && (
                      <Text style={s.dateDiffBadge}>
                        {`DB:${fmtDateShort(item.existingDate)}`}
                      </Text>
                    )}
                  </View>
                  <Text style={s.listItemFlt} numberOfLines={1}>{item.incoming.flt_no || '—'}</Text>
                  <Text style={s.listItemBlock}>{item.incoming.block || '—'}</Text>
                </View>
              )}
            />
            {duplicates.some(d => d.dateDiff !== 0) && (
              <View style={s.dateDiffHint}>
                <Text style={s.dateDiffHintText}>
                  ⚠ 날짜 표기 차이 감지됨 (UTC/KST) — 같은 비행인지 확인 후 선택하세요.
                </Text>
              </View>
            )}
          </View>

          {/* 선택 버튼 */}
          <Text style={s.question}>중복 기록을 어떻게 처리할까요?</Text>
          <TouchableOpacity style={s.overwriteBtn} onPress={onOverwrite}>
            <Text style={s.overwriteBtnText}>덮어쓰기 (새 값으로 교체)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.keepBtn} onPress={onKeep}>
            <Text style={s.keepBtnText}>유지하기 (기존 그대로)</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: BG, borderRadius: 16, width: '100%',
    maxWidth: 420, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 16, elevation: 12,
  },
  title: { fontSize: 17, fontWeight: '800', color: TEXT, textAlign: 'center' },
  subtitle: { fontSize: 14, color: TEXT_DIM, textAlign: 'center' },
  accent: { color: RED, fontWeight: '700' },
  hintBox: { backgroundColor: '#FFF5F5', borderRadius: 6, padding: 8 },
  hint: { fontSize: 12, color: TEXT_DIM, textAlign: 'center' },

  listContainer: {
    height: 320, borderWidth: 1, borderColor: BORDER, borderRadius: 8, overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: CARD_BG, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  listHeaderText: { fontSize: 10, fontWeight: '700', color: TEXT_DIM, letterSpacing: 0.5 },
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9, backgroundColor: BG,
  },
  listItemAlt: { backgroundColor: '#FAFAFA' },
  listItemDateCol: { width: 62, justifyContent: 'center' },
  listItemDate: { fontSize: 13, color: TEXT_DIM },
  dateDiffBadge: { fontSize: 9, color: '#B45309', fontWeight: '700', marginTop: 1 },
  listItemFlt: { fontSize: 13, fontWeight: '600', color: TEXT, flex: 1 },
  listItemBlock: { fontSize: 12, color: TEXT_DIM, width: 52, textAlign: 'right' },
  dateDiffHint: {
    backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FDE68A',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  dateDiffHintText: { fontSize: 11, color: '#92400E', lineHeight: 16 },

  question: { fontSize: 13, fontWeight: '600', color: TEXT, textAlign: 'center', marginTop: 4 },
  overwriteBtn: {
    backgroundColor: RED, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  overwriteBtnText: { color: BG, fontSize: 14, fontWeight: '700' },
  keepBtn: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', backgroundColor: BG,
  },
  keepBtnText: { color: TEXT_DIM, fontSize: 14, fontWeight: '600' },
});
