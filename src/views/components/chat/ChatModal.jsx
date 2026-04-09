import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../../../hooks/useChat';
import ChatMessage from './ChatMessage';

export default function ChatModal({ visible, onClose }) {
    const { messages, sendMessage, isSending } = useChat();
    const [inputText, setInputText] = useState('');

    const handleSend = async () => {
        if (inputText.trim()) {
            await sendMessage(inputText);
            setInputText('');
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
                    renderItem={({ item }) => <ChatMessage message={item} />}
                    contentContainerStyle={{ flexGrow: 1 }}
                />

                {/* Input */}
                <View className="flex-row p-3 bg-white border-t border-gray-200">
                    <TextInput
                        className="flex-1 border border-gray-300 rounded-full px-4 py-2 mr-2"
                        placeholder="Nhập tin nhắn..."
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={isSending || !inputText.trim()}
                        className={`rounded-full p-2 ${isSending || !inputText.trim() ? 'bg-gray-400' : 'bg-blue-600'}`}
                    >
                        {isSending ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <MaterialIcons name="send" size={20} color="white" />
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}