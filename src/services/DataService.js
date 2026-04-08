import { USE_MOCK_DATA, API_ENDPOINTS, API_CONFIG } from '../config/api.config';
import { MOCK_DATA, mockApiDelay } from '../config/mockData';
import apiClient from './api/apiClient';

class DataService {
    constructor() {
        this.useMock = USE_MOCK_DATA;
    }

    async fetchData(endpoint, mockData, params = {}) {
        if (this.useMock) {
            await mockApiDelay();
            return { success: true, data: mockData };
        }

        try {
            const response = await apiClient.get(endpoint, params);
            return { success: true, data: response.data };
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            return { success: false, error: error.message, data: null };
        }
    }

    async getUserInfo() {
        return this.fetchData(API_ENDPOINTS.USER_INFO, MOCK_DATA.user);
    }

    async getOverviewStats() {
        return this.fetchData(API_ENDPOINTS.OVERVIEW, MOCK_DATA.overview);
    }

    async getStatistics() {
        return this.fetchData(API_ENDPOINTS.STATISTICS, MOCK_DATA.statistics);
    }

    async getNews() {
        return this.fetchData(API_ENDPOINTS.NEWS, MOCK_DATA.news);
    }

    async getExploreFeatures() {
        return this.fetchData('/explore/features', MOCK_DATA.exploreFeatures);
    }

    async getAppInfo() {
        return this.fetchData('/app/info', MOCK_DATA.appInfo);
    }

    async sendChatMessage(message) {
        if (this.useMock) {
            await mockApiDelay();
            const responses = [
                'Cảm ơn bạn! Tôi sẽ xử lý yêu cầu này.',
                'Thông tin đã được ghi nhận.',
                'Bạn cần tôi hỗ trợ thêm gì không?',
                'Tôi đang kiểm tra dữ liệu cho bạn.',
                'Đã nhận yêu cầu, tôi sẽ phản hồi sớm.'
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            return { success: true, data: { reply: randomResponse } };
        }

        try {
            const response = await apiClient.post(API_ENDPOINTS.CHAT_SEND, { message });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export default new DataService();