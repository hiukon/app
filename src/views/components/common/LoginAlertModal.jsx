import React from 'react';
import { Modal, View, Text, TouchableOpacity, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function LoginAlertModal({ visible, onClose, onLogin }) {
    const scaleAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 70,
                friction: 10,
            }).start();
        } else {
            Animated.timing(scaleAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Animated.View
                    style={{
                        transform: [{ scale: scaleAnim }],
                        backgroundColor: '#ffffff',
                        borderRadius: 16,
                        padding: 24,
                        width: '100%',
                        maxWidth: 360,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15,
                        shadowRadius: 8,
                        elevation: 8,
                    }}
                >
                    {/* Icon */}
                    <View style={{ alignItems: 'center', marginBottom: 16 }}>
                        <View
                            style={{
                                width: 64,
                                height: 64,
                                borderRadius: 32,
                                backgroundColor: '#fee2e2',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                        >
                            <MaterialIcons name="lock" size={32} color="#dc2626" />
                        </View>
                    </View>

                    {/* Title */}
                    <Text
                        style={{
                            fontSize: 18,
                            fontWeight: '700',
                            color: '#1f2937',
                            textAlign: 'center',
                            marginBottom: 8,
                        }}
                    >
                        Cần đăng nhập
                    </Text>

                    {/* Message */}
                    <Text
                        style={{
                            fontSize: 14,
                            color: '#6b7280',
                            textAlign: 'center',
                            lineHeight: 20,
                            marginBottom: 24,
                        }}
                    >
                        Vui lòng đăng nhập để tiếp tục sử dụng ứng dụng
                    </Text>

                    {/* Buttons */}
                    <View style={{ gap: 12 }}>
                        {/* Login Button */}
                        <TouchableOpacity
                            onPress={onLogin}
                            style={{
                                backgroundColor: '#2563eb',
                                paddingVertical: 12,
                                borderRadius: 8,
                                alignItems: 'center',
                            }}
                        >
                            <Text
                                style={{
                                    color: '#ffffff',
                                    fontSize: 15,
                                    fontWeight: '600',
                                }}
                            >
                                Đăng nhập
                            </Text>
                        </TouchableOpacity>

                        {/* Close Button */}
                        <TouchableOpacity
                            onPress={onClose}
                            style={{
                                backgroundColor: '#f3f4f6',
                                paddingVertical: 12,
                                borderRadius: 8,
                                alignItems: 'center',
                            }}
                        >
                            <Text
                                style={{
                                    color: '#6b7280',
                                    fontSize: 15,
                                    fontWeight: '600',
                                }}
                            >
                                Đóng
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}
