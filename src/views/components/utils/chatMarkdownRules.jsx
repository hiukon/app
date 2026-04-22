import React, { useState, useRef, useCallback } from 'react';
import { View, Text, PanResponder, TouchableWithoutFeedback, Linking } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export const toCircledNumber = (n) => `[${n}]`;

const TABLE_CELL_WIDTH = 130;
const TABLE_MAX_HEIGHT = 400;

function HorizontalScrollTable({ children }) {
    // ── Horizontal state ──────────────────────────────────────────────────────
    const [containerWidth, setContainerWidth] = useState(0);
    const [contentWidth, setContentWidth] = useState(0);
    const [scrollX, setScrollX] = useState(0);

    const hScrollRef = useRef(null);
    const containerWidthRef = useRef(0);
    const contentWidthRef = useRef(0);
    const startScrollXRef = useRef(0);
    const scrollXRef = useRef(0);

    const hScrollable = contentWidth > containerWidth + 2;
    const hThumbWidth = hScrollable ? Math.max(44, (containerWidth / contentWidth) * containerWidth) : 0;
    const hMaxThumbLeft = containerWidth - hThumbWidth;
    const hThumbLeft = hScrollable
        ? Math.min((scrollX / (contentWidth - containerWidth)) * hMaxThumbLeft, hMaxThumbLeft)
        : 0;

    // ── Vertical state ────────────────────────────────────────────────────────
    const [containerHeight, setContainerHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    const [scrollY, setScrollY] = useState(0);

    const vScrollRef = useRef(null);
    const containerHeightRef = useRef(0);
    const contentHeightRef = useRef(0);
    const startScrollYRef = useRef(0);
    const scrollYRef = useRef(0);

    const vScrollable = contentHeight > containerHeight + 2;
    const vThumbHeight = vScrollable ? Math.max(44, (containerHeight / contentHeight) * containerHeight) : 0;
    const vMaxThumbTop = containerHeight - vThumbHeight;
    const vThumbTop = vScrollable
        ? Math.min((scrollY / (contentHeight - containerHeight)) * vMaxThumbTop, vMaxThumbTop)
        : 0;

    // ── PanResponder — kéo thumb NGANG ───────────────────────────────────────
    const hPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => { startScrollXRef.current = scrollXRef.current; },
            onPanResponderMove: (_, g) => {
                const cw = containerWidthRef.current;
                const tw = contentWidthRef.current;
                if (!cw || !tw) return;
                const thumb = Math.max(44, (cw / tw) * cw);
                const dScroll = (g.dx / (cw - thumb)) * (tw - cw);
                const target = Math.max(0, Math.min(startScrollXRef.current + dScroll, tw - cw));
                hScrollRef.current?.scrollTo({ x: target, animated: false });
            },
        })
    ).current;

    // ── PanResponder — kéo thumb DỌC ─────────────────────────────────────────
    const vPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => { startScrollYRef.current = scrollYRef.current; },
            onPanResponderMove: (_, g) => {
                const ch = containerHeightRef.current;
                const th = contentHeightRef.current;
                if (!ch || !th) return;
                const thumb = Math.max(44, (ch / th) * ch);
                const dScroll = (g.dy / (ch - thumb)) * (th - ch);
                const target = Math.max(0, Math.min(startScrollYRef.current + dScroll, th - ch));
                vScrollRef.current?.scrollTo({ y: target, animated: false });
            },
        })
    ).current;

    // ── Tap track để nhảy vị trí ─────────────────────────────────────────────
    const handleHTrackPress = useCallback((e) => {
        const tapX = e.nativeEvent.locationX;
        const cw = containerWidthRef.current;
        const tw = contentWidthRef.current;
        if (!cw || !tw) return;
        const thumb = Math.max(44, (cw / tw) * cw);
        const ratio = Math.max(0, Math.min((tapX - thumb / 2) / (cw - thumb), 1));
        hScrollRef.current?.scrollTo({ x: ratio * (tw - cw), animated: true });
    }, []);

    const handleVTrackPress = useCallback((e) => {
        const tapY = e.nativeEvent.locationY;
        const ch = containerHeightRef.current;
        const th = contentHeightRef.current;
        if (!ch || !th) return;
        const thumb = Math.max(44, (ch / th) * ch);
        const ratio = Math.max(0, Math.min((tapY - thumb / 2) / (ch - thumb), 1));
        vScrollRef.current?.scrollTo({ y: ratio * (th - ch), animated: true });
    }, []);

    // ── Layout / size / scroll callbacks ─────────────────────────────────────
    const onHLayout = useCallback(e => {
        const w = e.nativeEvent.layout.width;
        setContainerWidth(w);
        containerWidthRef.current = w;
    }, []);
    const onHContentSizeChange = useCallback((w) => {
        setContentWidth(w);
        contentWidthRef.current = w;
    }, []);
    const onHScroll = useCallback(e => {
        const x = e.nativeEvent.contentOffset.x;
        setScrollX(x);
        scrollXRef.current = x;
    }, []);

    const onVLayout = useCallback(e => {
        const h = e.nativeEvent.layout.height;
        setContainerHeight(h);
        containerHeightRef.current = h;
    }, []);
    const onVContentSizeChange = useCallback((_, h) => {
        setContentHeight(h);
        contentHeightRef.current = h;
    }, []);
    const onVScroll = useCallback(e => {
        const y = e.nativeEvent.contentOffset.y;
        setScrollY(y);
        scrollYRef.current = y;
    }, []);

    return (
        <View style={{ marginVertical: 10 }}>
            <View style={{ flexDirection: 'row' }}>
                {/* ── Bảng (cuộn dọc bọc cuộn ngang) ───────────────────── */}
                <View style={{ flex: 1 }}>
                    <ScrollView
                        ref={vScrollRef}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        style={{ maxHeight: TABLE_MAX_HEIGHT }}
                        onLayout={onVLayout}
                        onContentSizeChange={onVContentSizeChange}
                        onScroll={onVScroll}
                        scrollEventThrottle={16}
                    >
                        <ScrollView
                            ref={hScrollRef}
                            horizontal
                            nestedScrollEnabled
                            showsHorizontalScrollIndicator={false}
                            onLayout={onHLayout}
                            onContentSizeChange={onHContentSizeChange}
                            onScroll={onHScroll}
                            scrollEventThrottle={16}
                        >
                            <View style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' }}>
                                {children}
                            </View>
                        </ScrollView>
                    </ScrollView>
                </View>

                {/* ── Thanh cuộn DỌC (bên phải) ─────────────────────────── */}
                {vScrollable && containerHeight > 0 && (
                    <View style={{ width: 8, marginLeft: 6, height: containerHeight }}>
                        <TouchableWithoutFeedback onPress={handleVTrackPress}>
                            <View style={{ flex: 1, backgroundColor: '#e5e7eb', borderRadius: 99 }}>
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: vThumbTop,
                                        width: 8,
                                        height: vThumbHeight,
                                        backgroundColor: '#6b7280',
                                        borderRadius: 99,
                                        shadowColor: '#6b7280',
                                        shadowOpacity: 0.3,
                                        shadowRadius: 3,
                                        elevation: 2,
                                    }}
                                    {...vPanResponder.panHandlers}
                                />
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                )}
            </View>

            {/* ── Thanh cuộn NGANG (phía dưới) ─────────────────────────────── */}
            {hScrollable && (
                <View style={{ marginTop: 8, marginHorizontal: 2 }}>
                    <TouchableWithoutFeedback onPress={handleHTrackPress}>
                        <View style={{ height: 8, backgroundColor: '#e5e7eb', borderRadius: 99, justifyContent: 'center' }}>
                            <View
                                style={{
                                    position: 'absolute',
                                    left: hThumbLeft,
                                    width: hThumbWidth,
                                    height: 8,
                                    backgroundColor: '#6b7280',
                                    borderRadius: 99,
                                    shadowColor: '#6b7280',
                                    shadowOpacity: 0.3,
                                    shadowRadius: 3,
                                    elevation: 2,
                                }}
                                {...hPanResponder.panHandlers}
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
                    style={{ color: '#2563eb', fontSize: 12, fontWeight: '700' }}
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
