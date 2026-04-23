import React, { useState, useEffect, memo } from 'react';
import { View, Text, TouchableOpacity, Modal, SafeAreaView, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Base64 from 'base-64';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';

const ArtifactItem = memo(({ artifact }) => {
    const [showPreview, setShowPreview] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [previewType, setPreviewType] = useState(null); // 'markdown', 'text', 'doc'
    const [isDownloading, setIsDownloading] = useState(false);
    const [fileUrl, setFileUrl] = useState(null);
    const [extractedFileUrl, setExtractedFileUrl] = useState(null);

    const fileName = artifact.name || 'Tải xuống';
    const isDoc = /\.docx?$/.test(fileName);
    const isMarkdown = fileName.endsWith('.md');
    const isJson = fileName.endsWith('.json');
    const isTxt = fileName.endsWith('.txt');
    const isTextFile = isMarkdown || isJson || isTxt;
    const isPreviewable = isTextFile || isDoc;

    let iconName = 'insert-drive-file';
    let iconColor = '#2563eb';
    if (isDoc) { iconName = 'description'; iconColor = '#2b5797'; }
    else if (isMarkdown) { iconName = 'code'; iconColor = '#d97706'; }

    // Hàm giải mã base64 từ response
    const decodeBase64Url = (encodedData) => {
        try {
            // Giải mã base64
            const decoded = Base64.decode(encodedData);

            // Thử parse JSON nếu decoded là JSON string
            try {
                const parsed = JSON.parse(decoded);
                // Nếu parsed có url field
                if (parsed.url) return parsed.url;
                // Nếu parsed là string URL
                if (typeof parsed === 'string') return parsed;
                return decoded;
            } catch (e) {
                // Không phải JSON, trả về decoded string
                return decoded;
            }
        } catch (error) {
            console.error('Base64 decode failed:', error);
            return encodedData;
        }
    };

    useEffect(() => {
        const getFileUrl = async () => {
            // Original file URL
            if (artifact.url) {
                if (artifact.url.startsWith('http')) {
                    setFileUrl(artifact.url);
                } else {
                    const baseUrl = AgentApiService.baseUrl();
                    setFileUrl(`${baseUrl}${artifact.url.startsWith('/') ? '' : '/'}${artifact.url}`);
                }
            } else if (artifact.id) {
                try {
                    const token = apiClient.getAuthToken();
                    const conversationId = artifact.conversation_id;
                    if (conversationId) {
                        const result = await AgentApiService.getArtifactSignedUrl(token, conversationId, artifact.id);

                        console.log('API Response:', result.data);

                        // Xử lý response từ API
                        if (result.data?.data && typeof result.data.data === 'string') {
                            // Trường hợp data là base64 encoded
                            const decodedUrl = decodeBase64Url(result.data.data);
                            console.log('Decoded URL:', decodedUrl);
                            setFileUrl(decodedUrl);
                        } else if (result.data?.url) {
                            // Trường hợp có url trực tiếp
                            setFileUrl(result.data.url);
                        } else if (typeof result.data === 'string') {
                            // Trường hợp data trả về trực tiếp là string
                            const decodedUrl = decodeBase64Url(result.data);
                            setFileUrl(decodedUrl);
                        } else {
                            console.warn('Unexpected response format:', result.data);
                        }
                    }
                } catch (error) {
                    console.error('Failed to get signed URL:', error);
                    Alert.alert('Lỗi', 'Không thể lấy URL file: ' + error.message);
                }
            }

            // Extracted file URL (for Word, PDF → text preview)
            if (artifact.extracted_url) {
                if (artifact.extracted_url.startsWith('http')) {
                    setExtractedFileUrl(artifact.extracted_url);
                } else {
                    const baseUrl = AgentApiService.baseUrl();
                    setExtractedFileUrl(`${baseUrl}${artifact.extracted_url.startsWith('/') ? '' : '/'}${artifact.extracted_url}`);
                }
            }
        };
        getFileUrl();
    }, [artifact.url, artifact.id, artifact.extracted_url]);

    const handlePreview = async () => {
        if (!fileUrl && !extractedFileUrl) {
            Alert.alert('Thông báo', 'URL file không hợp lệ');
            return;
        }

        try {
            const token = apiClient.getAuthToken();

            if (isMarkdown) {
                // Markdown: xem từ original file
                const response = await fetch(fileUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const text = await response.text();
                setPreviewContent(text);
                setPreviewType('markdown');
                setShowPreview(true);
            } else if (isDoc) {
                // Word: xem từ extracted text file
                if (!extractedFileUrl) {
                    Alert.alert('Thông báo', 'Không có bản text của file Word này. Hãy tải xuống để xem.');
                    return;
                }
                const response = await fetch(extractedFileUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const text = await response.text();
                setPreviewContent(text);
                setPreviewType('doc');
                setShowPreview(true);
            } else if (isJson || isTxt) {
                // Text file: xem từ original
                const response = await fetch(fileUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const text = await response.text();
                setPreviewContent(text);
                setPreviewType('text');
                setShowPreview(true);
            } else {
                Alert.alert('Thông báo', 'Không thể xem trước loại file này');
            }
        } catch (error) {
            console.error('Preview error:', error);
            Alert.alert('Lỗi', 'Không thể tải nội dung file: ' + error.message);
        }
    };

    const handleDownload = async () => {
        if (!fileUrl) {
            Alert.alert('Thông báo', 'URL file không hợp lệ');
            return;
        }

        setIsDownloading(true);
        try {
            const token = apiClient.getAuthToken();
            let fileExt = '';
            if (isDoc) fileExt = fileName.endsWith('.docx') ? '.docx' : '.doc';
            else if (isMarkdown) fileExt = '.md';
            else {
                const lastDot = fileName.lastIndexOf('.');
                fileExt = lastDot > -1 ? fileName.substring(lastDot) : '';
            }

            const baseFileName = fileName.replace(/\.[^/.]+$/, '');
            const fullFileName = baseFileName + fileExt;
            const fileUri = FileSystem.documentDirectory + fullFileName;

            const downloadResumable = FileSystem.createDownloadResumable(
                fileUrl, fileUri,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const result = await downloadResumable.downloadAsync();

            if (!result?.uri) throw new Error('Download failed - no file');

            const fileInfo = await FileSystem.getInfoAsync(result.uri);
            if (!fileInfo.exists) throw new Error('File not found after download');

            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                let mimeType;
                if (isDoc) {
                    mimeType = fileName.endsWith('.docx')
                        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        : 'application/msword';
                } else if (isMarkdown) {
                    mimeType = 'text/markdown';
                }
                await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: `Chia sẻ ${fullFileName}` });
            } else {
                Alert.alert('Tải xuống thành công', `File đã được lưu tại: ${result.uri}`);
            }
        } catch (error) {
            console.error('Download error:', error);
            Alert.alert('Lỗi tải file', error.message);
        } finally {
            setIsDownloading(false);
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
                borderColor: isDoc ? '#b8d4f0' : isMarkdown ? '#fde68a' : '#e5e7eb',
                backgroundColor: 'white'
            }}>
                <MaterialIcons name={iconName} size={22} color={iconColor} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={{ color: '#111827', fontWeight: '500', fontSize: 14 }} numberOfLines={1}>
                        {fileName}
                    </Text>
                </View>
                {isPreviewable && (
                    <TouchableOpacity
                        onPress={handlePreview}
                        style={{ padding: 6, marginRight: 4 }}
                        disabled={!fileUrl && !extractedFileUrl}
                    >
                        <MaterialIcons
                            name="visibility"
                            size={20}
                            color={(fileUrl || extractedFileUrl) ? '#6b7280' : '#d1d5db'}
                        />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    onPress={handleDownload}
                    style={{ padding: 6 }}
                    disabled={isDownloading || !fileUrl}
                >
                    {isDownloading
                        ? <ActivityIndicator size="small" color={iconColor} />
                        : <MaterialIcons name="download" size={20} color={fileUrl ? '#6b7280' : '#d1d5db'} />
                    }
                </TouchableOpacity>
            </View>

            {/* Preview Modal */}
            {showPreview && (previewType === 'markdown' || previewType === 'doc' || previewType === 'text') && (
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
                            borderBottomColor: '#e5e7eb'
                        }}>
                            <Text style={{ fontSize: 16, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                                {fileName}
                            </Text>
                            <TouchableOpacity onPress={() => setShowPreview(false)}>
                                <MaterialIcons name="close" size={24} color="#374151" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ flex: 1, padding: 16 }}>
                            {previewType === 'markdown' ? (
                                <Markdown
                                    style={{
                                        body: { color: '#1f2937', fontSize: 14, lineHeight: 22 },
                                        code_block: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8 },
                                        fence: { backgroundColor: '#f3f4f6' }
                                    }}
                                >
                                    {previewContent}
                                </Markdown>
                            ) : (
                                <Text style={{ color: '#1f2937', fontSize: 14, lineHeight: 22 }}>
                                    {previewContent}
                                </Text>
                            )}
                        </ScrollView>
                    </SafeAreaView>
                </Modal>
            )}
        </View>
    );
});

export default ArtifactItem;