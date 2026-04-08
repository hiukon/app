import { useState } from 'react';
import ChatController from '../controllers/ChatController';

export function useChat() {
    const [chatController] = useState(() => new ChatController());
    const [messages, setMessages] = useState(() => chatController.getMessages());
    const [isSending, setIsSending] = useState(false);

    const sendMessage = async (text) => {
        if (!text?.trim()) return { messages };
        setIsSending(true);
        try {
            const result = await chatController.sendUserMessage(text.trim());
            setMessages(result.messages);
            return result;
        } finally {
            setIsSending(false);
        }
    };

    const clearChat = () => {
        chatController.clearChat();
        setMessages(chatController.getMessages());
    };

    return { messages, sendMessage, clearChat, isSending };
}