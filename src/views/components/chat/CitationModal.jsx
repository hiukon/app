import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function CitationModal({ citationModal, onClose }) {
    return (
        <Modal visible={!!citationModal} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    style={{
                        backgroundColor: 'white', borderRadius: 16, padding: 20,
                        marginHorizontal: 24, maxHeight: '70%', width: '88%',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3, shadowRadius: 8, elevation: 10,
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <MaterialIcons name="description" size={18} color="#2563eb" />
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 }} numberOfLines={2}>
                            {citationModal?.file?.original_name || `Tài liệu tham khảo #${citationModal?.refId || ''}`}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                            <MaterialIcons name="close" size={20} color="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    {citationModal?.passage?.page_range && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <MaterialIcons name="bookmark" size={14} color="#6b7280" />
                            <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                                Trang {citationModal.passage.page_range}
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 1, backgroundColor: '#e5e7eb', marginBottom: 12 }} />

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={{ fontSize: 14, color: '#374151', lineHeight: 22 }}>
                            {citationModal?.passage?.text || (citationModal?.passage ? '' : 'Nội dung trích dẫn không có sẵn.')}
                        </Text>
                    </ScrollView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}
