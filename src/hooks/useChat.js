import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ChatController from '../controllers/ChatController';

export function useChat() {
    const [chatController] = useState(() => new ChatController());
    const [messages, setMessages] = useState(() => chatController.getMessages());
    const [isSending, setIsSending] = useState(false);
    const [isOpeningConversation, setIsOpeningConversation] = useState(false);
    const [pendingInterrupt, setPendingInterrupt] = useState(() =>
        chatController.getPendingInterrupt?.() || null
    );
    // Generation counter — incremented whenever a new async operation takes ownership.
    // Any in-flight sendMessage/openConversation whose gen no longer matches will not
    // reset isSending when it eventually finishes, preventing race conditions.
    const sendGenRef = useRef(0);
    const openGenRef = useRef(0);
    const pollingRef = useRef(null);
    const messagesHashRef = useRef(null);
    const [conversations, setConversations] = useState([]);

    // ✅ HÀM LỌC MESSAGE - CHỈ HIỂN THỊ KẾT QUẢ
    const filterDisplayMessages = useCallback((rawMessages) => {
        return rawMessages.filter(msg => {
            // Luôn giữ message của user
            if (msg.isUser) return true;
            // Luôn giữ interrupt question messages
            if (msg.isInterruptMessage) return true;

            // ✅ Kiểm tra nếu là message chứa báo cáo - LUÔN HIỂN THỊ
            if (msg.text) {
                const lowerText = msg.text.toLowerCase();
                const isReportMessage =
                    lowerText.includes('báo cáo') ||
                    lowerText.includes('tải xuống') ||
                    lowerText.includes('.doc') ||
                    lowerText.includes('kết quả') ||
                    lowerText.includes('phân loại') ||
                    lowerText.includes('nhiệm vụ') ||
                    msg.text.length > 300;  // Message dài thường là báo cáo

                if (isReportMessage) {
                    return true;  // ✅ Luôn hiển thị message báo cáo
                }
            }

            // Bỏ qua message có type là tool_call hoặc thinking (trừ khi là báo cáo)
            if (msg.type === 'tool_call' || msg.type === 'thinking' || msg.role === 'activity') {
                return false;
            }

            // Bỏ qua message là log nội bộ / process
            if (msg.text) {
                const lowerText = msg.text.toLowerCase();
                const hidePatterns = [
                    // Internal logs
                    'tìm kiếm kỹ năng',
                    'observe the result',
                    '🔍', '📢',
                    'tool call', 'thinking',
                    // Agent process steps
                    'tôi sẽ tìm kiếm',
                    'tôi sẽ tra cứu',
                    'tôi sẽ kiểm tra',
                    'tôi sẽ thực hiện',
                    'tôi sẽ xem xét',
                    'tôi cần tìm kiếm',
                    'tôi đang tìm kiếm',
                    'tôi đang thực hiện',
                    'tôi đang xử lý',
                    'thực hiện tìm kiếm',
                    'thực hiện kế hoạch',
                    'kế hoạch hành động',
                    'đang thực hiện bước',
                    'bước tiếp theo',
                    'tôi sẽ sử dụng công cụ',
                    'gọi công cụ',
                    'calling tool',
                    // Document mode / context confirmation
                    'xác nhận chế độ',
                    'xác nhận ngữ cảnh',
                    'chế độ tài liệu',
                    'document mode',
                    'ngữ cảnh tài liệu',
                    'vui lòng xác nhận',
                    'để tôi hiểu rõ hơn ngữ cảnh',
                    'bạn muốn tôi phân tích',
                    'bạn muốn tôi tìm kiếm trong',
                    // Context gathering before answer
                    'trước khi trả lời, tôi cần',
                    'trước khi thực hiện',
                ];

                // Không lọc "đang suy nghĩ" nếu là message streaming
                if (msg.status !== 'streaming' && lowerText.includes('đang suy nghĩ')) {
                    return false;
                }

                for (const pattern of hidePatterns) {
                    if (lowerText.includes(pattern.toLowerCase())) {
                        return false;
                    }
                }

                // Bỏ message chỉ có nội dung là tool call JSON
                if (/^\s*\{[\s\S]*"tool"[\s\S]*\}\s*$/.test(msg.text) ||
                    /^\s*\{[\s\S]*"function"[\s\S]*\}\s*$/.test(msg.text)) {
                    return false;
                }
            }

            return true;
        });
    }, []);

    // ✅ HÀM CẬP NHẬT MESSAGES CÓ LỌC
    const updateFilteredMessages = useCallback(() => {
        const rawMessages = chatController.getMessages();
        const filtered = filterDisplayMessages(rawMessages);
        setMessages(filtered);
        return filtered;
    }, [chatController, filterDisplayMessages]);

    // ✅ POLLING TO SYNC APP-WEB: Detect when web makes changes
    const startConversationPolling = useCallback(() => {
        if (pollingRef.current) clearInterval(pollingRef.current);

        pollingRef.current = setInterval(async () => {
            const conversationId = chatController.conversationId;
            if (!conversationId || isSending) return;

            try {
                // Fetch latest conversation history
                await chatController.fetchConversationHistory(conversationId, () => {
                    // Silent update - no UI flashing
                });

                // Check if messages changed
                const currentMessages = chatController.getMessages();
                const currentHash = JSON.stringify(
                    currentMessages.map(m => ({ id: m.id, text: m.text, meta: m.meta }))
                );

                if (messagesHashRef.current !== currentHash) {
                    messagesHashRef.current = currentHash;
                    updateFilteredMessages();
                    setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
                }
            } catch (error) {
                console.log('Polling sync error (silent):', error.message);
            }
        }, 3000); // Poll every 3 seconds
    }, [isSending, updateFilteredMessages, chatController]);

    const stopConversationPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const toInterruptPayload = (interrupt, input) => {
        const normalizedInput =
            typeof input === 'string'
                ? { displayText: `${input || ''}`.trim(), selected: [], custom: `${input || ''}`.trim() }
                : {
                    displayText: `${input?.displayText || input?.custom || (input?.selected || []).join(', ') || ''}`.trim(),
                    selected: Array.isArray(input?.selected) ? input.selected.filter(Boolean) : [],
                    custom: `${input?.custom || ''}`.trim(),
                };
        const reason = `${interrupt?.reason || ''}`.toLowerCase();
        const value = normalizedInput.displayText;
        const hasSelectedOptions = normalizedInput.selected.length > 0;
        const selectionPayload = hasSelectedOptions
            ? { custom: normalizedInput.custom || '', selected: normalizedInput.selected }
            : null;

        switch (reason) {
            case 'human_approval':
            case 'database_modification':
            case 'multi_step_confirm': {
                const yes = /^(yes|y|approve|đồng ý|dong y|ok|có)$/i.test(value);
                return {
                    action: yes ? 'approve' : 'reject',
                    ...(selectionPayload || {}),
                    tool_name: interrupt?.payload?.tool_name
                };
            }

            case 'error_recovery': {
                if (/retry|thử lại/i.test(value)) return { action: 'retry' };
                if (/skip|bỏ qua/i.test(value)) return { action: 'skip' };
                if (/abort|hủy|cancel|thoát/i.test(value)) return { action: 'abort' };
                return { action: 'retry' };
            }

            case 'upload_required': {
                if (selectionPayload) return { answer: value, ...selectionPayload };
                return { answer: value };
            }

            // ✅ SỬA LẠI CASE NÀY
            case 'information_gathering': {
                if (selectionPayload) return { answer: value, ...selectionPayload };
                // Theo tài liệu §9.4: payload có { answer: string }
                return { answer: value };
            }

            case 'policy_hold': {
                if (selectionPayload) return { answer: value, ...selectionPayload };
                return { answer: value };
            }

            default: {
                if (selectionPayload) return { answer: value, ...selectionPayload };
                // Fallback - dùng answer
                return { answer: value };
            }
        }
    };

    const sortConversationsDesc = (list = []) =>
        [...list].sort((a, b) =>
            `${b?.updated_at || b?.created_at || ''}`.localeCompare(
                `${a?.updated_at || a?.created_at || ''}`
            )
        );

    const sendMessage = async (text, options = {}) => {
        if (!text?.trim()) return { messages };
        const gen = ++sendGenRef.current;
        setIsSending(true);
        try {
            const bump = () => {
                updateFilteredMessages();
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const result = await chatController.sendUserMessage(text.trim(), bump, options);
            updateFilteredMessages();
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return result;
        } finally {
            if (sendGenRef.current === gen) setIsSending(false);
        }
    };

    const cancel = async () => {
        sendGenRef.current++;
        const bump = () => {
            updateFilteredMessages();
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        };
        await chatController.cancelCurrentRun(bump);
        setIsSending(false);
        updateFilteredMessages();
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
    };

    const editMessage = (messageId, newText) => {
        const result = chatController.editUserMessage(messageId, newText);
        updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        return result;
    };

    const resendEditedMessage = async (messageId, newText) => {
        const edited = chatController.editAndPruneFromMessage(messageId, newText);
        if (!edited.success) {
            updateFilteredMessages();
            return edited;
        }
        const gen = ++sendGenRef.current;
        setIsSending(true);
        try {
            const bump = () => {
                updateFilteredMessages();
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const result = await chatController.sendUserMessage(newText.trim(), bump, {
                skipUserMessage: true,
            });
            updateFilteredMessages();
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return { success: true, result };
        } finally {
            if (sendGenRef.current === gen) setIsSending(false);
        }
    };

    const answerInterrupt = async (input, storedInterruptData = null) => {
        const gen = ++sendGenRef.current;
        setIsSending(true);

        try {
            const bump = () => {
                updateFilteredMessages();
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };

            const isHistorical = !chatController.getPendingInterrupt?.() && !!storedInterruptData;
            const displayText =
                typeof input === 'string'
                    ? input.trim()
                    : `${input?.displayText || input?.custom || (input?.selected || []).join(', ') || ''}`.trim();

            if (isHistorical) {
                // Re-select after already getting a response: remove old result, send as new message
                chatController.pruneAfterInterruptSelection();
                updateFilteredMessages();
                const result = await chatController.sendUserMessage(displayText, bump);
                updateFilteredMessages();
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
                return result;
            }

            const intr = chatController.getPendingInterrupt?.() || null;
            const payload = toInterruptPayload(intr, input);
            const out = await chatController.resumeAgentInterrupt(payload, bump);
            updateFilteredMessages();
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return out;
        } catch (error) {
            chatController.chatModel?.addMessage?.({
                text: `❌ Có lỗi xử lý: ${error.message}. Vui lòng thử lại.`,
                isUser: false,
                status: 'error',
            });
            updateFilteredMessages();
        } finally {
            if (sendGenRef.current === gen) setIsSending(false);
        }
    };

    // ✅ START/STOP POLLING when conversation changes
    useEffect(() => {
        const conversationId = chatController.conversationId;
        if (conversationId) {
            startConversationPolling();
        } else {
            stopConversationPolling();
        }

        return () => stopConversationPolling();
    }, [chatController.conversationId, startConversationPolling, stopConversationPolling]);

    const loadConversations = async () => {
        const out = await chatController.listConversations();
        if (out.success) {
            const sorted = sortConversationsDesc(out.data || []);
            setConversations(sorted);
        } else {
            setConversations([]);
        }
        return out;
    };

    const openConversation = async (conversationId) => {
        const gen = ++openGenRef.current;
        setIsOpeningConversation(true);
        messagesHashRef.current = null; // ✅ Reset hash for new conversation
        try {
            const bump = () => {
                if (openGenRef.current !== gen) return;
                updateFilteredMessages();
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const out = await chatController.openConversation(conversationId, bump);
            if (openGenRef.current !== gen) return out;
            updateFilteredMessages();
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return out;
        } finally {
            if (openGenRef.current === gen) setIsOpeningConversation(false);
        }
    };

    const deleteConversation = async (conversationId) => {
        const out = await chatController.deleteConversation(conversationId);
        const refreshed = await chatController.listConversations();
        if (refreshed.success) setConversations(sortConversationsDesc(refreshed.data || []));
        updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        return out;
    };

    const newConversation = () => {
        // Abort ongoing stream and prevent its finally from racing
        sendGenRef.current++;
        messagesHashRef.current = null; // ✅ Reset hash for new conversation
        const out = chatController.startNewConversation();
        setIsSending(false);
        updateFilteredMessages();
        setPendingInterrupt(null);
        return out;
    };

    const clearChat = () => {
        chatController.clearChat();
        updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
    };

    return {
        messages,
        sendMessage,
        clearChat,
        cancel,
        editMessage,
        resendEditedMessage,
        isSending,
        isOpeningConversation,
        pendingInterrupt,
        answerInterrupt,
        conversations,
        loadConversations,
        openConversation,
        deleteConversation,
        newConversation,
        conversationId: chatController.conversationId,  // ✅ THÊM PROPERTY NÀY
    };
}
