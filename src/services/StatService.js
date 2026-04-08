import apiClient from './api/apiClient';
import StatModel from '../models/StatModel';

class StatService {
    async fetchStatistics() {
        try {
            // Mock data - thay bằng API call thực tế
            const mockData = [
                { name: 'UỶ BAN KIỂM TRA', cthQuaHan: 1, cthSapQuaHan: 0, cthTrongHan: 14, htQuaHan: 0, htDangKy: 1 },
                { name: 'THƯỜNG TRỰC', cthQuaHan: 0, cthSapQuaHan: 0, cthTrongHan: 1, htQuaHan: 0, htDangKy: 0 },
                { name: 'BAN TUYÊN GIÁO VÀ DÂN VẬN', cthQuaHan: 0, cthSapQuaHan: 0, cthTrongHan: 13, htQuaHan: 1, htDangKy: 9 },
                { name: 'ĐẢNG BỘ TRỰC THUỘC', cthQuaHan: 56, cthSapQuaHan: 1, cthTrongHan: 1165, htQuaHan: 127, htDangKy: 1239 },
                { name: 'BAN NỘI CHÍNH', cthQuaHan: 1, cthSapQuaHan: 0, cthTrongHan: 12, htQuaHan: 3, htDangKy: 16 },
            ];

            // Convert to Model instances
            return mockData.map(item => new StatModel(item).toJSON());

            // Real API call:
            // const response = await apiClient.get('/statistics');
            // return response.data.map(item => new StatModel(item).toJSON());
        } catch (error) {
            console.error('Error fetching statistics:', error);
            throw error;
        }
    }

    async getOverviewStats() {
        const stats = await this.fetchStatistics();
        return {
            totalCHTSapQuaHan: stats.reduce((sum, s) => sum + s.cthSapQuaHan, 0),
            totalHTQuaHan: stats.reduce((sum, s) => sum + s.htQuaHan, 0),
            totalCTHQuaHan: stats.reduce((sum, s) => sum + s.cthQuaHan, 0),
        };
    }
}

export default new StatService();