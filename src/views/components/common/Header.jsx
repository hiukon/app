import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useResponsive } from '../../../hooks/useResponsive';
import { useAuth } from '../../../contexts/AuthContext';

export default function Header({ user }) {
    const { scale, isTablet } = useResponsive();
    const { user: authUser } = useAuth();
    const effectiveUser = user || authUser;

    // Lấy chữ cái đầu tiên của tên
    const getInitial = (name) => {
        return name ? name.charAt(0).toUpperCase() : 'A';
    };

    return (
        <View style={{
            marginHorizontal: scale(isTablet ? 16 : 12),
            marginTop: scale(8),
            borderRadius: scale(14),
            backgroundColor: '#1d4ed8',
            paddingHorizontal: scale(isTablet ? 18 : 14),
            paddingVertical: scale(12),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                    width: scale(isTablet ? 44 : 36),
                    height: scale(isTablet ? 44 : 36),
                    borderRadius: scale(isTablet ? 22 : 18),
                    backgroundColor: '#eff6ff',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: scale(10),
                }}>
                    <Text style={{ color: '#1d4ed8', fontSize: scale(16), fontWeight: 'bold' }}>
                        {getInitial(effectiveUser?.name)}
                    </Text>
                </View>
                <View>
                    <Text style={{ fontSize: scale(12), color: '#bfdbfe' }}>Chào mừng</Text>
                    <Text numberOfLines={1} style={{ fontSize: scale(isTablet ? 20 : 18), fontWeight: '700', color: 'white', maxWidth: scale(isTablet ? 360 : 220) }}>
                        {effectiveUser?.name || 'Người dùng'}
                    </Text>
                </View>
            </View>

            <TouchableOpacity>
                <MaterialIcons name="notifications-none" size={scale(22)} color="white" />
            </TouchableOpacity>
        </View>
    );
}