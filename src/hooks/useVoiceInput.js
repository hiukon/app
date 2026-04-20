import { useState, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import Voice from '@react-native-voice/voice';

export function useVoiceInput({ onPartialResult, onFinalResult }) {
    const [isListening, setIsListening] = useState(false);
    const committedTextRef = useRef('');
    const hasVoiceResultRef = useRef(false);

    // Lưu callbacks vào ref để listener không bao giờ bị stale dù component re-render
    const onPartialResultRef = useRef(onPartialResult);
    const onFinalResultRef = useRef(onFinalResult);
    useEffect(() => { onPartialResultRef.current = onPartialResult; }, [onPartialResult]);
    useEffect(() => { onFinalResultRef.current = onFinalResult; }, [onFinalResult]);

    const micScale = useSharedValue(1);

    const ringStyle = useAnimatedStyle(() => ({
        transform: [{ scale: withSpring(isListening ? 1.3 : 1, { damping: 2, stiffness: 100 }) }],
        opacity: withTiming(isListening ? 0.5 : 0, { duration: 200 }),
    }));

    useEffect(() => {
        let beatInterval;
        if (isListening) {
            beatInterval = setInterval(() => {
                micScale.value = withSpring(1.2, { damping: 2, stiffness: 150 });
                setTimeout(() => { micScale.value = withSpring(1, { damping: 2, stiffness: 150 }); }, 150);
            }, 400);
        } else {
            micScale.value = withSpring(1);
        }
        return () => { if (beatInterval) clearInterval(beatInterval); };
    }, [isListening, micScale]);

    // Setup listeners CHỈ 1 LẦN — tránh re-subscribe làm duplicate/mất text
    useEffect(() => {
        Voice.onSpeechStart = () => {
            setIsListening(true);
            hasVoiceResultRef.current = false;
        };
        Voice.onSpeechEnd = () => setIsListening(false);

        Voice.onSpeechPartialResults = (event) => {
            const partialText = event.value?.[0];
            if (!partialText?.trim()) return;
            const base = committedTextRef.current;
            const sep = base && !base.endsWith(' ') ? ' ' : '';
            onPartialResultRef.current?.(base + sep + partialText);
        };

        Voice.onSpeechResults = (event) => {
            const spokenText = event.value?.[0];
            hasVoiceResultRef.current = true;
            if (!spokenText?.trim()) return;
            const base = committedTextRef.current;
            const sep = base && !base.endsWith(' ') ? ' ' : '';
            const newCommitted = (base + sep + spokenText).trimStart();
            committedTextRef.current = newCommitted;
            onFinalResultRef.current?.(newCommitted);
        };

        Voice.onSpeechError = (error) => {
            setIsListening(false);
            if (hasVoiceResultRef.current) return;
            const silentCodes = ['7', 'no-speech', '5', 'no-match', '2', '6', 'audio-error'];
            const code = error?.error?.code?.toString();
            if (silentCodes.includes(code)) return;
            Alert.alert('Lỗi nhận dạng giọng nói', error?.error?.message || 'Vui lòng thử lại');
        };

        return () => {
            Voice.removeAllListeners();
            Voice.destroy().catch(() => { });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const startListening = async (currentText = '') => {
        try {
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    { title: 'Microphone Permission', message: 'Cần quyền microphone để nhận dạng giọng nói', buttonPositive: 'OK', buttonNegative: 'Hủy', buttonNeutral: 'Để sau' }
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Thiếu quyền', 'Cần cấp quyền microphone');
                    return;
                }
            }
            committedTextRef.current = currentText;
            hasVoiceResultRef.current = false;
            await Voice.start('vi-VN');
            setIsListening(true);
        } catch (error) {
            setIsListening(false);
            if (error.code === 'E_NO_RECOGNIZER') Alert.alert('Lỗi', 'Thiết bị không hỗ trợ nhận dạng giọng nói');
        }
    };

    const stopListening = async () => {
        try { await Voice.stop(); } catch { }
        setIsListening(false);
    };

    return { isListening, startListening, stopListening, ringStyle, committedTextRef };
}
