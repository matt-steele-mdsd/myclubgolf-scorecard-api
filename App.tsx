import { Slot, useNavigationContainerRef } from 'expo-router';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

export default function App() {
  const ref = useNavigationContainerRef();

  // Channel is read-only and set via eas.json or app.json
  // For beta testing, use EAS builds with channel: 'beta' in eas.json

  return <Slot />;
}
