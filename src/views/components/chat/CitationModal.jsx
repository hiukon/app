import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.85;

const MD_STYLES = {
    body: { color: '#1f2937', fontSize: 14, lineHeight: 22 },
    text: { color: '#1f2937', fontSize: 14, lineHeight: 22 },
    paragraph: { marginBottom: 8, marginTop: 0 },
    strong: { fontWeight: '700', color: '#111827' },
    em: { fontStyle: 'italic' },
    heading1: { fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 6 },
    heading2: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginTop: 12, marginBottom: 4 },
    heading3: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 10, marginBottom: 4 },
    bullet_list: { marginBottom: 8, marginTop: 4 },
    bullet_list_icon: { marginRight: 8, color: '#374151', fontSize: 14, lineHeight: 22 },
    bullet_list_content: { flex: 1, color: '#374151', fontSize: 14, lineHeight: 22 },
    ordered_list: { marginBottom: 8, marginTop: 4 },
    ordered_list_icon: { marginRight: 8, color: '#374151', fontSize: 14, lineHeight: 22, fontWeight: '600' },
    ordered_list_content: { flex: 1, color: '#374151', fontSize: 14, lineHeight: 22 },
    blockquote: {
        borderLeftWidth: 3, borderLeftColor: '#2563eb',
        paddingLeft: 12, paddingVertical: 4, marginVertical: 8,
        backgroundColor: '#f0f9ff', borderRadius: 4,
    },
    code_inline: {
        backgroundColor: '#f3f4f6', paddingHorizontal: 5, paddingVertical: 1,
        borderRadius: 4, fontSize: 13, fontFamily: 'monospace',
    },
    fence: {
        backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8,
        marginVertical: 8, fontSize: 13,
    },
    hr: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginVertical: 10 },
};

export default function CitationModal({ citationModal, onClose }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [matchIndex, setMatchIndex] = useState(0);

    const p = citationModal?.passage;
    const fullText = p?.text || p?.content || p?.chunk_text || p?.passage_text || '';

    const matchPositions = useMemo(() => {
        if (!searchQuery.trim() || !fullText) return [];
        const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        const positions = [];
        let m;
        while ((m = regex.exec(fullText)) !== null) positions.push(m.index);
        return positions;
    }, [fullText, searchQuery]);

    const matchCount = matchPositions.length;

    const highlightedParts = useMemo(() => {
        if (!searchQuery.trim() || !fullText) return null;
        const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return fullText.split(new RegExp(`(${escaped})`, 'gi'));
    }, [fullText, searchQuery]);

    const renderHighlighted = () => {
        if (!highlightedParts) return null;
        let occurrenceIdx = 0;
        return (
            <Text style={{ fontSize: 14, color: '#374151', lineHeight: 24 }}>
                {highlightedParts.map((part, i) => {
                    const isMatch = part.toLowerCase() === searchQuery.toLowerCase();
                    if (!isMatch) return <Text key={i}>{part}</Text>;
                    const isCurrent = occurrenceIdx === matchIndex;
                    occurrenceIdx++;
                    return (
                        <Text key={i} style={{
                            backgroundColor: isCurrent ? '#fb923c' : '#fef08a',
                            color: '#111827', fontWeight: '700',
                        }}>
                            {part}
                        </Text>
                    );
                })}
            </Text>
        );
    };

    const handleClose = () => {
        setSearchQuery('');
        setMatchIndex(0);
        onClose();
    };

    const handleSearchChange = (t) => {
        setSearchQuery(t);
        setMatchIndex(0);
    };

    return (
        <Modal visible={!!citationModal} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />

                {/* Fixed height sheet so flex:1 ScrollView works properly */}
                <View style={{
                    height: SHEET_HEIGHT,
                    backgroundColor: 'white',
                    borderTopLeftRadius: 20, borderTopRightRadius: 20,
                    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: 0.15, shadowRadius: 12, elevation: 20,
                }}>
                    {/* Header */}
                    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 }}>
                                Trích dẫn [{citationModal?.refId || ''}]
                            </Text>
                            {p?.page_range ? (
                                <Text style={{ fontSize: 12, color: '#6b7280', marginRight: 10 }}>
                                    tr. {p.page_range}
                                </Text>
                            ) : null}
                            <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
                                <MaterialIcons name="close" size={20} color="#6b7280" />
                            </TouchableOpacity>
                        </View>

                        {/* Search */}
                        <View style={{
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: '#f8fafc', borderRadius: 10,
                            borderWidth: 1, borderColor: searchQuery ? '#2563eb' : '#e5e7eb',
                            paddingHorizontal: 10, height: 40,
                        }}>
                            <MaterialIcons name="search" size={16} color={searchQuery ? '#2563eb' : '#9ca3af'} />
                            <TextInput
                                style={{ flex: 1, fontSize: 14, color: '#111827', marginLeft: 8 }}
                                placeholder="Tìm trong đoạn..."
                                placeholderTextColor="#9ca3af"
                                value={searchQuery}
                                onChangeText={handleSearchChange}
                                returnKeyType="search"
                                clearButtonMode="while-editing"
                            />
                            {searchQuery.length > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, marginRight: 4, color: matchCount > 0 ? '#6b7280' : '#ef4444' }}>
                                        {matchCount > 0 ? `${matchIndex + 1}/${matchCount}` : 'Không có kết quả'}
                                    </Text>
                                    {matchCount > 0 && (
                                        <>
                                            <TouchableOpacity onPress={() => setMatchIndex((matchIndex - 1 + matchCount) % matchCount)} style={{ padding: 3 }}>
                                                <MaterialIcons name="keyboard-arrow-up" size={18} color="#6b7280" />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => setMatchIndex((matchIndex + 1) % matchCount)} style={{ padding: 3 }}>
                                                <MaterialIcons name="keyboard-arrow-down" size={18} color="#6b7280" />
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Scrollable content — flex: 1 works because parent has fixed height */}
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
                        showsVerticalScrollIndicator
                    >
                        {!fullText ? (
                            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                                <MaterialIcons name="info-outline" size={40} color="#d1d5db" />
                                <Text style={{ fontSize: 14, color: '#9ca3af', marginTop: 10 }}>
                                    Nội dung trích dẫn không có sẵn.
                                </Text>
                            </View>
                        ) : highlightedParts ? (
                            renderHighlighted()
                        ) : (
                            <Markdown style={MD_STYLES}>
                                {fullText}
                            </Markdown>
                        )}
                    </ScrollView>

                    {/* Footer */}
                    <View style={{
                        borderTopWidth: 1, borderTopColor: '#f3f4f6',
                        paddingHorizontal: 16, paddingVertical: 10,
                        flexDirection: 'row', alignItems: 'center',
                    }}>
                        {p?.id != null ? (
                            <Text style={{ fontSize: 11, color: '#9ca3af', marginRight: 12 }}>
                                Đoạn #{p.id}
                            </Text>
                        ) : null}
                        <View style={{
                            width: 26, height: 26, borderRadius: 6,
                            backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginRight: 8,
                        }}>
                            <MaterialIcons name="description" size={15} color="#2563eb" />
                        </View>
                        <Text style={{ fontSize: 12, color: '#374151', fontWeight: '500', flex: 1 }} numberOfLines={1}>
                            {citationModal?.file?.original_name || ''}
                        </Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
