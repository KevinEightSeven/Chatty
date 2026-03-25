import React, {useState, useEffect} from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';

function daysSince(dateStr) {
  const date = new Date(dateStr);
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 365) return `${days} days`;
  const years = Math.floor(days / 365);
  const rem = days % 365;
  if (years === 1) return rem > 0 ? `1 year, ${rem} days` : '1 year';
  return rem > 0 ? `${years} years, ${rem} days` : `${years} years`;
}

const ProfileCardModal = ({visible, username, api, onClose}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !username || !api) return;
    setLoading(true);
    setData(null);

    (async () => {
      try {
        const userData = await api.getUser(username);
        if (!userData || userData.error) {
          setData(null);
          setLoading(false);
          return;
        }

        let channelInfo = null;
        let streamData = null;
        try {
          channelInfo = await api.getChannelInfo(userData.id);
        } catch (e) {}
        try {
          streamData = await api.getStreamByUser(username);
        } catch (e) {}

        setData({
          ...userData,
          gameName: channelInfo?.game_name || '',
          streamTitle: channelInfo?.title || '',
          isLive: !!(streamData && !streamData.error),
          viewerCount: streamData?.viewer_count || 0,
        });
      } catch (err) {
        console.error('Profile card error:', err);
        setData(null);
      }
      setLoading(false);
    })();
  }, [visible, username, api]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#3b82f6" />
            </View>
          ) : data ? (
            <ScrollView>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.avatarWrap}>
                  <Image
                    source={{uri: data.profile_image_url}}
                    style={styles.avatar}
                  />
                  {data.isLive && (
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  )}
                </View>
                <View style={styles.names}>
                  <Text style={styles.displayName}>
                    {data.display_name}
                  </Text>
                  <Text style={styles.username}>@{data.login}</Text>
                  <Text style={styles.userId}>ID: {data.id}</Text>
                </View>
              </View>

              {/* Bio */}
              {data.description ? (
                <Text style={styles.bio}>{data.description}</Text>
              ) : null}

              {/* Info */}
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Created</Text>
                  <Text style={styles.infoValue}>
                    {data.created_at
                      ? `${new Date(data.created_at).toLocaleDateString(
                          'en-US',
                          {year: 'numeric', month: 'long', day: 'numeric'},
                        )} (${daysSince(data.created_at)})`
                      : 'Unknown'}
                  </Text>
                </View>
                {data.isLive && (
                  <>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Viewers</Text>
                      <Text style={styles.infoValue}>
                        {data.viewerCount?.toLocaleString()}
                      </Text>
                    </View>
                    {data.gameName ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Playing</Text>
                        <Text style={styles.infoValue}>
                          {data.gameName}
                        </Text>
                      </View>
                    ) : null}
                    {data.streamTitle ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Title</Text>
                        <Text
                          style={styles.infoValue}
                          numberOfLines={2}>
                          {data.streamTitle}
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.errorText}>User not found</Text>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333338',
    width: '85%',
    maxWidth: 360,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  loadingWrap: {
    padding: 40,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  liveBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    backgroundColor: '#e91916',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  names: {
    flex: 1,
  },
  displayName: {
    color: '#e4e4e7',
    fontSize: 16,
    fontWeight: '700',
  },
  username: {
    color: '#63637a',
    fontSize: 12,
  },
  userId: {
    color: '#63637a',
    fontSize: 10,
    marginTop: 2,
  },
  bio: {
    color: '#a1a1aa',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  infoSection: {
    borderTopWidth: 1,
    borderTopColor: '#333338',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    color: '#63637a',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  infoValue: {
    color: '#a1a1aa',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  errorText: {
    color: '#63637a',
    textAlign: 'center',
    padding: 40,
    fontSize: 14,
  },
  closeBtn: {
    borderTopWidth: 1,
    borderTopColor: '#333338',
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ProfileCardModal;
