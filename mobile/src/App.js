import React, {useState, useRef} from 'react';
import {SafeAreaView, StyleSheet, NativeModules, Platform} from 'react-native';

import LoginScreen from './screens/LoginScreen';
import ChannelScreen from './screens/ChannelScreen';
import AuthManager from './auth/AuthManager';

const {ChatService} = NativeModules;

const App = () => {
  const authRef = useRef(new AuthManager());
  const [loggedIn, setLoggedIn] = useState(false);

  const handleLoginSuccess = () => {
    setLoggedIn(true);
    // Start foreground service to keep chat alive in background
    if (Platform.OS === 'android' && ChatService) {
      ChatService.startService();
    }
  };

  const handleLogout = async () => {
    if (Platform.OS === 'android' && ChatService) {
      ChatService.stopService();
    }
    await authRef.current.logout();
    setLoggedIn(false);
  };

  if (!loggedIn) {
    return (
      <LoginScreen
        authManager={authRef.current}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ChannelScreen authManager={authRef.current} onLogout={handleLogout} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
});

export default App;
