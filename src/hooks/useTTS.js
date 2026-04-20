import { useState, useCallback } from 'react';
import * as Speech from 'expo-speech';

export function useTTS() {
    const [speakingMessageId, setSpeakingMessageId] = useState(null);

    const speakMessage = useCallback((text, messageId) => {
        if (speakingMessageId) Speech.stop();
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
            onError: () => setSpeakingMessageId(null),
        });
    }, [speakingMessageId]);

    const stopSpeaking = useCallback(() => {
        try { Speech.stop(); } catch { }
        setSpeakingMessageId(null);
    }, []);

    return { speakingMessageId, speakMessage, stopSpeaking };
}
