import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TextInput,
    FlatList,
    SafeAreaView,
    ImageBackground,
    Image,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../../../hooks/useChat';
import { useVoiceChat } from '../../../hooks/useVoiceChat';
import { useResponsive } from '../../../hooks/useResponsive';
import { useAuth } from '../../../contexts/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';
import AgentSkillService from '../../../services/agent/AgentSkillService';
import DomainService from '../../../services/domain/DomainService';
import ModelPickerModal from './ModelPickerModal';
import SuggestionModal from './SuggestionModal';
import { removeTriggerTokens } from '../../../utils/triggerParser';
import botBubbleBg from '../../../assets/images/TUHN3.jpg';
import { LinearGradient } from 'expo-linear-gradient';
import chatIcon from '../../../assets/images/chatbot.png';
import Markdown from 'react-native-markdown-display';


// ==================== HÀM TIỆN ÍCH ====================

// Chuyển đổi token server → hiển thị
const convertTokensToDisplayWithMap = (text, domainIdToCodeMap) => {
    if (!text) return '';

    let converted = text;

    // Xử lý skill token: </:visualize> → /visualize
    converted = converted.replace(/<\/([^>]+)>/g, (match, code) => {
        // Loại bỏ dấu : ở đầu nếu có
        const cleanCode = code.replace(/^:/, '');
        return `/${cleanCode}`;
    });

    // Xử lý domain token: <@:domain=ID> → @code_name
    converted = converted.replace(/<@:domain=([^>]+)>/g, (match, id) => {
        const codeName = domainIdToCodeMap?.[id];
        return codeName ? `@${codeName}` : match;
    });

    // Xử lý tag token
    converted = converted.replace(/<#:(.*?)>/g, '#$1');

    return converted;
};

// Làm sạch Markdown

const cleanMarkdownText = (text) => {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/^[-*•]\s+/gm, '• ')
        .replace(/^\d+\.\s+/gm, '▪️ ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
};

// Lọc lỗi kỹ thuật
const sanitizeTechnicalText = (text) => {
    if (!text) return '';
    const patterns = [/syntaxerror/i, /traceback/i, /exception/i, /http\s*\d{3}/i];
    return patterns.some(p => p.test(text)) ? 'Đã có lỗi xảy ra. Vui lòng thử lại.' : text;
};
const cleanBotText = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
        const lowerLine = line.toLowerCase().trim();
        if (line.trim().length < 10) return false;

        // Các pattern cần loại bỏ (bổ sung thêm)
        if (lowerLine.includes('tôi đã trả về phản hồi không hợp lệ')) return false;
        if (lowerLine.includes('để tôi thử lại')) return false;
        if (lowerLine.includes('tìm kiếm báo cáo')) return false;
        if (lowerLine.includes('tìm kiếm thông tin')) return false;
        if (lowerLine.includes('người dùng muốn biết')) return false;
        if (lowerLine.includes('tìm kiếm kỹ năng')) return false;
        if (lowerLine.includes('observe the result')) return false;
        if (lowerLine.includes('dựa trên kết quả')) return false;
        if (lowerLine.includes('theo hướng dẫn')) return false;
        if (lowerLine.includes('tôi sẽ tổng hợp')) return false;
        if (lowerLine.includes('tôi cần tìm kiếm')) return false;
        if (lowerLine.includes('tôi đã tìm kiếm')) return false;
        if (lowerLine.includes('sau khi tìm kiếm')) return false;
        if (lowerLine.includes('cortex')) return false;

        // Lọc các dòng chỉ chứa timestamp (ví dụ "8:47:43 AM")
        if (lowerLine.match(/^\d{1,2}:\d{2}:\d{2}\s*(am|pm)?$/)) return false;
        if (lowerLine.match(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/i)) return false;

        return true;
    });

    let cleaned = filteredLines.join('\n').trim();

    if (cleaned) {
        // Lấy đoạn cuối cùng (kết quả)
        const paragraphs = cleaned.split(/\n\s*\n/);
        cleaned = paragraphs[paragraphs.length - 1];
    }

    // Xóa timestamp còn sót
    cleaned = cleaned?.replace(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/gi, '');
    cleaned = cleaned?.replace(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/gi, '');

    if (!cleaned || cleaned.length < 15) {
        return null;
    }

    return cleaned;
};

