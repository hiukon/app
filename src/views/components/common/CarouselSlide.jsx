import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    ScrollView,
    Image,
    TouchableOpacity,
    Text,
    Dimensions,
    StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useResponsive } from '../../../hooks/useResponsive';

const { width: screenWidth } = Dimensions.get('window');

const SLIDE_DATA = [
    {
        id: 1,
        title: 'Quản lý nhiệm vụ',
        description: 'Theo dõi tiến độ công việc',
        image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=200&fit=crop',
    },
    {
        id: 2,
        title: 'Báo cáo chi tiết',
        description: 'Xem thống kê công việc',
        image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=200&fit=crop',
    },
    {
        id: 3,
        title: 'Hợp tác hiệu quả',
        description: 'Làm việc nhóm, đạt mục tiêu',
        image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=200&fit=crop',
    },
    {
        id: 4,
        title: 'Công nghệ hiện đại',
        description: 'Giải pháp tối ưu, bảo mật cao',
        image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&h=200&fit=crop',
    },
];

const FEATURES = [
    { id: 1, icon: 'analytics', text: 'Tổng hợp, phân tích và trực quan hóa dữ liệu điều hành', color: '#3b82f6' },
    { id: 2, icon: 'whatshot', text: 'Theo dõi điểm nóng, sự kiện nổi bật và khu vực trọng điểm', color: '#f59e0b' },
    { id: 3, icon: 'assignment-turned-in', text: 'Giám sát tiến độ nhiệm vụ và kết quả xử lý', color: '#10b981' },
    { id: 4, icon: 'autorenew', text: 'Cập nhật báo cáo liên tục từ nhiều nguồn thông tin', color: '#8b5cf6' },
    { id: 5, icon: 'group-work', text: 'Hỗ trợ công tác chỉ đạo, điều hành và phối hợp liên ngành', color: '#ec4899' },
    { id: 6, icon: 'security', text: 'Cung cấp dữ liệu kịp thời, tập trung và tin cậy', color: '#06b6d4' },
];

const FALLBACK_IMAGE = 'https://via.placeholder.com/400x200/3b82f6/ffffff?text=Image+Not+Found';

