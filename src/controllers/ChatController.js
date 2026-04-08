import { ChatModel } from '../models/ChatModel';
import DataService from '../services/DataService';

class ChatController {
    constructor() {
        this.chatModel = new ChatModel();
        this.ensureWelcomeMessage();
    }

    ensureWelcomeMessage() {
        if (this.chatModel.getMessages().length === 0) {
            this.chatModel.addMessage({
                text: 'Xin chào! Tôi là trợ lý ảo HaNoiBrain. Tôi có thể giúp gì cho bạn?',
                isUser: false,
            });
        }
    }

    async sendUserMessage(text) {
        const userMessage = this.chatModel.addMessage({
            text,
            isUser: true,
        });

        const response = await DataService.sendChatMessage(text);

        if (response.success) {
            const botMessage = this.chatModel.addMessage({
                text: response.data.reply,
                isUser: false,
            });
            return {
                userMessage: userMessage.toJSON(),
                botMessage: botMessage.toJSON(),
                messages: this.chatModel.getMessages(),
            };
        }

        const errorMessage = this.chatModel.addMessage({
            text: 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau.',
            isUser: false,
        });

        return {
            userMessage: userMessage.toJSON(),
            botMessage: errorMessage.toJSON(),
            messages: this.chatModel.getMessages(),
        };
    }

    getMessages() {
        return this.chatModel.getMessages();
    }

    clearChat() {
        this.chatModel.clearMessages();
        this.ensureWelcomeMessage();
    }
}

export default ChatController;