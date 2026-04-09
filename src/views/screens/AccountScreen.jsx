import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { USE_MOCK_AUTH } from '../../config/api.config';

export default function AccountScreen() {
    const { user, login, register, logout, isLoading } = useAuth();
    const { isSmall } = useResponsive();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [formError, setFormError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');

    const menuItems = [
        { name: 'Thông tin cá nhân', icon: 'person', onPress: () => { } },
        { name: 'Đổi mật khẩu', icon: 'lock', onPress: () => { } },
        { name: 'Cài đặt', icon: 'settings', onPress: () => { } },
        { name: 'Ngôn ngữ', icon: 'language', onPress: () => { } },
        { name: 'Thông báo', icon: 'notifications', onPress: () => { } },
        { name: 'Điều khoản dịch vụ', icon: 'description', onPress: () => { } },
        { name: 'Chính sách bảo mật', icon: 'security', onPress: () => { } },
    ];

    const onLogin = async () => {
        setFormError('');
        const res = await login(email.trim(), password);
        if (!res.success) setFormError(res.error || 'Đăng nhập thất bại');
    };

    const onRegister = async () => {
        setFormError('');
        setInfoMessage('');
        const res = await register(email.trim(), password);
        if (!res.success) {
            setFormError(res.error || 'Đăng ký thất bại');
        } else if (res.message) {
            setInfoMessage(res.message);
        }
    };

    if (!user) {
        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    className="flex-1"
                >
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ flexGrow: 1, padding: isSmall ? 16 : 24 }}
                    >
                        <View className="bg-blue-600 rounded-2xl p-6 mb-6 items-center">
                            <MaterialIcons name="person" size={48} color="white" />
                            <Text className="text-white text-xl font-bold mt-2">Login</Text>
                        </View>

                        <Text className="text-gray-700 font-medium mb-1">Email</Text>
                        <TextInput
                            className="bg-white border border-gray-300 rounded-lg px-3 py-2 mb-3"
                            placeholder="you@example.com"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                        />
                        <Text className="text-gray-700 font-medium mb-1">Mật khẩu</Text>
                        <TextInput
                            className="bg-white border border-gray-300 rounded-lg px-3 py-2 mb-4"
                            placeholder="••••••••"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />

                        {!!formError && (
                            <Text className="text-red-600 text-sm mb-3">{formError}</Text>
                        )}
                        {!!infoMessage && (
                            <Text className="text-green-700 text-sm mb-3">{infoMessage}</Text>
                        )}

                        <TouchableOpacity
                            onPress={onLogin}
                            disabled={isLoading}
                            className="bg-blue-600 py-3 rounded-lg mb-3"
                        >
                            {isLoading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white text-center font-semibold">Đăng nhập</Text>
                            )}
                        </TouchableOpacity>

                        {!USE_MOCK_AUTH && (
                            <TouchableOpacity
                                onPress={onRegister}
                                disabled={isLoading}
                                className="bg-white border border-blue-600 py-3 rounded-lg"
                            >
                                <Text className="text-blue-600 text-center font-semibold">Đăng ký</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <ScrollView>
                <View className="bg-blue-600 pt-8 pb-6 items-center">
                    <View className="w-24 h-24 rounded-full bg-white items-center justify-center mb-3">
                        <MaterialIcons name="person" size={50} color="#2563eb" />
                    </View>
                    <Text className="text-white text-xl font-bold">{user?.name || 'Người dùng'}</Text>
                    <Text className="text-blue-100">{user?.email || ''}</Text>
                    <View className="flex-row mt-2">
                        <View className="bg-blue-500 px-3 py-1 rounded-full mx-1">
                            <Text className="text-white text-xs">{user?.role || 'Thành viên'}</Text>
                        </View>
                        <View className="bg-green-500 px-3 py-1 rounded-full mx-1">
                            <Text className="text-white text-xs">Đang hoạt động</Text>
                        </View>
                    </View>
                </View>

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
