import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, SafeAreaView, ImageBackground, Image } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { useChat } from '../../../hooks/useChat';
import { useVoiceInput } from '../../../hooks/useVoiceInput';
import { useTTS } from '../../../hooks/useTTS';
import { useResponsive } from '../../../hooks/useResponsive';
import { useAuth } from '../../../contexts/AuthContext';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';
import AgentSkillService from '../../../services/agent/AgentSkillService';
import DomainService from '../../../services/domain/DomainService';
import ModelPickerModal from './ModelPickerModal';
import SuggestionModal from './SuggestionModal';
import BubbleMessageItem from './BubbleMessageItem';
import HistoryModal from './HistoryModal';
import CitationModal from './CitationModal';
import ChatInputArea from './ChatInputArea';
import botBubbleBg from '../../../assets/images/TUHN3.jpg';
import chatIcon from '../../../assets/images/chatbot.png';
import {
    escapeRegExp, isCommandText, truncateHistoryText,
    convertTokensToDisplayWithMap, formatVietnamTime,
} from '../utils/chatTextUtils';

export default function DraggableChatBubble() {
    const { user } = useAuth();
    const partnerId = user?.partner_id || '01km7vpjm4hcq4jbj35m680m5p';
    const { scale } = useResponsive();

    // ── Chat ──────────────────────────────────────────────────────────────────
    const {
        messages, sendMessage, cancel, resendEditedMessage,
        isSending, pendingInterrupt, answerInterrupt,
        conversations, loadConversations, openConversation, deleteConversation, newConversation,
    } = useChat();

    // ── TTS ──────────────────────────────────────────────────────────────────
    const { speakingMessageId, speakMessage, stopSpeaking } = useTTS();

    // ── UI state (khai báo trước useVoiceInput để callbacks không bị stale) ──
    const [modalVisible, setModalVisible] = useState(false);
    const [inputText, setInputText] = useState('');

    // ── Voice ─────────────────────────────────────────────────────────────────
    const voiceTextBlockedRef = useRef(false);
    const handleVoiceText = useCallback((text) => {
        if (voiceTextBlockedRef.current) return;
        setInputText(text);
    }, []);
    const { isListening, startListening, stopListening, ringStyle, committedTextRef } = useVoiceInput({
        onPartialResult: handleVoiceText,
        onFinalResult: handleVoiceText,
    });
    const [selectedModel, setSelectedModel] = useState('intelligent');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [thinkingDots, setThinkingDots] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [citationModal, setCitationModal] = useState(null);

    // ── Suggestion state ──────────────────────────────────────────────────────
    const [showSuggestion, setShowSuggestion] = useState(false);
    const [suggestionType, setSuggestionType] = useState(null);
    const [suggestionData, setSuggestionData] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [selectedSuggestions, setSelectedSuggestions] = useState({});

    // ── Domain mapping ────────────────────────────────────────────────────────
    const [domainIdToCodeMap, setDomainIdToCodeMap] = useState({});
    const [domainCodeToIdMap, setDomainCodeToIdMap] = useState({});

    const flatListRef = useRef(null);

    // ── Draggable bubble animation ────────────────────────────────────────────
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    }));

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

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (messages.length > 0 && flatListRef.current) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [messages]);

    useEffect(() => {
        const hasStreaming = messages.some(m => !m.isUser && m.status === 'streaming' && !`${m.text || ''}`.trim());
        if (!hasStreaming) { setThinkingDots(''); return; }
        const t = setInterval(() => {
            setThinkingDots(prev => prev === '' ? '.' : prev === '.' ? '..' : prev === '..' ? '...' : '');
        }, 450);
        return () => clearInterval(t);
    }, [messages]);

    // ── Formatters ────────────────────────────────────────────────────────────
    const formatTimestamp = useCallback((value) => {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
    }, []);

    // ── History ───────────────────────────────────────────────────────────────
    const sortedConversations = [...conversations].sort((a, b) =>
        `${b?.updated_at || b?.created_at || ''}`.localeCompare(`${a?.updated_at || a?.created_at || ''}`)
    );

    const loadHistoryData = async () => {
        setLoadingHistory(true);
        try {
            await loadConversations();
            await loadDomains();
        } catch (error) {
            console.error('Load history error:', error);
        } finally {
            setLoadingHistory(false);
            setRefreshing(false);
        }
    };

    const openHistory = async () => { setShowHistory(true); await loadHistoryData(); };
    const onRefresh = async () => { setRefreshing(true); await loadHistoryData(); };

    const getDisplayTitle = (title) => {
        if (!title) return 'Cuộc trò chuyện';
        let display = convertTokensToDisplayWithMap(title, domainIdToCodeMap);
        if (domainCodeToIdMap[display]) display = `@${display}`;
        return display;
    };

    // ── Suggestions ───────────────────────────────────────────────────────────
    const loadSkills = async () => {
        setLoadingSuggestions(true);
        try {
            const result = await AgentSkillService.getAvailableSkills({ limit: 20, partner_id: partnerId });
            if (result.code === 200 && result.data) {
                setSuggestionData(result.data.map(skill => ({ ...skill, type: 'skill' })));
            }
        } catch (error) { console.error('Load skills error:', error); }
        finally { setLoadingSuggestions(false); }
    };

    const loadDomains = async () => {
        setLoadingSuggestions(true);
        try {
            const result = await DomainService.getDomains({ limit: 20, type: 'file_folder', partner_id: partnerId });
            if (result.code === 200 && result.data) {
                const idToCode = {};
                const codeToId = {};
                result.data.forEach(d => { idToCode[d.id] = d.code_name; codeToId[d.code_name] = d.id; });
                setDomainIdToCodeMap(idToCode);
                setDomainCodeToIdMap(codeToId);
                setSuggestionData(result.data.map(domain => ({ ...domain, type: 'domain' })));
            }
        } catch (error) { console.error('Load domains error:', error); }
        finally { setLoadingSuggestions(false); }
    };

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleTextChange = (text) => {
        setInputText(text);
        if (!isListening) committedTextRef.current = text;
        const cursorPos = text.length;
        const lastSlash = text.lastIndexOf('/', cursorPos);
        const lastAt = text.lastIndexOf('@', cursorPos);
        const triggers = [];
        if (lastSlash !== -1) triggers.push({ type: '/', index: lastSlash });
        if (lastAt !== -1) triggers.push({ type: '@', index: lastAt });

        if (triggers.length === 0) { if (showSuggestion) { setShowSuggestion(false); setSuggestionType(null); } return; }

        const active = triggers.reduce((prev, curr) => curr.index > prev.index ? curr : prev);
        const isValidTrigger = (index) => {
            if (index === 0) return true;
            const before = text[index - 1];
            return before === ' ' || before === '\n' || before === '\t';
        };
        if (!isValidTrigger(active.index)) { if (showSuggestion) { setShowSuggestion(false); setSuggestionType(null); } return; }

        const afterTrigger = text.substring(active.index + 1, cursorPos);
        if (afterTrigger === '') {
            if (active.type === '/' && suggestionType !== 'skill') { setSuggestionType('skill'); loadSkills(); setShowSuggestion(true); }
            else if (active.type === '@' && suggestionType !== 'domain') { setSuggestionType('domain'); loadDomains(); setShowSuggestion(true); }
        }
    };

    const handleSelectSuggestion = (item) => {
        if (!suggestionType) return;
        const triggerChar = suggestionType === 'skill' ? '/' : '@';
        const lastIndex = inputText.lastIndexOf(triggerChar, cursorPosition);
        if (lastIndex === -1) { setShowSuggestion(false); setSuggestionType(null); return; }

        let displayText, displayKey, serverToken;
        if (suggestionType === 'skill') {
            displayText = `/${item.code_name} `;
            displayKey = `/${item.code_name}`;
            serverToken = `</:${item.code_name}>`;
        } else {
            const domainId = domainCodeToIdMap[item.code_name];
            if (!domainId) return;
            displayText = `@${item.code_name} `;
            displayKey = `@${item.code_name}`;
            serverToken = `<@:domain=${domainId}>`;
        }

        setInputText(inputText.substring(0, lastIndex) + displayText + inputText.substring(cursorPosition));
        setSelectedSuggestions(prev => ({ ...prev, [displayKey]: serverToken }));
        setShowSuggestion(false);
        setSuggestionType(null);
    };

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;

        voiceTextBlockedRef.current = true;
        await stopListening();

        if (editingMessageId) {
            await resendEditedMessage(editingMessageId, inputText);
            setEditingMessageId(null);
            setInputText('');
            voiceTextBlockedRef.current = false;
            return;
        }

        if (pendingInterrupt) {
            voiceTextBlockedRef.current = false;
            return;
        }

        let currentMessage = inputText;
        Object.keys(selectedSuggestions).forEach(displayKey => {
            const serverToken = selectedSuggestions[displayKey];
            if (currentMessage.includes(displayKey)) {
                currentMessage = currentMessage.replace(new RegExp(escapeRegExp(displayKey) + '\\b', 'g'), serverToken);
            }
        });

        setInputText('');
        committedTextRef.current = '';
        voiceTextBlockedRef.current = false;
        setSelectedSuggestions({});
        const pending = [...attachments];
        setAttachments([]);
        await sendMessage(currentMessage, { attachments: pending, agentModel: selectedModel });
    };

    const pickFile = async () => {
        try {
            setIsUploading(true);
            const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
            const asset = res?.assets?.[0] || (res?.type === 'success' ? res : null);
            if (!asset?.uri) return;
            const token = apiClient.getAuthToken();
            if (!token) return;
            const up = await AgentApiService.uploadAttachment(
                token, { uri: asset.uri, name: asset.name, type: asset.mimeType || asset.type }, asset.name
            );
            const serverData = up?.data;
            if (!serverData?.original_file) return;
            setAttachments(prev => prev.concat({
                type: (asset.mimeType || asset.type || '').startsWith('image/') ? 'image' : 'file',
                name: serverData.name || asset.name || 'upload',
                original_file: serverData.original_file,
                extracted_file: serverData.extracted_file,
                mimeType: asset.mimeType || asset.type,
                size: asset.size,
            }));
        } finally { setIsUploading(false); }
    };

    const handleCitationPress = useCallback((data) => setCitationModal(data), []);

    // ── Render helpers ────────────────────────────────────────────────────────
    // Find the interrupt question message id — prefer isInterruptMessage flag, fallback to last bot
    const interruptMessageId = useMemo(() => {
        if (!pendingInterrupt) return null;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (!messages[i].isUser && messages[i].isInterruptMessage) return messages[i].id;
        }
        for (let i = messages.length - 1; i >= 0; i--) {
            if (!messages[i].isUser) return messages[i].id;
        }
        return null;
    }, [messages, pendingInterrupt]);

    const renderMessage = useCallback(({ item }) => {
        const isLastBot = !item.isUser && item.id === interruptMessageId && !!pendingInterrupt;
        return (
            <BubbleMessageItem
                item={item}
                onLongPressUserMessage={(id, text) => { setEditingMessageId(id); setInputText(text); }}
                formatTimestamp={formatTimestamp}
                thinkingDots={thinkingDots}
                domainIdToCodeMap={domainIdToCodeMap}
                onSpeak={speakMessage}
                isSpeaking={speakingMessageId}
                onStopSpeaking={stopSpeaking}
                onCitationPress={handleCitationPress}
                pendingInterrupt={isLastBot ? pendingInterrupt : null}
                answerInterrupt={isLastBot ? answerInterrupt : null}
                isSending={isSending}
            />
        );
    }, [formatTimestamp, thinkingDots, domainIdToCodeMap, speakMessage, speakingMessageId, stopSpeaking, handleCitationPress, interruptMessageId, pendingInterrupt, answerInterrupt, isSending]);

    const renderHistoryItem = useCallback(({ item }) => {
        const displayTitle = getDisplayTitle(item.title) || 'Cuộc trò chuyện';
        const isCmd = isCommandText(displayTitle);
        const truncatedTitle = truncateHistoryText(displayTitle, 2, 100);
        return (
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isCmd ? '#fef3c7' : '#e0e7ff', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <MaterialIcons name={isCmd ? 'bolt' : 'chat-bubble-outline'} size={16} color={isCmd ? '#d97706' : '#4f46e5'} />
                </View>
                <TouchableOpacity onPress={async () => { await openConversation(item.id); setInputText(''); setShowHistory(false); }} style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500', marginBottom: 4 }} numberOfLines={2}>{truncatedTitle}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {isCmd && (
                            <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 }}>
                                <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '600' }}>Command</Text>
                            </View>
                        )}
                        <Text style={{ fontSize: 11, color: '#6b7280' }}>{formatVietnamTime(item.updated_at || item.created_at)}</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteConversation(item.id)} style={{ padding: 8 }}>
                    <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
            </View>
        );
    }, [domainIdToCodeMap, domainCodeToIdMap, openConversation, deleteConversation]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            {/* Floating bubble */}
            <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
                <Animated.View style={[{ position: 'absolute', bottom: scale(92), right: scale(20), zIndex: 1000, elevation: 20 }, animatedStyle]}>
                    <TouchableOpacity
                        onPress={() => setModalVisible(true)}
                        style={{ backgroundColor: '#2563eb', width: scale(56), height: scale(56), borderRadius: scale(28), alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 }}
                    >
                        <Image source={chatIcon} style={{ width: 28, height: 28, tintColor: 'white' }} />
                    </TouchableOpacity>
                </Animated.View>
            </PanGestureHandler>

            {/* Chat modal */}
            <Modal visible={modalVisible} animationType="slide" transparent={false}>
                <ImageBackground source={botBubbleBg} style={{ flex: 1 }} resizeMode="cover">
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)' }} />
                    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent', overflow: 'hidden' }}>
                        {/* Header */}
                        <LinearGradient
                            colors={['#732cc9', '#7840f2', '#5c50da', '#5233f0']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Image source={chatIcon} style={{ width: 24, height: 24, tintColor: 'white' }} />
                                <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 8 }}>AI HaNoiBrain</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TouchableOpacity onPress={() => { newConversation(); setInputText(''); }} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="add-comment" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={openHistory} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="history" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => { newConversation(); setInputText(''); setModalVisible(false); setSelectedSuggestions({}); }}>
                                    <MaterialIcons name="close" size={24} color="white" />
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>

                        {/* Messages */}
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={(item, index) => `${item.id || index}${item.status === 'streaming' ? '-s' : ''}`}
                            renderItem={renderMessage}
                            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
                            showsVerticalScrollIndicator={false}
                            initialNumToRender={15}
                            maxToRenderPerBatch={10}
                            windowSize={21}
                            removeClippedSubviews={false}
                        />

                        <ChatInputArea
                            inputText={inputText}
                            onChangeText={handleTextChange}
                            onSelectionChange={(e) => setCursorPosition(e.nativeEvent.selection.start)}
                            editingMessageId={editingMessageId}
                            pendingInterrupt={pendingInterrupt}
                            isListening={isListening}
                            isUploading={isUploading}
                            isSending={isSending}
                            selectedModel={selectedModel}
                            attachments={attachments}
                            ringStyle={ringStyle}
                            onPickFile={pickFile}
                            onToggleVoice={() => isListening ? stopListening() : startListening(inputText)}
                            onToggleModelPicker={() => setShowModelPicker(true)}
                            onSend={handleSendMessage}
                            onCancel={cancel}
                        />
                    </SafeAreaView>

                    <HistoryModal
                        visible={showHistory}
                        onClose={() => setShowHistory(false)}
                        conversations={sortedConversations}
                        loadingHistory={loadingHistory}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        renderHistoryItem={renderHistoryItem}
                    />
                </ImageBackground>
            </Modal>

            <SuggestionModal
                visible={showSuggestion}
                onClose={() => { setShowSuggestion(false); setSuggestionType(null); }}
                onSelect={handleSelectSuggestion}
                data={suggestionData}
                loading={loadingSuggestions}
                title={suggestionType === 'skill' ? 'Chọn kỹ năng' : 'Chọn thư mục/tài liệu'}
                icon={suggestionType === 'skill' ? 'bolt' : 'folder-open'}
                emptyMessage="Không tìm thấy kết quả"
            />

            <ModelPickerModal
                visible={showModelPicker}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onClose={() => setShowModelPicker(false)}
            />

            <CitationModal citationModal={citationModal} onClose={() => setCitationModal(null)} />
        </>
    );
}
