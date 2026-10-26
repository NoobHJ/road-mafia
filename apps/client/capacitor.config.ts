import type { CapacitorConfig } from '@capacitor/cli';

// Native shells load the built web app from dist/. Point VITE_SERVER_URL at the
// game server before `npm run cap:sync`, since the app is not served by it.
const config: CapacitorConfig = {
  appId: 'com.roadmafia.app',
  appName: 'Road Mafia',
  webDir: 'dist',
  backgroundColor: '#f4f1ea',
};

export default config;
