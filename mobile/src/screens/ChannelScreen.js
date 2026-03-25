import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';

import StreamPlayer from '../components/StreamPlayer';
import ChatPanel from '../components/ChatPanel';
import ProfileCardModal from '../components/ProfileCardModal';

import TwitchChat from '../api/TwitchChat';
import TwitchAPI from '../api/TwitchAPI';
import EmoteBadgeManager from '../api/EmoteBadgeManager';

const MAX_MESSAGES = 300;
const STATUSBAR_HEIGHT =
  Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;
const SWIPE_THRESHOLD = 50;
const STREAM_POLL_INTERVAL = 60000;

const ChannelScreen = ({authManager, onLogout}) => {
  const {width, height} = useWindowDimensions();
  const isLandscape = width > height;

  const [channel, setChannel] = useState('');
  const [joinedChannel, setJoinedChannel] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [profileUser, setProfileUser] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [streamInfo, setStreamInfo] = useState(null);

  const chatRef = useRef(null);
  const apiRef = useRef(null);
  const emoteRef = useRef(null);
  const msgIdRef = useRef(0);
  const chatSlideAnim = useRef(new Animated.Value(0)).current;
  const batchRef = useRef([]);
  const batchTimerRef = useRef(null);
  const chatVisibleRef = useRef(false);
  const streamPollRef = useRef(null);

  // Initialize API + Chat
  useEffect(() => {
    const token = authManager.getAccessToken();
    const clientId = authManager.getClientId();
    const user = authManager.userInfo;

    const api = new TwitchAPI(token, clientId);
    apiRef.current = api;

    const emoteManager = new EmoteBadgeManager(api);
    emoteRef.current = emoteManager;

    const chat = new TwitchChat();
    chatRef.current = chat;

    chat.onStateChange = (isConnected) => {
      setConnected(isConnected);
    };

    chat.onRoomState = (ch, state) => {
      setRoomState(state);
    };

    chat.connect(user.login, token);

    return () => {
      chat.disconnect();
      if (streamPollRef.current) clearInterval(streamPollRef.current);
    };
  }, []);

  // Fetch stream info (viewer count, game, title)
  const fetchStreamInfo = useCallback(async (channelName) => {
    const api = apiRef.current;
    if (!api || !channelName) return;
    const stream = await api.getStreamByUser(channelName);
    if (stream && !stream.error) {
      setStreamInfo(stream);
    } else {
      setStreamInfo(null);
    }
  }, []);

  // Join channel
  const joinChannel = useCallback(
    async (ch) => {
      const name = ch.toLowerCase().trim().replace(/^#/, '');
      if (!name) return;

      const chat = chatRef.current;
      if (!chat) return;

      if (joinedChannel) {
        chat.offChannel(joinedChannel);
        chat.part(joinedChannel);
      }

      setMessages([]);
      setRoomState(null);
      setStreamInfo(null);
      setChannel(name);
      setJoinedChannel(name);

      const api = apiRef.current;
      if (api) {
        const userData = await api.getUser(name);
        if (userData && !userData.error) {
          emoteRef.current?.loadChannel(userData.id);
        }
      }

      // Fetch stream details + start polling
      fetchStreamInfo(name);
      if (streamPollRef.current) clearInterval(streamPollRef.current);
      streamPollRef.current = setInterval(
        () => fetchStreamInfo(name),
        STREAM_POLL_INTERVAL,
      );

      chat.join(name);
      chat.onChannel(name, (parsed) => {
        if (parsed.command !== 'PRIVMSG') return;

        const emoteManager = emoteRef.current;
        const displayName =
          parsed.tags['display-name'] || parsed.username;
        const channelId = parsed.tags['room-id'] || '';

        const badges = emoteManager
          ? emoteManager.getBadgeSegments(
              parsed.tags.badges || '',
              channelId,
            )
          : [];

        const segments = emoteManager
          ? emoteManager.parseMessage(
              parsed.message,
              parsed.tags.emotes || '',
              channelId,
            )
          : [{type: 'text', content: parsed.message}];

        const msg = {
          id: `msg-${++msgIdRef.current}`,
          username: parsed.username,
          displayName,
          tags: parsed.tags,
          message: parsed.message,
          badges,
          segments,
          timestamp: new Date(),
        };

        batchRef.current.push(msg);
        if (!batchTimerRef.current) {
          batchTimerRef.current = setTimeout(() => {
            const batch = batchRef.current;
            batchRef.current = [];
            batchTimerRef.current = null;
            setMessages((prev) => {
              const next = [...prev, ...batch];
              return next.length > MAX_MESSAGES
                ? next.slice(-MAX_MESSAGES)
                : next;
            });
          }, 100);
        }
      });
    },
    [joinedChannel, fetchStreamInfo],
  );

  // Send message with local echo
  const handleSend = useCallback(
    (text) => {
      if (!chatRef.current || !channel) return;
      const sent = chatRef.current.send(channel, text);
      if (sent) {
        const user = authManager.userInfo;
        const emoteManager = emoteRef.current;
        const segments = emoteManager
          ? emoteManager.parseMessage(text, '', '')
          : [{type: 'text', content: text}];

        const localMsg = {
          id: `msg-${++msgIdRef.current}`,
          username: user.login,
          displayName: user.display_name || user.login,
          tags: {color: '#3b82f6'},
          message: text,
          badges: [],
          segments,
          timestamp: new Date(),
          isLocal: true,
        };

        setMessages((prev) => {
          const next = [...prev, localMsg];
          return next.length > MAX_MESSAGES
            ? next.slice(-MAX_MESSAGES)
            : next;
        });
      }
    },
    [channel, authManager],
  );

  // Toggle landscape chat panel
  const toggleLandscapeChat = useCallback(
    (show) => {
      const next = typeof show === 'boolean' ? show : !chatVisibleRef.current;
      if (next === chatVisibleRef.current) return;
      chatVisibleRef.current = next;
      setChatVisible(next);
      Animated.timing(chatSlideAnim, {
        toValue: next ? 1 : 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    },
    [chatSlideAnim],
  );

  // Swipe gesture handler for landscape
  const handleSwipeGesture = useCallback(
    (event) => {
      if (event.nativeEvent.state === State.END) {
        const {translationX, velocityX} = event.nativeEvent;
        if (translationX < -SWIPE_THRESHOLD || velocityX < -500) {
          toggleLandscapeChat(true);
        }
        if (translationX > SWIPE_THRESHOLD || velocityX > 500) {
          toggleLandscapeChat(false);
        }
      }
    },
    [toggleLandscapeChat],
  );

  const handleUsernamePress = useCallback((username) => {
    setProfileUser(username);
  }, []);

  // Animated stream width for landscape
  const chatPanelWidth = width * 0.3;
  const streamAnimWidth = chatSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [width, width - chatPanelWidth],
  });

  // Channel picker
  if (!channel) {
    return (
      <View style={styles.pickerContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0c" />
        <View style={styles.pickerCard}>
          <Text style={styles.pickerTitle}>Join a Channel</Text>
          <TextInput
            style={styles.pickerInput}
            value={channelInput}
            onChangeText={setChannelInput}
            placeholder="Channel name..."
            placeholderTextColor="#63637a"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => joinChannel(channelInput)}
          />
          <Pressable
            style={styles.pickerBtn}
            onPress={() => joinChannel(channelInput)}>
            <Text style={styles.pickerBtnText}>Join</Text>
          </Pressable>
        </View>
        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </Pressable>
      </View>
    );
  }

  // ── MAIN LAYOUT ──
  return (
    <GestureHandlerRootView
      style={[
        styles.container,
        {flexDirection: isLandscape ? 'row' : 'column'},
      ]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#000"
        translucent={true}
        hidden={isLandscape}
      />

      {/* Status bar spacer — portrait only */}
      {!isLandscape && (
        <View style={{height: STATUSBAR_HEIGHT, backgroundColor: '#000'}} />
      )}

      {/* Stream player — PanGestureHandler always wraps to keep tree stable */}
      <Animated.View
        style={
          isLandscape
            ? {width: streamAnimWidth, height: '100%'}
            : {height: (height - STATUSBAR_HEIGHT) * 0.3}
        }>
        <PanGestureHandler
          onHandlerStateChange={handleSwipeGesture}
          activeOffsetX={[-20, 20]}
          enabled={isLandscape}>
          <View style={{flex: 1}}>
            <StreamPlayer channel={channel} style={{flex: 1}} authToken={authManager.getAccessToken()} />
          </View>
        </PanGestureHandler>
      </Animated.View>

      {/* Chat panel — portrait: below stream, landscape: beside stream */}
      {!isLandscape ? (
        <View style={{flex: 1}}>
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            channel={channel}
            connected={connected}
            onUsernamePress={handleUsernamePress}
            roomState={roomState}
            streamInfo={streamInfo}
          />
        </View>
      ) : (
        chatVisible && (
          <View
            style={[styles.landscapeChatPanel, {width: chatPanelWidth}]}>
            <ChatPanel
              messages={messages}
              onSend={handleSend}
              channel={channel}
              connected={connected}
              onUsernamePress={handleUsernamePress}
              roomState={roomState}
              streamInfo={streamInfo}
            />
          </View>
        )
      )}

      <ProfileCardModal
        visible={!!profileUser}
        username={profileUser}
        api={apiRef.current}
        onClose={() => setProfileUser(null)}
      />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  pickerCard: {
    backgroundColor: '#1a1a1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333338',
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  pickerTitle: {
    color: '#e4e4e7',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerInput: {
    backgroundColor: '#222226',
    borderWidth: 1,
    borderColor: '#333338',
    borderRadius: 8,
    color: '#e4e4e7',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  pickerBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  pickerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutBtn: {
    marginTop: 20,
    paddingVertical: 10,
  },
  logoutBtnText: {
    color: '#63637a',
    fontSize: 13,
  },
  landscapeChatPanel: {
    height: '100%',
    backgroundColor: '#1a1a1e',
    borderLeftWidth: 1,
    borderLeftColor: '#333338',
  },
});

export default ChannelScreen;