// Escape regex
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ==================== COMPONENT TIN NHẮN ====================

const MessageItem = memo(({
    item,
    onLongPressUserMessage,
    formatTimestamp,
    thinkingDots,
    domainIdToCodeMap
}) => {
    const isUser = item.isUser;

    let displayText = '';
    if (isUser) {
        displayText = convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap);
    } else {
        let rawText = item.status === 'streaming' && !`${item.text || ''}`.trim()
            ? `Đang suy nghĩ${thinkingDots}`
            : (item.text || '');

        let cleaned = cleanBotText(rawText);
        if (cleaned === null) {
            if (item.status !== 'streaming') {
                // Không hiển thị tin nhắn này
                return null;
            } else {
                cleaned = rawText;
            }
        }

        cleaned = sanitizeTechnicalText(cleaned);
        if (cleaned === 'Đã có lỗi xảy ra. Vui lòng thử lại.') {
            if (item.status !== 'streaming') return null;
        }
        cleaned = removeTriggerTokens(cleaned);
        displayText = convertTokensToDisplayWithMap(cleaned, domainIdToCodeMap);

        if (!displayText.trim()) {
            return null;
        }
    }

    const handleLongPress = () => {
        if (!isUser) return;
        onLongPressUserMessage(item.id, convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap));
    };

    return (
        <TouchableOpacity
            activeOpacity={isUser ? 0.9 : 1}
            onLongPress={handleLongPress}
            style={{
                flexDirection: 'row',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 12,
                paddingHorizontal: 10,
            }}>
            <View style={{
                alignItems: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
            }}>
                <LinearGradient
                    colors={isUser ? ['#e7e8e9', '#f9fbff'] : ['#732cc9', '#7840f2', '#5c50da', '#5233f0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        padding: 1.5,
                        borderRadius: 18,
                        borderBottomLeftRadius: isUser ? 18 : 4,
                        borderBottomRightRadius: isUser ? 4 : 18,
                    }}
                >
                    <View style={{
                        backgroundColor: isUser ? '#2581eb' : 'white',
                        padding: 12,
                        borderRadius: 17,
                        borderBottomLeftRadius: isUser ? 17 : 4,
                        borderBottomRightRadius: isUser ? 4 : 17,
                    }}>
                        {isUser ? (
                            // User message: plain text
                            <Text style={{
                                color: 'white',
                                fontSize: 14,
                                lineHeight: 20,
                            }}>
                                {displayText}
                            </Text>
                        ) : (
                            // AI message: render markdown
                            <Markdown
                                style={{
                                    body: {
                                        color: '#1f2937',
                                        fontSize: 14,
                                        lineHeight: 20,
                                    },
                                    strong: {
                                        fontWeight: 'bold',
                                        color: '#1f2937',
                                    },
                                    em: {
                                        fontStyle: 'italic',
                                    },
                                    bullet_list: {
                                        marginBottom: 4,
                                    },
                                    bullet_list_item: {
                                        flexDirection: 'row',
                                        marginBottom: 2,
                                    },
                                    ordered_list: {
                                        marginBottom: 4,
                                    },
                                    ordered_list_item: {
                                        flexDirection: 'row',
                                        marginBottom: 2,
                                    },
                                    paragraph: {
                                        marginBottom: 4,
                                    },
                                    heading1: {
                                        fontSize: 20,
                                        fontWeight: 'bold',
                                        marginVertical: 6,
                                    },
                                    heading2: {
                                        fontSize: 18,
                                        fontWeight: 'bold',
                                        marginVertical: 5,
                                    },
                                    heading3: {
                                        fontSize: 16,
                                        fontWeight: 'bold',
                                        marginVertical: 4,
                                    },
                                    link: {
                                        color: '#2563eb',
                                    },
                                }}
                                // Tùy chọn: cho phép line break từ \n
                                mergeStyle={false}
                            >
                                {displayText}
                            </Markdown>
                        )}
                        <Text style={{
                            fontSize: 10,
                            color: isUser ? '#dbeafe' : '#6b7280',
                            marginTop: 4,
                            textAlign: 'right',
                        }}>
                            {formatTimestamp(item.timestamp)}
                        </Text>
                    </View>
                </LinearGradient>

                {isUser && (
                    <Text style={{
                        fontSize: 10,
                        color: '#ffffff',
                        marginTop: 4,
                        marginRight: 4,
                    }}>
                        Nhấn giữ để sửa
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
});
// ==================== COMPONENT CHÍNH ====================

export default function DraggableChatBubble() {
    const { user } = useAuth();
    const partnerId = user?.partner_id || '01km7vpjm4hcq4jbj35m680m5p';

    // Animation shared values
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const micScale = useSharedValue(1);

    // UI state
    const [modalVisible, setModalVisible] = useState(false);
    const [inputText, setInputText] = useState('');
    const [selectedModel, setSelectedModel] = useState('intelligent');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [thinkingDots, setThinkingDots] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);

    // Suggestion state
    const [showSuggestion, setShowSuggestion] = useState(false);
    const [suggestionType, setSuggestionType] = useState(null); // 'skill', 'domain'
    const [suggestionData, setSuggestionData] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [selectedSuggestions, setSelectedSuggestions] = useState({}); // displayKey → serverToken

    // Domain mapping
    const [domainIdToCodeMap, setDomainIdToCodeMap] = useState({}); // id → code_name
    const [domainCodeToIdMap, setDomainCodeToIdMap] = useState({}); // code_name → id

    const flatListRef = useRef(null);
    const { scale } = useResponsive();

    // Chat hooks
    const {
        messages,
        sendMessage,
        cancel,
        resendEditedMessage,
        isSending,
        pendingInterrupt,
        answerInterrupt,
        conversations,
        loadConversations,
        openConversation,
        deleteConversation,
        newConversation,
    } = useChat();

    // Voice hook
    const { isListening, startListening, stopListening } = useVoiceChat({
        onTranscript: (text) => setInputText(text),
    });

    // Mic animation style
    const ringStyle = useAnimatedStyle(() => ({
        transform: [{ scale: withSpring(isListening ? 1.3 : 1) }],
        opacity: withTiming(isListening ? 0.5 : 0),
    }));

    useEffect(() => {
        if (isListening) {
            micScale.value = withSpring(1.2, { damping: 2, stiffness: 80 });
        } else {
            micScale.value = withSpring(1);
        }
    }, [isListening]);

    // Format timestamp
    const formatTimestamp = useCallback((value) => {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
    }, []);

    // Format Vietnam time
    const formatVietnamTime = (dateString) => {
        if (!dateString) return '';
        try {
            if (typeof dateString === 'string' && dateString.startsWith('01k')) return '';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${day}/${month} ${hours}:${minutes}`;
        } catch (e) {
            return '';
        }
    };

    // Sort conversations
    const sortedConversations = [...conversations].sort((a, b) =>
        `${b?.updated_at || b?.created_at || ''}`.localeCompare(
            `${a?.updated_at || a?.created_at || ''}`
        )
    );

    // Load skills
    const loadSkills = async (search = '') => {
        setLoadingSuggestions(true);
        try {
            const result = await AgentSkillService.getAvailableSkills({
                limit: 20,
                partner_id: partnerId
            });
            if (result.code === 200 && result.data) {
                let filtered = result.data;
                if (search) {
                    filtered = filtered.filter(skill =>
                        skill.name.toLowerCase().includes(search.toLowerCase()) ||
                        skill.code_name.toLowerCase().includes(search.toLowerCase())
                    );
                }
                setSuggestionData(filtered.map(skill => ({ ...skill, type: 'skill' })));
            }
        } catch (error) {
            console.error('Load skills error:', error);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    // Load domains and build mappings
    const loadDomains = async (search = '') => {
        setLoadingSuggestions(true);
        try {
            const result = await DomainService.getDomains({
                limit: 20,
                type: 'file_folder',
                partner_id: partnerId
            });
            if (result.code === 200 && result.data) {
                // Build mappings
                const idToCode = {};
                const codeToId = {};
                result.data.forEach(domain => {
                    idToCode[domain.id] = domain.code_name;
                    codeToId[domain.code_name] = domain.id;
                });
                setDomainIdToCodeMap(idToCode);
                setDomainCodeToIdMap(codeToId);

                let filtered = result.data;
                if (search) {
                    filtered = filtered.filter(domain =>
                        domain.name.toLowerCase().includes(search.toLowerCase()) ||
                        domain.code_name.toLowerCase().includes(search.toLowerCase())
                    );
                }
                setSuggestionData(filtered.map(domain => ({ ...domain, type: 'domain' })));
            }
        } catch (error) {
            console.error('Load domains error:', error);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    // Xử lý chọn suggestion (THEO ĐÚNG TRIGGER TOKEN FORMAT)
    const handleSelectSuggestion = (item) => {
        if (!suggestionType) return;

        const triggerChar = suggestionType === 'skill' ? '/' : '@';
        const lastIndex = inputText.lastIndexOf(triggerChar, cursorPosition);

        if (lastIndex === -1) {
            setShowSuggestion(false);
            setSuggestionType(null);
            return;
        }

        let displayText = '';
        let displayKey = '';
        let serverToken = '';

        if (suggestionType === 'skill') {
            // Hiển thị: /code_name
            // Server: </:code_name>
            displayText = `/${item.code_name} `;
            displayKey = `/${item.code_name}`;
            serverToken = `</:${item.code_name}>`;
        } else if (suggestionType === 'domain') {
            // Hiển thị: @code_name
            // Server: <@:domain=ID>
            const domainId = domainCodeToIdMap[item.code_name];
            if (!domainId) {
                console.error('Domain ID not found for:', item.code_name);
                return;
            }
            displayText = `@${item.code_name} `;
            displayKey = `@${item.code_name}`;
            serverToken = `<@:domain=${domainId}>`;
        } else {
            setShowSuggestion(false);
            setSuggestionType(null);
            return;
        }

        const newText = inputText.substring(0, lastIndex) + displayText + inputText.substring(cursorPosition);
        setInputText(newText);

        setSelectedSuggestions(prev => ({
            ...prev,
            [displayKey]: serverToken
        }));

        setShowSuggestion(false);
        setSuggestionType(null);
    };

    // Xử lý khi text thay đổi (bắt trigger / và @)
    const handleTextChange = (text) => {
        setInputText(text);
        const cursorPos = text.length;

        const lastSlash = text.lastIndexOf('/', cursorPos);
        const lastAt = text.lastIndexOf('@', cursorPos);

        const triggers = [];
        if (lastSlash !== -1) triggers.push({ type: '/', index: lastSlash });
        if (lastAt !== -1) triggers.push({ type: '@', index: lastAt });

        if (triggers.length === 0) {
            if (showSuggestion) {
                setShowSuggestion(false);
                setSuggestionType(null);
            }
            return;
        }

        // Lấy trigger gần con trỏ nhất
        const active = triggers.reduce((prev, curr) => curr.index > prev.index ? curr : prev);
        const activeIndex = active.index;
        const activeToken = active.type;

        // Kiểm tra trigger có hợp lệ (đứng sau khoảng trắng hoặc đầu dòng)
        const isValidTrigger = (index) => {
            if (index === 0) return true;
            const before = text[index - 1];
            return before === ' ' || before === '\n' || before === '\t';
        };

        if (!isValidTrigger(activeIndex)) {
            if (showSuggestion) {
                setShowSuggestion(false);
                setSuggestionType(null);
            }
            return;
        }

        const afterTrigger = text.substring(activeIndex + 1, cursorPos);

        if (afterTrigger === '') {
            if (activeToken === '/' && suggestionType !== 'skill') {
                setSuggestionType('skill');
                loadSkills();
                setShowSuggestion(true);
            } else if (activeToken === '@' && suggestionType !== 'domain') {
                setSuggestionType('domain');
                loadDomains();
                setShowSuggestion(true);
            }
        } else if (showSuggestion && suggestionType === 'skill' && activeToken !== '/') {
            setShowSuggestion(false);
            setSuggestionType(null);
        } else if (showSuggestion && suggestionType === 'domain' && activeToken !== '@') {
            setShowSuggestion(false);
            setSuggestionType(null);
        }
    };

    // Gửi tin nhắn (chuyển đổi display → server token)
    const handleSendMessage = async () => {
        if (!inputText.trim()) return;

        if (editingMessageId) {
            await resendEditedMessage(editingMessageId, inputText);
            setEditingMessageId(null);
            setInputText('');
            return;
        }

        let currentMessage = inputText;

        // Thay thế display text bằng server token
        Object.keys(selectedSuggestions).forEach(displayKey => {
            const serverToken = selectedSuggestions[displayKey];
            if (currentMessage.includes(displayKey)) {
                const escapedKey = escapeRegExp(displayKey);
                currentMessage = currentMessage.replace(
                    new RegExp(escapedKey + '\\b', 'g'),
                    serverToken
                );
            }
        });

        setInputText('');
        setSelectedSuggestions({});
        const pending = [...attachments];
        setAttachments([]);

        await sendMessage(currentMessage, {
            attachments: pending,
            agentModel: selectedModel
        });
    };

    // Upload file
    const pickFile = async () => {
        try {
            setIsUploading(true);
            const res = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                multiple: false,
            });
            const asset = res?.assets?.[0] || (res?.type === 'success' ? res : null);
            if (!asset?.uri) return;

            const token = apiClient.getAuthToken();
            if (!token) return;

            const up = await AgentApiService.uploadAttachment(
                token,
                { uri: asset.uri, name: asset.name, type: asset.mimeType || asset.type },
                asset.name
            );

            const serverData = up?.data;
            if (!serverData?.original_file) return;

            const record = {
                type: (asset.mimeType || asset.type || '').startsWith('image/') ? 'image' : 'file',
                name: serverData.name || asset.name || 'upload',
                original_file: serverData.original_file,
                extracted_file: serverData.extracted_file,
                mimeType: asset.mimeType || asset.type,
                size: asset.size,
            };

            setAttachments(prev => prev.concat(record));
        } finally {
            setIsUploading(false);
        }
    };

    // Gesture handlers
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

    // Auto scroll to bottom
    useEffect(() => {
        if (messages.length > 0 && flatListRef.current) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

    // Thinking dots animation
    useEffect(() => {
        const hasStreaming = messages.some(
            (m) => !m.isUser && m.status === 'streaming' && !`${m.text || ''}`.trim()
        );
        if (!hasStreaming) {
            setThinkingDots('');
            return;
        }
        const t = setInterval(() => {
            setThinkingDots((prev) => {
                if (prev === '') return '.';
                if (prev === '.') return '..';
                if (prev === '..') return '...';
                return '';
            });
        }, 450);
        return () => clearInterval(t);
    }, [messages]);

    const openHistory = async () => {
        setShowHistory(true);
        await loadConversations();
        await loadDomains(); // Load mapping cho lịch sử
    };

    // Render message item
    const renderMessage = useCallback(({ item }) => (
        <MessageItem
            item={item}
            onLongPressUserMessage={(id, text) => {
                setEditingMessageId(id);
                setInputText(text);
            }}
            formatTimestamp={formatTimestamp}
            thinkingDots={thinkingDots}
            domainIdToCodeMap={domainIdToCodeMap}
        />
    ), [formatTimestamp, thinkingDots, domainIdToCodeMap]);

    // Chuyển đổi title lịch sử (xử lý cả token và raw ID)
    const getDisplayTitle = (title) => {
        if (!title) return 'Conversation';
        let display = convertTokensToDisplayWithMap(title, domainIdToCodeMap);
        // Nếu vẫn còn là raw ID (dạng 01kmqh...)
        if (domainCodeToIdMap[display]) {
            display = `@${display}`;
        }
        return display;
    };

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
                        <Image source={chatIcon} style={{ width: 28, height: 28, tintColor: 'white' }} />
                    </TouchableOpacity>
                </Animated.View>
            </PanGestureHandler>

            <Modal visible={modalVisible} animationType="slide" transparent={false}>
                <ImageBackground source={botBubbleBg} style={{ flex: 1 }} resizeMode="cover">
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)' }} />
                    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
                        {/* Header */}
                        <LinearGradient
                            colors={['#732cc9', '#7840f2', '#5c50da', '#5233f0']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                                padding: 16,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderTopLeftRadius: 16,
                                borderTopRightRadius: 16,
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Image source={chatIcon} style={{ width: 24, height: 24, tintColor: 'white' }} />
                                <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 8 }}>
                                    AI HaNoiBrain
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TouchableOpacity onPress={newConversation} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="add-comment" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={openHistory} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="history" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => {
                                    newConversation();
                                    setModalVisible(false);
                                    setSelectedSuggestions({});
                                }}>
                                    <MaterialIcons name="close" size={24} color="white" />
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>

                        {/* Messages */}
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={(item, index) => item.id || `msg-${index}`}
                            renderItem={renderMessage}
                            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
                            showsVerticalScrollIndicator={false}
                            initialNumToRender={15}
                            maxToRenderPerBatch={10}
                            windowSize={21}
                            removeClippedSubviews={true}
                        />

                        {/* Pending Interrupt */}
                        {pendingInterrupt && (
                            <View style={{
                                marginHorizontal: 12,
                                marginTop: 8,
                                backgroundColor: '#fff7ed',
                                borderWidth: 1,
                                borderColor: '#fdba74',
                                borderRadius: 12,
                                padding: 10,
                            }}>
                                <Text style={{ fontSize: 12, color: '#9a3412', marginBottom: 6 }}>
                                    {pendingInterrupt.question || 'Cần xác nhận'}
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                    {(pendingInterrupt.options || ['Đồng ý', 'Từ chối']).map((opt) => (
                                        <TouchableOpacity
                                            key={opt}
                                            onPress={() => answerInterrupt(opt)}
                                            style={{
                                                backgroundColor: '#fb923c',
                                                borderRadius: 999,
                                                paddingHorizontal: 10,
                                                paddingVertical: 6,
                                                marginRight: 8,
                                                marginBottom: 6,
                                            }}
                                        >
                                            <Text style={{ color: 'white', fontSize: 12 }}>{opt}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Input Area */}
                        <View style={{
                            backgroundColor: 'white',
                            padding: 12,
                            borderWidth: 1,
                            borderColor: '#e5e7eb',
                            borderTopLeftRadius: 16,
                            borderTopRightRadius: 16,
                        }}>
                            <TextInput
                                style={{
                                    borderWidth: 0,
                                    borderRadius: 20,
                                    backgroundColor: '#f8fafc',
                                    paddingHorizontal: 16,
                                    paddingVertical: 12,
                                    fontSize: 14,
                                    minHeight: 48,
                                    maxHeight: 100,
                                    textAlignVertical: 'top',
                                }}
                                placeholder={editingMessageId ? 'Sửa tin nhắn...' : 'Bạn cần tôi giúp gì? (gõ / để dùng lệnh, @ để chọn tài liệu)'}
                                value={inputText}
                                onChangeText={handleTextChange}
                                onSelectionChange={(e) => setCursorPosition(e.nativeEvent.selection.start)}
                                multiline
                            />

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <TouchableOpacity
                                        onPress={pickFile}
                                        disabled={isUploading || isSending}
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 20,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: isUploading || isSending ? '#d1d5db' : '#e5e7eb',
                                            marginRight: 8,
                                        }}
                                    >
                                        <MaterialIcons name="attach-file" size={20} color="#374151" />
                                    </TouchableOpacity>

                                    <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                        {isListening && (
                                            <Animated.View style={[{
                                                position: 'absolute',
                                                width: 40,
                                                height: 40,
                                                borderRadius: 20,
                                                backgroundColor: '#ef4444',
                                            }, ringStyle]} />
                                        )}
                                        <TouchableOpacity
                                            onPress={isListening ? stopListening : startListening}
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 20,
                                                backgroundColor: isListening ? '#ef4444' : '#e5e7eb',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <MaterialIcons name="mic" size={22} color={isListening ? 'white' : '#374151'} />
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={{ fontSize: 12, color: '#6b7280', marginRight: 12 }}>
                                        {`${inputText.length}/1000`}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    onPress={() => setShowModelPicker(true)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        backgroundColor: '#eef2ff',
                                        borderRadius: 999,
                                    }}
                                >
                                    <Text numberOfLines={1} style={{ color: '#4338ca', fontSize: 14, fontWeight: '600' }}>
                                        {selectedModel === 'intelligent' ? 'Trợ lý thông minh' : selectedModel === 'document' ? 'Trợ lý tài liệu' : 'Trợ lý dữ liệu'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={16} color="#4338ca" style={{ marginLeft: 4 }} />
                                </TouchableOpacity>

                                {isSending ? (
                                    <TouchableOpacity onPress={cancel} style={{
                                        backgroundColor: '#dc2626',
                                        width: 40, height: 40, borderRadius: 20,
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="stop" size={20} color="white" />
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        onPress={handleSendMessage}
                                        disabled={isUploading || !inputText.trim()}
                                        style={{
                                            backgroundColor: isUploading || !inputText.trim() ? '#9ca3af' : '#2563eb',
                                            width: 40, height: 40, borderRadius: 20,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <MaterialIcons
                                            name={editingMessageId ? 'check' : 'send'}
                                            size={20}
                                            color="white"
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {attachments.length > 0 && (
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'white' }}>
                                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                                    Đã đính kèm: {attachments.map(a => a.name).join(', ')}
                                </Text>
                            </View>
                        )}
                    </SafeAreaView>
                </ImageBackground>
            </Modal>

            {/* History Modal */}
            <Modal visible={showHistory} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '65%' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Lịch sử hội thoại</Text>
                            <View style={{ flexDirection: 'row' }}>
                                <TouchableOpacity onPress={loadConversations} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="refresh" size={22} color="#374151" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowHistory(false)}>
                                    <MaterialIcons name="close" size={22} color="#374151" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <FlatList
                            data={sortedConversations}
                            keyExtractor={(item, idx) => item.id || `${idx}`}
                            renderItem={({ item }) => (
                                <View style={{
                                    paddingHorizontal: 14,
                                    paddingVertical: 12,
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#f3f4f6',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <TouchableOpacity
                                        onPress={async () => {
                                            await openConversation(item.id);
                                            setShowHistory(false);
                                        }}
                                        style={{ flex: 1 }}
                                    >
                                        <Text style={{ fontSize: 14, color: '#111827' }}>
                                            {getDisplayTitle(item.title) || item.id || 'Conversation'}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                            {formatVietnamTime(item.updated_at || item.created_at)}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => deleteConversation(item.id)} style={{ padding: 4 }}>
                                        <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* Suggestion Modal */}
            <SuggestionModal
                visible={showSuggestion}
                onClose={() => {
                    setShowSuggestion(false);
                    setSuggestionType(null);
                }}
                onSelect={handleSelectSuggestion}
                data={suggestionData}
                loading={loadingSuggestions}
                title={suggestionType === 'skill' ? 'Chọn kỹ năng' : 'Chọn thư mục/tài liệu'}
                icon={suggestionType === 'skill' ? 'bolt' : 'folder-open'}
                emptyMessage="Không tìm thấy kết quả"
            />

            {/* Model Picker Modal */}
            <ModelPickerModal
                visible={showModelPicker}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onClose={() => setShowModelPicker(false)}
            />
        </>
    );
}