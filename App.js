import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { runMigrationSeedFltRouteDbIfNeeded } from './src/lib/database';
import UpdatePopup     from './src/components/UpdatePopup';
import SplashScreen_   from './src/screens/SplashScreen';
import MainMenuScreen  from './src/screens/MainMenuScreen';
import HomeScreen      from './src/screens/HomeScreen';
import ImportScreen    from './src/screens/ImportScreen';
import NewEntryScreen  from './src/screens/NewEntryScreen';
import HelpScreen             from './src/screens/HelpScreen';
import AboutScreen            from './src/screens/AboutScreen';
import PrivacyPolicyScreen    from './src/screens/PrivacyPolicyScreen';

// ─── 전역 JS 에러 핸들러 ────────────────────────────────────────────────────
// ErrorUtils는 React Native 글로벌이지만 New Architecture / 일부 환경에서
// 없을 수 있으므로 typeof 가드 적용
if (typeof ErrorUtils !== 'undefined') {
  const _defaultHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error(
      '[GlobalError]' + (isFatal ? ' (Fatal)' : ''),
      error?.message ?? String(error),
      error?.stack ?? '',
    );
    _defaultHandler(error, isFatal);
  });
}

// ─── ErrorBoundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(
      '[RenderError]',
      error?.message ?? String(error),
      info?.componentStack ?? '',
    );
  }
  render() {
    if (this.state.error) {
      return (
        <View style={eb.container}>
          <Text style={eb.icon}>✈️</Text>
          <Text style={eb.title}>문제가 발생했습니다</Text>
          <Text style={eb.msg}>앱을 다시 시작해주세요.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f0f4f8' },
  icon:  { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a2332', marginBottom: 8 },
  msg:   { fontSize: 14, color: '#6b7a8d', textAlign: 'center' },
});

// ─── App ─────────────────────────────────────────────────────────────────────

function AppContent() {
  const [screen, setScreen]                 = useState('splash');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [editingEntry, setEditingEntry]     = useState(null);

  // 네이티브 스플래시 해제 — try 블록 실패 여부와 무관하게 finally에서 보장
  useEffect(() => {
    (async () => {
      try {
        console.log('[Splash] init starting...');
        await runMigrationSeedFltRouteDbIfNeeded();
        console.log('[Splash] init done, hiding...');
        await SplashScreen.hideAsync();
        console.log('[Splash] hidden');
      } catch (err) {
        console.log('[Splash] ERROR:', err);
        Alert.alert('초기화 오류', String(err?.message || err));
        try { await SplashScreen.hideAsync(); } catch {}
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goMenu  = () => setScreen('mainMenu');
  const refresh = () => { setRefreshTrigger(n => n + 1); setScreen('home'); setEditingEntry(null); };

  const handleHomeNavigate = (s) => {
    if (s === 'mainMenu') { goMenu(); return; }
    setScreen(s);
  };

  return (
    <>
      <StatusBar style="dark" />
      <UpdatePopup />

      {screen === 'splash' && (
        <SplashScreen_ onDone={() => {
          console.log('[App] splash onDone 수신, 화면 전환');
          setScreen('mainMenu');
        }} />
      )}
      {screen === 'mainMenu' && (
        <MainMenuScreen onNavigate={s => setScreen(s)} />
      )}
      {screen === 'home' && (
        <HomeScreen onNavigate={handleHomeNavigate} onEdit={e => { setEditingEntry(e); setScreen('editEntry'); }} refreshTrigger={refreshTrigger} />
      )}
      {screen === 'import'    && <ImportScreen  onBack={goMenu} onImported={refresh} />}
      {screen === 'newEntry'  && <NewEntryScreen onBack={() => setScreen('home')} onSaved={refresh} />}
      {screen === 'editEntry' && editingEntry && (
        <NewEntryScreen onBack={() => setScreen('home')} onSaved={refresh} initialData={editingEntry} />
      )}
      {screen === 'help'    && <HelpScreen    onBack={goMenu} />}
      {screen === 'about'   && <AboutScreen   onBack={goMenu} onNavigate={setScreen} />}
      {screen === 'privacy' && <PrivacyPolicyScreen onBack={() => setScreen('about')} />}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
