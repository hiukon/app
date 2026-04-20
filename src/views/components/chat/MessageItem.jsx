// components/MessageItem.jsx
import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown from 'react-native-markdown-display';
import { MaterialIcons } from '@expo/vector-icons';
import { ArtifactItem } from './ArtifactItem';
import { convertTokensToDisplayWithMap, cleanBotText, sanitizeTechnicalText, formatMarkdownText } from '../utils/textUtils';
import { removeTriggerTokens } from '../../../utils/triggerParser';

export const MessageItem = memo(({
    item,
    onLongPressUserMessage,
    formatTimestamp,
    thinkingDots,
    domainIdToCodeMap,
    onSpeak,
    isSpeaking,
    onStopSpeaking,
}) => {
    const isUser = item.isUser;
    const isStreaming = !isUser && item.status === 'streaming';

    let displayText = '';
    if (isUser) {
        displayText = convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap);
    } else {
        let rawText = item.status === 'streaming' && !`${item.text || ''}`.trim()
            ? `Đang suy nghĩ${thinkingDots}`
            : (item.text || '');

        let cleaned = cleanBotText(rawText);
        if (cleaned === null) {
            if (item.status !== 'streaming') return null;
            cleaned = rawText;
        }

        cleaned = sanitizeTechnicalText(cleaned);
        if (cleaned === 'Đã có lỗi xảy ra. Vui lòng thử lại.') {
            if (item.status !== 'streaming') return null;
        }
        cleaned = removeTriggerTokens(cleaned);
        displayText = convertTokensToDisplayWithMap(cleaned, domainIdToCodeMap);
        displayText = formatMarkdownText(displayText);

        if (!displayText.trim()) return null;
    }

    const handleLongPress = () => {
        if (!isUser) return;
        onLongPressUserMessage(item.id, convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap));
    };

    const handleSpeak = () => {
        if (isSpeaking === item.id) {
            onStopSpeaking?.();
        } else {
            onSpeak?.(displayText, item.id);
        }
    };

    const isThisSpeaking = isSpeaking === item.id;

    return (
        <TouchableOpacity
            activeOpacity={isUser ? 0.9 : 1}
            onLongPress={handleLongPress}
            style={{
                flexDirection: 'row',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 12,
                paddingHorizontal: 10,
            }}
        >
            <View style={{
                alignItems: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
            }}>
                <LinearGradient
                    colors={isUser ? ['#e7e8e9', '#f9fbff'] : ['#732cc9', '#7840f2', '#5c50da', '#5233f0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        padding: 1.5,
                        borderRadius: 18,
                        borderBottomLeftRadius: isUser ? 18 : 4,
                        borderBottomRightRadius: isUser ? 4 : 18,
                    }}
                >
                    <View style={{
                        backgroundColor: isUser ? '#2581eb' : 'white',
                        padding: 12,
                        borderRadius: 17,
                        borderBottomLeftRadius: isUser ? 17 : 4,
                        borderBottomRightRadius: isUser ? 4 : 17,
                    }}>
                        {isUser ? (
                            <Text style={{ color: 'white', fontSize: 14, lineHeight: 20 }}>
                                {displayText}
                            </Text>
                        ) : (
                            <View>
                                <Markdown
                                    style={{
                                        body: { color: '#1f2937', fontSize: 14, lineHeight: 22 },
                                        paragraph: { marginBottom: 10, marginTop: 4, marginLeft: 0, paddingLeft: 0, paddingRight: 8, lineHeight: 22 },
                                        strong: { fontWeight: '700', color: '#111827' },
                                        bullet_list: { marginBottom: 12, marginTop: 6, marginLeft: 0, paddingLeft: 0 },
                                        bullet_list_item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, marginLeft: 0, paddingLeft: 0 },
                                        bullet_list_icon: { marginRight: 8, marginTop: 2, fontSize: 16, color: '#2563eb', width: 16, textAlign: 'center' },
                                        bullet_list_content: { flex: 1, marginLeft: 0, paddingLeft: 0, paddingRight: 8 },
                                        ordered_list: { marginBottom: 12, marginTop: 6, marginLeft: 0, paddingLeft: 0 },
                                        ordered_list_item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, marginLeft: 0, paddingLeft: 0 },
                                        ordered_list_icon: { marginRight: 8, minWidth: 22, marginTop: 2, fontSize: 14, fontWeight: '600', color: '#2563eb' },
                                        ordered_list_content: { flex: 1, marginLeft: 0, paddingLeft: 0, paddingRight: 8 },
                                        heading1: { fontSize: 20, fontWeight: 'bold', marginTop: 20, marginBottom: 12, marginLeft: 0, paddingLeft: 0, paddingBottom: 6, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
                                        heading2: { fontSize: 18, fontWeight: 'bold', marginTop: 16, marginBottom: 10, marginLeft: 0, paddingLeft: 0, color: '#1f2937' },
                                        heading3: { fontSize: 16, fontWeight: '600', marginTop: 14, marginBottom: 8, marginLeft: 0, paddingLeft: 0, color: '#374151' },
                                        text: { color: '#1f2937', fontSize: 14, lineHeight: 22 },
                                        link: { color: '#2563eb', textDecorationLine: 'underline' },
                                        blockquote: { borderLeftWidth: 4, borderLeftColor: '#2563eb', paddingLeft: 16, paddingVertical: 8, marginVertical: 12, marginLeft: 0, backgroundColor: '#f8fafc', borderRadius: 8 },
                                    }}
                                    mergeStyle={false}
                                >
                                    {displayText}
                                </Markdown>

                                {!isUser && item.meta?.artifacts && item.meta.artifacts.length > 0 && (
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
                                            📎 Tệp đính kèm ({item.meta.artifacts.length}):
                                        </Text>
                                        {item.meta.artifacts.map((artifact, idx) => (
                                            <ArtifactItem key={idx} artifact={artifact} />
                                        ))}
                                    </View>
                                )}

                                {!isStreaming && (
                                    <TouchableOpacity
                                        onPress={handleSpeak}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            marginTop: 8,
                                            alignSelf: 'flex-start',
                                        }}
                                    >
                                        <MaterialIcons
                                            name={isThisSpeaking ? 'volume-up' : 'volume-off'}
                                            size={16}
                                            color={isThisSpeaking ? '#2563eb' : '#9ca3af'}
                                        />
                                        <Text style={{
                                            fontSize: 11,
                                            color: isThisSpeaking ? '#2563eb' : '#9ca3af',
                                            marginLeft: 4,
                                        }}>
                                            {isThisSpeaking ? 'Đang đọc...' : 'Đọc'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                        <Text style={{
                            fontSize: 10,
                            color: isUser ? '#dbeafe' : '#6b7280',
                            marginTop: 4,
                            textAlign: 'right',
                        }}>
                            {formatTimestamp(item.timestamp)}
                        </Text>
                    </View>
                </LinearGradient>

                {isUser && (
                    <Text style={{
                        fontSize: 10,
                        color: '#ffffff',
                        marginTop: 4,
                        marginRight: 4,
                    }}>
                        Nhấn giữ để sửa
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
});