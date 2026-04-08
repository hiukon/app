import apiClient from './api/apiClient';
import { API_ENDPOINTS } from '../config/api.config';
import { MOCK_DATA, mockApiDelay } from '../config/mockData';

class AuthService {
    async login(username, password) {
        if (true) { // Mock login
            await mockApiDelay();
            if (username === 'admin' && password === '123456') {
                const userData = MOCK_DATA.user;
                apiClient.setAuthToken('mock-token-12345');
                return { success: true, data: userData };
            }
            return { success: false, error: 'Sai tài khoản hoặc mật khẩu' };
        }

        try {
            const response = await apiClient.post(API_ENDPOINTS.LOGIN, { username, password });
            apiClient.setAuthToken(response.data.token);
            return { success: true, data: response.data.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async logout() {
        apiClient.setAuthToken(null);
        return { success: true };
    }
}

export default new AuthService();