export default function CarouselSlide() {
    const { scale } = useResponsive();
    const scrollViewRef = useRef(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [autoScroll, setAutoScroll] = useState(true);
    const [imageErrors, setImageErrors] = useState({});

    const slideWidth = screenWidth;
    const slideHeight = scale(180);

    useEffect(() => {
        if (!autoScroll) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % SLIDE_DATA.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [autoScroll]);

    useEffect(() => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollTo({
                x: currentIndex * slideWidth,
                animated: true,
            });
        }
    }, [currentIndex, slideWidth]);

    const goToSlide = (index) => {
        setCurrentIndex(index);
        setAutoScroll(false);
        setTimeout(() => setAutoScroll(true), 8000);
    };

    const handleImageError = (slideId) => {
        setImageErrors(prev => ({ ...prev, [slideId]: true }));
    };

    return (
        <View style={{ marginTop: scale(8), marginBottom: scale(14) }}>
            {/* Header title */}
            <View style={{ 
                paddingHorizontal: scale(16), 
                marginBottom: scale(12),
                marginTop: scale(4),
            }}>
                <Text style={{
                    fontSize: scale(18),
                    fontWeight: '700',
                    color: '#1f2937',
                    lineHeight: scale(24),
                }}>
                    HỆ THỐNG CHỈ ĐẠO ĐIỀU HÀNH THÔNG MINH
                </Text>
                <Text style={{
                    fontSize: scale(14),
                    fontWeight: '500',
                    color: '#3b82f6',
                    marginTop: scale(4),
                    letterSpacing: scale(0.5),
                }}>
                    TP HÀ NỘI
                </Text>
                
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: scale(8),
                }}>
                    <View style={{
                        width: scale(40),
                        height: scale(3),
                        backgroundColor: '#3b82f6',
                        borderRadius: scale(1.5),
                    }} />
                    <View style={{
                        width: scale(20),
                        height: scale(3),
                        backgroundColor: '#93c5fd',
                        borderRadius: scale(1.5),
                        marginLeft: scale(4),
                    }} />
                </View>
            </View>

            {/* Carousel */}
            <ScrollView
                ref={scrollViewRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
            >
                {SLIDE_DATA.map((slide) => (
                    <View
                        key={slide.id}
                        style={{
                            width: slideWidth,
                            height: slideHeight,
                            paddingHorizontal: scale(12),
                        }}
                    >
                        <View style={{ flex: 1, position: 'relative' }}>
                            <Image
                                source={{ uri: imageErrors[slide.id] ? FALLBACK_IMAGE : slide.image }}
                                style={{
                                    ...StyleSheet.absoluteFillObject,
                                    borderRadius: scale(16),
                                }}
                                onError={() => handleImageError(slide.id)}
                            />
                            <View
                                style={{
                                    ...StyleSheet.absoluteFillObject,
                                    backgroundColor: 'rgba(0, 0, 0, 0.45)',
                                    borderRadius: scale(16),
                                }}
                            />
                            <View
                                style={{
                                    flex: 1,
                                    justifyContent: 'center',
                                    paddingLeft: scale(20),
                                    paddingRight: scale(40),
                                    zIndex: 1,
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: scale(20),
                                        fontWeight: '700',
                                        color: '#ffffff',
                                        marginBottom: scale(8),
                                        textAlign: 'left',
                                    }}
                                >
                                    {slide.title}
                                </Text>
                                <Text
                                    style={{
                                        fontSize: scale(14),
                                        color: '#e5e7eb',
                                        marginBottom: scale(12),
                                        lineHeight: scale(20),
                                        textAlign: 'left',
                                    }}
                                >
                                    {slide.description}
                                </Text>
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text style={{ 
                                        fontSize: scale(13), 
                                        color: '#ffffff', 
                                        fontWeight: '600' 
                                    }}>
                                        Tìm hiểu ngay
                                    </Text>
                                    <MaterialIcons
                                        name="arrow-forward"
                                        size={scale(16)}
                                        color="#ffffff"
                                        style={{ marginLeft: scale(6) }}
                                    />
                                </View>
                            </View>
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* Dot indicators */}
            <View
                style={{
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: scale(12),
                    gap: scale(6),
                }}
            >
                {SLIDE_DATA.map((_, index) => (
                    <TouchableOpacity
                        key={index}
                        onPress={() => goToSlide(index)}
                        style={{
                            width: currentIndex === index ? scale(24) : scale(6),
                            height: scale(6),
                            borderRadius: scale(3),
                            backgroundColor: currentIndex === index ? '#3b82f6' : '#9ca3af',
                            marginHorizontal: scale(2),
                        }}
                    />
                ))}
            </View>

            {/* Features section - Các ô icon tròn */}
            <View style={{
                marginTop: scale(20),
                paddingHorizontal: scale(12),
            }}>
                <Text style={{
                    fontSize: scale(16),
                    fontWeight: '700',
                    color: '#1f2937',
                    marginBottom: scale(12),
                    paddingLeft: scale(4),
                }}>
                    Tính năng nổi bật
                </Text>
                
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: scale(4),
                    }}
                >
                    {FEATURES.map((feature) => (
                        <View
                            key={feature.id}
                            style={{
                                alignItems: 'center',
                                width: scale(100),
                                marginRight: scale(12),
                            }}
                        >
                            <View
                                style={{
                                    width: scale(56),
                                    height: scale(56),
                                    borderRadius: scale(28),
                                    backgroundColor: `${feature.color}15`,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    marginBottom: scale(8),
                                    borderWidth: 1,
                                    borderColor: `${feature.color}30`,
                                }}
                            >
                                <MaterialIcons
                                    name={feature.icon}
                                    size={scale(28)}
                                    color={feature.color}
                                />
                            </View>
                            <Text
                                style={{
                                    fontSize: scale(11),
                                    color: '#4b5563',
                                    textAlign: 'center',
                                    lineHeight: scale(15),
                                    fontWeight: '500',
                                }}
                                numberOfLines={2}
                            >
                                {feature.text.length > 40 ? feature.text.substring(0, 40) + '...' : feature.text}
                            </Text>
                        </View>
                    ))}
                </ScrollView>
            </View>
        </View>
    );
}