import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DataService from '../../services/DataService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useResponsive } from '../../hooks/useResponsive';

export default function ExploreScreen() {
    const [features, setFeatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const { isSmall, gridColumns } = useResponsive();

    useEffect(() => {
        loadFeatures();
    }, []);

    const loadFeatures = async () => {
        const res = await DataService.getExploreFeatures();
        if (res.success) {
            setFeatures(res.data);
        }
        setLoading(false);
    };

    if (loading) return <LoadingSpinner />;

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <ScrollView className="p-4">
                <Text className={`font-bold mb-4 ${isSmall ? 'text-xl' : 'text-2xl'}`}>
                    Khám phá
                </Text>

                <View className={`flex-row flex-wrap justify-between`}>
                    {features.map((feature) => (
                        <TouchableOpacity key={feature.id} className={`mb-4 ${isSmall ? 'w-full' : 'w-[48%]'}`}>
                            <View className="bg-white p-4 rounded-lg shadow items-center">
                                <View className="w-12 h-12 rounded-full items-center justify-center mb-2"
                                    style={{ backgroundColor: feature.color + '20' }}>
                                    <MaterialIcons name={feature.icon} size={24} color={feature.color} />
                                </View>
                                <Text className="text-center font-semibold">{feature.name}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}