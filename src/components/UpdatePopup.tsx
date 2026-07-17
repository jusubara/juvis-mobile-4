import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
} from 'react-native';
import { CHANGELOG, CURRENT_VERSION } from './ChangelogModal';
import { getAppSetting, setAppSetting } from '../lib/database';

const RED  = '#DC1E28';
const DARK = '#1a2332';
const MUTED = '#6b7a8d';
const BG   = '#ffffff';
const BORDER = '#e2e8f0';

const SETTING_KEY = 'last_seen_version';

export default function UpdatePopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    getAppSetting(SETTING_KEY).then(lastSeen => {
      console.log('[UpdatePopup] lastSeen:', lastSeen, '/ current:', CURRENT_VERSION);
      if (lastSeen !== CURRENT_VERSION) {
        setVisible(true);
      }
    }).catch(e => {
      console.warn('[UpdatePopup] settings read error:', e);
    });
  }, []);

  const handleClose = () => {
    setVisible(false);
  };

  const handleDontShowAgain = async () => {
    try {
      await setAppSetting(SETTING_KEY, CURRENT_VERSION);
      console.log('[UpdatePopup] dont-show-again — saved version:', CURRENT_VERSION);
    } catch (e) {
      console.warn('[UpdatePopup] settings write error:', e);
    }
    setVisible(false);
  };

  if (!visible) return null;

  const latest = CHANGELOG[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* 헤더 */}
          <View style={s.header}>
            <View style={s.versionBadge}>
              <Text style={s.versionText}>v{latest.version}</Text>
            </View>
            <Text style={s.headerTitle}>업데이트 내역</Text>
            <Text style={s.headerDate}>{latest.date}</Text>
          </View>

          {/* 변경 목록 */}
          <View style={s.body}>
            {latest.changes.map((item, i) => (
              <View key={i} style={s.changeRow}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.changeText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* 푸터 */}
          <View style={s.footer}>
            <TouchableOpacity style={s.confirmBtn} onPress={handleDontShowAgain}>
              <Text style={s.confirmBtnText}>다시 보지 않기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
              <Text style={s.closeBtnText}>확인</Text>
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
    maxWidth: 380,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: RED,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 4,
  },
  versionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 4,
  },
  versionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerDate: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  changeRow: { flexDirection: 'row', gap: 8 },
  bullet: { color: RED, fontSize: 14, lineHeight: 21, marginTop: 0 },
  changeText: { fontSize: 14, color: DARK, lineHeight: 21, flex: 1 },

  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 8,
    gap: 8,
  },
  confirmBtn: {
    backgroundColor: RED,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  closeBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  closeBtnText: { color: MUTED, fontSize: 14, fontWeight: '600' },
});
