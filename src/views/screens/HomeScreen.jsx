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
import StatController from '../../controllers/StatController';
import { useResponsive } from '../../hooks/useResponsive';
import Header from '../components/common/Header';
import StatCard from '../components/statistics/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { TASK_UNITS } from '../../config/api.config';
import { useAuth } from '../../contexts/AuthContext';

function monthKeyFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
}

function monthLabel(d) {
    return `Tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function HomeScreen() {
    const { user } = useAuth();
    const [stats, setStats] = useState(() =>
        TASK_UNITS.map((name, i) => ({
            id: String(i + 1),
            name,
            title: name,
            cthQuaHan: 0,
            cthSapQuaHan: 0,
            cthTrongHan: 0,
            htQuaHan: 0,
            htDangKy: 0,
            total: 0,
            status: 'normal',
            color: '#2563eb',
        }))
    );
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => new Date());
    const { scale, isTablet, isSmall, isLandscape, width } = useResponsive();
    const statSectionPadding = scale(isTablet ? 16 : 12);
    const statGap = scale(10);
    const statColumns = isTablet ? (isLandscape ? 4 : 3) : (isSmall ? 1 : (isLandscape ? 3 : 2));
    const statContainerWidth = Math.max(width - (statSectionPadding * 2), 1);
    const statCardWidth = (statContainerWidth - (statGap * (statColumns - 1))) / statColumns;

    useEffect(() => {
        loadData();
    }, [selectedMonth, user?.email]);

    const loadData = async () => {
        try {
            setLoading(true);
            const monthKey = monthKeyFromDate(selectedMonth);
            const statRes = await StatController.loadStatistics({ monthKey });
            if (statRes.success) setStats(statRes.data);
            else {
                // Luôn hiển thị 4 mục để UI không bị "mất" phần Nhận nhiệm vụ.
                setStats(
                    TASK_UNITS.map((name, i) => ({
                        id: String(i + 1),
                        name,
                        title: name,
                        cthQuaHan: 0,
                        cthSapQuaHan: 0,
                        cthTrongHan: 0,
                        htQuaHan: 0,
                        htDangKy: 0,
                        total: 0,
                        status: 'normal',
                        color: '#2563eb',
                    }))
                );
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

    const shiftMonth = (delta) => {
        const d = new Date(selectedMonth);
        d.setMonth(d.getMonth() + delta);
        setSelectedMonth(d);
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
                <Header />

                

                <View style={{ marginTop: scale(22), paddingHorizontal: statSectionPadding }}>
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: scale(10),
                    }}>
                        <Text style={{ fontSize: scale(20), fontWeight: 'bold', color: '#1f2937' }}>
                            Nhận nhiệm vụ
                        </Text>
                    </View>

                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#ffffff',
                        borderRadius: scale(12),
                        paddingVertical: scale(8),
                        marginBottom: scale(14),
                    }}>
                        <TouchableOpacity onPress={() => shiftMonth(-1)} style={{ paddingHorizontal: scale(14) }}>
                            <MaterialIcons name="chevron-left" size={22} color="#1d4ed8" />
                        </TouchableOpacity>
                        <Text style={{ color: '#1f2937', fontWeight: '700', minWidth: scale(130), textAlign: 'center' }}>
                            {monthLabel(selectedMonth)}
                        </Text>
                        <TouchableOpacity onPress={() => shiftMonth(1)} style={{ paddingHorizontal: scale(14) }}>
                            <MaterialIcons name="chevron-right" size={22} color="#1d4ed8" />
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