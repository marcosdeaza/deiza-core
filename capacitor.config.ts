import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.deiza.app',
  appName: 'Deiza',
  webDir: 'dist',
  server: {
    // For production: remove this block and use the built dist folder
    // For development testing: point to your VPS
    // androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    backgroundColor: '#0d0d0d',
    preferredContentMode: 'mobile',
    handleApplicationNotifications: true,
    allowsLinkPreview: false,
    webViewInjection: true,
  },
  plugins: {
    Keyboard: {
      resize: 'native',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1c1714',
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#1c1714',
      iosSpinnerStyle: 'small',
      spinnerColor: '#8C2F39',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#8C2F39',
    },
  },
};

export default config;
