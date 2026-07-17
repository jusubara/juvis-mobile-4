import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const RED   = '#C41E3A';
const BG    = '#f0f4f8';
const DARK  = '#1a2332';
const MUTED = '#6b7a8d';

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const insets     = useSafeAreaInsets();
  const progress   = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);

  useEffect(() => {
    // 진행률 애니메이션 0 → 100% (1.8초)
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 1800,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    });

    // pct 텍스트 업데이트 (리스너)
    const id = progress.addListener(({ value }) => {
      setPct(Math.round(value * 100));
    });

    anim.start(({ finished }) => {
      if (finished) {
        setPct(100);
        setTimeout(onDone, 300);
      }
    });

    return () => {
      progress.removeListener(id);
      anim.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[s.container, { paddingTop: 80 + insets.top, paddingBottom: 52 + insets.bottom }]}>

      {/* ─── 상단: 로그북 이미지 + 로고 + 브랜드 텍스트 ─── */}
      <View style={s.topSection}>
        <Image
          source={require('../../assets/pilot-logbook.png')}
          style={s.logbookImg}
          resizeMode="contain"
        />
        <Text style={s.brand}>MOBILE PILOT&apos;S LOGBOOK</Text>
        <View style={s.divider} />
      </View>

      {/* ─── 중앙: 로딩 진행 영역 ─── */}
      <View style={s.loadingSection}>
        {/* 라벨 + 퍼센트 */}
        <View style={s.progressRow}>
          <Text style={s.loadingLabel}>Initializing cockpit systems...</Text>
          <Text style={s.pctText}>{pct}%</Text>
        </View>

        {/* 진행 바 */}
        <View style={s.barTrack}>
          <Animated.View style={[s.barFill, { width: barWidth }]} />
        </View>

        {/* 보조 문구 */}
        <Text style={s.subLabel}>VERIFYING CREDENTIALS  •  UPDATING CHARTS</Text>
      </View>

      {/* ─── 하단: 인증 배지 ─── */}
      <View style={s.bottomSection}>
        <View style={s.badge}>
          <Ionicons name="checkmark-circle" size={14} color={RED} />
          <Text style={s.badgeText}>EASA PART-FCL COMPLIANT</Text>
        </View>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },

  // 상단
  topSection: { alignItems: 'center', gap: 10 },
  logbookImg: { width: 360, height: 256, marginBottom: 6 },
  brand: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  divider: {
    marginTop: 4,
    width: 40,
    height: 2,
    backgroundColor: RED,
    borderRadius: 1,
  },

  // 중앙 로딩
  loadingSection: { gap: 10 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loadingLabel: { fontSize: 13, color: DARK, fontWeight: '500' },
  pctText: { fontSize: 13, fontWeight: '700', color: RED },
  barTrack: {
    height: 5,
    backgroundColor: '#dce3ea',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: RED,
    borderRadius: 3,
  },
  subLabel: {
    fontSize: 10,
    color: MUTED,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 4,
  },

  // 하단 배지
  bottomSection: { alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#cdd5df',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1.5,
  },
});
