import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { formatRelativeTime } from '../../../utils/formatters';
import { removeTriggerTokens } from '../../../utils/triggerParser';
import Markdown from 'react-native-markdown-display';

export default function ChatMessage({ message, onEdit }) {
    const isUser = message.isUser;
    const [showMeta, setShowMeta] = useState(false);
    const [dots, setDots] = useState('');

    // Animation
    const scale = useSharedValue(0.7);
    const opacity = useSharedValue(0);

    useEffect(() => {
        scale.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
        opacity.value = withTiming(1, { duration: 250 });
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    // Effect cho streaming dots
    useEffect(() => {
        if (message.status !== 'streaming' || isUser) {
            setDots('');
            return;
        }
        if (message.text?.trim()) {
            setDots('');
            return;
        }
        const t = setInterval(() => {
            setDots((prev) => {
                if (prev === '') return '.';
                if (prev === '.') return '..';
                if (prev === '..') return '...';
                return '';
            });
        }, 450);
        return () => clearInterval(t);
    }, [message.status, isUser, message.text]);

    const meta = message.meta || null;
    const hasMeta = !!(meta &&
        (meta.thinkingText ||
            (Array.isArray(meta.toolCalls) && meta.toolCalls.length) ||
            (Array.isArray(meta.artifacts) && meta.artifacts.length) ||
            (Array.isArray(meta.attachments) && meta.attachments.length) ||
            (Array.isArray(meta.citations) && meta.citations.length) ||
            (Array.isArray(meta.delegateLog) && meta.delegateLog.length))
    );

    const title = useMemo(() => {
        if (!hasMeta) return '';
        const parts = [];
        if (meta?.thinkingText) parts.push('Thinking');
        if (meta?.toolCalls?.length) parts.push(`Tools(${meta.toolCalls.length})`);
        if (meta?.artifacts?.length) parts.push(`Artifacts(${meta.artifacts.length})`);
        if (meta?.attachments?.length) parts.push(`Files(${meta.attachments.length})`);
        if (meta?.citations?.length) parts.push(`Citations(${meta.citations.length})`);
        if (meta?.delegateLog?.length) parts.push(`Agents(${meta.delegateLog.length})`);
        return parts.join(' · ');
    }, [hasMeta, meta]);

    const visibleText = (() => {
        if (message.status === 'streaming' && !isUser && !message.text?.trim()) {
            return `Đang suy nghĩ${dots}`;
        }
        return removeTriggerTokens(message.text || '');
    })();

    // HÀM XỬ LÝ TEXT: BOT chỉ hiển thị plain text, USER giữ nguyên
    const renderFormattedText = (text) => {
        if (!text) return null;
        if (isUser) {
            return <Text style={{ color: 'white', fontSize: 15, lineHeight: 22 }}>{text}</Text>;
        }
        // Bot: loại bỏ mọi ký hiệu markdown, chỉ hiển thị plain text
        let cleaned = text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/__(.*?)__/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            .replace(/~~(.*?)~~/g, '$1')
            .replace(/^[-*•]\s+/gm, '• ')
            .replace(/^\d+\.\s+/gm, '▪️ ')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+/g, ' ').trim();
        return cleaned.split('\n').map((line, idx) => (
            <Text key={idx} style={{ marginBottom: 4, fontSize: 15, lineHeight: 22, color: '#1f2937' }}>{line}</Text>
        ));
    };

    // Style cho Markdown (nếu dùng)
    const markdownStyles = {
        body: {
            color: isUser ? 'white' : '#1f2937',
            fontSize: 15,
            lineHeight: 22,
        },
        paragraph: {
            marginTop: 4,
            marginBottom: 4,
            lineHeight: 22,
        },
        heading1: {
            fontSize: 20,
            fontWeight: 'bold',
            color: isUser ? 'white' : '#1f2937',
            marginTop: 8,
            marginBottom: 4,
        },
        heading2: {
            fontSize: 18,
            fontWeight: 'bold',
            color: isUser ? 'white' : '#1f2937',
            marginTop: 8,
            marginBottom: 4,
        },
        heading3: {
            fontSize: 16,
            fontWeight: 'bold',
            color: isUser ? 'white' : '#1f2937',
            marginTop: 6,
            marginBottom: 3,
        },
        strong: {
            fontWeight: 'bold',
            color: isUser ? 'white' : '#111827',
        },
        em: {
            fontStyle: 'italic',
        },
        bullet_list: {
            marginTop: 6,
            marginBottom: 6,
            paddingLeft: 0,
        },
        list_item: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginTop: 3,
            marginBottom: 3,
        },
        bullet_list_icon: {
            color: isUser ? '#a7f3d0' : '#3b82f6',
            fontSize: 15,
            marginRight: 8,
            lineHeight: 22,
        },
        bullet_list_content: {
            flex: 1,
            color: isUser ? 'white' : '#1f2937',
            fontSize: 15,
            lineHeight: 22,
        },
        link: {
            color: isUser ? '#a7f3d0' : '#2563eb',
            textDecorationLine: 'underline',
        },
        blockquote: {
            backgroundColor: isUser ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
            borderLeftColor: isUser ? '#a7f3d0' : '#3b82f6',
            borderLeftWidth: 4,
            paddingLeft: 10,
            paddingVertical: 4,
            marginTop: 6,
            marginBottom: 6,
        },
        code_inline: {
            backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : '#e5e7eb',
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            fontFamily: 'monospace',
            fontSize: 13,
        },
    };

    const bubble = (
        <View
            style={{
                maxWidth: '85%',
                backgroundColor: isUser ? '#2563eb' : '#ffffff',
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 20,
                borderBottomRightRadius: isUser ? 4 : 20,
                borderBottomLeftRadius: isUser ? 20 : 4,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 2,
                elevation: 1,
                borderWidth: isUser ? 0 : 1,
                borderColor: isUser ? 'transparent' : '#e5e7eb',
            }}
        >
            {/* Nội dung tin nhắn đã được format */}
            {visibleText ? (
                <View>
                    {renderFormattedText(visibleText)}
                </View>
            ) : null}

            {hasMeta && !isUser ? (
                <TouchableOpacity
                    onPress={() => setShowMeta((v) => !v)}
                    style={{ marginTop: 8 }}
                >
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                        {showMeta ? 'Ẩn chi tiết' : 'Xem chi tiết'} {title ? `(${title})` : ''}
                    </Text>
                </TouchableOpacity>
            ) : null}

            {hasMeta && showMeta && !isUser ? (
                <View style={{ marginTop: 8 }}>
                    {meta?.thinkingText ? (
                        <View style={{ padding: 8, borderRadius: 6, backgroundColor: '#f3f4f6' }}>
                            <Text style={{ fontSize: 12, color: '#374151' }}>{meta.thinkingText}</Text>
                        </View>
                    ) : null}

                    {Array.isArray(meta?.toolCalls) && meta.toolCalls.length ? (
                        <View style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Tool calls</Text>
                            {meta.toolCalls.map((tc) => (
                                <View key={tc.id || `${tc.name}-${Math.random()}`} style={{ marginTop: 4 }}>
                                    <Text style={{ fontSize: 12, color: '#374151' }}>
                                        - {tc.name || 'tool'} {tc.is_error ? '(error)' : ''}
                                    </Text>
                                    {tc.argsText ? (
                                        <Text style={{ fontSize: 10, color: '#6b7280' }}>
                                            args: {tc.argsText}
                                        </Text>
                                    ) : null}
                                    {tc.resultText ? (
                                        <Text style={{ fontSize: 10, color: '#6b7280' }}>
                                            result: {tc.resultText}
                                        </Text>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {Array.isArray(meta?.attachments) && meta.attachments.length ? (
                        <View style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Attachments</Text>
                            {meta.attachments.map((a) => (
                                <Text key={a.original_file || a.name} style={{ fontSize: 12, color: '#374151' }}>
                                    - {a.name || 'file'}
                                </Text>
                            ))}
                        </View>
                    ) : null}

                    {Array.isArray(meta?.delegateLog) && meta.delegateLog.length ? (
                        <View style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Sub-Agents</Text>
                            {meta.delegateLog.map((d, idx) => (
                                <View key={d.agentName || idx} style={{ marginTop: 4, padding: 4, backgroundColor: '#dbeafe', borderRadius: 4 }}>
                                    <Text style={{ fontSize: 12, color: '#374151' }}>
                                        • {d.agentName} {d.status === 'completed' ? '✓' : '...'}
                                    </Text>
                                    {d.result ? (
                                        <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                            {d.result.substring(0, 100)}
                                            {d.result.length > 100 ? '...' : ''}
                                        </Text>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {Array.isArray(meta?.artifacts) && meta.artifacts.length ? (
                        <View style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Artifacts</Text>
                            {meta.artifacts.map((a) => (
                                <TouchableOpacity
                                    key={`${a.type || 'workspace'}-${a.name || 'artifact'}`}
                                    onPress={() => {
                                        if (a.url) Linking.openURL(a.url);
                                    }}
                                    style={{ padding: 6, borderRadius: 4, backgroundColor: '#dbeafe', marginTop: 4 }}
                                >
                                    <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '500' }}>
                                        📄 {a.name || 'artifact'}
                                    </Text>
                                    {a.description ? (
                                        <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                            {a.description.substring(0, 60)}
                                            {a.description.length > 60 ? '...' : ''}
                                        </Text>
                                    ) : null}
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null}

                    {Array.isArray(meta?.citations) && meta.citations.length ? (
                        <View style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Citations</Text>
                            {meta.citations.slice(0, 5).map((c, idx) => (
                                <Text key={c.id || `${idx}`} style={{ fontSize: 10, color: '#6b7280' }}>
                                    - {c.title || c.name || c.url || `#${idx + 1}`}
                                </Text>
                            ))}
                        </View>
                    ) : null}
                </View>
            ) : null}

            <Text
                style={{
                    fontSize: 10,
                    color: isUser ? '#bfdbfe' : '#9ca3af',
                    marginTop: 6,
                    textAlign: 'right',
                }}
            >
                {formatRelativeTime(message.timestamp)}
            </Text>

            {isUser ? (
                <Text style={{ fontSize: 9, color: '#bfdbfe', marginTop: 2, textAlign: 'right' }}>
                    Nhấn giữ để sửa
                </Text>
            ) : null}
        </View>
    );

    return (
        <Animated.View
            style={[animatedStyle, {
                marginBottom: 12,
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                flexDirection: 'row',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                paddingHorizontal: 8,
            }]}
        >
            <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => {
                    if (isUser && onEdit) {
                        onEdit(message);
                    }
                }}
                disabled={!isUser}
            >
                {bubble}
            </TouchableOpacity>
        </Animated.View>
    );
}