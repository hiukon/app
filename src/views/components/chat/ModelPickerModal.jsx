import React from 'react';
import { Modal, TouchableOpacity, View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function ModelPickerModal({ visible, selectedModel, onSelectModel, onClose }) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    justifyContent: 'flex-end',
                }}
            >
                <View
                    style={{
                        backgroundColor: 'white',
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        paddingHorizontal: 16,
                        paddingTop: 16,
                        paddingBottom: 24,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: -2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 8,
                    }}
                >
                    <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 16, color: '#111827', textAlign: 'center' }}>
                        Chọn mô hình AI
                    </Text>
                    <TouchableOpacity
                        onPress={() => {
                            onSelectModel('intelligent');
                            onClose();
                        }}
                        style={{
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            marginBottom: 10,
                            borderRadius: 12,
                            backgroundColor: selectedModel === 'intelligent' ? '#dcfce7' : '#f3f4f6',
                            borderLeftWidth: selectedModel === 'intelligent' ? 4 : 0,
                            borderLeftColor: selectedModel === 'intelligent' ? '#16a34a' : 'transparent',
                        }}
                    >
                        <Text style={{ color: '#1f2937', fontSize: 14, fontWeight: '500' }}>Trợ lý thông minh</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => {
                            onSelectModel('document');
                            onClose();
                        }}
                        style={{
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            marginBottom: 10,
                            borderRadius: 12,
                            backgroundColor: selectedModel === 'document' ? '#dcfce7' : '#f3f4f6',
                            borderLeftWidth: selectedModel === 'document' ? 4 : 0,
                            borderLeftColor: selectedModel === 'document' ? '#16a34a' : 'transparent',
                        }}
                    >
                        <Text style={{ color: '#1f2937', fontSize: 14, fontWeight: '500' }}>Trợ lý tài liệu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => {
                            onSelectModel('data');
                            onClose();
                        }}
                        style={{
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            borderRadius: 12,
                            backgroundColor: selectedModel === 'data' ? '#dcfce7' : '#f3f4f6',
                            borderLeftWidth: selectedModel === 'data' ? 4 : 0,
                            borderLeftColor: selectedModel === 'data' ? '#16a34a' : 'transparent',
                        }}
                    >
                        <Text style={{ color: '#1f2937', fontSize: 14, fontWeight: '500' }}>Trợ lý dữ liệu</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}
