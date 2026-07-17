import React from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const RED   = '#C41E3A';
const BG    = '#f0f4f8';
const DARK  = '#1a2332';
const MUTED = '#6b7a8d';
const CARD  = '#ffffff';

type Target = 'home' | 'import' | 'help' | 'about';

interface CardDef {
  target:  Target;
  label:   string;
  sub:     string;
  icon:    React.ComponentProps<typeof Ionicons>['name'];
  iconBg:  string;
  iconColor: string;
  primary?: boolean;
}

const CARDS: CardDef[] = [
  {
    target: 'home',
    label: '로그북 작성하기',
    sub: '기록 조회 및 편집',
    icon: 'create',
    iconBg: RED,
    iconColor: '#fff',
    primary: true,
  },
  {
    target: 'import',
    label: '파일에서 불러오기',
    sub: 'CSV 가져오기',
    icon: 'cloud-upload-outline',
    iconBg: '#e8f0fe',
    iconColor: '#3b6fd4',
  },
  {
    target: 'help',
    label: '사용 설명서',
    sub: '앱 사용법 안내',
    icon: 'book-outline',
    iconBg: '#e8f5e9',
    iconColor: '#2e7d32',
  },
  {
    target: 'about',
    label: '저작권 및 문의',
    sub: '개발자 정보',
    icon: 'information-circle-outline',
    iconBg: '#fff3e0',
    iconColor: '#e65100',
  },
];

function MenuCard({ card, onPress }: { card: CardDef; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.card, card.primary && s.cardPrimary]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[s.iconCircle, { backgroundColor: card.iconBg }]}>
        <Ionicons name={card.icon} size={26} color={card.iconColor} />
      </View>
      <Text style={[s.cardLabel, card.primary && s.cardLabelPrimary]}>
        {card.label}
      </Text>
      <Text style={s.cardSub}>{card.sub}</Text>
    </TouchableOpacity>
  );
}

export default function MainMenuScreen({ onNavigate }: { onNavigate: (s: Target) => void }) {
  return (
    <SafeAreaView style={s.safe}>

      {/* ─── 헤더 바 ─── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="airplane" size={20} color={RED} />
          <Text style={s.headerTitle}>MOBILE PILOT'S LOGBOOK</Text>
        </View>
        <View style={s.profileIcon}>
          <Ionicons name="person" size={18} color={MUTED} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ─── 히어로 영역 ─── */}
        <View style={s.hero}>
          <Image
            source={require('../../assets/pilot-logbook.png')}
            style={s.logbookImg}
            resizeMode="contain"
          />
          <Text style={s.heroTitle}>PILOT DASHBOARD</Text>
          <Text style={s.heroSub}>
            Welcome back, Captain.{'\n'}
            Manage your flight records with precision and speed.
          </Text>
        </View>

        {/* ─── 2×2 카드 그리드 ─── */}
        <View style={s.grid}>
          {CARDS.map((card) => (
            <MenuCard
              key={card.target}
              card={card}
              onPress={() => onNavigate(card.target)}
            />
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: DARK,
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  profileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#eef2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 히어로
  scroll: { paddingBottom: 32 },
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 10,
  },
  logbookImg: { width: 280, height: 200, marginBottom: 4 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: DARK,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },

  // 그리드
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    width: '47%',
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardPrimary: {
    borderColor: RED + '33',
    backgroundColor: '#fff5f6',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: DARK,
    lineHeight: 18,
  },
  cardLabelPrimary: { color: RED },
  cardSub: { fontSize: 11, color: MUTED },
});
