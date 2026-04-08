import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TextInput,
    FlatList,
    ActivityIndicator,
    SafeAreaView,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../../../hooks/useChat';
import { useResponsive } from '../../../hooks/useResponsive';

export default function DraggableChatBubble() {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const [modalVisible, setModalVisible] = useState(false);
    const [inputText, setInputText] = useState('');
    const { messages, sendMessage, isSending } = useChat();
    const { scale } = useResponsive();

    const onGestureEvent = (event) => {
        translateX.value = offsetX.value + event.nativeEvent.translationX;
        translateY.value = offsetY.value + event.nativeEvent.translationY;
    };

    const onHandlerStateChange = (event) => {
        if (event.nativeEvent.state === State.END) {
            offsetX.value = translateX.value;
            offsetY.value = translateY.value;
            translateX.value = withSpring(translateX.value);
            translateY.value = withSpring(translateY.value);
        }
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    }));

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;
        const currentMessage = inputText;
        setInputText('');
        await sendMessage(currentMessage);
    };

    const formatTimestamp = (value) => {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
    };

    const renderMessage = ({ item }) => (
        <View style={{
            flexDirection: 'row',
            justifyContent: item.isUser ? 'flex-end' : 'flex-start',
            marginBottom: 12,
        }}>
            <View style={{
                maxWidth: '80%',
                backgroundColor: item.isUser ? '#2563eb' : '#e5e7eb',
                padding: 12,
                borderRadius: 16,
                borderBottomRightRadius: item.isUser ? 4 : 16,
                borderBottomLeftRadius: item.isUser ? 16 : 4,
            }}>
                <Text style={{ color: item.isUser ? 'white' : '#1f2937', fontSize: 14 }}>
                    {item.text}
                </Text>
                <Text style={{
                    fontSize: 10,
                    color: item.isUser ? '#bfdbfe' : '#6b7280',
                    marginTop: 4,
                }}>
                    {formatTimestamp(item.timestamp)}
                </Text>
            </View>
        </View>
    );

    return (
        <>
            <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
                <Animated.View style={[{ position: 'absolute', bottom: scale(92), right: scale(20), zIndex: 1000 }, animatedStyle]}>
                    <TouchableOpacity
                        onPress={() => setModalVisible(true)}
                        style={{
                            backgroundColor: '#2563eb',
                            width: scale(56),
                            height: scale(56),
                            borderRadius: scale(28),
                            alignItems: 'center',
                            justifyContent: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 4,
                            elevation: 8,
                        }}
                    >
                        <MaterialIcons name="chat" size={scale(28)} color="white" />
                    </TouchableOpacity>
                </Animated.View>
            </PanGestureHandler>

            <Modal visible={modalVisible} animationType="slide" transparent={false}>
                <SafeAreaView style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
                    {/* Chat Header */}
                    <View style={{
                        backgroundColor: '#2563eb',
                        padding: 16,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialIcons name="smart-toy" size={24} color="white" />
                            <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 8 }}>
                                Trợ lý AI HaNoiBrain
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                            <MaterialIcons name="close" size={24} color="white" />
                        </TouchableOpacity>
                    </View>

                    {/* Messages */}
                    <FlatList
                        data={messages}
                        keyExtractor={(item, index) => item.id || `${index}`}
                        renderItem={renderMessage}
                        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
                        showsVerticalScrollIndicator={false}
                    />

                    {/* Input */}
                    <View style={{
                        flexDirection: 'row',
                        padding: 12,
                        backgroundColor: 'white',
                        borderTopWidth: 1,
                        borderTopColor: '#e5e7eb',
                        alignItems: 'center',
                    }}>
                        <TextInput
                            style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: '#d1d5db',
                                borderRadius: 24,
                                paddingHorizontal: 16,
                                paddingVertical: 8,
                                fontSize: 14,
                                backgroundColor: 'white',
                                maxHeight: 100,
                            }}
                            placeholder="Nhập tin nhắn..."
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                        />
                        <TouchableOpacity
                            onPress={handleSendMessage}
                            disabled={isSending || !inputText.trim()}
                            style={{
                                backgroundColor: isSending || !inputText.trim() ? '#9ca3af' : '#2563eb',
                                marginLeft: 8,
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {isSending ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <MaterialIcons name="send" size={20} color="white" />
                            )}
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </Modal>
        </>
    );
}