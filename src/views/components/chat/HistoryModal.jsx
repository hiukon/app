import React from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const SkeletonHistoryItem = () => (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
            <View style={{ height: 16, backgroundColor: '#e5e7eb', borderRadius: 4, width: '70%', marginBottom: 8 }} />
            <View style={{ height: 12, backgroundColor: '#f3f4f6', borderRadius: 4, width: '40%' }} />
        </View>
        <View style={{ width: 20, height: 20, backgroundColor: '#fee2e2', borderRadius: 4 }} />
    </View>
);

export default function HistoryModal({ visible, onClose, conversations, loadingHistory, refreshing, onRefresh, renderHistoryItem }) {
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                        <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>Lịch sử hội thoại</Text>
                        <TouchableOpacity onPress={onClose}>
                            <MaterialIcons name="close" size={24} color="#374151" />
                        </TouchableOpacity>
                    </View>

                    {loadingHistory ? (
                        <View style={{ padding: 16 }}>
                            {[1, 2, 3, 4, 5].map(i => <SkeletonHistoryItem key={i} />)}
                        </View>
                    ) : conversations.length === 0 ? (
                        <View style={{ padding: 48, alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialIcons name="history" size={56} color="#d1d5db" />
                            <Text style={{ marginTop: 16, fontSize: 16, color: '#6b7280', fontWeight: '500' }}>
                                Chưa có lịch sử hội thoại
                            </Text>
                            <Text style={{ marginTop: 4, fontSize: 14, color: '#9ca3af' }}>
                                Bắt đầu trò chuyện để lưu lại lịch sử
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={conversations}
                            keyExtractor={item => item.id || `${item.created_at}`}
                            renderItem={renderHistoryItem}
                            refreshControl={
                                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} tintColor="#2563eb" />
                            }
                            contentContainerStyle={{ flexGrow: 1 }}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}
