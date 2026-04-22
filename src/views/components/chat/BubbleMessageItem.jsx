import React, { memo, useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { removeTriggerTokens } from '../../../utils/triggerParser';
import ArtifactItem from './ArtifactItem';
import { buildMarkdownRules } from '../utils/chatMarkdownRules';
import { convertTokensToDisplayWithMap, cleanBotText, sanitizeTechnicalText } from '../utils/chatTextUtils';

const MD_STYLES = {
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
};

// Inline interrupt UI embedded inside the bot bubble
function InlineInterrupt({ pendingInterrupt, answerInterrupt, isSending, isAnswered = false }) {
    const [selectedIndices, setSelectedIndices] = useState([]);
    const [customText, setCustomText] = useState('');
    const [loading, setLoading] = useState(false);
    const submittingRef = useRef(false);

    const opts = (pendingInterrupt.options || []).filter(o => o?.trim());
    const isApproval = ['human_approval', 'database_modification', 'multi_step_confirm', 'error_recovery']
        .includes(pendingInterrupt.reason);
    const displayOpts = opts.length > 0 ? opts : (isApproval ? ['Đồng ý', 'Từ chối'] : []);
    const nextLabel = String.fromCharCode(65 + displayOpts.length);

    const selectedTexts = selectedIndices.map(idx => displayOpts[idx]).filter(Boolean);
    const submitValue = selectedTexts.length > 0
        ? selectedTexts.join(', ')
        : customText.trim();

    const handleOptionClick = (idx) => {
        if (isAnswered) return;
        setSelectedIndices(prev =>
            prev.includes(idx)
                ? prev.filter(i => i !== idx)
                : [...prev, idx]
        );
        setCustomText('');
    };

    const handleCustomChange = (t) => {
        if (isAnswered) return;
        setCustomText(t);
        setSelectedIndices([]);
    };

    const handleSubmit = async () => {
        if (isAnswered || !submitValue || isSending || loading || submittingRef.current || !answerInterrupt) return;
        submittingRef.current = true;
        setLoading(true);
        try {
            await answerInterrupt(submitValue);
        } catch (err) {
            console.error('🔘 INLINE INTERRUPT - Error:', err);
        } finally {
            submittingRef.current = false;
            setLoading(false);
        }
    };

    const isDisabledAll = isAnswered || isSending || loading;

    return (
        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 }}>
            {/* Options A / B / C / D */}
            {displayOpts.map((opt, idx) => {
                const isSelected = selectedIndices.includes(idx);
                return (
                    <TouchableOpacity
                        key={idx}
                        onPress={() => handleOptionClick(idx)}
                        disabled={isDisabledAll}
                        activeOpacity={isAnswered ? 1 : 0.7}
                        style={{
                            flexDirection: 'row', alignItems: 'center',
                            paddingVertical: 9, paddingHorizontal: 10,
                            borderRadius: 10, marginBottom: 6,
                            backgroundColor: isAnswered ? '#f3f4f6' : (isSelected ? '#ede9fe' : '#f8f8ff'),
                            borderWidth: 1.5,
                            borderColor: isAnswered ? '#e5e7eb' : (isSelected ? '#7c3aed' : '#d1d5db'),
                            opacity: isAnswered ? 0.6 : 1,
                        }}
                    >
                        <View style={{
                            width: 22, height: 22, borderRadius: 11,
                            backgroundColor: isAnswered ? '#e5e7eb' : (isSelected ? '#7c3aed' : '#ede9fe'),
                            alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0,
                        }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: isAnswered ? '#9ca3af' : (isSelected ? 'white' : '#7c3aed') }}>
                                {String.fromCharCode(65 + idx)}
                            </Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: isAnswered ? '#9ca3af' : '#1f2937', fontWeight: isSelected ? '600' : '400' }}>
                            {opt}
                        </Text>
                    </TouchableOpacity>
                );
            })}

            {/* Bottom area */}
            <View style={{ marginTop: 4 }}>
                {isAnswered ? (
                    /* Answered lock indicator */
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb',
                        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                    }}>
                        <MaterialIcons name="lock" size={14} color="#9ca3af" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                            Đã gửi câu trả lời
                        </Text>
                    </View>
                ) : selectedIndices.length > 0 ? (
                    /* Selected options badge + send */
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: '#f5f3ff', borderWidth: 1.5, borderColor: '#7c3aed',
                        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                    }}>
                        <MaterialIcons name="check-circle-outline" size={16} color="#7c3aed" style={{ marginRight: 6 }} />
                        <Text style={{ flex: 1, fontSize: 13, color: '#5b21b6', fontWeight: '500' }} numberOfLines={2}>
                            {selectedIndices.map(idx => String.fromCharCode(65 + idx)).join(', ')}: {selectedTexts.join(', ')}
                        </Text>
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={isSending || loading}
                            style={{
                                width: 30, height: 30, borderRadius: 15,
                                backgroundColor: isSending || loading ? '#e5e7eb' : '#7c3aed',
                                alignItems: 'center', justifyContent: 'center', marginLeft: 8,
                            }}
                        >
                            {loading
                                ? <ActivityIndicator size="small" color="white" />
                                : <MaterialIcons name="send" size={15} color="white" />
                            }
                        </TouchableOpacity>
                    </View>
                ) : (
                    /* Free-text input */
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: '#fff', borderWidth: 1.5,
                        borderColor: customText ? '#7c3aed' : '#e5e7eb',
                        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, minHeight: 40,
                    }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed', marginRight: 6 }}>
                            {nextLabel}:
                        </Text>
                        <TextInput
                            style={{ flex: 1, fontSize: 13, color: '#1f2937', paddingVertical: 2 }}
                            placeholder="câu trả lời của bạn..."
                            placeholderTextColor="#9ca3af"
                            value={customText}
                            onChangeText={handleCustomChange}
                            editable={!isSending && !loading}
                            returnKeyType="send"
                            onSubmitEditing={handleSubmit}
                            multiline={false}
                        />
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={!customText.trim() || isSending || loading}
                            style={{
                                width: 28, height: 28, borderRadius: 14,
                                backgroundColor: customText.trim() && !isSending && !loading ? '#7c3aed' : '#e5e7eb',
                                alignItems: 'center', justifyContent: 'center', marginLeft: 6,
                            }}
                        >
                            {loading
                                ? <ActivityIndicator size="small" color="white" />
                                : <MaterialIcons name="send" size={14} color={customText.trim() && !isSending && !loading ? 'white' : '#9ca3af'} />
                            }
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
}

