import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import App from './App';

// preventAutoHideAsync는 import 완료 후 즉시 실행 (catch로 실패 무시)
SplashScreen.preventAutoHideAsync().catch(() => {});

registerRootComponent(App);
