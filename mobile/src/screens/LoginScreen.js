import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';

const LoginScreen = ({authManager, onLoginSuccess}) => {
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    // Try to restore session
    authManager.init().then((valid) => {
      setLoading(false);
      if (valid) {
        onLoginSuccess();
      }
    });

    // Listen for deep link redirect
    const handleUrl = async ({url}) => {
      if (url?.startsWith('chattymobile://auth')) {
        setLoggingIn(true);
        const success = await authManager.handleRedirect(url);
        setLoggingIn(false);
        if (success) {
          onLoginSuccess();
        }
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url?.startsWith('chattymobile://auth')) {
        handleUrl({url});
      }
    });

    return () => sub.remove();
  }, []);

  const handleLogin = () => {
    const {url} = authManager.getLoginUrl();
    Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <Text style={styles.logoText}>{'>_'}</Text>
      </View>
      <Text style={styles.title}>Chatty</Text>
      <Text style={styles.subtitle}>
        A modern Twitch chat client{'\n'}for mobile
      </Text>

      <Pressable
        style={styles.loginBtn}
        onPress={handleLogin}
        disabled={loggingIn}>
        {loggingIn ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginBtnText}>Connect with Twitch</Text>
        )}
      </Pressable>

      <Text style={styles.hint}>
        You'll be redirected to Twitch to authorize
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#222226',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333338',
  },
  logoText: {
    color: '#71717a',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  title: {
    color: '#e4e4e7',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#71717a',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 22,
  },
  loginBtn: {
    backgroundColor: '#9146ff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 10,
    minWidth: 240,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: '#3f3f46',
    fontSize: 12,
    marginTop: 16,
  },
});

export default LoginScreen;
