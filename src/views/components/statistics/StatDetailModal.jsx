import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { formatNumber } from '../../../utils/formatters';

export default function StatDetailModal({ visible, onClose, data }) {
    if (!data) return null;

    const statItems = [
        { label: 'CHT quá hạn', value: data.cthQuaHan, color: 'red', bgColor: 'bg-red-50' },
        { label: 'CHT sắp quá hạn', value: data.cthSapQuaHan, color: 'yellow', bgColor: 'bg-yellow-50' },
        { label: 'CHT trong hạn', value: data.cthTrongHan, color: 'green', bgColor: 'bg-green-50' },
        { label: 'HT quá hạn', value: data.htQuaHan, color: 'orange', bgColor: 'bg-orange-50' },
        { label: 'HT đăng ký', value: data.htDangKy, color: 'blue', bgColor: 'bg-blue-50' },
    ];

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View className="flex-1 bg-gray-100">
                {/* Header */}
                <View className="bg-blue-600 p-4 pt-12 flex-row justify-between items-center">
                    <Text className="text-white text-xl font-bold">Chi tiết thống kê</Text>
                    <TouchableOpacity onPress={onClose}>
                        <MaterialIcons name="close" size={28} color="white" />
                    </TouchableOpacity>
                </View>

                <ScrollView className="p-4">
                    <View className="bg-white rounded-lg p-4 shadow">
                        <Text className="text-2xl font-bold text-center mb-4">{data.name}</Text>

                        <View className="border-t border-gray-300 pt-4">
                            <Text className="text-lg font-bold mb-3">📊 Tổng quan</Text>

                            {statItems.map((item, idx) => (
                                <View key={idx} className={`${item.bgColor} p-3 rounded-lg mb-2`}>
                                    <Text className="text-gray-600">{item.label}</Text>
                                    <Text className={`text-2xl font-bold text-${item.color}-600`}>
                                        {formatNumber(item.value)}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <View className="border-t border-gray-300 mt-4 pt-4">
                            <Text className="text-lg font-bold mb-2">📈 Tổng số nhiệm vụ</Text>
                            <Text className="text-3xl font-bold text-blue-600 text-center">
                                {formatNumber(data.total)}
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}