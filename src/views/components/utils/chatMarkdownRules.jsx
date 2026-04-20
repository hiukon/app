import React, { useState, useRef, useCallback } from 'react';
import { View, Text, PanResponder, TouchableWithoutFeedback, Linking } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

// Unicode circled numbers: ①-⑳ (1-20), ㉑-㉟ (21-35), ㊱-㊿ (36-50)
export const toCircledNumber = (n) => {
    const num = Number(n);
    if (num >= 1 && num <= 20) return String.fromCodePoint(0x245F + num);
    if (num >= 21 && num <= 35) return String.fromCodePoint(0x323C + num);
    if (num >= 36 && num <= 50) return String.fromCodePoint(0x328D + num);
    return `(${n})`;
};

const TABLE_CELL_WIDTH = 130;

function HorizontalScrollTable({ children }) {
    const [containerWidth, setContainerWidth] = useState(0);
    const [contentWidth, setContentWidth] = useState(0);
    const [scrollX, setScrollX] = useState(0);

    const scrollViewRef = useRef(null);
    const containerWidthRef = useRef(0);
    const contentWidthRef = useRef(0);
    const startScrollXRef = useRef(0);
    const scrollXRef = useRef(0);

    const scrollable = contentWidth > containerWidth + 2;
    const thumbWidth = scrollable ? Math.max(44, (containerWidth / contentWidth) * containerWidth) : 0;
    const maxThumbLeft = containerWidth - thumbWidth;
    const thumbLeft = scrollable
        ? Math.min((scrollX / (contentWidth - containerWidth)) * maxThumbLeft, maxThumbLeft)
        : 0;

    // PanResponder để kéo thumb
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startScrollXRef.current = scrollXRef.current;
            },
            onPanResponderMove: (_, gestureState) => {
                const cw = containerWidthRef.current;
                const tw = contentWidthRef.current;
                if (!cw || !tw) return;
                const thumb = Math.max(44, (cw / tw) * cw);
                const maxLeft = cw - thumb;
                const dScroll = (gestureState.dx / maxLeft) * (tw - cw);
                const target = Math.max(0, Math.min(startScrollXRef.current + dScroll, tw - cw));
                scrollViewRef.current?.scrollTo({ x: target, animated: false });
            },
        })
    ).current;

    // Tap trên track để nhảy tới vị trí đó
    const handleTrackPress = useCallback((e) => {
        const tapX = e.nativeEvent.locationX;
        const cw = containerWidthRef.current;
        const tw = contentWidthRef.current;
        if (!cw || !tw) return;
        const thumb = Math.max(44, (cw / tw) * cw);
        const ratio = Math.max(0, Math.min((tapX - thumb / 2) / (cw - thumb), 1));
        scrollViewRef.current?.scrollTo({ x: ratio * (tw - cw), animated: true });
    }, []);

    const onLayout = useCallback(e => {
        const w = e.nativeEvent.layout.width;
        setContainerWidth(w);
        containerWidthRef.current = w;
    }, []);

    const onContentSizeChange = useCallback((w) => {
        setContentWidth(w);
        contentWidthRef.current = w;
    }, []);

    const onScroll = useCallback(e => {
        const { x } = e.nativeEvent.contentOffset;
        setScrollX(x);
        scrollXRef.current = x;
    }, []);

    return (
        <View style={{ marginVertical: 10 }}>
            <ScrollView
                ref={scrollViewRef}
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                onLayout={onLayout}
                onContentSizeChange={onContentSizeChange}
                onScroll={onScroll}
                scrollEventThrottle={16}
            >
                <View style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' }}>
                    {children}
                </View>
            </ScrollView>

            {scrollable && (
                <View style={{ marginTop: 8, marginHorizontal: 2 }}>
                    {/* Track — tap để nhảy vị trí */}
                    <TouchableWithoutFeedback onPress={handleTrackPress}>
                        <View style={{ height: 8, backgroundColor: '#e5e7eb', borderRadius: 99, justifyContent: 'center' }}>
                            {/* Thumb — kéo để scroll */}
                            <View
                                style={{
                                    position: 'absolute',
                                    left: thumbLeft,
                                    width: thumbWidth,
                                    height: 8,
                                    backgroundColor: '#7c3aed',
                                    borderRadius: 99,
                                    shadowColor: '#7c3aed',
                                    shadowOpacity: 0.4,
                                    shadowRadius: 3,
                                    elevation: 2,
                                }}
                                {...panResponder.panHandlers}
                            />
                        </View>
                    </TouchableWithoutFeedback>
                    <Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
                        ← vuốt hoặc kéo thanh để xem thêm →
                    </Text>
                </View>
            )}
        </View>
    );
}

const baseMarkdownTableRules = {
    table: (node, children) => (
        <HorizontalScrollTable key={node.key}>{children}</HorizontalScrollTable>
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
            const idx = Number(refId) - 1; // citations are 1-based, array is 0-based
            // Primary: use array index (passage order = citation order from API)
            // Fallback: match by passage.id field
            const passage = citations?.passages?.[idx] ||
                citations?.passages?.find(p => String(p.id) === refId) ||
                null;
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
