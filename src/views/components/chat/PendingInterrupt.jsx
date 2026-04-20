import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function PendingInterrupt({ pendingInterrupt, answerInterrupt, isSending }) {
    const [loadingIdx, setLoadingIdx] = useState(null);
    const [freeText, setFreeText] = useState('');
    const [freeLoading, setFreeLoading] = useState(false);

    if (!pendingInterrupt) return null;

    const opts = (pendingInterrupt.options || []).filter(o => o?.trim());
    const isApproval = ['human_approval', 'database_modification', 'multi_step_confirm', 'error_recovery']
        .includes(pendingInterrupt.reason);
    const displayOpts = opts.length > 0 ? opts : (isApproval ? ['Đồng ý', 'Từ chối'] : []);
    const isFreeText = displayOpts.length === 0;
    const isDisabledAll = isSending || loadingIdx !== null || freeLoading;

    const handleSelect = async (opt, idx) => {
        if (isDisabledAll) return;
        setLoadingIdx(idx);
        await answerInterrupt(opt);
        setLoadingIdx(null);
    };

    const handleFreeSubmit = async () => {
        const val = freeText.trim();
        if (!val || isDisabledAll) return;
        setFreeLoading(true);
        setFreeText('');
        await answerInterrupt(val);
        setFreeLoading(false);
    };

    // Free-text only (no options)
    if (isFreeText) {
        return (
            <View style={{
                marginHorizontal: 12, marginTop: 6, marginBottom: 2,
                backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e5e7eb',
                borderRadius: 14, padding: 12,
            }}>
                {pendingInterrupt.question ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
                        <MaterialIcons name="help-outline" size={16} color="#6b7280" style={{ marginRight: 6, marginTop: 1 }} />
                        <Text style={{ fontSize: 13, color: '#374151', flex: 1, fontWeight: '500', lineHeight: 19 }}>
                            {pendingInterrupt.question}
                        </Text>
                    </View>
                ) : null}
                <FreeTextInput
                    value={freeText}
                    onChange={setFreeText}
                    onSubmit={handleFreeSubmit}
                    loading={freeLoading}
                    disabled={isSending}
                    label="E"
                />
            </View>
        );
    }

    const nextLabel = String.fromCharCode(65 + displayOpts.length); // 'E' if 4 opts, etc.

    return (
        <View style={{
            marginHorizontal: 12, marginTop: 6, marginBottom: 2,
            backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e5e7eb',
            borderRadius: 14, padding: 12,
        }}>
            {pendingInterrupt.question ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
                    <MaterialIcons name="help-outline" size={16} color="#6b7280" style={{ marginRight: 6, marginTop: 1 }} />
                    <Text style={{ fontSize: 13, color: '#374151', flex: 1, fontWeight: '500', lineHeight: 19 }}>
                        {pendingInterrupt.question}
                    </Text>
                </View>
            ) : null}

            {displayOpts.map((opt, idx) => {
                const isLoading = loadingIdx === idx;
                const isDisabled = isDisabledAll;
                return (
                    <TouchableOpacity
                        key={idx}
                        onPress={() => handleSelect(opt, idx)}
                        disabled={isDisabled}
                        activeOpacity={0.7}
                        style={{
                            flexDirection: 'row', alignItems: 'center',
                            paddingVertical: 10, paddingHorizontal: 12,
                            borderRadius: 10, marginBottom: 6,
                            backgroundColor: isLoading ? '#dbeafe' : isDisabled ? '#f9fafb' : '#fff',
                            borderWidth: 1.5,
                            borderColor: isLoading ? '#3b82f6' : isDisabled ? '#e5e7eb' : '#d1d5db',
                        }}
                    >
                        <View style={{
                            width: 24, height: 24, borderRadius: 12,
                            backgroundColor: isLoading ? '#3b82f6' : isDisabled ? '#e5e7eb' : '#ede9fe',
                            alignItems: 'center', justifyContent: 'center', marginRight: 10,
                        }}>
                            {isLoading
                                ? <ActivityIndicator size="small" color="white" />
                                : <Text style={{ fontSize: 12, fontWeight: '700', color: isDisabled ? '#9ca3af' : '#7c3aed' }}>
                                    {String.fromCharCode(65 + idx)}
                                </Text>
                            }
                        </View>
                        <Text style={{
                            flex: 1, fontSize: 13, lineHeight: 19,
                            color: isDisabled ? '#9ca3af' : '#1f2937',
                            fontWeight: isLoading ? '600' : '400',
                        }}>
                            {opt}
                        </Text>
                        {!isDisabled && (
                            <MaterialIcons name="chevron-right" size={18} color="#9ca3af" />
                        )}
                    </TouchableOpacity>
                );
            })}

            {/* Inline free-text input below options */}
            <FreeTextInput
                value={freeText}
                onChange={setFreeText}
                onSubmit={handleFreeSubmit}
                loading={freeLoading}
                disabled={isDisabledAll}
                label={nextLabel}
            />
        </View>
    );
}

function FreeTextInput({ value, onChange, onSubmit, loading, disabled, label }) {
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center',
            marginTop: 4,
            backgroundColor: '#fff', borderWidth: 1.5,
            borderColor: value ? '#7c3aed' : '#e5e7eb',
            borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
            minHeight: 42,
        }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed', marginRight: 8 }}>
                {label}:
            </Text>
            <TextInput
                style={{ flex: 1, fontSize: 13, color: '#1f2937', paddingVertical: 2 }}
                placeholder="câu trả lời của bạn..."
                placeholderTextColor="#9ca3af"
                value={value}
                onChangeText={onChange}
                editable={!disabled && !loading}
                returnKeyType="send"
                onSubmitEditing={onSubmit}
                multiline={false}
            />
            <TouchableOpacity
                onPress={onSubmit}
                disabled={!value.trim() || disabled || loading}
                style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: value.trim() && !disabled && !loading ? '#7c3aed' : '#e5e7eb',
                    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
                }}
            >
                {loading
                    ? <ActivityIndicator size="small" color="white" />
                    : <MaterialIcons name="send" size={15} color={value.trim() && !disabled ? 'white' : '#9ca3af'} />
                }
            </TouchableOpacity>
        </View>
    );
}
