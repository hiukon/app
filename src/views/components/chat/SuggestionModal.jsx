import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useResponsive } from '../../../hooks/useResponsive';

export default function SuggestionModal({
    visible,
    onClose,
    onSelect,
    data,
    loading,
    title,
    icon,
    emptyMessage = 'Không tìm thấy',
}) {
    const { scale } = useResponsive();

    if (!visible) return null;

    const renderItem = ({ item }) => (
        <TouchableOpacity
            onPress={() => onSelect(item)}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f3f4f6',
            }}
        >
            <View style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: item.type === 'skill' ? '#dbeafe' : '#e0e7ff',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
            }}>
                <MaterialIcons
                    name={icon || (item.type === 'skill' ? 'bolt' : 'folder')}
                    size={20}
                    color={item.type === 'skill' ? '#2563eb' : '#4f46e5'}
                />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#1f2937' }}>
                    {item.name}
                </Text>
                <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {item.type === 'skill' ? item.group_name : item.code_name}
                </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
        </TouchableOpacity>
    );

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
            <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={onClose}
            />
            <View
                onStartShouldSetResponder={() => true}
                style={{
                    position: 'absolute',
                    bottom: 100,
                    left: 16,
                    right: 16,
                    backgroundColor: 'white',
                    borderRadius: 12,
                    maxHeight: 300,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 5,
                }}
            >
                <View style={{
                    padding: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: '#e5e7eb',
                    flexDirection: 'row',
                    alignItems: 'center',
                }}>
                    <MaterialIcons name={icon || 'info'} size={18} color="#6b7280" />
                    <Text style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
                        {title}
                    </Text>
                </View>
                {loading ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#2563eb" />
                        <Text style={{ marginTop: 8, color: '#9ca3af' }}>Đang tải...</Text>
                    </View>
                ) : data.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: '#9ca3af' }}>{emptyMessage}</Text>
                    </View>
                ) : (
                    <FlatList
                        data={data}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </View>
    );
}
