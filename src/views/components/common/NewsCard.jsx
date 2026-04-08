import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { formatRelativeTime } from '../../../utils/formatters';

export default function NewsCard({ news, onPress }) {
    return (
        <TouchableOpacity onPress={onPress} className="px-3 mb-2">
            <View className="bg-white p-3 rounded-lg shadow">
                <Text className="font-semibold text-base mb-1">{news.title}</Text>
                <View className="flex-row items-center mt-1">
                    <MaterialIcons name="access-time" size={14} color="#9ca3af" />
                    <Text className="text-xs text-gray-500 ml-1">
                        {formatRelativeTime(news.date)}
                    </Text>
                    <MaterialIcons name="remove-red-eye" size={14} color="#9ca3af" className="ml-3" />
                    <Text className="text-xs text-gray-500 ml-1">{news.views} lượt xem</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}