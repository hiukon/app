import React from 'react';
import { View, Text } from 'react-native';
import { useResponsive } from '../../../hooks/useResponsive';

export default function OverviewCard({ overview }) {
    const { isSmall } = useResponsive();

    const overviewStats = [
        {
            value: overview?.totalCHTSapQuaHan || 319,
            label: 'CHT sắp quá hạn',
            subLabels: ['HT quá hạn', 'HT đăng hạn'],
            color: 'text-yellow-600',
            bgColor: 'bg-yellow-50'
        },
        {
            value: overview?.totalHTQuaHan || 22,
            label: 'HT quá hạn',
            subLabels: ['CTH sắp quá hạn', 'HT đăng ký'],
            color: 'text-orange-600',
            bgColor: 'bg-orange-50'
        },
        {
            value: overview?.totalCTHQuaHan || 30,
            label: 'CTH quá hạn',
            subLabels: ['HT quá hạn', 'HT đăng ký'],
            color: 'text-red-600',
            bgColor: 'bg-red-50'
        },
    ];

    return (
        <View className="px-3 mb-3">
            <Text className={`font-bold mb-2 ${isSmall ? 'text-lg' : 'text-xl'}`}>
                Tổng quan
            </Text>
            <View className={`flex-row ${isSmall ? 'flex-col' : 'justify-between'}`}>
                {overviewStats.map((stat, idx) => (
                    <View
                        key={idx}
                        className={`${stat.bgColor} p-3 rounded-lg shadow ${isSmall ? 'mb-2' : 'flex-1 mx-1'}`}
                    >
                        <Text className={`text-2xl font-bold ${stat.color} text-center`}>
                            {stat.value}
                        </Text>
                        <Text className="text-sm font-semibold text-center mt-1">
                            {stat.label}
                        </Text>
                        <View className="flex-row justify-center mt-1 flex-wrap">
                            {stat.subLabels.map((sub, i) => (
                                <Text key={i} className="text-xs text-gray-600 mx-1">
                                    {sub}
                                </Text>
                            ))}
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
}