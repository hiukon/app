import React from 'react';
import { View, Text, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';

export default function AccountScreen() {
    const { user, logout } = useAuth();
    const { isSmall } = useResponsive();

    const menuItems = [
        { name: 'Thông tin cá nhân', icon: 'person', onPress: () => { } },
        { name: 'Đổi mật khẩu', icon: 'lock', onPress: () => { } },
        { name: 'Cài đặt', icon: 'settings', onPress: () => { } },
        { name: 'Ngôn ngữ', icon: 'language', onPress: () => { } },
        { name: 'Thông báo', icon: 'notifications', onPress: () => { } },
        { name: 'Điều khoản dịch vụ', icon: 'description', onPress: () => { } },
        { name: 'Chính sách bảo mật', icon: 'security', onPress: () => { } },
    ];

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <ScrollView>
                {/* Header Profile */}
                <View className="bg-blue-600 pt-8 pb-6 items-center">
                    <View className="w-24 h-24 rounded-full bg-white items-center justify-center mb-3">
                        <MaterialIcons name="person" size={50} color="#2563eb" />
                    </View>
                    <Text className="text-white text-xl font-bold">{user?.name || 'Nguyễn Văn A'}</Text>
                    <Text className="text-blue-100">{user?.email || 'nguyenvana@hanobrain.vn'}</Text>
                    <View className="flex-row mt-2">
                        <View className="bg-blue-500 px-3 py-1 rounded-full mx-1">
                            <Text className="text-white text-xs">{user?.role || 'Quản trị viên'}</Text>
                        </View>
                        <View className="bg-green-500 px-3 py-1 rounded-full mx-1">
                            <Text className="text-white text-xs">Đang hoạt động</Text>
                        </View>
                    </View>
                </View>

                {/* Menu Items */}
                <View className="bg-white mt-4 rounded-t-xl">
                    {menuItems.map((item, idx) => (
                        <TouchableOpacity
                            key={idx}
                            onPress={item.onPress}
                            className="flex-row items-center p-4 border-b border-gray-200"
                        >
                            <MaterialIcons name={item.icon} size={24} color="#4b5563" />
                            <Text className="flex-1 ml-3 text-gray-800">{item.name}</Text>
                            <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Logout Button */}
                <TouchableOpacity
                    onPress={logout}
                    className="bg-red-500 mx-4 my-4 p-3 rounded-lg"
                >
                    <Text className="text-white text-center font-semibold">Đăng xuất</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}