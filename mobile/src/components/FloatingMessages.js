import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Image, StyleSheet, Animated} from 'react-native';

const DISPLAY_DURATION = 8000;
const MAX_VISIBLE = 1;

const FloatingMessage = ({msg, onExpired}) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => onExpired?.(msg.id));
    }, DISPLAY_DURATION);
    return () => clearTimeout(timer);
  }, []);

  const color =
    msg.tags?.color ||
    '#e4e4e7';

  return (
    <Animated.View style={[styles.floatingMsg, {opacity}]}>
      <Text style={styles.floatingText} numberOfLines={1}>
        <Text style={[styles.floatingName, {color}]}>
          {msg.displayName || msg.username}
        </Text>
        <Text style={styles.floatingColon}>: </Text>
        {msg.segments?.map((seg, i) => {
          if (seg.type === 'emote') {
            return (
              <Image
                key={`e${i}`}
                source={{uri: seg.url}}
                style={styles.floatingEmote}
              />
            );
          }
          return (
            <Text key={`t${i}`} style={styles.floatingContent}>
              {seg.content}
            </Text>
          );
        })}
      </Text>
    </Animated.View>
  );
};

const FloatingMessages = ({messages}) => {
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];
    setVisible((prev) => {
      const next = [...prev, latest].slice(-MAX_VISIBLE);
      return next;
    });
  }, [messages.length]);

  const handleExpired = (id) => {
    setVisible((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <View style={styles.container} pointerEvents="none">
      {visible.map((msg) => (
        <FloatingMessage key={msg.id} msg={msg} onExpired={handleExpired} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: '30%',
    gap: 4,
  },
  floatingMsg: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  floatingText: {
    fontSize: 12,
    color: '#e4e4e7',
  },
  floatingName: {
    fontWeight: '700',
    fontSize: 12,
  },
  floatingColon: {
    color: '#e4e4e7',
    fontSize: 12,
  },
  floatingContent: {
    color: '#e4e4e7',
    fontSize: 12,
  },
  floatingEmote: {
    width: 18,
    height: 18,
  },
});

export default FloatingMessages;
