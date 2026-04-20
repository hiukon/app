import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Linking } from 'react-native';

// Unicode circled numbers: ①-⑳ (1-20), ㉑-㉟ (21-35), ㊱-㊿ (36-50)
export const toCircledNumber = (n) => {
    const num = Number(n);
    if (num >= 1 && num <= 20) return String.fromCodePoint(0x245F + num);
    if (num >= 21 && num <= 35) return String.fromCodePoint(0x323C + num);
    if (num >= 36 && num <= 50) return String.fromCodePoint(0x328D + num);
    return `(${n})`;
};

const TABLE_CELL_WIDTH = 130;

const baseMarkdownTableRules = {
    table: (node, children) => (
        <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator style={{ marginVertical: 10 }}>
            <View style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' }}>
                {children}
            </View>
        </ScrollView>
    ),
    thead: (node, children) => (
        <View key={node.key} style={{ backgroundColor: '#ede9fe' }}>{children}</View>
    ),
    tbody: (node, children) => <View key={node.key}>{children}</View>,
    tr: (node, children) => (
        <View key={node.key} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            {children}
        </View>
    ),
    th: (node, children) => (
        <View key={node.key} style={{ width: TABLE_CELL_WIDTH, paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#c4b5fd', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '700', color: '#5b21b6', fontSize: 13 }}>{children}</Text>
        </View>
    ),
    td: (node, children) => (
        <View key={node.key} style={{ width: TABLE_CELL_WIDTH, paddingHorizontal: 12, paddingVertical: 9, borderRightWidth: 1, borderRightColor: '#e5e7eb', justifyContent: 'center' }}>
            <Text style={{ color: '#374151', fontSize: 13 }}>{children}</Text>
        </View>
    ),
};

// {ref:N} placeholder passes through markdown parser into text nodes unchanged
export const buildMarkdownRules = (citations, onCitationPress) => ({
    ...baseMarkdownTableRules,
    text: (node, children, parent, styles) => {
        const content = node.content || '';
        if (!content.includes('{ref:')) {
            return <Text key={node.key} style={styles.text}>{content}</Text>;
        }
        const segments = [];
        const regex = /\{ref:(\d+)\}/g;
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(content)) !== null) {
            if (match.index > lastIndex) segments.push(content.slice(lastIndex, match.index));
            const refId = match[1];
            const id = Number(refId);
            const passage = citations?.passages?.find(p => p.id === id || String(p.id) === refId);
            const file = passage ? citations?.files?.find(f => f.id === passage.file_id) : null;
            segments.push(
                <Text
                    key={`ref-${match.index}`}
                    onPress={() => onCitationPress?.({ passage: passage || null, file: file || null, refId })}
                    style={{ color: '#2563eb', fontSize: 15 }}
                >
                    {toCircledNumber(refId)}
                </Text>
            );
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < content.length) segments.push(content.slice(lastIndex));
        return <Text key={node.key} style={styles.text}>{segments}</Text>;
    },
    link: (node, children) => (
        <Text
            key={node.key}
            style={{ color: '#2563eb', textDecorationLine: 'underline' }}
            onPress={() => { try { Linking.openURL(node.attributes?.href || ''); } catch (_) { } }}
        >
            {children}
        </Text>
    ),
});
