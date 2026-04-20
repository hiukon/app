// src/services/tag/TagService.js
import apiClient from '../api/apiClient';

const TAG_API_URL = 'https://agent.next.seinetime.ai/api/v1/tags'; // Thay đổi URL nếu cần

class TagService {
    async getTags(params = {}) {
        try {
            const token = apiClient.getAuthToken();
            if (!token) {
                throw new Error('No auth token');
            }

            const queryParams = new URLSearchParams();
            if (params.limit) queryParams.append('limit', params.limit);
            if (params.offset) queryParams.append('offset', params.offset);
            if (params.search) queryParams.append('search', params.search);
            if (params.partner_id) queryParams.append('partner_id', params.partner_id);

            const url = `${TAG_API_URL}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Get tags error:', error);
            return { code: 500, data: [], error: error.message };
        }
    }

    // Nếu API trả về cấu trúc khác, bạn có thể điều chỉnh
    async getAvailableTags(params = {}) {
        const result = await this.getTags(params);
        // Giả sử API trả về { code: 200, data: [...] }
        if (result.code === 200 && Array.isArray(result.data)) {
            return result.data;
        }
        // Nếu API trả về trực tiếp mảng
        if (Array.isArray(result)) {
            return result;
        }
        // Nếu API trả về { tags: [...] }
        if (result.tags && Array.isArray(result.tags)) {
            return result.tags;
        }
        return [];
    }
}

export default new TagService();