import React, {useRef, useEffect, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {WebView} from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';

// Instead of hiding everything and whitelisting the player,
// we hide specific UI elements and let the video fill the viewport.
const INJECT_JS = `
  (function() {
    var css = document.createElement('style');
    css.id = 'chatty-stream-css';
    css.textContent = \`
      html, body {
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #000 !important;
      }
    \`;
    document.head.appendChild(css);

    // Wait for the video element to appear, then reparent it
    // directly onto body so no Twitch layout containers interfere
    function setupVideo() {
      var video = document.querySelector('video');
      if (!video) return false;

      // Create a clean container directly on body
      var wrap = document.getElementById('chatty-video-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'chatty-video-wrap';
        wrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#000;';
        document.body.appendChild(wrap);
      }

      // Move video element into our container if not already there
      if (video.parentElement !== wrap) {
        wrap.appendChild(video);
        video.style.cssText = 'width:100%!important;height:100%!important;object-fit:contain!important;display:block!important;';
      }

      // Hide everything else in body except our wrapper
      Array.from(document.body.children).forEach(function(el) {
        if (el.id !== 'chatty-video-wrap') {
          el.style.display = 'none';
        }
      });

      return true;
    }

    // Poll until video appears, then keep monitoring
    var interval = setInterval(function() {
      if (setupVideo()) {
        clearInterval(interval);
        // Keep hiding new elements Twitch adds
        new MutationObserver(function() { setupVideo(); })
          .observe(document.body, { childList: true, subtree: true });
      }
    }, 500);
  })();
  true;
`;

const StreamPlayer = ({channel, style, authToken}) => {
  const webviewRef = useRef(null);
  const [cookieReady, setCookieReady] = useState(false);

  // Set auth cookie at the native level before the WebView renders
  useEffect(() => {
    const setCookies = async () => {
      if (authToken) {
        await CookieManager.set('https://www.twitch.tv', {
          name: 'auth-token',
          value: authToken,
          domain: '.twitch.tv',
          path: '/',
          secure: true,
        });
      }
      setCookieReady(true);
    };
    setCookies();
  }, [authToken]);

  if (!channel || !cookieReady) {
    return <View style={[styles.container, style]} />;
  }

  const twitchUrl = `https://m.twitch.tv/${channel}`;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={{uri: twitchUrl}}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={true}
        mixedContentMode="always"
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        injectedJavaScript={INJECT_JS}
        userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        allowsBackForwardNavigationGestures={false}
        overScrollMode="never"
        nestedScrollEnabled={false}
        scrollEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default StreamPlayer;
