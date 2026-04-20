import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { removeTriggerTokens } from '../../../utils/triggerParser';
import { formatRelativeTime } from '../../../utils/formatters';

// ==================== HÀM TIỆN ÍCH ====================

// Hàm xử lý user message - thay thế token bằng tên hiển thị
const processUserMessage = (text, domainIdToCodeMap) => {
    if (!text) return '';

    let processed = text;

    // ✅ CÁCH 1: Dùng regex trực tiếp (giống convertTokensToDisplayWithMap)
    processed = processed.replace(/<@:domain=([^>]+)>/g, (match, id) => {
        const codeName = domainIdToCodeMap?.[id];
        return codeName ? `@${codeName}` : match;
    });

    // Xử lý skill token (giữ nguyên, đang hoạt động tốt)
    processed = processed.replace(/<\/([^>]+)>/g, (match, code) => {
        const cleanCode = code.replace(/^:/, '');
        return `/${cleanCode}`;
    });

    return processed;
};

const convertTokensToDisplay = (text, domainIdToCodeMap) => {
    if (!text) return '';

    let converted = text;

    // Xử lý skill token
    converted = converted.replace(/<\/([^>]+)>/g, (match, code) => {
        const cleanCode = code.replace(/^:/, '');
        return `/${cleanCode}`;
    });

    // Xử lý domain token
    converted = converted.replace(/<@:domain=([^>]+)>/g, (match, id) => {
        const codeName = domainIdToCodeMap?.[id];
        return codeName ? `@${codeName}` : match;
    });

    return converted;
};

const cleanMarkdownText = (text) => {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/^[-*•]\s+/gm, '• ')
        .replace(/^\d+\.\s+/gm, '▪️ ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const sanitizeTechnicalText = (text) => {
    if (!text) return '';
    const patterns = [/syntaxerror/i, /traceback/i, /exception/i, /http\s*\d{3}/i];
    return patterns.some(p => p.test(text)) ? 'Đã có lỗi xảy ra. Vui lòng thử lại.' : text;
};

const cleanBotText = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
        const lowerLine = line.toLowerCase();
        if (line.trim().length < 10) return false;
        if (lowerLine.includes('người dùng muốn biết')) return false;
        if (lowerLine.includes('tìm kiếm thông tin')) return false;
        if (lowerLine.includes('tìm kiếm kỹ năng')) return false;
        if (lowerLine.includes('observe the result')) return false;
        if (lowerLine.includes('dựa trên kết quả')) return false;
        if (lowerLine.includes('theo hướng dẫn')) return false;
        if (lowerLine.includes('tôi sẽ tổng hợp')) return false;
        if (lowerLine.includes('tôi cần tìm kiếm')) return false;
        if (lowerLine.includes('tôi đã tìm kiếm')) return false;
        if (lowerLine.includes('sau khi tìm kiếm')) return false;
        if (lowerLine.includes('cortex')) return false;
        if (lowerLine.match(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/)) return false;
        return true;
    });

    let cleaned = filteredLines.join('\n').trim();

    if (cleaned) {
        const paragraphs = cleaned.split(/\n\s*\n/);
        cleaned = paragraphs[paragraphs.length - 1];
    }

    cleaned = cleaned?.replace(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/gi, '');

    if (!cleaned || cleaned.length < 15) {
        return null;
    }

    return cleaned;
};

// ==================== COMPONENT CHÍNH ====================

const MessageItem = memo(({
    item,
    onLongPressUserMessage,
    formatTimestamp,
    thinkingDots,
    domainIdToCodeMap,
    onSpeak,           // ← THÊM
    isSpeaking,        // ← THÊM
    onStopSpeaking,    // ← THÊM
}) => {
    const isUser = item.isUser;

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
            }}>
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
                                        body: { color: '#1f2937', fontSize: 14, lineHeight: 20 },
                                        strong: { fontWeight: 'bold', color: '#1f2937' },
                                        em: { fontStyle: 'italic' },
                                        bullet_list: { marginBottom: 4 },
                                        bullet_list_item: { flexDirection: 'row', marginBottom: 2 },
                                        ordered_list: { marginBottom: 4 },
                                        ordered_list_item: { flexDirection: 'row', marginBottom: 2 },
                                        paragraph: { marginBottom: 4 },
                                        heading1: { fontSize: 20, fontWeight: 'bold', marginVertical: 6 },
                                        heading2: { fontSize: 18, fontWeight: 'bold', marginVertical: 5 },
                                        heading3: { fontSize: 16, fontWeight: 'bold', marginVertical: 4 },
                                        link: { color: '#2563eb' },
                                    }}
                                    mergeStyle={false}
                                >
                                    {displayText}
                                </Markdown>

                                {/* Nút phát âm - chỉ hiển thị cho tin nhắn AI */}
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
                                        {isThisSpeaking ? 'Đang đọc...' : 'Đọc to'}
                                    </Text>
                                </TouchableOpacity>
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

export default MessageItem;