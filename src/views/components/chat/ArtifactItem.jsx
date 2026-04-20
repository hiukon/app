import React, { useState, useEffect, memo } from 'react';
import { View, Text, TouchableOpacity, Modal, SafeAreaView, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import apiClient from '../../../services/api/apiClient';
import AgentApiService from '../../../services/agent/AgentApiService';

const ArtifactItem = memo(({ artifact }) => {
    const [showPreview, setShowPreview] = useState(false);
    const [mdContent, setMdContent] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [fileUrl, setFileUrl] = useState(null);

    const fileName = artifact.name || 'Tải xuống';
    const isDoc = /\.docx?$/.test(fileName);
    const isMarkdown = fileName.endsWith('.md');
    const isTextFile = isMarkdown || /\.(txt|json)$/.test(fileName);

    let iconName = 'insert-drive-file';
    let iconColor = '#2563eb';
    if (isDoc) { iconName = 'description'; iconColor = '#2b5797'; }
    else if (isMarkdown) { iconName = 'code'; iconColor = '#d97706'; }

    useEffect(() => {
        const getFileUrl = async () => {
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
                        if (result.data?.url) setFileUrl(result.data.url);
                    }
                } catch (error) {
                    console.error('Failed to get signed URL:', error);
                }
            }
        };
        getFileUrl();
    }, [artifact.url, artifact.id]);

    const handlePreview = async () => {
        if (!fileUrl) { Alert.alert('Thông báo', 'URL file không hợp lệ'); return; }
        try {
            const token = apiClient.getAuthToken();
            if (isMarkdown) {
                const response = await fetch(fileUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                const text = await response.text();
                setMdContent(text);
                setShowPreview(true);
            } else if (isDoc) {
                Alert.alert('Xem tài liệu', 'File Word sẽ được tải xuống để xem. Bạn có muốn tiếp tục?', [
                    { text: 'Hủy', style: 'cancel' },
                    { text: 'Tải xuống', onPress: handleDownload },
                ]);
            } else {
                Alert.alert('Thông báo', 'Không thể xem trước loại file này');
            }
        } catch (error) {
            Alert.alert('Lỗi', 'Không thể tải nội dung file: ' + error.message);
        }
    };

    const handleDownload = async () => {
        if (!fileUrl) { Alert.alert('Thông báo', 'URL file không hợp lệ'); return; }
        setIsDownloading(true);
        try {
            const token = apiClient.getAuthToken();
            let fileExt = '';
            if (isDoc) fileExt = fileName.endsWith('.docx') ? '.docx' : '.doc';
            else if (isMarkdown) fileExt = '.md';
            else { const lastDot = fileName.lastIndexOf('.'); fileExt = lastDot > -1 ? fileName.substring(lastDot) : ''; }

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
                if (isDoc) mimeType = fileName.endsWith('.docx')
                    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    : 'application/msword';
                else if (isMarkdown) mimeType = 'text/markdown';
                await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: `Chia sẻ ${fullFileName}` });
            } else {
                Alert.alert('Tải xuống thành công', `File đã được lưu tại: ${result.uri}`);
            }
        } catch (error) {
            Alert.alert('Lỗi tải file', error.message);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <View>
            <View style={{
                flexDirection: 'row', alignItems: 'center', padding: 12,
                borderRadius: 10, marginBottom: 8, borderWidth: 1,
                borderColor: isDoc ? '#b8d4f0' : isMarkdown ? '#fde68a' : '#e5e7eb',
            }}>
                <MaterialIcons name={iconName} size={22} color={iconColor} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={{ color: '#111827', fontWeight: '500', fontSize: 14 }}>{fileName}</Text>
                </View>
                {isTextFile && (
                    <TouchableOpacity onPress={handlePreview} style={{ padding: 6, marginRight: 4 }} disabled={!fileUrl}>
                        <MaterialIcons name="visibility" size={20} color={fileUrl ? '#6b7280' : '#d1d5db'} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleDownload} style={{ padding: 6 }} disabled={isDownloading || !fileUrl}>
                    {isDownloading
                        ? <ActivityIndicator size="small" color={iconColor} />
                        : <MaterialIcons name="download" size={20} color={fileUrl ? '#6b7280' : '#d1d5db'} />
                    }
                </TouchableOpacity>
            </View>

            {showPreview && isMarkdown && (
                <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
                    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                            <Text style={{ fontSize: 16, fontWeight: '600', flex: 1 }}>{fileName}</Text>
                            <TouchableOpacity onPress={() => setShowPreview(false)}>
                                <MaterialIcons name="close" size={24} color="#374151" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ flex: 1, padding: 16 }}>
                            <Markdown style={{ body: { color: '#1f2937', fontSize: 14, lineHeight: 22 }, code_block: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8 } }}>
                                {mdContent}
                            </Markdown>
                        </ScrollView>
                    </SafeAreaView>
                </Modal>
            )}
        </View>
    );
});

export default ArtifactItem;
