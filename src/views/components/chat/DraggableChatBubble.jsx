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
    ActivityIndicator,
    RefreshControl,
    ScrollView
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../../../hooks/useChat';
import Voice from '@react-native-voice/voice';
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
import * as Speech from 'expo-speech';
import { Linking, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';

// ==================== UTILITIES ====================

// Chuyển đổi token server → hiển thị
const convertTokensToDisplayWithMap = (text, domainIdToCodeMap) => {
    if (!text) return '';

    let converted = text;

    // Xử lý skill token: </:visualize> → /visualize
    converted = converted.replace(/<\/([^>]+)>/g, (match, code) => {
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

// Lọc lỗi kỹ thuật
const sanitizeTechnicalText = (text) => {
    if (!text) return '';
    const patterns = [/syntaxerror/i, /traceback/i, /exception/i, /http\s*\d{3}/i];
    return patterns.some(p => p.test(text)) ? 'Đã có lỗi xảy ra. Vui lòng thử lại.' : text;
};

// Làm sạch text từ bot
const cleanBotText = (text) => {
    if (!text) return null;
    const lowerText = text.toLowerCase();

    // ✅ Kiểm tra nếu đây là message chứa báo cáo
    const isReportMessage =
        lowerText.includes('báo cáo') ||
        lowerText.includes('tải xuống') ||
        lowerText.includes('.doc') ||
        lowerText.includes('kết quả') ||
        text.length > 500;

    if (isReportMessage) {
        // Chỉ xóa timestamp, giữ nguyên toàn bộ nội dung
        let cleaned = text
            .replace(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/gi, '')
            .replace(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/gi, '')
            .trim();

        return cleaned.length > 0 ? cleaned : text;
    }

    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
        const lowerLine = line.toLowerCase().trim();
        if (line.trim().length < 10) return false;

        // Các pattern cần loại bỏ
        const excludePatterns = [
            'tôi đã trả về phản hồi không hợp lệ',
            'để tôi thử lại',
            'tìm kiếm báo cáo',
            'tìm kiếm thông tin',
            'người dùng muốn biết',
            'tìm kiếm kỹ năng',
            'observe the result',
            'dựa trên kết quả',
            'theo hướng dẫn',
            'tôi sẽ tổng hợp',
            'tôi cần tìm kiếm',
            'tôi đã tìm kiếm',
            'sau khi tìm kiếm',
            'tìm thấy kỹ năng',
            'kích hoạt kỹ năng',
            'cortex',
        ];

        if (excludePatterns.some(pattern => lowerLine.includes(pattern))) return false;

        // Lọc timestamp
        if (lowerLine.match(/^\d{1,2}:\d{2}:\d{2}\s*(am|pm)?$/)) return false;
        if (lowerLine.match(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/i)) return false;

        return true;
    });

    let cleaned = filteredLines.join('\n').trim();

    if (cleaned) {
        const paragraphs = cleaned.split(/\n\s*\n/);
        cleaned = paragraphs[paragraphs.length - 1];
    }

    cleaned = cleaned?.replace(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/gi, '');
    cleaned = cleaned?.replace(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/gi, '');

    if (!cleaned || cleaned.length < 15) {
        return null;
    }

    return cleaned;
};

// Escape regex
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ==================== HISTORY UTILS ====================

// Kiểm tra xem text có phải command hay không (bắt đầu bằng / hoặc @)
const isCommandText = (text) => {
    if (!text) return false;
    const trimmed = text.trim();
    return trimmed.startsWith('/') || trimmed.startsWith('@') || trimmed.includes('</:') || trimmed.includes('<@:');
};

// Rút gọn text đến 1-2 dòng với dấu ...
const truncateHistoryText = (text, maxLines = 2, maxChars = 100) => {
    if (!text) return '';

    const lines = text.split('\n').filter(line => line.trim().length > 0);

    // Lấy số dòng cần thiết
    let truncated = lines.slice(0, maxLines).join('\n');

    // Nếu vượt quá ký tự, cắt bớt và thêm ...
    if (truncated.length > maxChars) {
        truncated = truncated.substring(0, maxChars).trim() + '...';
    } else if (lines.length > maxLines) {
        // Nếu có nhiều dòng hơn maxLines, thêm ...
        truncated = truncated + '...';
    }

    return truncated;
};

const ArtifactItem = memo(({ artifact }) => {
    const [showPreview, setShowPreview] = useState(false);
    const [mdContent, setMdContent] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [fileUrl, setFileUrl] = useState(null); // ✅ THÊM STATE

    const fileName = artifact.name || 'Tải xuống';
    const isDoc = /\\.docx?$/.test(fileName);
    const isMarkdown = fileName.endsWith('.md');
    const isTextFile = isMarkdown || /\\.(txt|json)$/.test(fileName);
    let iconName = 'insert-drive-file';
    let iconColor = '#2563eb';
    let bgColor = '#f3f4f6';

    if (isDoc) {
        iconName = 'description';
        iconColor = '#2b5797';
        bgColor = '#e6f0fa';
    } else if (isMarkdown) {
        iconName = 'code';
        iconColor = '#d97706';
        bgColor = '#fef3c7';
    }

    useEffect(() => {
        const getFileUrl = async () => {
            if (artifact.url) {
                // Nếu đã có URL
                if (artifact.url.startsWith('http')) {
                    setFileUrl(artifact.url);
                } else {
                    // Thêm base URL nếu là relative path
                    const baseUrl = AgentApiService.baseUrl();
                    setFileUrl(`${baseUrl}${artifact.url.startsWith('/') ? '' : '/'}${artifact.url}`);
                }
            } else if (artifact.id) {
                // Nếu chỉ có ID, cần lấy signed URL
                try {
                    const token = apiClient.getAuthToken();
                    const conversationId = artifact.conversation_id;
                    if (conversationId) {
                        const result = await AgentApiService.getArtifactSignedUrl(token, conversationId, artifact.id);
                        if (result.data?.url) {
                            setFileUrl(result.data.url);
                        }
                    }
                } catch (error) {
                    console.error('Failed to get signed URL:', error);
                }
            }
        };

        getFileUrl();
    }, [artifact.url, artifact.id]);

    const handlePreview = async () => {
        if (!fileUrl) {
            Alert.alert('Thông báo', 'URL file không hợp lệ');
            return;
        }

        try {
            const token = apiClient.getAuthToken();

            if (isMarkdown) {
                const response = await fetch(fileUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const text = await response.text();
                setMdContent(text);
                setShowPreview(true);
            } else if (isDoc) {
                Alert.alert(
                    'Xem tài liệu',
                    'File Word sẽ được tải xuống để xem. Bạn có muốn tiếp tục?',
                    [
                        { text: 'Hủy', style: 'cancel' },
                        { text: 'Tải xuống', onPress: handleDownload }
                    ]
                );
            } else {
                Alert.alert('Thông báo', 'Không thể xem trước loại file này');
            }
        } catch (error) {
            Alert.alert('Lỗi', 'Không thể tải nội dung file: ' + error.message);
        }
    };

    const handleDownload = async () => {
        if (!fileUrl) {
            Alert.alert('Thông báo', 'URL file không hợp lệ');
            return;
        }

        setIsDownloading(true);
        setDownloadProgress(0);

        try {
            const token = apiClient.getAuthToken();

            let fileExt = '';
            if (isDoc) {
                fileExt = fileName.endsWith('.docx') ? '.docx' : '.doc';
            } else if (isMarkdown) {
                fileExt = '.md';
            } else {
                const lastDot = fileName.lastIndexOf('.');
                fileExt = lastDot > -1 ? fileName.substring(lastDot) : '';
            }

            const baseFileName = fileName.replace(/\.[^/.]+$/, '');
            const fullFileName = baseFileName + fileExt;
            const fileUri = FileSystem.documentDirectory + fullFileName;

            const downloadResumable = FileSystem.createDownloadResumable(
                fileUrl,
                fileUri,
                {
                    headers: { 'Authorization': `Bearer ${token}` },
                },
                (downloadProgress) => {
                    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                    setDownloadProgress(progress);
                }
            );

            const result = await downloadResumable.downloadAsync();

            if (result && result.uri) {
                const fileInfo = await FileSystem.getInfoAsync(result.uri);
                if (!fileInfo.exists) {
                    throw new Error('File not found after download');
                }

                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                    let mimeType = undefined;
                    if (isDoc) {
                        mimeType = fileName.endsWith('.docx')
                            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                            : 'application/msword';
                    } else if (isMarkdown) {
                        mimeType = 'text/markdown';
                    }

                    await Sharing.shareAsync(result.uri, {
                        mimeType: mimeType,
                        dialogTitle: `Chia sẻ ${fullFileName}`,
                    });
                } else {
                    Alert.alert(
                        'Tải xuống thành công',
                        `File đã được lưu tại: ${result.uri}`,
                        [{ text: 'OK' }]
                    );
                }
            } else {
                throw new Error('Download failed - no file');
            }
        } catch (error) {
            Alert.alert('Lỗi tải file', error.message);
        } finally {
            setIsDownloading(false);
            setDownloadProgress(0);
        }
    };

    return (
        <View>
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',

                padding: 12,
                borderRadius: 10,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: isDoc ? '#b8d4f0' : (isMarkdown ? '#fde68a' : '#e5e7eb'),
            }}>
                <MaterialIcons name={iconName} size={22} color={iconColor} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={{ color: '#111827', fontWeight: '500', fontSize: 14 }}>
                        {fileName}
                    </Text>
                </View>

                {isTextFile && (
                    <TouchableOpacity
                        onPress={handlePreview}
                        style={{ padding: 6, marginRight: 4 }}
                        disabled={!fileUrl}
                    >
                        <MaterialIcons
                            name="visibility"
                            size={20}
                            color={fileUrl ? '#6b7280' : '#d1d5db'}
                        />
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    onPress={handleDownload}
                    style={{ padding: 6 }}
                    disabled={isDownloading || !fileUrl}
                >
                    {isDownloading ? (
                        <ActivityIndicator size="small" color={iconColor} />
                    ) : (
                        <MaterialIcons
                            name="download"
                            size={20}
                            color={fileUrl ? '#6b7280' : '#d1d5db'}
                        />
                    )}
                </TouchableOpacity>
            </View>

            {/* Preview Modal */}
            {showPreview && isMarkdown && (
                <Modal
                    visible={showPreview}
                    animationType="slide"
                    onRequestClose={() => setShowPreview(false)}
                >
                    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: '#e5e7eb',
                        }}>
                            <Text style={{ fontSize: 16, fontWeight: '600', flex: 1 }}>
                                {fileName}
                            </Text>
                            <TouchableOpacity onPress={() => setShowPreview(false)}>
                                <MaterialIcons name="close" size={24} color="#374151" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ flex: 1, padding: 16 }}>
                            <Markdown
                                style={{
                                    body: { color: '#1f2937', fontSize: 14, lineHeight: 22 },
                                    code_block: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8 },
                                }}
                            >
                                {mdContent}
                            </Markdown>
                        </ScrollView>
                    </SafeAreaView>
                </Modal>
            )}
        </View>
    );
});
// ==================== MESSAGE COMPONENT ====================

