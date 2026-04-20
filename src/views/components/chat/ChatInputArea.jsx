import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';

export default function ChatInputArea({
    inputText,
    onChangeText,
    onSelectionChange,
    editingMessageId,
    pendingInterrupt,
    isListening,
    isUploading,
    isSending,
    selectedModel,
    attachments,
    ringStyle,
    onPickFile,
    onToggleVoice,
    onToggleModelPicker,
    onSend,
    onCancel,
}) {
    const modelLabel = selectedModel === 'intelligent' ? 'Trợ lý thông minh'
        : selectedModel === 'document' ? 'Trợ lý tài liệu' : 'Trợ lý dữ liệu';

    return (
        <View style={{ backgroundColor: 'white', padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <TextInput
                style={{
                    borderWidth: 0, borderRadius: 20, backgroundColor: '#f8fafc',
                    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14,
                    minHeight: 48, maxHeight: 100, textAlignVertical: 'top',
                }}
                placeholder={editingMessageId ? 'Sửa tin nhắn...' : pendingInterrupt ? 'Nhập câu trả lời...' : 'Bạn cần tôi giúp gì?'}
                value={inputText}
                onChangeText={onChangeText}
                onSelectionChange={onSelectionChange}
                multiline
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {/* Attach file */}
                    <TouchableOpacity
                        onPress={onPickFile}
                        disabled={isUploading || isSending}
                        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: isUploading || isSending ? '#d1d5db' : '#e5e7eb', marginRight: 8 }}
                    >
                        <MaterialIcons name="attach-file" size={20} color="#374151" />
                    </TouchableOpacity>

                    {/* Mic button with pulse ring */}
                    <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        {isListening && (
                            <Animated.View style={[{ position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#ef4444' }, ringStyle]} />
                        )}
                        <TouchableOpacity
                            onPress={onToggleVoice}
                            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isListening ? '#ef4444' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <MaterialIcons name="mic" size={22} color={isListening ? 'white' : '#374151'} />
                        </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 12, color: '#6b7280', marginRight: 12 }}>{`${inputText.length}/1000`}</Text>
                </View>

                {/* Model picker */}
                <TouchableOpacity
                    onPress={onToggleModelPicker}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#eef2ff', borderRadius: 999 }}
                >
                    <Text numberOfLines={1} style={{ color: '#4338ca', fontSize: 14, fontWeight: '600' }}>{modelLabel}</Text>
                    <MaterialIcons name="keyboard-arrow-down" size={16} color="#4338ca" style={{ marginLeft: 4 }} />
                </TouchableOpacity>

                {/* Send / Cancel */}
                {isSending ? (
                    <TouchableOpacity onPress={onCancel} style={{ backgroundColor: '#dc2626', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="stop" size={20} color="white" />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        onPress={onSend}
                        disabled={isUploading || !inputText.trim()}
                        style={{ backgroundColor: isUploading || !inputText.trim() ? '#9ca3af' : '#2563eb', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <MaterialIcons name={editingMessageId ? 'check' : 'send'} size={20} color="white" />
                    </TouchableOpacity>
                )}
            </View>

            {attachments.length > 0 && (
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                    Đã đính kèm: {attachments.map(a => a.name).join(', ')}
                </Text>
            )}
        </View>
    );
}
