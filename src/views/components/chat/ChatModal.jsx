import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    TextInput,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../../../hooks/useChat';
import ChatMessage from './ChatMessage';
import * as DocumentPicker from 'expo-document-picker';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';

export default function ChatModal({ visible, onClose }) {
    const { messages, sendMessage, cancel, resendEditedMessage, isSending } = useChat();
    const [inputText, setInputText] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState(null);

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
            await sendMessage(inputText, { attachments: pending });
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
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View className="flex-1 bg-gray-100">
                {/* Header */}
                <View className="bg-blue-600 p-4 pt-12 flex-row justify-between items-center">
                    <View className="flex-row items-center">
                        <MaterialIcons name="chat" size={24} color="white" />
                        <Text className="text-white text-lg font-bold ml-2">Trợ lý AI HaNoiBrain</Text>
                    </View>
                    <TouchableOpacity onPress={onClose}>
                        <MaterialIcons name="close" size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Messages */}
                <FlatList
                    data={messages}
                    keyExtractor={(item) => item.id}
                    className="flex-1 p-3"
                    renderItem={({ item }) => (
                        <ChatMessage
                            message={item}
                            onEdit={(m) => {
                                if (!m?.isUser) return;
                                setEditingMessageId(m.id);
                                setInputText(m.text || '');
                            }}
                        />
                    )}
                    contentContainerStyle={{ flexGrow: 1 }}
                />

                {/* Input */}
                <View className="flex-row p-3 bg-white border-t border-gray-200">
                    <TouchableOpacity
                        onPress={pickFile}
                        disabled={isUploading || isSending}
                        className={`rounded-full p-2 mr-2 ${
                            isUploading || isSending ? 'bg-gray-300' : 'bg-gray-200'
                        }`}
                    >
                        <MaterialIcons name="attach-file" size={20} color="#374151" />
                    </TouchableOpacity>
                    <TextInput
                        className="flex-1 border border-gray-300 rounded-full px-4 py-2 mr-2"
                        placeholder={editingMessageId ? 'Sửa tin nhắn...' : 'Nhập tin nhắn...'}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                    />
                    {isSending ? (
                        <TouchableOpacity
                            onPress={cancel}
                            className="rounded-full p-2 bg-red-600"
                        >
                            <MaterialIcons name="stop" size={20} color="white" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onPress={handleSend}
                            disabled={isUploading || !inputText.trim()}
                            className={`rounded-full p-2 ${
                                isUploading || !inputText.trim() ? 'bg-gray-400' : 'bg-blue-600'
                            }`}
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
                    <View className="px-4 pb-3 bg-white">
                        <Text className="text-xs text-gray-600">
                            Đã đính kèm: {attachments.map((a) => a.name).join(', ')}
                        </Text>
                    </View>
                ) : null}
            </View>
        </Modal>
    );
}