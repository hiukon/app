import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    TextInput,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../../../hooks/useChat';
import { useVoiceChat } from '../../../hooks/useVoiceChat';
import ChatMessage from './ChatMessage';
import ModelPickerModal from './ModelPickerModal';
import * as DocumentPicker from 'expo-document-picker';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';
import { removeTriggerTokens } from '../../../utils/triggerParser';

export default function ChatModal({ visible, onClose }) {
    const {
        messages,
        sendMessage,
        cancel,
        resendEditedMessage,
        isSending,
        conversations,
        loadConversations,
        openConversation,
        deleteConversation,
        newConversation,
    } = useChat();
    const [inputText, setInputText] = useState('');
    const [selectedModel, setSelectedModel] = useState('intelligent');
    const { isListening, toggleListening } = useVoiceChat({
        onTranscript: (text) => {
            setInputText(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text);
        },
    });
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [shouldRender, setShouldRender] = useState(visible);

    // Animation
    const scale = useSharedValue(0.9);
    const opacity = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            setShouldRender(true);
            scale.value = withTiming(1, { duration: 250 });
            opacity.value = withTiming(1, { duration: 250 });

            // Auto-load conversations when modal opens
            (async () => {
                setLoadingHistory(true);
                try {
                    await loadConversations();
                } catch (e) {
                    console.error('Failed to load conversations:', e);
                } finally {
                    setLoadingHistory(false);
                }
            })();
        } else {
            setShouldRender(false);
            scale.value = withTiming(0.9, { duration: 200 });
            opacity.value = withTiming(0, { duration: 200 });
        }
    }, [visible, loadConversations]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    const formatVietnamTime = (dateString) => {
        if (!dateString) return 'Không xác định';

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Không xác định';

            // Get today's date at Vietnam timezone (UTC+7)
            const now = new Date();
            const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
            const convDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const convDateStart = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate());

            const diffMs = todayStart.getTime() - convDateStart.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            // Format time HH:mm in Vietnam timezone
            const timeStr = date.toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
            });

            if (diffDays === 0) {
                return `Hôm nay ${timeStr}`;
            } else if (diffDays === 1) {
                return `Hôm qua ${timeStr}`;
            } else if (diffDays < 7) {
                return `${diffDays} ngày trước`;
            } else {
                // Format: DD/MM/YYYY HH:mm
                const dateStr = date.toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Ho_Chi_Minh',
                });
                return dateStr;
            }
        } catch (e) {
            console.error('Error formatting date:', e);
            return dateString;
        }
    };

    const sortedConversations = [...conversations].sort((a, b) =>
        `${b?.updated_at || b?.created_at || ''}`.localeCompare(
            `${a?.updated_at || a?.created_at || ''}`
        )
    );

    const handleOpenConversation = async (conversationId) => {
        try {
            await openConversation(conversationId);
            setShowHistory(false);
        } catch (e) {
            console.error('Failed to open conversation:', e);
        }
    };

    const handleSend = async () => {
        if (inputText.trim()) {
            if (editingMessageId) {
                await resendEditedMessage(editingMessageId, inputText);
                setEditingMessageId(null);
                setInputText('');
                return;
            }
            const pending = attachments;
            setAttachments([]);
            await sendMessage(inputText, {
                attachments: pending,
                agentModel: selectedModel,
            });
            setInputText('');
        }
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
            const record = serverData?.original_file
                ? {
                    type:
                        (asset.mimeType || asset.type || '').startsWith('image/')
                            ? 'image'
                            : 'file',
                    name: serverData.name || asset.name || 'upload',
                    original_file: serverData.original_file,
                    extracted_file: serverData.extracted_file,
                    mimeType: asset.mimeType || asset.type,
                    size: asset.size,
                }
                : null;
            if (record) setAttachments((prev) => prev.concat(record));
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Modal visible={shouldRender} transparent={true} animationType="none">
            <Animated.View style={[{ flex: 1, backgroundColor: '#ffffff' }, animStyle]}>
                {/* Header */}
                <View style={{ backgroundColor: '#2563eb', paddingTop: 40, paddingHorizontal: 16, paddingBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <MaterialIcons name="chat" size={22} color="white" />
                            <Text style={{ color: 'white', fontSize: 16, fontWeight: '700', marginLeft: 8 }}>
                                Chatbot
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity onPress={newConversation} style={{ padding: 4, marginRight: 8 }}>
                                <MaterialIcons name="add-comment" size={24} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setShowHistory(true)} style={{ padding: 4, marginRight: 8 }}>
                                <MaterialIcons name="history" size={24} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                                <MaterialIcons name="close" size={24} color="white" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Messages */}
                <FlatList
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item, index }) => (
                        <ChatMessage
                            message={item}
                            onEdit={(m) => {
                                if (!m?.isUser) return;
                                setEditingMessageId(m.id);
                                setInputText(m.text || '');
                            }}
                        />
                    )}
                    contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12, flexGrow: 1 }}
                    style={{ flex: 1 }}
                />

                {/* Input */}
                <View style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e5e7eb', flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                        onPress={pickFile}
                        disabled={isUploading || isSending}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isUploading || isSending ? '#d1d5db' : '#f3f4f6',
                        }}
                    >
                        <MaterialIcons name="attach-file" size={20} color="#4b5563" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', position: 'relative' }}>
                        <TextInput
                            style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: '#e5e7eb',
                                borderRadius: 24,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                paddingRight: 36,
                                fontSize: 14,
                                backgroundColor: '#f9fafb',
                                maxHeight: 100,
                            }}
                            placeholder={editingMessageId ? 'Sửa...' : 'message...'}
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            placeholderTextColor="#9ca3af"
                        />
                        <TouchableOpacity
                            onPress={() => setShowModelPicker(true)}
                            style={{
                                position: 'absolute',
                                right: 10,
                                width: 24,
                                height: 24,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <MaterialIcons name="tune" size={18} color="#6b7280" />
                        </TouchableOpacity>
                    </View>
                </View>
                {isSending ? (
                    <TouchableOpacity
                        onPress={cancel}
                        style={{
                            backgroundColor: '#ef4444',
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
                        onPress={handleSend}
                        disabled={isUploading || !inputText.trim()}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <MaterialIcons
                            name={editingMessageId ? 'check' : 'arrow-upward'}
                            size={20}
                            color="white"
                        />
                    </TouchableOpacity>
                )}
            </View>

            {attachments.length ? (
                <View style={{ paddingHorizontal: 12, paddingBottom: 8, backgroundColor: '#ffffff' }}>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                        Đã đính kèm: {attachments.map((a) => a.name).join(', ')}
                    </Text>
                </View>
            ) : null}
        </Animated.View>

            {/* Model Picker Modal */ }
    <ModelPickerModal
        visible={showModelPicker}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        onClose={() => setShowModelPicker(false)}
    />

    {/* History Modal */ }
    <Modal visible={showHistory} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '65%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Lịch sử hội thoại</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={loadConversations} disabled={loadingHistory} style={{ marginRight: 12 }}>
                            {loadingHistory ? (
                                <ActivityIndicator size="small" color="#2563eb" />
                            ) : (
                                <MaterialIcons name="refresh" size={22} color="#374151" />
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowHistory(false)}>
                            <MaterialIcons name="close" size={22} color="#374151" />
                        </TouchableOpacity>
                    </View>
                </View>
                {loadingHistory ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
                        <ActivityIndicator size="large" color="#2563eb" />
                        <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Đang tải lịch sử...</Text>
                    </View>
                ) : (
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
                                    onPress={() => handleOpenConversation(item.id)}
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
                )}
            </View>
        </View>
    </Modal>
        </Modal >
    );
}