import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';

export default function LoadingSpinner({ message = 'Đang tải...' }) {
    return (
        <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="mt-2 text-gray-600">{message}</Text>
        </View>
    );
}