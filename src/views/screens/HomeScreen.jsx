import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    SafeAreaView,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import UserController from '../../controllers/UserController';
import StatController from '../../controllers/StatController';
import { useResponsive } from '../../hooks/useResponsive';
import Header from '../components/common/Header';
import StatCard from '../components/statistics/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function HomeScreen() {
    const [stats, setStats] = useState([]);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const { scale, isTablet, isSmall, isLandscape, width } = useResponsive();
    const statSectionPadding = scale(isTablet ? 16 : 12);
    const statGap = scale(10);
    const statColumns = isTablet ? (isLandscape ? 4 : 3) : (isSmall ? 1 : (isLandscape ? 3 : 2));
    const statContainerWidth = Math.max(width - (statSectionPadding * 2), 1);
    const statCardWidth = (statContainerWidth - (statGap * (statColumns - 1))) / statColumns;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [userRes, statRes] = await Promise.all([
                UserController.loadCurrentUser(),
                StatController.loadStatistics(),
            ]);

            if (userRes.success) {
                setUser(userRes.data);
            }

            if (statRes.success) {
                setStats(statRes.data.slice(0, 4));
            }
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    if (loading) {
        return <LoadingSpinner message="Đang tải dữ liệu..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
            <ScrollView
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: scale(130) }}
            >
                <Header user={user} />

                

                <View style={{ marginTop: scale(22), paddingHorizontal: statSectionPadding }}>
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: scale(16),
                    }}>
                        <Text style={{ fontSize: scale(20), fontWeight: 'bold', color: '#1f2937' }}>
                            Báo cáo thống kê
                        </Text>
                        <TouchableOpacity>
                            <Text style={{ color: '#2563eb', fontSize: scale(14), fontWeight: '500' }}>
                                Xem thêm
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-start',
                        columnGap: statGap,
                        rowGap: statGap,
                    }}>
                        {stats.map((item) => (
                            <StatCard
                                key={item.id}
                                data={item}
                                cardWidth={statCardWidth}
                                compact={statColumns >= 3}
                            />
                        ))}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}