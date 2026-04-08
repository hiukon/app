class MessageModel {
    constructor(data) {
        this.id = data.id || Date.now().toString();
        this.text = data.text;
        this.isUser = data.isUser || false;
        this.timestamp = data.timestamp || new Date();
        this.status = data.status || 'sent';
    }

    toJSON() {
        return {
            id: this.id,
            text: this.text,
            isUser: this.isUser,
            timestamp: this.timestamp,
            status: this.status
        };
    }
}

class ChatModel {
    constructor() {
        this.messages = [];
        this.isTyping = false;
    }

    addMessage(message) {
        const newMessage = new MessageModel(message);
        this.messages.push(newMessage);
        return newMessage;
    }

    getMessages() {
        return this.messages.map(msg => msg.toJSON());
    }

    clearMessages() {
        this.messages = [];
    }
}

export { MessageModel, ChatModel };