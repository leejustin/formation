import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dinksf.formation',
  appName: 'Formation',
  webDir: 'dist',
  backgroundColor: '#0b0b10',
  ios: { contentInset: 'never' },
  server: { androidScheme: 'https' },
  plugins: {
    // edge-to-edge with light status-bar icons over the dark stage UI
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover', style: 'DARK' },
  },
};

export default config;
