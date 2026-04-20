import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function PendingInterrupt({ pendingInterrupt, answerInterrupt }) {
    if (!pendingInterrupt) return null;

    const opts = (pendingInterrupt.options || []).filter(o => o?.trim());
    const isApproval = ['human_approval', 'database_modification', 'multi_step_confirm', 'error_recovery']
        .includes(pendingInterrupt.reason);
    const displayOpts = opts.length > 0 ? opts : (isApproval ? ['Đồng ý', 'Từ chối'] : []);
    const isFreeText = displayOpts.length === 0;

    if (isFreeText) {
        return (
            <View style={{
                marginHorizontal: 12, marginTop: 8, backgroundColor: '#fff7ed',
                borderWidth: 1, borderColor: '#fdba74', borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 10,
                flexDirection: 'row', alignItems: 'center',
            }}>
                <MaterialIcons name="chat-bubble-outline" size={16} color="#d97706" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 13, color: '#b45309', flex: 1 }}>
                    Nhập câu trả lời vào ô bên dưới và gửi
                </Text>
            </View>
        );
    }

    return (
        <View style={{
            marginHorizontal: 12, marginTop: 8, backgroundColor: '#fff7ed',
            borderWidth: 1, borderColor: '#fdba74', borderRadius: 12, padding: 12,
        }}>
            {pendingInterrupt.question ? (
                <Text style={{ fontSize: 13, color: '#9a3412', marginBottom: 10, fontWeight: '500', lineHeight: 18 }}>
                    {pendingInterrupt.question}
                </Text>
            ) : null}
            <View>
                {displayOpts.map((opt, idx) => (
                    <TouchableOpacity
                        key={idx}
                        onPress={() => answerInterrupt(opt)}
                        style={{
                            flexDirection: 'row', alignItems: 'flex-start',
                            paddingVertical: 8, paddingHorizontal: 10,
                            borderRadius: 8, marginBottom: 4,
                            backgroundColor: '#fef9f0', borderWidth: 1, borderColor: '#fde68a',
                        }}
                    >
                        <Text style={{ fontWeight: '700', color: '#b45309', marginRight: 8, minWidth: 22, fontSize: 13 }}>
                            {String.fromCharCode(65 + idx)}:
                        </Text>
                        <Text style={{ flex: 1, color: '#78350f', fontSize: 13, lineHeight: 18 }}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}