const BubbleMessageItem = memo(({
    item,
    onLongPressUserMessage,
    formatTimestamp,
    thinkingDots,
    domainIdToCodeMap,
    onSpeak,
    isSpeaking,
    onStopSpeaking,
    onCitationPress,
    pendingInterrupt,
    answerInterrupt,
    isSending,
}) => {
    const isUser = item.isUser;
    const isStreaming = !isUser && item.status === 'streaming';

    const rawCitations = item.meta?.citations;
    const citations = rawCitations && !Array.isArray(rawCitations) && rawCitations.passages
        ? rawCitations
        : (Array.isArray(rawCitations) && rawCitations[0]?.passages ? rawCitations[0] : null);

    const mdRules = useMemo(
        () => buildMarkdownRules(citations, onCitationPress),
        [citations, onCitationPress]
    );

    let displayText = '';
    if (isUser) {
        displayText = convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap);
    } else {
        let rawText = isStreaming && !`${item.text || ''}`.trim()
            ? `Đang suy nghĩ${thinkingDots}`
            : (item.text || '');

        let cleaned = cleanBotText(rawText);
        if (cleaned === null) {
            if (!isStreaming) return null;
            cleaned = rawText;
        }
        cleaned = sanitizeTechnicalText(cleaned);
        if (cleaned === 'Đã có lỗi xảy ra. Vui lòng thử lại.' && !isStreaming) return null;
        cleaned = removeTriggerTokens(cleaned);
        displayText = convertTokensToDisplayWithMap(cleaned, domainIdToCodeMap);
        displayText = displayText
            .split('\n').map(line => line.trimStart()).join('\n')
            .replace(/([^\n])\n([-*]\s)/g, '$1\n\n$2')
            .replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2')
            .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
            .replace(/([^\n])\n(\*\*[^*]+\*\*[:\s])/g, '$1\n\n$2')
            .replace(/\n{3,}/g, '\n\n');
        displayText = displayText.replace(/\[\^(\d+)\]/g, (_, n) => `{ref:${n}}`);
        displayText = displayText.trimEnd();
        if (!displayText.trim()) return null;
    }

    const handleLongPress = () => {
        if (!isUser) return;
        onLongPressUserMessage(item.id, convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap));
    };

    const handleSpeak = () => {
        if (isSpeaking === item.id) onStopSpeaking?.();
        else onSpeak?.(displayText, item.id);
    };

    const isThisSpeaking = isSpeaking === item.id;

    // Check for interrupt data from multiple sources:
    // 1. pendingInterrupt prop (active interrupt)
    // 2. item.meta?.interruptData (from cache with full interrupt data)
    // 3. item.meta?.interrupt_payload (from server snapshot with options in payload)
    // 4. item.meta?.options (fallback for other structures)
    const interruptData = pendingInterrupt || item.meta?.interruptData ||
        (item.meta?.interrupt_payload && {
            question: item.meta.interrupt_payload.question || item.text,
            options: item.meta.interrupt_payload.options || [],
            reason: item.meta.interrupt_payload.reason || 'information_gathering',
        }) ||
        (item.meta?.options && {
            question: item.text,
            options: item.meta.options,
            reason: item.meta?.reason || 'information_gathering',
        });
    const showInterrupt = !isUser && !!interruptData;
    const isAnswered = !!item.meta?.answered;

    return (
        <TouchableOpacity
            activeOpacity={isUser ? 0.9 : 1}
            onLongPress={handleLongPress}
            style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12, paddingHorizontal: 10 }}
        >
            <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: showInterrupt ? '95%' : '85%' }}>
                <LinearGradient
                    colors={isUser ? ['#e7e8e9', '#f9fbff'] : ['#732cc9', '#7840f2', '#5c50da', '#5233f0']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ padding: 1.5, borderRadius: 18, borderBottomLeftRadius: isUser ? 18 : 4, borderBottomRightRadius: isUser ? 4 : 18 }}
                >
                    <View style={{ backgroundColor: isUser ? '#2581eb' : 'white', padding: 12, borderRadius: 17, borderBottomLeftRadius: isUser ? 17 : 4, borderBottomRightRadius: isUser ? 4 : 17 }}>
                        {isUser ? (
                            <Text style={{ color: 'white', fontSize: 14, lineHeight: 20 }}>{displayText}</Text>
                        ) : (
                            <View>
                                <Markdown style={MD_STYLES} rules={mdRules} mergeStyle={false}>
                                    {displayText}
                                </Markdown>

                                {/* Inline interrupt options + freetext input */}
                                {showInterrupt && interruptData && (
                                    <InlineInterrupt
                                        pendingInterrupt={interruptData}
                                        answerInterrupt={
                                            pendingInterrupt
                                                ? answerInterrupt
                                                : (value) => answerInterrupt(value, interruptData)
                                        }
                                        isSending={isSending}
                                        isAnswered={isAnswered}
                                    />
                                )}

                                {item.meta?.artifacts?.length > 0 && (
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
                                            📎 Tệp đính kèm ({item.meta.artifacts.length}):
                                        </Text>
                                        {item.meta.artifacts.map((artifact, idx) => (
                                            <ArtifactItem key={idx} artifact={artifact} />
                                        ))}
                                    </View>
                                )}
                                {!isStreaming && !showInterrupt && (
                                    <TouchableOpacity onPress={handleSpeak} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'flex-start' }}>
                                        <MaterialIcons name={isThisSpeaking ? 'volume-up' : 'volume-off'} size={16} color={isThisSpeaking ? '#2563eb' : '#9ca3af'} />
                                        <Text style={{ fontSize: 11, color: isThisSpeaking ? '#2563eb' : '#9ca3af', marginLeft: 4 }}>
                                            {isThisSpeaking ? 'Đang đọc...' : 'Đọc'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                        <Text style={{ fontSize: 10, color: isUser ? '#dbeafe' : '#6b7280', marginTop: 4, textAlign: 'right' }}>
                            {formatTimestamp(item.timestamp)}
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

export default BubbleMessageItem;
