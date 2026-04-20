import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    SafeAreaView,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import StatController from '../../controllers/StatController';
import { useResponsive } from '../../hooks/useResponsive';
import Header from '../components/common/Header';
import CarouselSlide from '../components/common/CarouselSlide';
import StatCard from '../components/statistics/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import LoginAlertModal from '../components/common/LoginAlertModal';
import { TASK_UNITS, ASSIGN_TASK_UNITS } from '../../config/api.config';
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
    const navigation = useNavigation();
    const { user, isLoading: authLoading } = useAuth();
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
    const [assignTasks, setAssignTasks] = useState(() =>
        ASSIGN_TASK_UNITS.map((name, i) => ({
            id: `a_${i + 1}`,
            name,
            title: name,
            cthQuaHan: 0,
            cthSapQuaHan: 0,
            cthTrongHan: 0,
            htQuaHan: 0,
            htDangKy: 0,
            total: 0,
            status: 'normal',
            color: '#10b981',
        }))
    );
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loginModalVisible, setLoginModalVisible] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => new Date());
    const [selectedMonthAssign, setSelectedMonthAssign] = useState(() => new Date());
    const { scale, isTablet, isSmall, isLandscape, width } = useResponsive();
    const statSectionPadding = scale(isTablet ? 16 : 12);
    const statGap = scale(10);
    const statColumns = isTablet ? (isLandscape ? 4 : 3) : (isSmall ? 1 : (isLandscape ? 3 : 2));
    const statContainerWidth = Math.max(width - (statSectionPadding * 2), 1);
    const statCardWidth = (statContainerWidth - (statGap * (statColumns - 1))) / statColumns;

    useEffect(() => {
        if (authLoading) return;
        loadReceiveTasks();
    }, [selectedMonth, user?.email, authLoading]);

    useEffect(() => {
        if (authLoading) return;
        loadAssignTasksData();
    }, [selectedMonthAssign, user?.email, authLoading]);

    const loadReceiveTasks = async () => {
        if (authLoading) return;
        try {
            setLoading(true);
            const monthKey = monthKeyFromDate(selectedMonth);
            const statRes = await StatController.loadStatistics({ monthKey });

            const fallbackStats = TASK_UNITS.map((name, i) => ({
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
            }));

            if (statRes.success && Array.isArray(statRes.data) && statRes.data.length > 0) {
                setStats(statRes.data);
            } else {
                setStats(fallbackStats);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadAssignTasksData = async () => {
        if (authLoading) return;
        try {
            const monthKey = monthKeyFromDate(selectedMonthAssign);
            const assignRes = await StatController.loadAssignTasks({ monthKey });

            const fallbackAssign = ASSIGN_TASK_UNITS.map((name, i) => ({
                id: `a_${i + 1}`,
                name,
                title: name,
                cthQuaHan: 0,
                cthSapQuaHan: 0,
                cthTrongHan: 0,
                htQuaHan: 0,
                htDangKy: 0,
                total: 0,
                status: 'normal',
                color: '#10b981',
            }));

            // ✅ Kiểm tra lỗi Missing access token
            if (!assignRes.success && assignRes.error && assignRes.error.includes('Missing access token')) {
                setLoginModalVisible(true);
            }

            if (assignRes.success && Array.isArray(assignRes.data) && assignRes.data.length > 0) {
                const withColors = assignRes.data.map(item => ({
                    ...item,
                    color: item.color || '#10b981',
                }));
                setAssignTasks(withColors);
            } else {
                setAssignTasks(fallbackAssign);
            }
        } catch (error) {
            console.error('Load assign tasks failed:', error);
        }
    };

    const loadData = async () => {
        if (authLoading) return;
        try {
            setLoading(true);
            const monthKey = monthKeyFromDate(selectedMonth);
            const statRes = await StatController.loadStatistics({ monthKey });
            const assignRes = await StatController.loadAssignTasks({ monthKey });

            const fallbackStats = TASK_UNITS.map((name, i) => ({
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
            }));

            const fallbackAssign = TASK_UNITS.map((name, i) => ({
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
                color: '#10b981',
            }));

            // ✅ Kiểm tra lỗi Missing access token
            if (!statRes.success && statRes.error && statRes.error.includes('Missing access token')) {
                setLoginModalVisible(true);
            }

            if (!assignRes.success && assignRes.error && assignRes.error.includes('Missing access token')) {
                setLoginModalVisible(true);
            }

            // Always keep mission boxes visible: failure OR empty success -> fallback boxes.
            if (statRes.success && Array.isArray(statRes.data) && statRes.data.length > 0) {
                setStats(statRes.data);
            } else {
                setStats(fallbackStats);
            }

            if (assignRes.success && Array.isArray(assignRes.data) && assignRes.data.length > 0) {
                setAssignTasks(assignRes.data);
            } else {
                setAssignTasks(fallbackAssign);
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

    const shiftMonthAssign = (delta) => {
        const d = new Date(selectedMonthAssign);
        d.setMonth(d.getMonth() + delta);
        setSelectedMonthAssign(d);
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

                <CarouselSlide />

                <View style={{ marginTop: scale(12) }}>
                    <View style={{
                        flexDirection: 'column',  // Giữ nguyên column cho View cha
                        marginBottom: scale(16),
                        backgroundColor: '#ffffff',
                        borderRadius: scale(10),
                        paddingVertical: scale(10),
                        paddingHorizontal: scale(12),
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 4,
                        elevation: 2,
                    }}>
                        {/* Thêm View con để chứa title và date trên cùng 1 dòng */}
                        <View style={{
                            flexDirection: 'row',  // Row cho 2 phần tử này
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: scale(12),  // Khoảng cách với các box StatCard bên dưới
                        }}>
                            <Text style={{ fontSize: scale(18), fontWeight: '700', color: '#1f2937' }}>
                                Nhận nhiệm vụ
                            </Text>
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: '#d9e8f7',
                                borderRadius: scale(8),
                                paddingVertical: scale(6),
                                paddingHorizontal: scale(8),
                            }}>
                                <TouchableOpacity onPress={() => shiftMonth(-1)} style={{ paddingHorizontal: scale(4) }}>
                                    <MaterialIcons name="chevron-left" size={20} color="#1d4ed8" />
                                </TouchableOpacity>
                                <Text style={{ color: '#1f2937', fontWeight: '600', minWidth: scale(100), textAlign: 'center', fontSize: scale(12) }}>
                                    {monthLabel(selectedMonth)}
                                </Text>
                                <TouchableOpacity onPress={() => shiftMonth(1)} style={{ paddingHorizontal: scale(4) }}>
                                    <MaterialIcons name="chevron-right" size={20} color="#1d4ed8" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Các box StatCard */}
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
                </View>

                {/*  PHẦN GIAO NHIỆM VỤ */}
                <View style={{ marginTop: scale(6) }}>
                    <View style={{
                        flexDirection: 'column',  // Giữ nguyên column cho View cha
                        marginBottom: scale(16),
                        backgroundColor: '#ffffff',
                        borderRadius: scale(10),
                        paddingVertical: scale(10),
                        paddingHorizontal: scale(12),
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 4,
                        elevation: 2,
                    }}>
                        {/* Thêm View con để chứa title và date trên cùng 1 dòng */}
                        <View style={{
                            flexDirection: 'row',  // Row cho 2 phần tử này
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: scale(12),  // Khoảng cách với các box StatCard bên dưới
                        }}>
                            <Text style={{ fontSize: scale(18), fontWeight: '700', color: '#1f2937' }}>
                                Giao nhiệm vụ
                            </Text>
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: '#d8fadd',
                                borderRadius: scale(8),
                                paddingVertical: scale(6),
                                paddingHorizontal: scale(8),
                            }}>
                                <TouchableOpacity onPress={() => shiftMonth(-1)} style={{ paddingHorizontal: scale(4) }}>
                                    <MaterialIcons name="chevron-left" size={20} color="#1d4ed8" />
                                </TouchableOpacity>
                                <Text style={{ color: '#1f2937', fontWeight: '600', minWidth: scale(100), textAlign: 'center', fontSize: scale(12) }}>
                                    {monthLabel(selectedMonth)}
                                </Text>
                                <TouchableOpacity onPress={() => shiftMonth(1)} style={{ paddingHorizontal: scale(4) }}>
                                    <MaterialIcons name="chevron-right" size={20} color="#1d4ed8" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            justifyContent: 'flex-start',
                            columnGap: statGap,
                            rowGap: statGap,
                        }}>
                            {assignTasks.map((item) => (
                                <StatCard
                                    key={item.id}
                                    data={item}
                                    cardWidth={statCardWidth}
                                    compact={statColumns >= 3}
                                />
                            ))}
                        </View>
                    </View>
                </View>

            </ScrollView>
            <LoginAlertModal
                visible={loginModalVisible}
                onClose={() => setLoginModalVisible(false)}
                onLogin={() => {
                    setLoginModalVisible(false);
                    navigation.navigate('Tài khoản');
                }}
            />
        </SafeAreaView>
    );
}