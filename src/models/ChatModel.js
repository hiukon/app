let localMessageSeq = 0;

function genMessageId() {
    localMessageSeq += 1;
    const t = Date.now().toString(36);
    const s = localMessageSeq.toString(36);
    return `msg-${t}-${s}`;
}

class MessageModel {
    constructor(data) {
        this.id = data.id || genMessageId();
        this.text = data.text;
        this.isUser = data.isUser || false;
        this.timestamp = data.timestamp || new Date();
        this.status = data.status || 'sent';
        this.meta = data.meta || null;
        this.isInterruptMessage = data.isInterruptMessage || false;
    }

    toJSON() {
        return {
            id: this.id,
            text: this.text,
            isUser: this.isUser,
            timestamp: this.timestamp,
            status: this.status,
            meta: this.meta,
            isInterruptMessage: this.isInterruptMessage,
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

    updateMessage(id, patch) {
        const msg = this.messages.find((m) => m.id === id);
        if (!msg) return;
        Object.assign(msg, patch);
    }

    removeMessage(id) {
        this.messages = this.messages.filter((m) => m.id !== id);
    }

    getMessages() {
        return this.messages.map(msg => msg.toJSON());
    }

    clearMessages() {
        this.messages = [];
    }
}

export { MessageModel, ChatModel };