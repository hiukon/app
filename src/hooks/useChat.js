import { useState } from 'react';
import ChatController from '../controllers/ChatController';

export function useChat() {
    const [chatController] = useState(() => new ChatController());
    const [messages, setMessages] = useState(() => chatController.getMessages());
    const [isSending, setIsSending] = useState(false);

    const sendMessage = async (text, options = {}) => {
        if (!text?.trim()) return { messages };
        setIsSending(true);
        try {
            const bump = () => setMessages(chatController.getMessages());
            const result = await chatController.sendUserMessage(text.trim(), bump, options);
            setMessages(chatController.getMessages());
            return result;
        } finally {
            setIsSending(false);
        }
    };

    const cancel = async () => {
        const bump = () => setMessages(chatController.getMessages());
        await chatController.cancelCurrentRun(bump);
        setIsSending(false);
        setMessages(chatController.getMessages());
    };

    const editMessage = (messageId, newText) => {
        const result = chatController.editUserMessage(messageId, newText);
        setMessages(chatController.getMessages());
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
            const bump = () => setMessages(chatController.getMessages());
            const result = await chatController.sendUserMessage(newText.trim(), bump, {
                skipUserMessage: true,
            });
            setMessages(chatController.getMessages());
            return { success: true, result };
        } finally {
            setIsSending(false);
        }
    };

    const clearChat = () => {
        chatController.clearChat();
        setMessages(chatController.getMessages());
    };

    return { messages, sendMessage, clearChat, cancel, editMessage, resendEditedMessage, isSending };
}