import { useState } from 'react';
import ChatController from '../controllers/ChatController';

export function useChat() {
    const [chatController] = useState(() => new ChatController());
    const [messages, setMessages] = useState(() => chatController.getMessages());
    const [isSending, setIsSending] = useState(false);
    const [pendingInterrupt, setPendingInterrupt] = useState(() =>
        chatController.getPendingInterrupt?.() || null
    );
    const [conversations, setConversations] = useState([]);

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
                return { action: 'provide', answer: value };

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
                setMessages(chatController.getMessages());
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const result = await chatController.sendUserMessage(text.trim(), bump, options);
            setMessages(chatController.getMessages());
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            return result;
        } finally {
            setIsSending(false);
        }
    };

    const cancel = async () => {
        const bump = () => {
            setMessages(chatController.getMessages());
            setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        };
        await chatController.cancelCurrentRun(bump);
        setIsSending(false);
        setMessages(chatController.getMessages());
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
    };

    const editMessage = (messageId, newText) => {
        const result = chatController.editUserMessage(messageId, newText);
        setMessages(chatController.getMessages());
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        return result;
    };

    const resendEditedMessage = async (messageId, newText) => {
        const edited = chatController.editAndPruneFromMessage(messageId, newText);
        if (!edited.success) {
            setMessages(chatController.getMessages());
            return edited;
        }
        setIsSending(true);
        try {
            const bump = () => {
                setMessages(chatController.getMessages());
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const result = await chatController.sendUserMessage(newText.trim(), bump, {
                skipUserMessage: false,
            });
            setMessages(chatController.getMessages());
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
                setMessages(chatController.getMessages());
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const intr = chatController.getPendingInterrupt?.() || null;
            const payload = toInterruptPayload(intr, input);
            const out = await chatController.resumeAgentInterrupt(payload, bump);
            setMessages(chatController.getMessages());
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
                setMessages(chatController.getMessages());
                setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
            };
            const out = await chatController.openConversation(conversationId, bump);
            setMessages(chatController.getMessages());
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
        setMessages(chatController.getMessages());
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        return out;
    };

    const newConversation = () => {
        const out = chatController.startNewConversation();
        setMessages(chatController.getMessages());
        setPendingInterrupt(chatController.getPendingInterrupt?.() || null);
        return out;
    };

    const clearChat = () => {
        chatController.clearChat();
        setMessages(chatController.getMessages());
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