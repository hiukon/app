import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TextInput,
    FlatList,
    ActivityIndicator,
    SafeAreaView,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../../../hooks/useChat';
import { useVoiceChat } from '../../../hooks/useVoiceChat';
import { useResponsive } from '../../../hooks/useResponsive';
import * as DocumentPicker from 'expo-document-picker';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';
import ModelPickerModal from './ModelPickerModal';
import { removeTriggerTokens } from '../../../utils/triggerParser';

export default function DraggableChatBubble() {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const [modalVisible, setModalVisible] = useState(false);
    const [inputText, setInputText] = useState('');
    const [selectedModel, setSelectedModel] = useState('intelligent'); // ✅ Thêm state cho model
    const [showModelPicker, setShowModelPicker] = useState(false); // ✅ Thêm state cho model picker

    const formatVietnamTime = (dateString) => {
        if (!dateString) return '';

        try {
            // Bỏ qua nếu là conversation ID
            if (typeof dateString === 'string' && dateString.startsWith('01k')) {
                return '';
            }

            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';

            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${day}/${month} ${hours}:${minutes}`;
        } catch (e) {
            return '';
        }
    };
    const {
        messages,
        sendMessage,
        cancel,
        resendEditedMessage,
        isSending,
        pendingInterrupt,
        answerInterrupt,
        conversations,
        loadConversations,
        openConversation,
        deleteConversation,
        newConversation,
    } = useChat();

    const { isListening, toggleListening } = useVoiceChat({
        onTranscript: (text) => setInputText(text),
    });

    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [thinkingDots, setThinkingDots] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const { scale } = useResponsive();

    const sortedConversations = [...conversations].sort((a, b) =>
        `${b?.updated_at || b?.created_at || ''}`.localeCompare(
            `${a?.updated_at || a?.created_at || ''}`
        )
    );

    const openHistory = async () => {
        setShowHistory(true);
        await loadConversations();
    };

    useEffect(() => {
        const hasStreaming = messages.some(
            (m) => !m.isUser && m.status === 'streaming' && !`${m.text || ''}`.trim()
        );
        if (!hasStreaming) {
            setThinkingDots('');
            return undefined;
        }
        const t = setInterval(() => {
            setThinkingDots((prev) => {
                if (prev === '') return '.';
                if (prev === '.') return '..';
                if (prev === '..') return '...';
                return '';
            });
        }, 450);
        return () => clearInterval(t);
    }, [messages]);

    const onGestureEvent = (event) => {
        translateX.value = offsetX.value + event.nativeEvent.translationX;
        translateY.value = offsetY.value + event.nativeEvent.translationY;
    };

    const onHandlerStateChange = (event) => {
        if (event.nativeEvent.state === State.END) {
            offsetX.value = translateX.value;
            offsetY.value = translateY.value;
            translateX.value = withSpring(translateX.value);
            translateY.value = withSpring(translateY.value);
        }
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    }));

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;
        if (editingMessageId) {
            await resendEditedMessage(editingMessageId, inputText);
            setEditingMessageId(null);
            setInputText('');
            return;
        }
        const currentMessage = inputText;
        setInputText('');
        const pending = attachments;
        setAttachments([]);
        await sendMessage(currentMessage, { attachments: pending, agentModel: selectedModel }); // ✅ Truyền model
    };

    const pickFile = async () => {
        try {
            setIsUploading(true);
            const res = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                multiple: false,
            });
            const asset = res?.assets?.[0] || (res?.type === 'success' ? res : null);
            if (!asset?.uri) return;

            const token = apiClient.getAuthToken();
            if (!token) return;

            const up = await AgentApiService.uploadAttachment(
                token,
                { uri: asset.uri, name: asset.name, type: asset.mimeType || asset.type },
                asset.name
            );
            const serverData = up?.data;
            if (!serverData?.original_file) return;
            const record = {
                type: (asset.mimeType || asset.type || '').startsWith('image/') ? 'image' : 'file',
                name: serverData.name || asset.name || 'upload',
                original_file: serverData.original_file,
                extracted_file: serverData.extracted_file,
                mimeType: asset.mimeType || asset.type,
                size: asset.size,
            };
            setAttachments((prev) => prev.concat(record));
        } finally {
            setIsUploading(false);
        }
    };

    const formatTimestamp = (value) => {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
    };

    const renderMessage = ({ item }) => {
        const visibleText = item.status === 'streaming' && !item.isUser && !`${item.text || ''}`.trim()
            ? `Đang suy nghĩ${thinkingDots}`
            : removeTriggerTokens(item.text || '');
        return (
            <TouchableOpacity
                activeOpacity={item.isUser ? 0.9 : 1}
                onLongPress={() => {
                    if (!item.isUser) return;
                    setEditingMessageId(item.id);
                    setInputText(item.text || '');
                }}
                style={{
                    flexDirection: 'row',
                    justifyContent: item.isUser ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                }}>
                <View style={{
                    maxWidth: '80%',
                    backgroundColor: item.isUser ? '#2563eb' : '#e5e7eb',
                    padding: 12,
                    borderRadius: 16,
                    borderBottomRightRadius: item.isUser ? 4 : 16,
                    borderBottomLeftRadius: item.isUser ? 16 : 4,
                }}>
                    <Text style={{ color: item.isUser ? 'white' : '#1f2937', fontSize: 14 }}>
                        {visibleText}
                    </Text>
                    <Text style={{
                        fontSize: 10,
                        color: item.isUser ? '#bfdbfe' : '#6b7280',
                        marginTop: 4,
                    }}>
                        {formatTimestamp(item.timestamp)}
                    </Text>
                    {item.isUser ? (
                        <Text style={{ fontSize: 10, color: '#bfdbfe', marginTop: 4 }}>
                            Nhấn giữ để sửa
                        </Text>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <>
            <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
                <Animated.View style={[{ position: 'absolute', bottom: scale(92), right: scale(20), zIndex: 1000 }, animatedStyle]}>
                    <TouchableOpacity
                        onPress={() => setModalVisible(true)}
                        style={{
                            backgroundColor: '#2563eb',
                            width: scale(56),
                            height: scale(56),
                            borderRadius: scale(28),
                            alignItems: 'center',
                            justifyContent: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 4,
                            elevation: 8,
                        }}
                    >
                        <MaterialIcons name="chat" size={scale(28)} color="white" />
                    </TouchableOpacity>
                </Animated.View>
            </PanGestureHandler>

            <Modal visible={modalVisible} animationType="slide" transparent={false}>
                <SafeAreaView style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
                    {/* Chat Header */}
                    <View style={{
                        backgroundColor: '#2563eb',
                        padding: 16,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialIcons name="chat" size={24} color="white" />
                            <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 8 }}>
                                Trợ lý AI HaNoiBrain
                            </Text>
                            {/* ✅ Hiển thị model đang chọn */}
                            <View style={{
                                marginLeft: 8,
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 12,
                            }}>
                                <Text style={{ color: 'white', fontSize: 10 }}>
                                    {selectedModel === 'intelligent' ? 'Thông minh' : selectedModel === 'document' ? 'Tài liệu' : 'Dữ liệu'}
                                </Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity onPress={newConversation} style={{ marginRight: 12 }}>
                                <MaterialIcons name="add-comment" size={24} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={openHistory} style={{ marginRight: 12 }}>
                                <MaterialIcons name="history" size={24} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <MaterialIcons name="close" size={24} color="white" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Messages */}
                    <FlatList
                        data={messages}
                        keyExtractor={(item, index) => item.id || `${index}`}
                        renderItem={renderMessage}
                        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
                        showsVerticalScrollIndicator={false}
                    />

                    {pendingInterrupt ? (
                        <View
                            style={{
                                marginHorizontal: 12,
                                marginTop: 8,
                                backgroundColor: '#fff7ed',
                                borderWidth: 1,
                                borderColor: '#fdba74',
                                borderRadius: 12,
                                padding: 10,
                            }}
                        >
                            <Text style={{ fontSize: 12, color: '#9a3412', marginBottom: 6 }}>
                                {pendingInterrupt.question || 'Cần xác nhận'}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {(pendingInterrupt.options || ['Đồng ý', 'Từ chối']).map((opt) => (
                                    <TouchableOpacity
                                        key={opt}
                                        onPress={() => answerInterrupt(opt)}
                                        style={{
                                            backgroundColor: '#fb923c',
                                            borderRadius: 999,
                                            paddingHorizontal: 10,
                                            paddingVertical: 6,
                                            marginRight: 8,
                                            marginBottom: 6,
                                        }}
                                    >
                                        <Text style={{ color: 'white', fontSize: 12 }}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ) : null}

                    {/* Input - Đã thêm nút mic và nút chọn model */}
                    <View style={{
                        flexDirection: 'row',
                        padding: 12,
                        backgroundColor: 'white',
                        borderTopWidth: 1,
                        borderTopColor: '#e5e7eb',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        {/* Nút attach file */}
                        <TouchableOpacity
                            onPress={pickFile}
                            disabled={isUploading || isSending}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isUploading || isSending ? '#d1d5db' : '#e5e7eb',
                            }}
                        >
                            <MaterialIcons name="attach-file" size={20} color="#374151" />
                        </TouchableOpacity>

                        {/* ✅ Nút mic */}
                        <TouchableOpacity
                            onPress={toggleListening}
                            disabled={isUploading || isSending}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isUploading || isSending
                                    ? '#d1d5db'
                                    : isListening
                                        ? '#fecaca'
                                        : '#e5e7eb',
                            }}
                        >
                            <MaterialIcons
                                name="mic"
                                size={20}
                                color={isListening ? '#b91c1c' : '#374151'}
                            />
                        </TouchableOpacity>

                        {/* TextInput */}
                        <View style={{ flex: 1, position: 'relative' }}>
                            <TextInput
                                style={{
                                    borderWidth: 1,
                                    borderColor: '#d1d5db',
                                    borderRadius: 24,
                                    paddingHorizontal: 16,
                                    paddingVertical: 8,
                                    paddingRight: 40,
                                    fontSize: 14,
                                    backgroundColor: 'white',
                                    maxHeight: 100,
                                }}
                                placeholder={editingMessageId ? 'Sửa tin nhắn...' : 'Nhập tin nhắn...'}
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                            />
                            {/* ✅ Nút chọn model */}
                            <TouchableOpacity
                                onPress={() => setShowModelPicker(true)}
                                style={{
                                    position: 'absolute',
                                    right: 12,
                                    top: 8,
                                    width: 24,
                                    height: 24,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <MaterialIcons name="tune" size={18} color="#2563eb" />
                            </TouchableOpacity>
                        </View>

                        {/* Nút send/stop */}
                        {isSending ? (
                            <TouchableOpacity
                                onPress={cancel}
                                style={{
                                    backgroundColor: '#dc2626',
                                    width: 40,
                                    height: 40,
                                    borderRadius: 20,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <MaterialIcons name="stop" size={20} color="white" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                onPress={handleSendMessage}
                                disabled={isUploading || !inputText.trim()}
                                style={{
                                    backgroundColor: isUploading || !inputText.trim() ? '#9ca3af' : '#2563eb',
                                    width: 40,
                                    height: 40,
                                    borderRadius: 20,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <MaterialIcons
                                    name={editingMessageId ? 'check' : 'send'}
                                    size={20}
                                    color="white"
                                />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Hiển thị attachments */}
                    {attachments.length ? (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'white' }}>
                            <Text style={{ fontSize: 12, color: '#6b7280' }}>
                                Đã đính kèm: {attachments.map((a) => a.name).join(', ')}
                            </Text>
                        </View>
                    ) : null}
                </SafeAreaView>
            </Modal>

            {/* Modal lịch sử */}
            <Modal visible={showHistory} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '65%' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Lịch sử hội thoại</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TouchableOpacity onPress={loadConversations} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="refresh" size={22} color="#374151" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowHistory(false)}>
                                    <MaterialIcons name="close" size={22} color="#374151" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <FlatList
                            data={sortedConversations}
                            keyExtractor={(item, idx) => item.id || `${idx}`}
                            renderItem={({ item }) => (
                                <View
                                    style={{
                                        paddingHorizontal: 14,
                                        paddingVertical: 12,
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#f3f4f6',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <TouchableOpacity
                                        onPress={async () => {
                                            await openConversation(item.id);
                                            setShowHistory(false);
                                        }}
                                        style={{ flex: 1, paddingRight: 8 }}
                                    >
                                        <Text style={{ fontSize: 14, color: '#111827' }}>
                                            {removeTriggerTokens(item.title) || item.id || 'Conversation'}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                            {formatVietnamTime(item.updated_at || item.created_at)}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => deleteConversation(item.id)}
                                        style={{ padding: 4 }}
                                    >
                                        <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            )}
                            ListEmptyComponent={
                                <Text style={{ padding: 14, color: '#6b7280' }}>Chưa có hội thoại.</Text>
                            }
                        />
                    </View>
                </View>
            </Modal>

            {/* ✅ Model Picker Modal */}
            <ModelPickerModal
                visible={showModelPicker}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onClose={() => setShowModelPicker(false)}
            />
        </>
    );
}