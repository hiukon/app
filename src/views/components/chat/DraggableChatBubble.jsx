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
import { useResponsive } from '../../../hooks/useResponsive';
import * as DocumentPicker from 'expo-document-picker';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';

export default function DraggableChatBubble() {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const [modalVisible, setModalVisible] = useState(false);
    const [inputText, setInputText] = useState('');
    const { messages, sendMessage, cancel, resendEditedMessage, isSending } = useChat();
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [thinkingDots, setThinkingDots] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const { scale } = useResponsive();

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
        await sendMessage(currentMessage, { attachments: pending });
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
        const visibleText =
            item.status === 'streaming' && !item.isUser && !`${item.text || ''}`.trim()
                ? `Đang suy nghĩ${thinkingDots}`
                : item.text;
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
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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

                    {/* Input */}
                    <View style={{
                        flexDirection: 'row',
                        padding: 12,
                        backgroundColor: 'white',
                        borderTopWidth: 1,
                        borderTopColor: '#e5e7eb',
                        alignItems: 'center',
                    }}>
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
                                marginRight: 8,
                            }}
                        >
                            <MaterialIcons name="attach-file" size={20} color="#374151" />
                        </TouchableOpacity>
                        <TextInput
                            style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: '#d1d5db',
                                borderRadius: 24,
                                paddingHorizontal: 16,
                                paddingVertical: 8,
                                fontSize: 14,
                                backgroundColor: 'white',
                                maxHeight: 100,
                            }}
                            placeholder={editingMessageId ? 'Sửa tin nhắn...' : 'Nhập tin nhắn...'}
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                        />
                        {isSending ? (
                            <TouchableOpacity
                                onPress={cancel}
                                style={{
                                    backgroundColor: '#dc2626',
                                    marginLeft: 8,
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
                                    marginLeft: 8,
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

                    {attachments.length ? (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'white' }}>
                            <Text style={{ fontSize: 12, color: '#6b7280' }}>
                                Đã đính kèm: {attachments.map((a) => a.name).join(', ')}
                            </Text>
                        </View>
                    ) : null}
                </SafeAreaView>
            </Modal>
        </>
    );
}