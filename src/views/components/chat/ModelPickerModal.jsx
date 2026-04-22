import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';

export default function ModelPickerModal({ visible, selectedModel, onSelectModel, onClose }) {
    if (!visible) return null;

    const option = (value, label) => (
        <TouchableOpacity
            onPress={() => { onSelectModel(value); onClose(); }}
            style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: selectedModel === value ? '#dcfce7' : '#f3f4f6',
                borderLeftWidth: selectedModel === value ? 4 : 0,
                borderLeftColor: selectedModel === value ? '#16a34a' : 'transparent',
            }}
        >
            <Text style={{ color: '#1f2937', fontSize: 14, fontWeight: '500' }}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
            >
                <View
                    onStartShouldSetResponder={() => true}
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
                    {option('intelligent', 'Trợ lý thông minh')}
                    {option('document', 'Trợ lý tài liệu')}
                    {option('data', 'Trợ lý dữ liệu')}
                </View>
            </TouchableOpacity>
        </View>
    );
}
