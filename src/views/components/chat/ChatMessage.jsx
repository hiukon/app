import React from 'react';
import { View, Text } from 'react-native';
import { formatRelativeTime } from '../../../utils/formatters';

export default function ChatMessage({ message }) {
    const isUser = message.isUser;

    return (
        <View className={`mb-3 ${isUser ? 'items-end' : 'items-start'}`}>
            <View className={`max-w-[80%] p-3 rounded-lg ${isUser ? 'bg-blue-500' : 'bg-gray-300'}`}>
                <Text className={isUser ? 'text-white' : 'text-gray-800'}>
                    {message.text}
                </Text>
                <Text className={`text-xs mt-1 ${isUser ? 'text-blue-100' : 'text-gray-500'}`}>
                    {formatRelativeTime(message.timestamp)}
                </Text>
            </View>
        </View>
    );
}