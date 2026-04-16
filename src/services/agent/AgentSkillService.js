import { AGENT_API_URL } from '../../config/api.config';
import apiClient from '../api/apiClient';

const AgentSkillService = {
    getAvailableSkills: async (params = {}) => {
        try {
            const { limit = 12, partner_id } = params;
            const baseUrl = (AGENT_API_URL || '').replace(/\/$/, '');
            const query = new URLSearchParams({ limit: String(limit), partner_id }).toString();
            const url = `${baseUrl}/api/v1/agent-skills/available?${query}`;
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
            console.error('Get skills error:', error);
            return { code: 500, msg: 'error', data: [] };
        }
    }
};

export default AgentSkillService;