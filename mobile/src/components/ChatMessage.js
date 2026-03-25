import React, {memo} from 'react';
import {View, Text, Image, StyleSheet, Pressable} from 'react-native';

const COLORS = [
  '#FF4500', '#FF6347', '#2E8B57', '#DAA520', '#D2691E',
  '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
  '#B22222', '#7FFF00', '#9ACD32', '#FF7F50', '#9932CC',
  '#008B8B', '#FFD700', '#6A5ACD', '#FF1493', '#00CED1',
];

function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

const ChatMessage = memo(({msg, onUsernamePress}) => {
  const color = msg.tags?.color || nameColor(msg.displayName || msg.username);
  const ts = msg.timestamp
    ? `${msg.timestamp.getHours().toString().padStart(2, '0')}:${msg.timestamp.getMinutes().toString().padStart(2, '0')}`
    : '';

  return (
    <View style={styles.container}>
      <Text style={styles.time}>{ts}</Text>
      {msg.badges?.map((badge, i) => (
        <Image
          key={`b${i}`}
          source={{uri: badge.url}}
          style={styles.badge}
        />
      ))}
      <Pressable onPress={() => onUsernamePress?.(msg.username)}>
        <Text style={[styles.username, {color}]}>
          {msg.displayName || msg.username}
        </Text>
      </Pressable>
      <Text style={styles.colon}>: </Text>
      <View style={styles.messageWrap}>
        {msg.segments?.map((seg, i) => {
          if (seg.type === 'emote') {
            return (
              <Image
                key={`e${i}`}
                source={{uri: seg.url}}
                style={styles.emote}
              />
            );
          }
          if (seg.type === 'mention') {
            return (
              <Text key={`m${i}`} style={styles.mention}>
                {seg.content}
              </Text>
            );
          }
          if (seg.type === 'link') {
            return (
              <Text key={`l${i}`} style={styles.link}>
                {seg.content}
              </Text>
            );
          }
          return (
            <Text key={`t${i}`} style={styles.text}>
              {seg.content}
            </Text>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  time: {
    color: '#63637a',
    fontSize: 10,
    marginRight: 6,
    fontVariant: ['tabular-nums'],
  },
  badge: {
    width: 18,
    height: 18,
    marginRight: 3,
  },
  username: {
    fontWeight: '700',
    fontSize: 13,
  },
  colon: {
    color: '#e4e4e7',
    fontSize: 13,
  },
  messageWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flex: 1,
  },
  text: {
    color: '#e4e4e7',
    fontSize: 13,
    lineHeight: 20,
  },
  emote: {
    width: 24,
    height: 24,
    marginHorizontal: 1,
  },
  mention: {
    color: '#a78bfa',
    fontWeight: '600',
    fontSize: 13,
  },
  link: {
    color: '#60a5fa',
    fontSize: 13,
  },
});

export default ChatMessage;
