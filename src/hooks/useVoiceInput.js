import { useState, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, Alert, Keyboard } from 'react-native';
import { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import Voice from '@react-native-voice/voice';

export function useVoiceInput({ onPartialResult, onFinalResult }) {
    const [isListening, setIsListening] = useState(false);

    // Base text trước khi session bắt đầu (set lúc bấm mic)
    const committedTextRef = useRef('');
    const hasVoiceResultRef = useRef(false);
    const isIgnoreResultsRef = useRef(false);

    // Giữ final text chưa commit — chờ xem partial tiếp theo có phải re-emission không
    // { sessionText: string, fullText: string } | null
    const pendingFinalRef = useRef(null);

    // Lưu callbacks vào ref để listener không bao giờ stale khi component re-render
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

    // Setup listeners CHỈ 1 LẦN
    useEffect(() => {
        Voice.onSpeechStart = () => {
            isIgnoreResultsRef.current = false;
            setIsListening(true);
            hasVoiceResultRef.current = false;
            pendingFinalRef.current = null;
        };

        Voice.onSpeechEnd = () => {
            setIsListening(false);
            // Commit pending final khi session kết thúc
            if (pendingFinalRef.current) {
                committedTextRef.current = pendingFinalRef.current.fullText;
                pendingFinalRef.current = null;
            }
        };

        Voice.onSpeechPartialResults = (event) => {
            if (isIgnoreResultsRef.current) return;
            const partialText = event.value?.[0];
            if (!partialText?.trim()) return;
            hasVoiceResultRef.current = true;

            if (pendingFinalRef.current) {
                if (partialText === pendingFinalRef.current.sessionText) {
                    // Engine đang re-emit lại text vừa commit → bỏ qua
                    return;
                }
                // Partial mới thật sự → giờ mới commit base
                committedTextRef.current = pendingFinalRef.current.fullText;
                pendingFinalRef.current = null;
            }

            const base = committedTextRef.current;
            const sep = base && !base.endsWith(' ') ? ' ' : '';
            onPartialResultRef.current?.(base + sep + partialText);
        };

        Voice.onSpeechResults = (event) => {
            if (isIgnoreResultsRef.current) return;
            const spokenText = event.value?.[0];
            hasVoiceResultRef.current = true;
            if (!spokenText?.trim()) return;

            const base = committedTextRef.current;
            const sep = base && !base.endsWith(' ') ? ' ' : '';
            const fullText = (base + sep + spokenText).trimStart();

            // Chưa cập nhật committedTextRef ngay — để onSpeechPartialResults phân biệt re-emission
            pendingFinalRef.current = { sessionText: spokenText, fullText };
            onFinalResultRef.current?.(fullText);
        };

        Voice.onSpeechError = (error) => {
            setIsListening(false);
            if (isIgnoreResultsRef.current) return;
            if (pendingFinalRef.current) {
                committedTextRef.current = pendingFinalRef.current.fullText;
                pendingFinalRef.current = null;
            }
            if (hasVoiceResultRef.current) return;
            // '3'=audio-error, '8'=recognizer-busy, '9'=insufficient-permissions (transient startup errors)
            const silentCodes = ['7', 'no-speech', '5', 'no-match', '2', '6', 'audio-error', '3', '8', '9'];
            const code = error?.error?.code?.toString();
            if (silentCodes.includes(code)) return;
            // Delay để onSpeechResults kịp fire trước (race condition trên Android)
        };
        return () => {
            Voice.removeAllListeners();
            Voice.destroy().catch(() => { });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const startListening = async (currentText = '') => {
        try {
            // Dismiss keyboard trước để tránh xung đột IME với Voice trên Android
            Keyboard.dismiss();
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
            pendingFinalRef.current = null;
            isIgnoreResultsRef.current = false;
            // Destroy session cũ trước khi start để tránh lỗi recognizer-busy (code 8)
            // xảy ra sau khi đổi model hoặc tạo tab trò chuyện mới
            try { await Voice.destroy(); } catch { }
            await Voice.start('vi-VN');
        } catch (error) {
            setIsListening(false);
            if (error.code === 'E_NO_RECOGNIZER') Alert.alert('Lỗi', 'Thiết bị không hỗ trợ nhận dạng giọng nói');
        }
    };

    const stopListening = async () => {
        isIgnoreResultsRef.current = true;
        try { await Voice.stop(); } catch { }
        setIsListening(false);
    };

    return { isListening, startListening, stopListening, ringStyle, committedTextRef };
}