const MessageItem = memo(({
    item,
    onLongPressUserMessage,
    formatTimestamp,
    thinkingDots,
    domainIdToCodeMap,
    onSpeak,
    isSpeaking,
    onStopSpeaking,
}) => {
    const isUser = item.isUser;
    const isStreaming = !isUser && item.status === 'streaming';


    let displayText = '';
    if (isUser) {
        displayText = convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap);
    } else {
        let rawText = item.status === 'streaming' && !`${item.text || ''}`.trim()
            ? `Đang suy nghĩ${thinkingDots}`
            : (item.text || '');

        let cleaned = cleanBotText(rawText);
        if (cleaned === null) {
            if (item.status !== 'streaming') return null;
            cleaned = rawText;
        }

        cleaned = sanitizeTechnicalText(cleaned);
        if (cleaned === 'Đã có lỗi xảy ra. Vui lòng thử lại.') {
            if (item.status !== 'streaming') return null;
        }
        cleaned = removeTriggerTokens(cleaned);
        displayText = convertTokensToDisplayWithMap(cleaned, domainIdToCodeMap);
        displayText = displayText
            .split('\n')
            .map(line => line.trimStart())  // Xóa khoảng trắng đầu dòng
            .join('\n')
            // Thêm dòng trống trước các bullet list (dấu - hoặc *)
            .replace(/([^\n])\n([-*]\s)/g, '$1\n\n$2')
            // Thêm dòng trống trước các numbered list
            .replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2')
            // Thêm dòng trống trước heading
            .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
            // Thêm dòng trống trước bold text đứng riêng 1 dòng (như **Phân loại...:**)
            .replace(/([^\n])\n(\*\*[^*]+\*\*[:\s])/g, '$1\n\n$2')
            // Chuẩn hóa dòng trống (tối đa 2)
            .replace(/\n{3,}/g, '\n\n');

        if (!displayText.trim()) return null;
    }

    const handleLongPress = () => {
        if (!isUser) return;
        onLongPressUserMessage(item.id, convertTokensToDisplayWithMap(item.text || '', domainIdToCodeMap));
    };

    const handleSpeak = () => {
        if (isSpeaking === item.id) {
            onStopSpeaking?.();
        } else {
            onSpeak?.(displayText, item.id);
        }
    };

    const isThisSpeaking = isSpeaking === item.id;


    return (
        <TouchableOpacity
            activeOpacity={isUser ? 0.9 : 1}
            onLongPress={handleLongPress}
            style={{
                flexDirection: 'row',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 12,
                paddingHorizontal: 10,
            }}
        >
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
                            <Text style={{ color: 'white', fontSize: 14, lineHeight: 20 }}>
                                {displayText}
                            </Text>
                        ) : (
                            <View>
                                <Markdown
                                    style={{
                                        body: {
                                            color: '#1f2937',
                                            fontSize: 14,
                                            lineHeight: 22,
                                        },
                                        paragraph: {
                                            marginBottom: 10,
                                            marginTop: 4,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                            paddingRight: 8,
                                            lineHeight: 22,
                                        },

                                        // ✅ STRONG (in đậm) - Dùng cho các tiêu đề nhỏ
                                        strong: {
                                            fontWeight: '700',
                                            color: '#111827',
                                        },
                                        bullet_list: {
                                            marginBottom: 12,
                                            marginTop: 6,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                        },
                                        bullet_list_item: {
                                            flexDirection: 'row',
                                            alignItems: 'flex-start',
                                            marginBottom: 6,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                        },
                                        bullet_list_icon: {
                                            marginRight: 8,
                                            marginTop: 2,
                                            fontSize: 16,
                                            color: '#2563eb',
                                            width: 16,
                                            textAlign: 'center',
                                        },
                                        bullet_list_content: {
                                            flex: 1,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                            paddingRight: 8,
                                        },

                                        ordered_list: {
                                            marginBottom: 12,
                                            marginTop: 6,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                        },
                                        ordered_list_item: {
                                            flexDirection: 'row',
                                            alignItems: 'flex-start',
                                            marginBottom: 8,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                        },
                                        ordered_list_icon: {
                                            marginRight: 8,
                                            minWidth: 22,
                                            marginTop: 2,
                                            fontSize: 14,
                                            fontWeight: '600',
                                            color: '#2563eb',
                                        },
                                        ordered_list_content: {
                                            flex: 1,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                            paddingRight: 8,
                                        },

                                        heading1: {
                                            fontSize: 20,
                                            fontWeight: 'bold',
                                            marginTop: 20,
                                            marginBottom: 12,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                            paddingBottom: 6,
                                            color: '#111827',
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#e5e7eb',
                                        },
                                        heading2: {
                                            fontSize: 18,
                                            fontWeight: 'bold',
                                            marginTop: 16,
                                            marginBottom: 10,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                            color: '#1f2937',
                                        },
                                        heading3: {
                                            fontSize: 16,
                                            fontWeight: '600',
                                            marginTop: 14,
                                            marginBottom: 8,
                                            marginLeft: 0,
                                            paddingLeft: 0,
                                            color: '#374151',
                                        },

                                        text: {
                                            color: '#1f2937',
                                            fontSize: 14,
                                            lineHeight: 22,
                                        },
                                        link: {
                                            color: '#2563eb',
                                            textDecorationLine: 'underline',
                                        },

                                        blockquote: {
                                            borderLeftWidth: 4,
                                            borderLeftColor: '#2563eb',
                                            paddingLeft: 16,
                                            paddingVertical: 8,
                                            marginVertical: 12,
                                            marginLeft: 0,
                                            backgroundColor: '#f8fafc',
                                            borderRadius: 8,
                                        },
                                    }}
                                    mergeStyle={false}
                                >
                                    {displayText}
                                </Markdown>
                                {isStreaming && (
                                    <Text style={{
                                        fontSize: 12,
                                        color: '#6b7280',
                                        fontStyle: 'italic',
                                        marginTop: 8,
                                    }}>
                                    </Text>
                                )}
                                {!isUser && item.meta?.artifacts && item.meta.artifacts.length > 0 && (
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
                                            📎 Tệp đính kèm ({item.meta.artifacts.length}):
                                        </Text>
                                        {item.meta.artifacts.map((artifact, idx) => (
                                            <ArtifactItem key={idx} artifact={artifact} />
                                        ))}
                                    </View>
                                )}
                                {!isStreaming && (
                                    <TouchableOpacity
                                        onPress={handleSpeak}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            marginTop: 8,
                                            alignSelf: 'flex-start',
                                        }}
                                    >
                                        <MaterialIcons
                                            name={isThisSpeaking ? 'volume-up' : 'volume-off'}
                                            size={16}
                                            color={isThisSpeaking ? '#2563eb' : '#9ca3af'}
                                        />
                                        <Text style={{
                                            fontSize: 11,
                                            color: isThisSpeaking ? '#2563eb' : '#9ca3af',
                                            marginLeft: 4,
                                        }}>
                                            {isThisSpeaking ? 'Đang đọc...' : 'Đọc'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
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

// ==================== SKELETON COMPONENT ====================

const SkeletonHistoryItem = () => (
    <View style={{
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    }}>
        <View style={{ flex: 1 }}>
            <View style={{
                height: 16,
                backgroundColor: '#e5e7eb',
                borderRadius: 4,
                width: '70%',
                marginBottom: 8,
            }} />
            <View style={{
                height: 12,
                backgroundColor: '#f3f4f6',
                borderRadius: 4,
                width: '40%',
            }} />
        </View>
        <View style={{
            width: 20,
            height: 20,
            backgroundColor: '#fee2e2',
            borderRadius: 4,
        }} />
    </View>
);

// ==================== MAIN COMPONENT ====================

export default function DraggableChatBubble() {
    const { user } = useAuth();
    const partnerId = user?.partner_id || '01km7vpjm4hcq4jbj35m680m5p';
    const [interruptAnswer, setInterruptAnswer] = useState('');
    // Animation shared values
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);

    // Text-to-Speech state
    const [speakingMessageId, setSpeakingMessageId] = useState(null);
    const [speechEnabled, setSpeechEnabled] = useState(true);

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
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [refreshing, setRefreshing] = useState(false);


    const [isListening, setIsListening] = useState(false);

    const [audioLevel, setAudioLevel] = useState(0);
    const recordingRef = useRef(null);
    const meterIntervalRef = useRef(null);
    const [hasVoiceResult, setHasVoiceResult] = useState(false);

    const micScale = useSharedValue(1);
    const ringScale = useSharedValue(1);
    // Suggestion state
    const [showSuggestion, setShowSuggestion] = useState(false);
    const [suggestionType, setSuggestionType] = useState(null);
    const [suggestionData, setSuggestionData] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [selectedSuggestions, setSelectedSuggestions] = useState({});

    // Domain mapping
    const [domainIdToCodeMap, setDomainIdToCodeMap] = useState({});
    const [domainCodeToIdMap, setDomainCodeToIdMap] = useState({});

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

    // TEXT-TO-SPEECH
    const speakMessage = useCallback((text, messageId) => {
        if (!speechEnabled) return;
        if (speakingMessageId) {
            Speech.stop();
        }
        const cleanText = text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            .replace(/\[.*?\]\(.*?\)/g, '')
            .replace(/<[^>]+>/g, '')
            .trim();
        if (!cleanText) return;

        Speech.speak(cleanText, {
            language: 'vi-VN',
            pitch: 1.0,
            rate: 0.9,
            onStart: () => setSpeakingMessageId(messageId),
            onDone: () => setSpeakingMessageId(null),
            onError: (error) => {
                setSpeakingMessageId(null);
            },
        });
    }, [speechEnabled, speakingMessageId]);

    const stopSpeaking = useCallback(() => {
        try {
            Speech.stop();
        } catch (error) {
            // Ignore speech stop errors
        }
        setSpeakingMessageId(null);
    }, []);

    // VOICE RECOGNITION


    const handleVoiceTranscript = useCallback((text) => {
        if (!text || !text.trim()) return;
        setInputText(prev => {
            const trimmedPrev = prev.trim();
            if (trimmedPrev.length === 0) return text;
            return prev + (prev.endsWith(' ') ? '' : ' ') + text;
        });
    }, []);

    // Voice event listeners - ĐÃ SỬA
    useEffect(() => {
        const onSpeechStart = () => {
            setIsListening(true);
            setHasVoiceResult(false);
        };

        const onSpeechEnd = () => {
            setIsListening(false);
        };

        // BỎ onSpeechPartialResults để tránh lặp text
        // Chỉ giữ onSpeechResults cho kết quả cuối cùng
        const onSpeechResults = (event) => {
            if (event.value && event.value.length > 0) {
                const spokenText = event.value[0];
                setHasVoiceResult(true);
                if (spokenText && spokenText.trim()) {
                    handleVoiceTranscript(spokenText);
                }
            }
        };

        const onSpeechError = (error) => {
            setIsListening(false);

            if (hasVoiceResult) return;

            const silentErrorCodes = [
                '7', 'no-speech', '5', 'no-match',
                '2', '6', 'audio-error'
            ];

            const errorCode = error?.error?.code?.toString();
            if (silentErrorCodes.includes(errorCode)) return;

            Alert.alert('Lỗi nhận dạng giọng nói', error?.error?.message || 'Vui lòng thử lại');
        };

        Voice.onSpeechStart = onSpeechStart;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechResults = onSpeechResults; // Chỉ lấy kết quả cuối
        Voice.onSpeechError = onSpeechError;

        return () => {
            Voice.removeAllListeners(); // Remove listeners trước
            Voice.destroy().catch(() => { }); // Destroy sau
        };
    }, [handleVoiceTranscript, hasVoiceResult]);

    const startListening = async () => {
        try {
            // Request permission cho Android
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: 'Microphone Permission',
                        message: 'This app needs access to your microphone to recognize speech',
                        buttonNeutral: 'Ask Me Later',
                        buttonNegative: 'Cancel',
                        buttonPositive: 'OK',
                    }
                );

                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Permission Denied', 'Microphone permission is required');
                    return;
                }

                // Kiểm tra speech recognition có sẵn không
            }

            // Request permission cho iOS
            if (Platform.OS === 'ios') {
                const { status } = await Audio.requestPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission Denied', 'Microphone permission is required');
                    return;
                }
            }

            setHasVoiceResult(false);
            await Voice.start('vi-VN');
            setIsListening(true);
        } catch (error) {
            console.error('Voice start error:', error);
            setIsListening(false);

            // Hiển thị lỗi thân thiện
            if (error.code === 'E_NO_RECOGNIZER') {
                Alert.alert('Error', 'Speech recognition not supported');
            }
        }
    };

    const stopListening = async () => {
        try {
            await Voice.stop();
            setIsListening(false);
        } catch (error) {
            console.error('Voice stop error:', error);
            setIsListening(false); // Vẫn set false dù lỗi
        }
    };

    // ANIMATIONS - ĐÃ SỬA
    const ringStyle = useAnimatedStyle(() => ({
        transform: [{
            scale: withSpring(isListening ? 1.3 : 1, {
                damping: 2,
                stiffness: 100
            })
        }],
        opacity: withTiming(isListening ? 0.5 : 0, {
            duration: 200
        }),
    }));

    // Tạo hiệu ứng beat khi đang nói
    useEffect(() => {
        let beatInterval;

        if (isListening) {
            // Tạo hiệu ứng beat liên tục
            beatInterval = setInterval(() => {
                if (isListening) {
                    // Phóng to
                    micScale.value = withSpring(1.2, {
                        damping: 2,
                        stiffness: 150
                    });

                    // Thu nhỏ lại
                    setTimeout(() => {
                        if (isListening) {
                            micScale.value = withSpring(1, {
                                damping: 2,
                                stiffness: 150
                            });
                        }
                    }, 150);
                }
            }, 400); // Beat mỗi 0.4 giây
        } else {
            micScale.value = withSpring(1);
        }

        return () => {
            if (beatInterval) clearInterval(beatInterval);
        };
    }, [isListening, micScale]);

    const animatedMicStyle = useAnimatedStyle(() => ({
        transform: [{ scale: micScale.value }],
    }));

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    }));

    // FORMATTERS
    const formatTimestamp = useCallback((value) => {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
    }, []);

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

    // HISTORY FUNCTIONS
    const sortedConversations = [...conversations].sort((a, b) =>
        `${b?.updated_at || b?.created_at || ''}`.localeCompare(
            `${a?.updated_at || a?.created_at || ''}`
        )
    );

    const openHistory = async () => {
        setShowHistory(true);
        await loadHistoryData();
    };

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

    const onRefresh = async () => {
        setRefreshing(true);
        await loadHistoryData();
    };

    const getDisplayTitle = (title) => {
        if (!title) return 'Cuộc trò chuyện';
        let display = convertTokensToDisplayWithMap(title, domainIdToCodeMap);
        if (domainCodeToIdMap[display]) {
            display = `@${display}`;
        }
        return display;
    };

    // SUGGESTION FUNCTIONS
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

    const loadDomains = async (search = '') => {
        setLoadingSuggestions(true);
        try {
            const result = await DomainService.getDomains({
                limit: 20,
                type: 'file_folder',
                partner_id: partnerId
            });
            if (result.code === 200 && result.data) {
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

    // HANDLERS
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

        const active = triggers.reduce((prev, curr) => curr.index > prev.index ? curr : prev);
        const activeIndex = active.index;
        const activeToken = active.type;

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
        }
    };

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
            displayText = `/${item.code_name} `;
            displayKey = `/${item.code_name}`;
            serverToken = `</:${item.code_name}>`;
        } else if (suggestionType === 'domain') {
            const domainId = domainCodeToIdMap[item.code_name];
            if (!domainId) return;
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

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;

        if (editingMessageId) {
            await resendEditedMessage(editingMessageId, inputText);
            setEditingMessageId(null);
            setInputText('');
            return;
        }

        let currentMessage = inputText;

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

    // EFFECTS
    useEffect(() => {
        if (messages.length > 0 && flatListRef.current) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

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

    // RENDER
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
            onSpeak={speakMessage}
            isSpeaking={speakingMessageId}
            onStopSpeaking={stopSpeaking}
        />
    ), [formatTimestamp, thinkingDots, domainIdToCodeMap, speakMessage, speakingMessageId, stopSpeaking]);

    const renderHistoryItem = useCallback(({ item }) => {
        const displayTitle = getDisplayTitle(item.title) || 'Cuộc trò chuyện';
        const isCommand = isCommandText(displayTitle);
        const truncatedTitle = truncateHistoryText(displayTitle, 2, 100);

        return (
            <View style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#f3f4f6',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <View style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: isCommand ? '#fef3c7' : '#e0e7ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                }}>
                    <MaterialIcons
                        name={isCommand ? 'bolt' : 'chat-bubble-outline'}
                        size={16}
                        color={isCommand ? '#d97706' : '#4f46e5'}
                    />
                </View>

                <TouchableOpacity
                    onPress={async () => {
                        await openConversation(item.id);
                        setInputText('');
                        setShowHistory(false);
                    }}
                    style={{ flex: 1 }}
                >
                    <Text
                        style={{
                            fontSize: 14,
                            color: '#111827',
                            fontWeight: '500',
                            marginBottom: 4,
                        }}
                        numberOfLines={2}
                    >
                        {truncatedTitle}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {isCommand && (
                            <View style={{
                                backgroundColor: '#fef3c7',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                marginRight: 6,
                            }}>
                                <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '600' }}>
                                    Command
                                </Text>
                            </View>
                        )}
                        <Text style={{ fontSize: 11, color: '#6b7280' }}>
                            {formatVietnamTime(item.updated_at || item.created_at)}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* ✅ Nút xóa */}
                <TouchableOpacity
                    onPress={() => deleteConversation(item.id)}
                    style={{ padding: 8 }}
                >
                    <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
            </View>
        );
    }, [domainIdToCodeMap, domainCodeToIdMap]);

    return (
        <>
            {/* Draggable Chat Bubble */}
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

            {/* Main Chat Modal */}
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
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Image source={chatIcon} style={{ width: 24, height: 24, tintColor: 'white' }} />
                                <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 8 }}>
                                    AI HaNoiBrain
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TouchableOpacity onPress={() => {
                                    newConversation();
                                    setInputText('');
                                }} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="add-comment" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={openHistory} style={{ marginRight: 12 }}>
                                    <MaterialIcons name="history" size={24} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => {
                                    newConversation();
                                    setInputText('');
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
                                    {pendingInterrupt.question || 'Vui lòng cung cấp thông tin:'}
                                </Text>

                                {pendingInterrupt.reason === 'information_gathering' ||
                                    pendingInterrupt.reason === 'upload_required' ? (
                                    // ✅ Hiển thị text input
                                    <View>
                                        <TextInput
                                            style={{
                                                backgroundColor: 'white',
                                                borderWidth: 1,
                                                borderColor: '#fdba74',
                                                borderRadius: 8,
                                                padding: 10,
                                                marginBottom: 0,
                                                fontSize: 14,
                                            }}
                                            placeholder="Nhập câu trả lời..."
                                            value={interruptAnswer}
                                            onChangeText={setInterruptAnswer}
                                            multiline
                                        />
                                        <Text style={{
                                            fontSize: 12,
                                            color: '#9a3412',
                                            marginBottom: 8,
                                            fontStyle: 'italic',
                                        }}>
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                if (interruptAnswer.trim()) {
                                                    answerInterrupt(interruptAnswer.trim());
                                                    setInterruptAnswer('');
                                                }
                                            }}
                                            style={{
                                                backgroundColor: '#fb923c',
                                                borderRadius: 8,
                                                padding: 10,
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Text style={{ color: 'white', fontWeight: '600' }}>Gửi</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    // Hiển thị buttons cho các reason khác
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                        {(pendingInterrupt.options?.filter(opt => opt && opt.trim()).length > 0
                                            ? pendingInterrupt.options
                                            : ['Đồng ý', 'Từ chối']
                                        ).map((opt, idx) => (
                                            <TouchableOpacity
                                                key={idx}
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
                                )}
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
                                placeholder={editingMessageId ? 'Sửa tin nhắn...' : 'Bạn cần tôi giúp gì?'}
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
                                            onPress={async () => {
                                                try {
                                                    if (isListening) {
                                                        await stopListening();
                                                    } else {
                                                        await startListening();
                                                    }
                                                } catch (err) {
                                                    // Mic press error
                                                }
                                            }}
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
                    <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
                        <View style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: '#e5e7eb'
                        }}>
                            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                                Lịch sử hội thoại
                            </Text>
                            <TouchableOpacity onPress={() => setShowHistory(false)}>
                                <MaterialIcons name="close" size={24} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        {loadingHistory ? (
                            <View style={{ padding: 16 }}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <SkeletonHistoryItem key={i} />
                                ))}
                            </View>
                        ) : sortedConversations.length === 0 ? (
                            <View style={{ padding: 48, alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialIcons name="history" size={56} color="#d1d5db" />
                                <Text style={{ marginTop: 16, fontSize: 16, color: '#6b7280', fontWeight: '500' }}>
                                    Chưa có lịch sử hội thoại
                                </Text>
                                <Text style={{ marginTop: 4, fontSize: 14, color: '#9ca3af' }}>
                                    Bắt đầu trò chuyện để lưu lại lịch sử
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={sortedConversations}
                                keyExtractor={(item) => item.id || `${item.created_at}`}
                                renderItem={renderHistoryItem}
                                refreshControl={
                                    <RefreshControl
                                        refreshing={refreshing}
                                        onRefresh={onRefresh}
                                        colors={['#2563eb']}
                                        tintColor="#2563eb"
                                    />
                                }
                                contentContainerStyle={{ flexGrow: 1 }}
                            />
                        )}
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