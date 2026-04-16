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
    domainIdToCodeMap
}) => {
    const isUser = item.isUser;

    let visibleText = item.status === 'streaming' && !isUser && !`${item.text || ''}`.trim()
        ? `Đang suy nghĩ`
        : item.text || '';

    if (isUser) {
        // ✅ Dùng hàm riêng cho user message
        visibleText = processUserMessage(visibleText, domainIdToCodeMap);
    } else {
        visibleText = removeTriggerTokens(visibleText);
        visibleText = cleanMarkdownText(visibleText);
        visibleText = sanitizeTechnicalText(visibleText);
        visibleText = convertTokensToDisplay(visibleText, domainIdToCodeMap);
        const cleaned = cleanBotText(visibleText);

        if (cleaned === null) {
            return null;
        }
        visibleText = cleaned;
    }

    const handleLongPress = () => {
        if (!isUser) return;
        const displayText = processUserMessage(item.text || '', domainIdToCodeMap);
        onLongPressUserMessage(item.id, displayText);
    };

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
                    style={{ padding: 1.5, borderRadius: 18, ...(isUser ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }) }}
                >
                    <View style={{
                        backgroundColor: isUser ? '#2581eb' : 'white',
                        padding: 12,
                        borderRadius: 17,
                        ...(isUser ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
                    }}>
                        <Text style={{ color: isUser ? 'white' : '#1f2937', fontSize: 14, lineHeight: 20 }}>
                            {visibleText}
                        </Text>
                        <Text style={{
                            fontSize: 10,
                            color: isUser ? '#dbeafe' : '#6b7280',
                            marginTop: 4,
                            textAlign: 'right',
                        }}>
                            {formatTimestamp ? formatTimestamp(item.timestamp) : formatRelativeTime(item.timestamp)}
                        </Text>
                    </View>
                </LinearGradient>

                {isUser && (
                    <Text style={{ fontSize: 10, color: '#ffffff', marginTop: 4, marginRight: 4 }}>
                        Nhấn giữ để sửa
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
});

export default MessageItem;