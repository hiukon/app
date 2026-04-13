import { useCallback, useRef, useState, useEffect } from 'react';
import { Platform, Alert } from 'react-native';

/**
 * No top-level import of expo-speech-recognition (requireNativeModule throws on Expo Go).
 * Lazy require in try/catch when mic starts; web uses SpeechRecognition.
 */
function tryRequireSpeechModule() {
    try {
        return require('expo-speech-recognition').ExpoSpeechRecognitionModule;
    } catch {
        return null;
    }
}

/**
 * Mic only: web = SpeechRecognition API; native = expo-speech-recognition (dev build after prebuild).
 * No speaker/TTS.
 */
export function useVoiceChat({ onTranscript }) {
    const [isListening, setIsListening] = useState(false);
    const webRecRef = useRef(null);
    const subsRef = useRef([]);

    const clearNativeSubs = useCallback(() => {
        subsRef.current.forEach((s) => {
            try {
                s.remove?.();
            } catch (_) {
                /* ignore */
            }
        });
        subsRef.current = [];
    }, []);

    useEffect(
        () => () => {
            clearNativeSubs();
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                try {
                    webRecRef.current?.stop?.();
                } catch (_) {
                    /* ignore */
                }
            }
        },
        [clearNativeSubs]
    );

    const stopListening = useCallback(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try {
                webRecRef.current?.stop?.();
            } catch (_) {
                /* ignore */
            }
            webRecRef.current = null;
            setIsListening(false);
            return;
        }
        clearNativeSubs();
        const mod = tryRequireSpeechModule();
        if (mod) {
            try {
                mod.stop();
            } catch (_) {
                try {
                    mod.abort();
                } catch (_) {
                    /* ignore */
                }
            }
        }
        setIsListening(false);
    }, [clearNativeSubs]);

    const startListening = useCallback(async () => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) {
                Alert.alert(
                    'Mic',
                    'Trinh duyet khong ho tro SpeechRecognition.'
                );
                return;
            }
            try {
                webRecRef.current?.stop?.();
            } catch (_) {
                /* ignore */
            }
            const rec = new SR();
            rec.lang = 'vi-VN';
            rec.interimResults = true;
            rec.continuous = false;
            rec.onresult = (event) => {
                let interim = '';
                let finalChunk = '';
                for (let i = event.resultIndex; i < event.results.length; i += 1) {
                    const piece = event.results[i][0]?.transcript || '';
                    if (event.results[i].isFinal) finalChunk += piece;
                    else interim += piece;
                }
                const chunk = `${finalChunk || interim}`.trim();
                if (chunk) onTranscript?.(chunk, { partial: !finalChunk });
            };
            rec.onerror = () => {
                setIsListening(false);
            };
            rec.onend = () => {
                setIsListening(false);
                webRecRef.current = null;
            };
            webRecRef.current = rec;
            rec.start();
            setIsListening(true);
            return;
        }

        const mod = tryRequireSpeechModule();
        if (!mod) {
            Alert.alert(
                'Nhan giong noi',
                'Expo Go khong co ExpoSpeechRecognition. Dung mic tren web, hoac: npx expo prebuild roi npx expo run:android / run:ios (development build).'
            );
            return;
        }

        clearNativeSubs();

        const subResult = mod.addListener('result', (ev) => {
            const first = ev.results?.[0];
            const t = `${first?.transcript || ''}`.trim();
            if (!t) return;
            onTranscript?.(t, { partial: !ev.isFinal });
            if (ev.isFinal) setIsListening(false);
        });
        const subError = mod.addListener('error', (e) => {
            setIsListening(false);
            clearNativeSubs();
            if (e.error !== 'aborted' && e.error !== 'no-speech') {
                Alert.alert(
                    'Nhận giọng nói',
                    e.message || e.error || 'Loi khong xac dinh'
                );
            }
        });
        const subEnd = mod.addListener('end', () => {
            setIsListening(false);
            clearNativeSubs();
        });

        subsRef.current = [subResult, subError, subEnd];

        try {
            const perm = await mod.requestPermissionsAsync();
            if (!perm.granted) {
                clearNativeSubs();
                Alert.alert('Cần quyền microphone và nhận dạng giọng nói.');
                return;
            }
            mod.start({
                lang: 'vi-VN',
                interimResults: true,
            });
            setIsListening(true);
        } catch (err) {
            clearNativeSubs();
            Alert.alert('Giọng nói', err?.message || String(err));
        }
    }, [onTranscript, clearNativeSubs]);

    const toggleListening = useCallback(() => {
        if (isListening) stopListening();
        else startListening();
    }, [isListening, startListening, stopListening]);

    return {
        isListening,
        startListening,
        stopListening,
        toggleListening,
    };
}
