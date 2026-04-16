import { useState, useCallback, useMemo } from 'react';
import ChatController from '../controllers/ChatController';

export function useChat() {
    const [chatController] = useState(() => new ChatController());
    const [messages, setMessages] = useState(() => chatController.getMessages());
    const [isSending, setIsSending] = useState(false);
    const [pendingInterrupt, setPendingInterrupt] = useState(() =>
        chatController.getPendingInterrupt?.() || null
    );
    const [conversations, setConversations] = useState([]);

    // ✅ HÀM LỌC MESSAGE - CHỈ HIỂN THỊ KẾT QUẢ
    const filterDisplayMessages = useCallback((rawMessages) => {
        return rawMessages.filter(msg => {
            // Luôn giữ message của user
            if (msg.isUser) return true;

            // Bỏ qua message có type là tool_call hoặc thinking
            if (msg.type === 'tool_call' || msg.type === 'thinking' || msg.role === 'activity') {
                return false;
            }

            // Bỏ qua message là log nội bộ
            if (msg.text) {
                const lowerText = msg.text.toLowerCase();
                const hidePatterns = [
                    'tìm kiếm kỹ năng',
                    'observe the result',
                    '🔍',
                    '📢',
                    'tool call',
                    'thinking',
                    'đang suy nghĩ'
                ];

                for (const pattern of hidePatterns) {
                    if (lowerText.includes(pattern.toLowerCase())) {
                        return false;
                    }
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

    const toInterruptPayload = (interrupt, input) => {
        const reason = `${interrupt?.reason || ''}`.toLowerCase();
        const value = `${input || ''}`.trim();

        switch (reason) {
            case 'human_approval':
            case 'database_modification':
            case 'multi_step_confirm':
                const yes = /^(yes|y|approve|đồng ý|dong y|ok|có)$/i.test(value);
                return { action: yes ? 'approve' : 'reject', answer: value };

            case 'error_recovery':
                if (/retry|thử lại/i.test(value)) return { action: 'retry' };
                if (/skip|bỏ qua/i.test(value)) return { action: 'skip' };
                if (/abort|hủy|cancel|thoát/i.test(value)) return { action: 'abort' };
                return { action: 'retry' };

            case 'upload_required':
                return { action: 'upload', answer: value };

            case 'information_gathering':
                return { selected: [], custom: value };

            default:
                return { answer: value };
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
        setIsSending(true);
        try {
            const bump = () => {
                updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const result = await chatController.sendUserMessage(text.trim(), bump, options);
            updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return result;
        } finally {
            setIsSending(false);
        }
    };

    const cancel = async () => {
        const bump = () => {
            updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        };
        await chatController.cancelCurrentRun(bump);
        setIsSending(false);
        updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
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
            updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
            return edited;
        }
        setIsSending(true);
        try {
            const bump = () => {
                updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const result = await chatController.sendUserMessage(newText.trim(), bump, {
                skipUserMessage: true,
            });
            updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return { success: true, result };
        } finally {
            setIsSending(false);
        }
    };

    const answerInterrupt = async (input) => {
        setIsSending(true);
        try {
            const bump = () => {
                updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            console.log('[DEBUG] answerInterrupt called with input:', input);
            // ...
            const intr = chatController.getPendingInterrupt?.() || null;
            console.log('[DEBUG] interrupt from controller:', intr);
            const payload = toInterruptPayload(intr, input);
            console.log('[DEBUG] payload to resume:', payload);
            const out = await chatController.resumeAgentInterrupt(payload, bump);
            updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return out;
        } finally {
            setIsSending(false);
        }
    };

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
        setIsSending(true);
        try {
            const bump = () => {
                updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const out = await chatController.openConversation(conversationId, bump);
            updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return out;
        } finally {
            setIsSending(false);
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
        const out = chatController.startNewConversation();
        updateFilteredMessages();  // ✅ DÙNG HÀM MỚI
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
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
        pendingInterrupt,
        answerInterrupt,
        conversations,
        loadConversations,
        openConversation,
        deleteConversation,
        newConversation,
    };
}