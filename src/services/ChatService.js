class ChatService {
    async sendMessage(message) {
        // Mock AI response
        return new Promise((resolve) => {
            setTimeout(() => {
                const responses = [
                    'Cảm ơn bạn! Tôi sẽ xử lý yêu cầu này.',
                    'Thông tin đã được ghi nhận.',
                    'Bạn cần tôi hỗ trợ thêm gì không?',
                    'Tôi đang kiểm tra dữ liệu cho bạn.',
                ];
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                resolve(randomResponse);
            }, 500);
        });
    }

    async getChatHistory(userId) {
        // Fetch chat history from API
        try {
            // const response = await apiClient.get(`/chat/history/${userId}`);
            // return response.data;
            return [];
        } catch (error) {
            console.error('Error fetching chat history:', error);
            return [];
        }
    }
}

export default new ChatService();