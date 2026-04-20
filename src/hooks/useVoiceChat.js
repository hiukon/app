import { useCallback, useRef, useState, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import {
    ExpoSpeechRecognitionModule,
    ExpoSpeechRecognitionModuleEmitter,
} from 'expo-speech-recognition';

export function useVoiceChat({ onTranscript }) {
    const [isListening, setIsListening] = useState(false);
    const webRecRef = useRef(null);
    const subsRef = useRef([]);
    const autoStopTimerRef = useRef(null);

    // ==================== CLEANUP ====================

    const cleanup = useCallback(() => {
        if (autoStopTimerRef.current) {
            clearTimeout(autoStopTimerRef.current);
            autoStopTimerRef.current = null;
        }
        subsRef.current.forEach(s => {
            try { s?.remove?.(); } catch (_) { }
        });
        subsRef.current = [];
    }, []);

    useEffect(() => () => cleanup(), [cleanup]);

    // ==================== STOP ====================

    const stopListening = useCallback(() => {
        console.log('⏹️ Stopping...');
        cleanup();

        if (Platform.OS === 'web') {
            try { webRecRef.current?.stop?.(); } catch (_) { }
            webRecRef.current = null;
            setIsListening(false);
            return;
        }

        try {
            ExpoSpeechRecognitionModule.stop();
        } catch (err) {
            console.error('❌ stop() error:', err);
            try { ExpoSpeechRecognitionModule.abort(); } catch (_) { }
        }
        setIsListening(false);
    }, [cleanup]);

    // ==================== START ====================

    const startListening = useCallback(async () => {
        console.log('🎤 Starting...');

        // ===== WEB =====
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { Alert.alert('Lỗi', 'Trình duyệt không hỗ trợ.'); return; }
            try { webRecRef.current?.stop?.(); } catch (_) { }

            const rec = new SR();
            rec.lang = 'vi-VN';
            rec.interimResults = false; // ✅ Chỉ final results
            rec.continuous = false;
            rec.onresult = (e) => {
                let text = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) text += e.results[i][0]?.transcript || '';
                }
                text = text.trim();
                if (text) onTranscript?.(text);
            };
            rec.onerror = () => setIsListening(false);
            rec.onend = () => { setIsListening(false); webRecRef.current = null; };
            webRecRef.current = rec;
            rec.start();
            setIsListening(true);
            return;
        }

        // ===== NATIVE =====
        cleanup();

        try {
            // ✅ Dùng đúng ExpoSpeechRecognitionModuleEmitter
            const resultSub = ExpoSpeechRecognitionModuleEmitter.addListener('result', (event) => {
                console.log('🎯 result:', JSON.stringify(event));
                try {
                    let text = '';
                    if (Array.isArray(event?.results)) {
                        text = event.results[0]?.[0]?.transcript ?? '';
                    } else if (Array.isArray(event?.value)) {
                        text = event.value[0] ?? '';
                    } else {
                        text = event?.transcript ?? event?.text ?? '';
                    }
                    text = String(text).trim();
                    console.log(`📝 "${text}"`);
                    if (text) onTranscript?.(text);
                } catch (err) {
                    console.error('❌ result error:', err);
                }
            });

            const errorSub = ExpoSpeechRecognitionModuleEmitter.addListener('error', (event) => {
                console.error('❌ error:', JSON.stringify(event));
                const code = event?.error ?? event?.message ?? '';
                if (code === 'no-speech') return;
                cleanup();
                setIsListening(false);
                if (!['aborted', 'abort'].includes(code)) {
                    Alert.alert('Lỗi nhận dạng', code);
                }
            });

            const endSub = ExpoSpeechRecognitionModuleEmitter.addListener('end', () => {
                console.log('🔚 end');
                cleanup();
                setIsListening(false);
            });

            subsRef.current = [resultSub, errorSub, endSub];
            console.log('✅ Listeners registered via ExpoSpeechRecognitionModuleEmitter');

        } catch (err) {
            console.error('❌ addListener error:', err);
        }

        // Request permissions + start
        try {
            console.log('📋 Checking permissions...');
            const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            console.log(`✅ Permission granted: ${granted}`);

            if (!granted) {
                Alert.alert('Yêu cầu quyền', 'Cần cấp quyền microphone.');
                cleanup();
                return;
            }

            console.log('🚀 Calling start()...');
            const startConfig = {
                lang: 'vi-VN',
                interimResults: false, // ✅ Chỉ final results
                continuous: false,
                maxResults: 1,
            };
            console.log('📝 Start config:', JSON.stringify(startConfig));

            await ExpoSpeechRecognitionModule.start(startConfig);

            setIsListening(true);
            console.log('✅ Started - speak now!');

            autoStopTimerRef.current = setTimeout(() => {
                console.log('⏰ Auto-stop 15s');
                try { ExpoSpeechRecognitionModule.stop(); } catch (_) { }
            }, 15000);

        } catch (err) {
            console.error('❌ start error:', err);
            console.error('❌ Error message:', err?.message);
            console.error('❌ Error code:', err?.code);
            cleanup();
            setIsListening(false);
            Alert.alert('Lỗi khởi động Voice', err?.message || 'Không thể khởi động nhận dạng giọng nói.');
        }
    }, [onTranscript, cleanup]);

    const toggleListening = useCallback(() => {
        if (isListening) stopListening();
        else startListening();
    }, [isListening, startListening, stopListening]);

    return { isListening, startListening, stopListening, toggleListening };
}