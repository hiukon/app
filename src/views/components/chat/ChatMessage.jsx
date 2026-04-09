import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { formatRelativeTime } from '../../../utils/formatters';

export default function ChatMessage({ message, onEdit }) {
    const isUser = message.isUser;
    const [showMeta, setShowMeta] = useState(false);
    const [dots, setDots] = useState('');

    const meta = message.meta || null;
    const hasMeta = !!(
        meta &&
        (meta.thinkingText ||
            (Array.isArray(meta.toolCalls) && meta.toolCalls.length) ||
            (Array.isArray(meta.artifacts) && meta.artifacts.length) ||
            (Array.isArray(meta.attachments) && meta.attachments.length) ||
            (Array.isArray(meta.citations) && meta.citations.length))
    );

    const title = useMemo(() => {
        if (!hasMeta) return '';
        const parts = [];
        if (meta?.thinkingText) parts.push('Thinking');
        if (meta?.toolCalls?.length) parts.push(`Tools(${meta.toolCalls.length})`);
        if (meta?.artifacts?.length) parts.push(`Artifacts(${meta.artifacts.length})`);
        if (meta?.attachments?.length) parts.push(`Files(${meta.attachments.length})`);
        if (meta?.citations?.length) parts.push(`Citations(${meta.citations.length})`);
        return parts.join(' · ');
    }, [hasMeta, meta]);

    useEffect(() => {
        if (message.status !== 'streaming' || isUser) {
            setDots('');
            return undefined;
        }
        const t = setInterval(() => {
            setDots((prev) => {
                if (prev === '') return '.';
                if (prev === '.') return '..';
                if (prev === '..') return '...';
                return '';
            });
        }, 450);
        return () => clearInterval(t);
    }, [message.status, isUser]);

    const visibleText =
        message.status === 'streaming' && !isUser && !`${message.text || ''}`.trim()
            ? `Đang suy nghĩ${dots}`
            : message.text;

    const bubble = (
        <View className={`max-w-[80%] p-3 rounded-lg ${isUser ? 'bg-blue-500' : 'bg-gray-300'}`}>
            <Text className={isUser ? 'text-white' : 'text-gray-800'}>
                {visibleText}
            </Text>

            {hasMeta && !isUser ? (
                <TouchableOpacity
                    onPress={() => setShowMeta((v) => !v)}
                    className="mt-2"
                >
                    <Text className="text-xs text-gray-600">
                        {showMeta ? 'Ẩn chi tiết' : 'Xem chi tiết'} {title ? `(${title})` : ''}
                    </Text>
                </TouchableOpacity>
            ) : null}

            {hasMeta && showMeta && !isUser ? (
                <View className="mt-2">
                    {meta?.thinkingText ? (
                        <View className="p-2 rounded-md bg-white/60">
                            <Text className="text-xs text-gray-700">{meta.thinkingText}</Text>
                        </View>
                    ) : null}

                    {Array.isArray(meta?.toolCalls) && meta.toolCalls.length ? (
                        <View className="mt-2">
                            <Text className="text-xs font-bold text-gray-700">Tool calls</Text>
                            {meta.toolCalls.map((tc) => (
                                <View key={tc.id || `${tc.name}-${Math.random()}`} className="mt-1">
                                    <Text className="text-xs text-gray-700">
                                        - {tc.name || 'tool'} {tc.is_error ? '(error)' : ''}
                                    </Text>
                                    {tc.argsText ? (
                                        <Text className="text-[10px] text-gray-600">
                                            args: {tc.argsText}
                                        </Text>
                                    ) : null}
                                    {tc.resultText ? (
                                        <Text className="text-[10px] text-gray-600">
                                            result: {tc.resultText}
                                        </Text>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {Array.isArray(meta?.attachments) && meta.attachments.length ? (
                        <View className="mt-2">
                            <Text className="text-xs font-bold text-gray-700">Attachments</Text>
                            {meta.attachments.map((a) => (
                                <Text key={a.original_file || a.name} className="text-xs text-gray-700">
                                    - {a.name || 'file'}
                                </Text>
                            ))}
                        </View>
                    ) : null}

                    {Array.isArray(meta?.artifacts) && meta.artifacts.length ? (
                        <View className="mt-2">
                            <Text className="text-xs font-bold text-gray-700">Artifacts</Text>
                            {meta.artifacts.map((a) => (
                                <TouchableOpacity
                                    key={`${a.type || 'workspace'}-${a.name || 'artifact'}`}
                                    onPress={() => {
                                        if (a.url) Linking.openURL(a.url);
                                    }}
                                >
                                    <Text className="text-xs text-blue-700">
                                        - {a.name || 'artifact'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null}

                    {Array.isArray(meta?.citations) && meta.citations.length ? (
                        <View className="mt-2">
                            <Text className="text-xs font-bold text-gray-700">Citations</Text>
                            {meta.citations.slice(0, 5).map((c, idx) => (
                                <Text key={c.id || `${idx}`} className="text-[10px] text-gray-600">
                                    - {c.title || c.name || c.url || `#${idx + 1}`}
                                </Text>
                            ))}
                        </View>
                    ) : null}
                </View>
            ) : null}

            <Text className={`text-xs mt-1 ${isUser ? 'text-blue-100' : 'text-gray-500'}`}>
                {formatRelativeTime(message.timestamp)}
            </Text>
            {isUser ? (
                <Text className="text-[10px] mt-1 text-blue-100">Nhấn giữ để sửa</Text>
            ) : null}
        </View>
    );

    return (
        <View className={`mb-3 ${isUser ? 'items-end' : 'items-start'}`}>
            {isUser ? (
                <TouchableOpacity activeOpacity={0.9} onLongPress={() => onEdit?.(message)}>
                    {bubble}
                </TouchableOpacity>
            ) : (
                bubble
            )}
        </View>
    );
}