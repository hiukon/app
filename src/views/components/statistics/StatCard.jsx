import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useResponsive } from '../../../hooks/useResponsive';

export default function StatCard({ data, cardWidth, compact = false }) {
    const [modalVisible, setModalVisible] = useState(false);
    const { scale, isTablet } = useResponsive();

    const statItems = [
        { label: 'CHT quá hạn', value: data.chtQuaHan ?? data.cthQuaHan ?? 0, color: '#ef4444', bgColor: '#fee2e2' },
        { label: 'CHT sắp quá hạn', value: data.chtSapQuaHan ?? data.cthSapQuaHan ?? 0, color: '#f59e0b', bgColor: '#fed7aa' },
        { label: 'CHT trong hạn', value: data.chtTrongHan ?? data.cthTrongHan ?? 0, color: '#22c55e', bgColor: '#dcfce7' },
        { label: 'HT quá hạn', value: data.htQuaHan ?? 0, color: '#a855f7', bgColor: '#f3e8ff' },
        { label: 'HT đúng hạn', value: data.htDangKy ?? data.htDungHan ?? 0, color: '#38bdf8', bgColor: '#e0f2fe' },
    ];

    const totalValue = statItems.reduce((sum, item) => sum + item.value, 0);
    const ringSize = scale(compact ? 48 : (isTablet ? 56 : 62));
    const ringStroke = scale(compact ? 6 : 7);
    const ringRadius = (ringSize - ringStroke) / 2;
    const ringCircumference = 2 * Math.PI * ringRadius;

    let accumulatedOffset = 0;
    const ringSegments = statItems
        .filter((item) => item.value > 0)
        .map((item) => {
            const ratio = totalValue > 0 ? item.value / totalValue : 0;
            const segmentLength = ringCircumference * ratio;
            const segment = {
                color: item.color,
                dashArray: `${segmentLength} ${Math.max(ringCircumference - segmentLength, 0)}`,
                dashOffset: -accumulatedOffset,
            };
            accumulatedOffset += segmentLength;
            return segment;
        });

    return (
        <>
            <TouchableOpacity onPress={() => setModalVisible(true)} activeOpacity={0.9}>
                <View style={{
                    width: cardWidth || (isTablet ? '32%' : '48.5%'),
                    backgroundColor: '#1e3a8a',
                    borderRadius: scale(16),
                    padding: scale(compact ? 8 : 10),
                    shadowColor: '#1e3a8a',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.18,
                    shadowRadius: 6,
                    elevation: 4,
                    minHeight: scale(compact ? 148 : 168),
                }}>
                    <Text style={{
                        fontSize: scale(compact ? 11 : (isTablet ? 12 : 13)),
                        fontWeight: '700',
                        color: '#dbeafe',
                        marginBottom: scale(compact ? 8 : 10),
                        minHeight: scale(compact ? 30 : 34),
                    }} numberOfLines={2}>
                        {data.title || data.name}
                    </Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, paddingRight: scale(compact ? 6 : 8) }}>
                            {statItems.map((item, idx) => (
                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(compact ? 3 : 4) }}>
                                    <View style={{
                                        width: scale(compact ? 5 : 6),
                                        height: scale(compact ? 5 : 6),
                                        borderRadius: scale(3),
                                        backgroundColor: item.color,
                                        marginRight: scale(5),
                                    }} />
                                    <Text style={{ fontSize: scale(compact ? 9 : 10), color: '#e2e8f0', flex: 1 }} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                    <Text style={{ fontSize: scale(compact ? 10 : 11), fontWeight: '700', color: '#ffffff' }}>
                                        {item.value}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <View style={{
                            width: ringSize,
                            height: ringSize,
                            borderRadius: scale(compact ? 24 : (isTablet ? 28 : 31)),
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            marginTop: scale(4),
                        }}>
                            <Svg
                                width={ringSize}
                                height={ringSize}
                                style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
                            >
                                <Circle
                                    cx={ringSize / 2}
                                    cy={ringSize / 2}
                                    r={ringRadius}
                                    stroke="#1e40af"
                                    strokeWidth={ringStroke}
                                    fill="none"
                                />
                                {ringSegments.map((segment, index) => (
                                    <Circle
                                        key={`${segment.color}-${index}`}
                                        cx={ringSize / 2}
                                        cy={ringSize / 2}
                                        r={ringRadius}
                                        stroke={segment.color}
                                        strokeWidth={ringStroke}
                                        strokeLinecap="butt"
                                        strokeDasharray={segment.dashArray}
                                        strokeDashoffset={segment.dashOffset}
                                        fill="none"
                                    />
                                ))}
                            </Svg>
                            <View style={{
                                width: scale(compact ? 28 : (isTablet ? 34 : 38)),
                                height: scale(compact ? 28 : (isTablet ? 34 : 38)),
                                borderRadius: scale(compact ? 14 : (isTablet ? 17 : 19)),
                                backgroundColor: '#1e40af',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Text style={{ color: '#ffffff', fontSize: scale(compact ? 11 : 13), fontWeight: '800' }}>
                                    {data.total}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        marginTop: scale(6),
                    }}>
                        <MaterialIcons name="grid-view" size={scale(14)} color="#93c5fd" />
                        <View style={{ width: scale(6) }} />
                        <MaterialIcons name="insert-chart-outlined" size={scale(14)} color="#93c5fd" />
                    </View>
                </View>
            </TouchableOpacity>

            <Modal
                animationType="slide"
                transparent={false}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
                    <View style={{
                        backgroundColor: '#1d4ed8',
                        paddingTop: 48,
                        paddingBottom: 16,
                        paddingHorizontal: 20,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>
                            Chi tiết thống kê
                        </Text>
                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                            <MaterialIcons name="close" size={24} color="white" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={{ flex: 1, padding: 20 }}>
                        <View style={{
                            backgroundColor: 'white',
                            borderRadius: 16,
                            padding: 20,
                            marginBottom: 16,
                        }}>
                            <Text style={{
                                fontSize: 22,
                                fontWeight: 'bold',
                                color: '#1f2937',
                                textAlign: 'center',
                                marginBottom: 20,
                            }}>
                                {data.title || data.name}
                            </Text>

                            {statItems.map((item, idx) => (
                                <View key={idx} style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    paddingVertical: 12,
                                    borderBottomWidth: idx < statItems.length - 1 ? 1 : 0,
                                    borderBottomColor: '#e5e7eb',
                                }}>
                                    <Text style={{ fontSize: 16, color: '#4b5563' }}>{item.label}</Text>
                                    <View style={{
                                        backgroundColor: item.bgColor,
                                        paddingHorizontal: 16,
                                        paddingVertical: 4,
                                        borderRadius: 20,
                                    }}>
                                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: item.color }}>
                                            {item.value}
                                        </Text>
                                    </View>
                                </View>
                            ))}

                            <View style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: 16,
                                paddingTop: 16,
                                borderTopWidth: 2,
                                borderTopColor: '#2563eb',
                            }}>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>
                                    Tổng cộng
                                </Text>
                                <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#2563eb' }}>
                                    {data.total}
                                </Text>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </>
    );
}