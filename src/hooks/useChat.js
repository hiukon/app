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

    const toInterruptPayload = (interrupt, input) => {
        const reason = `${interrupt?.reason || ''}`.toLowerCase();
        const value = `${input || ''}`.trim();

        switch (reason) {
            case 'human_approval':
            case 'database_modification':
            case 'multi_step_confirm': {
                const yes = /^(yes|y|approve|đồng ý|dong y|ok|có)$/i.test(value);
                return {
                    action: yes ? 'approve' : 'reject',
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
                return { answer: value };
            }

            // ✅ SỬA LẠI CASE NÀY
            case 'information_gathering': {
                // Theo tài liệu §9.4: payload có { answer: string }
                return { answer: value };
            }

            case 'policy_hold': {
                return { answer: value };
            }

            default: {
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

        // ✅ Thêm message chờ qua chatModel
        const waitingMessage = {
            text: '⏳ Đang tạo báo cáo, vui lòng đợi (có thể mất 10-15 phút)...',
            isUser: false,
            status: 'streaming',
        };

        // Truy cập chatModel từ chatController
        const waitingId = chatController.chatModel?.addMessage?.(waitingMessage)?.id;
        updateFilteredMessages();

        try {
            // ✅ Xóa message chờ trước khi resume
            if (waitingId) {
                chatController.chatModel?.removeMessage?.(waitingId);
                updateFilteredMessages();
            }

            const bump = () => {
                updateFilteredMessages();
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };

            console.log('[DEBUG] answerInterrupt called with input:', input);
            const intr = chatController.getPendingInterrupt?.() || null;
            console.log('[DEBUG] interrupt from controller:', intr);

            const payload = toInterruptPayload(intr, input);
            console.log('[DEBUG] payload to resume:', payload);

            const out = await chatController.resumeAgentInterrupt(payload, bump);

            updateFilteredMessages();
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return out;

        } catch (error) {
            console.error('[ERROR] answerInterrupt failed:', error);

            // Nếu lỗi, cập nhật message chờ thành lỗi (nếu chưa xóa)
            if (waitingId) {
                const stillExists = chatController.chatModel?.getMessages?.().find(m => m.id === waitingId);
                if (stillExists) {
                    chatController.chatModel?.updateMessage?.(waitingId, {
                        text: `❌ Có lỗi khi tạo báo cáo: ${error.message}. Vui lòng thử lại.`,
                        status: 'error',
                    });
                } else {
                    // Nếu đã xóa rồi thì thêm message lỗi mới
                    chatController.chatModel?.addMessage?.({
                        text: `❌ Có lỗi khi tạo báo cáo: ${error.message}. Vui lòng thử lại.`,
                        isUser: false,
                        status: 'error',
                    });
                }
                updateFilteredMessages();
            }
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
        conversationId: chatController.conversationId,  // ✅ THÊM PROPERTY NÀY
    };
}