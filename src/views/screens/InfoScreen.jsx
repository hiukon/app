import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, SafeAreaView, Linking, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DataService from '../../services/DataService';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function InfoScreen() {
    const [appInfo, setAppInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadInfo();
    }, []);

    const loadInfo = async () => {
        const res = await DataService.getAppInfo();
        if (res.success) {
            setAppInfo(res.data);
        }
        setLoading(false);
    };

    const infoItems = [
        {
            title: 'Giới thiệu',
            content: 'HaNoiBrain là trợ lý ảo AI giúp quản lý công việc và thống kê báo cáo cho các cơ quan, tổ chức tại Hà Nội.',
            icon: 'info'
        },
        {
            title: 'Hướng dẫn sử dụng',
            content: '• Nhấn vào bong bóng chat để trò chuyện với AI\n• Nhấn vào các card thống kê để xem chi tiết\n• Sử dụng bottom tab để điều hướng',
            icon: 'help'
        },
        {
            title: 'Liên hệ',
            content: `Email: ${appInfo?.supportEmail || 'support@hanobrain.vn'}\nHotline: ${appInfo?.hotline || '1900 1234'}`,
            icon: 'contact-phone'
        },
        {
            title: 'Phiên bản',
            content: `Version ${appInfo?.version || '1.0.0'}\n© 2024 ${appInfo?.company || 'HaNoiBrain'}`,
            icon: 'build'
        },
    ];

    if (loading) return <LoadingSpinner />;

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <ScrollView className="p-4">
                {infoItems.map((item, idx) => (
                    <View key={idx} className="bg-white p-4 rounded-lg shadow mb-4">
                        <View className="flex-row items-center mb-2">
                            <MaterialIcons name={item.icon} size={24} color="#2563eb" />
                            <Text className="text-lg font-bold ml-2">{item.title}</Text>
                        </View>
                        <Text className="text-gray-700 leading-5">{item.content}</Text>
                    </View>
                ))}

                <TouchableOpacity
                    onPress={() => Linking.openURL(`mailto:${appInfo?.supportEmail || 'support@hanobrain.vn'}`)}
                    className="bg-blue-600 p-3 rounded-lg mt-2"
                >
                    <Text className="text-white text-center font-semibold">Gửi phản hồi</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}