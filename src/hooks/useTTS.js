import { useState, useCallback, useRef, useEffect } from 'react';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

// Android TTS has ~4000 char hard limit per utterance
const CHUNK_SIZE = 3800;

// Cache selected iOS Vietnamese voice to avoid re-fetching
let selectedIosVoice = null;
let iosVoiceInitialized = false;

function cleanForSpeech(text) {
    return text
        // Remove citation tokens {ref:N}
        .replace(/\{ref:\d+\}/g, '')
        // Remove fenced code blocks (multiline)
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code
        .replace(/`([^`\n]+)`/g, '$1')
        // Remove markdown headings
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold/italic (keep text)
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        // Remove links [text](url) → text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // Remove HTML tags
        .replace(/<[^>]+>/g, '')
        // Remove entire table rows (| ... |)
        .replace(/^\|.*\|$/gm, '')
        // Remove leftover pipe chars
        .replace(/\|/g, ' ')
        // Remove bullet list markers
        .replace(/^[ \t]*[-*+]\s+/gm, '')
        // Remove ordered list markers
        .replace(/^[ \t]*\d+\.\s+/gm, '')
        // Remove horizontal rules
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // Remove blockquote markers
        .replace(/^>\s*/gm, '')
        // Collapse whitespace
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n')
        .trim();
}

function splitChunks(text) {
    if (text.length <= CHUNK_SIZE) return [text];
    const result = [];
    let rem = text;
    while (rem.length > CHUNK_SIZE) {
        const sub = rem.substring(0, CHUNK_SIZE);
        // Prefer to cut at a sentence boundary
        const cut = Math.max(
            sub.lastIndexOf('. '),
            sub.lastIndexOf('! '),
            sub.lastIndexOf('? '),
            sub.lastIndexOf('\n')
        );
        const at = cut > CHUNK_SIZE * 0.5 ? cut + 1 : CHUNK_SIZE;
        result.push(rem.substring(0, at).trim());
        rem = rem.substring(at).trim();
    }
    if (rem) result.push(rem);
    return result.filter(Boolean);
}

function isVietnameseVoice(voice) {
    const language = `${voice?.language || ''}`.toLowerCase();
    const name = `${voice?.name || ''}`.toLowerCase();
    const identifier = `${voice?.identifier || ''}`.toLowerCase();
    return (
        language === 'vi-vn' ||
        language.startsWith('vi-') ||
        language === 'vi' ||
        name.includes('viet') ||
        identifier.includes('vi-vn')
    );
}

// iOS: only choose a real Vietnamese voice. If none exists, rely on language fallback.
async function getIosVoice() {
    if (iosVoiceInitialized) return selectedIosVoice;

    try {
        const voices = await Speech.getAvailableVoicesAsync();
        const vi = voices.find(isVietnameseVoice);

        if (vi) {
            selectedIosVoice = vi.identifier || null;
            iosVoiceInitialized = true;
            return selectedIosVoice;
        }
        console.warn('No Vietnamese iOS TTS voice found. Falling back to language=vi-VN.');
    } catch (e) {
        console.warn('Failed to get iOS voices:', e);
    }

    iosVoiceInitialized = true;
    selectedIosVoice = null;
    return selectedIosVoice;
}

export function useTTS() {
    const [speakingMessageId, setSpeakingMessageId] = useState(null);
    // Use a ref to hold mutable session state — avoids stale closures in callbacks
    const sessionRef = useRef({ chunks: [], idx: 0, id: null });

    const playNext = useCallback(async () => {
        const { chunks, idx, id } = sessionRef.current;
        if (!id || idx >= chunks.length) return;

        const isLast = idx === chunks.length - 1;

        try {
            const speakOptions = {
                pitch: 1.0,
                // iOS scale: 0.0–1.0 where 0.5 is default normal speed
                // Android scale: 0.0–3.0 where 1.0 is normal speed
                rate: Platform.OS === 'ios' ? 0.5 : 0.9,
                onDone: () => {
                    if (sessionRef.current.id !== id) return;
                    if (isLast) {
                        sessionRef.current.id = null;
                        setSpeakingMessageId(null);
                    } else {
                        sessionRef.current.idx = idx + 1;
                        playNext();
                    }
                },
                onStopped: () => {
                    if (sessionRef.current.id === id) {
                        sessionRef.current.id = null;
                        setSpeakingMessageId(null);
                    }
                },
                onError: () => {
                    if (sessionRef.current.id === id) {
                        sessionRef.current.id = null;
                        setSpeakingMessageId(null);
                    }
                },
            };

            speakOptions.language = 'vi-VN';
            if (Platform.OS === 'ios') {
                const voice = await getIosVoice();
                if (voice) speakOptions.voice = voice;
            }

            Speech.speak(chunks[idx], speakOptions);
        } catch {
            sessionRef.current.id = null;
            setSpeakingMessageId(null);
        }
    }, []);

    const speakMessage = useCallback((text, messageId) => {
        // Stop any current speech first
        try { Speech.stop(); } catch { }

        const clean = cleanForSpeech(text);
        if (!clean) return;

        const chunks = splitChunks(clean);
        sessionRef.current = { chunks, idx: 0, id: messageId };
        setSpeakingMessageId(messageId);
        playNext();
    }, [playNext]);

    const stopSpeaking = useCallback(() => {
        try { Speech.stop(); } catch { }
        sessionRef.current = { chunks: [], idx: 0, id: null };
        setSpeakingMessageId(null);
    }, []);

    // Initialize iOS voice on mount
    useEffect(() => {
        if (Platform.OS === 'ios') {
            getIosVoice().catch(e => console.warn('Voice init error:', e));
        }
    }, []);

    return { speakingMessageId, speakMessage, stopSpeaking };
}
