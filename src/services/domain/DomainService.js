import { CORE_API_URL } from '../../config/api.config';
import apiClient from '../api/apiClient';

const DomainService = {
    getDomains: async (params = {}) => {
        try {
            const { limit = 12, type = 'file_folder', partner_id } = params;
            const baseUrl = (CORE_API_URL || '').replace(/\/$/, '');
            const query = new URLSearchParams({ limit: String(limit), type, partner_id }).toString();
            const url = `${baseUrl}/api/v1/domains?${query}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': apiClient.getAuthToken() ? `Bearer ${apiClient.getAuthToken()}` : undefined,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Get domains error:', error);
            return { code: 500, msg: 'error', data: [], pagination: {} };
        }
    }
};

export default DomainService;