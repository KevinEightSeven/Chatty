import React, {useState, useRef, useCallback, useEffect} from 'react';
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  StatusBar,
} from 'react-native';
import Svg, {Path, Circle, Polygon} from 'react-native-svg';
import ChatMessage from './ChatMessage';

const MAX_MESSAGES = 300;
const STATUSBAR_HEIGHT =
  Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;

// Room mode icon components matching the desktop app design
const FollowersIcon = ({active}) => (
  <View style={[styles.modeIcon, active && styles.modeIconActive]} title="Followers-Only Mode">
    <Svg width={12} height={12} viewBox="0 0 24 24" fill={active ? '#22c55e' : '#71717a'}>
      <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </Svg>
  </View>
);

const SubsIcon = ({active}) => (
  <View style={[styles.modeIcon, active && styles.modeIconActive]} title="Subscribers-Only Mode">
    <Svg width={12} height={12} viewBox="0 0 24 24" fill={active ? '#22c55e' : '#71717a'}>
      <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  </View>
);

const EmoteIcon = ({active}) => (
  <View style={[styles.modeIcon, active && styles.modeIconActive]} title="Emote-Only Mode">
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill="none" stroke={active ? '#22c55e' : '#71717a'} strokeWidth={2} />
      <Path d="M8 14s1.5 2 4 2 4-2 4-2" fill="none" stroke={active ? '#22c55e' : '#71717a'} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={9} cy={9.5} r={1.5} fill={active ? '#22c55e' : '#71717a'} />
      <Circle cx={15} cy={9.5} r={1.5} fill={active ? '#22c55e' : '#71717a'} />
    </Svg>
  </View>
);

const ChatPanel = ({
  messages,
  onSend,
  channel,
  connected,
  onUsernamePress,
  roomState,
  streamInfo,
}) => {
  const [inputText, setInputText] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const flatListRef = useRef(null);
  const autoScrollRef = useRef(true);

  // Track keyboard visibility for Android
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Auto-scroll when keyboard opens
  useEffect(() => {
    if (keyboardVisible && autoScrollRef.current && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: false});
      }, 100);
    }
  }, [keyboardVisible]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    onSend?.(text);
    setInputText('');
  }, [inputText, onSend]);

  const handleScroll = useCallback((event) => {
    const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
    const distFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    autoScrollRef.current = distFromBottom < 50;
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: false});
      }, 50);
    }
  }, [messages.length]);

  const renderItem = useCallback(
    ({item}) => (
      <ChatMessage msg={item} onUsernamePress={onUsernamePress} />
    ),
    [onUsernamePress],
  );

  const keyExtractor = useCallback(
    (item) => item.id || `${item.timestamp?.getTime()}-${item.username}`,
    [],
  );

  const content = (
    <View style={styles.container}>
      {/* Channel header with room mode icons */}
      <View style={styles.header}>
        <Text style={styles.channelName}>#{channel}</Text>
        <View style={styles.modeIcons}>
          <FollowersIcon active={!!roomState?.followersOnly} />
          <SubsIcon active={!!roomState?.subsOnly} />
          <EmoteIcon active={!!roomState?.emoteOnly} />
        </View>
        <View
          style={[
            styles.statusDot,
            {backgroundColor: connected ? '#22c55e' : '#ef4444'},
          ]}
        />
      </View>

      {/* Live info bar */}
      {streamInfo && (
        <View style={styles.liveInfoBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.liveInfoScroll}>
            <View style={styles.liveViewerCount}>
              <View style={styles.liveDot} />
              <Text style={styles.liveViewerText}>
                {Number(streamInfo.viewer_count).toLocaleString()}
              </Text>
            </View>
            {streamInfo.game_name ? (
              <Text style={styles.liveGame}>{streamInfo.game_name}</Text>
            ) : null}
            {streamInfo.title ? (
              <>
                <Text style={styles.liveSep}>—</Text>
                <Text style={styles.liveTitle} numberOfLines={1}>
                  {streamInfo.title}
                </Text>
              </>
            ) : null}
          </ScrollView>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.messageList}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        maxToRenderPerBatch={15}
        windowSize={21}
        removeClippedSubviews={true}
        initialNumToRender={30}
        keyboardShouldPersistTaps="handled"
      />

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Send a message..."
          placeholderTextColor="#63637a"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendBtnText}>Chat</Text>
        </Pressable>
      </View>
    </View>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{flex: 1}} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }

  // On Android, adjustPan in AndroidManifest handles keyboard
  return content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333338',
    backgroundColor: '#222226',
  },
  channelName: {
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  modeIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  modeIcon: {
    opacity: 0.35,
  },
  modeIconActive: {
    opacity: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveInfoBar: {
    backgroundColor: 'rgba(200, 0, 0, 0.25)',
  },
  liveInfoScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveViewerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveViewerText: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '700',
  },
  liveGame: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
  },
  liveSep: {
    color: 'rgba(255, 100, 100, 0.4)',
    fontSize: 12,
    flexShrink: 0,
  },
  liveTitle: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  messageList: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#333338',
    backgroundColor: '#222226',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1e',
    color: '#e4e4e7',
    borderWidth: 1,
    borderColor: '#333338',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  sendBtn: {
    marginLeft: 8,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ChatPanel;
