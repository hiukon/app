import {
    USE_SQL_CONNECTOR,
    SQL_QUERIES,
    TASK_UNITS,
    TASK_UNIT_DEFS,
    API_ENDPOINTS,
} from '../config/api.config';
import ConnectorService from './connector/ConnectorService';
import AuthService from './AuthService';
import apiClient from './api/apiClient';

const DEFAULT_NEWS = [];
const DEFAULT_FEATURES = [
    { id: 1, name: 'Báo cáo thống kê', icon: 'bar-chart', color: '#2563eb' },
    { id: 2, name: 'Quản lý công việc', icon: 'assignment', color: '#10b981' },
    { id: 3, name: 'Lịch họp', icon: 'event', color: '#f59e0b' },
    { id: 4, name: 'Tài liệu nội bộ', icon: 'folder', color: '#ef4444' },
];
const DEFAULT_APP_INFO = {
    version: '1.0.0',
    company: 'HaNoiBrain',
    supportEmail: 'support@hanobrain.vn',
    hotline: '',
};

function normalizeKhoiLabel(raw) {
    const s = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!s) return s;

    // Chuẩn hoá nhãn theo đúng UI mong muốn
    if (s === 'Ủy ban MTTQ Việt Nam thành phố Hà Nội') return 'Ủy ban MTTQ Việt Nam Thành phố';
    if (s === 'Ủy ban MTTQ Việt Nam Thành phố Hà Nội') return 'Ủy ban MTTQ Việt Nam Thành phố';
    if (s === 'Ủy ban MTTQ Việt Nam Thành phố') return 'Ủy ban MTTQ Việt Nam Thành phố';

    return s;
}

function pickFirstNumber(obj, keys, fallback = 0) {
    for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null && v !== '') return Number(v) || 0;
    }
    return fallback;
}

function normalizeOverviewRow(row) {
    const r = row || {};
    return {
        totalCHTSapQuaHan: pickFirstNumber(r, ['totalCHTSapQuaHan', 'CHT_SAP_QUA_HAN']),
        totalHTQuaHan: pickFirstNumber(r, ['totalHTQuaHan', 'HT_QUA_HAN']),
        totalCTHQuaHan: pickFirstNumber(r, ['totalCTHQuaHan', 'CHT_QUA_HAN']),
    };
}

function normalizeStatisticsRows(rows = []) {
    return (rows || []).map((r, idx) => {
        const cthQuaHan = pickFirstNumber(r, ['cthQuaHan', 'CHT_QUA_HAN', 'chua_hoan_thanh_qua_han']);
        const cthSapQuaHan = pickFirstNumber(r, ['cthSapQuaHan', 'CHT_SAP_QUA_HAN', 'chua_hoan_thanh_sap_qua_han']);
        const cthTrongHan = pickFirstNumber(r, ['cthTrongHan', 'CHT_TRONG_HAN', 'chua_hoan_thanh_trong_han']);
        const htQuaHan = pickFirstNumber(r, ['htQuaHan', 'HT_QUA_HAN', 'da_hoan_thanh_qua_han']);
        const htDungHan = pickFirstNumber(r, ['htDangKy', 'htDungHan', 'HT_DUNG_HAN', 'da_hoan_thanh_dung_han']);
        const total = pickFirstNumber(r, ['total', 'TONG', 'tong_so_nhiem_vu']);
        const nameRaw =
            r.name ||
            r.title ||
            r.KHOI ||
            r.khoi ||
            r.Khoi ||
            r.LOAICAPCHA ||
            r.loaiCapCha ||
            `Nhóm ${idx + 1}`;
        const name = normalizeKhoiLabel(nameRaw);
        return {
            id: r.id || r.ID || `${idx + 1}`,
            name,
            cthQuaHan,
            cthSapQuaHan,
            cthTrongHan,
            htQuaHan,
            htDangKy: htDungHan,
            total,
            status: cthQuaHan > 0 ? 'danger' : cthSapQuaHan > 0 ? 'warning' : 'normal',
        };
    });
}

function normalizeOneStatisticsRow(row, unitName, index) {
    const r = row || {};
    const cthQuaHan = pickFirstNumber(r, ['cthQuaHan', 'CHT_QUA_HAN', 'chua_hoan_thanh_qua_han']);
    const cthSapQuaHan = pickFirstNumber(r, ['cthSapQuaHan', 'CHT_SAP_QUA_HAN', 'chua_hoan_thanh_sap_qua_han']);
    const cthTrongHan = pickFirstNumber(r, ['cthTrongHan', 'CHT_TRONG_HAN', 'chua_hoan_thanh_trong_han']);
    const htQuaHan = pickFirstNumber(r, ['htQuaHan', 'HT_QUA_HAN', 'da_hoan_thanh_qua_han']);
    const htDungHan = pickFirstNumber(r, ['htDangKy', 'htDungHan', 'HT_DUNG_HAN', 'da_hoan_thanh_dung_han']);
    const total = pickFirstNumber(r, ['total', 'TONG', 'tong_so_nhiem_vu']);
    return {
        id: r.id || r.ID || `${index + 1}`,
        name: normalizeKhoiLabel(unitName),
        cthQuaHan,
        cthSapQuaHan,
        cthTrongHan,
        htQuaHan,
        htDangKy: htDungHan,
        total,
        status: cthQuaHan > 0 ? 'danger' : cthSapQuaHan > 0 ? 'warning' : 'normal',
    };
}

class DataService {
    async getUserInfo() {
        const authUser = AuthService.getCurrentUser();
        if (authUser) return { success: true, data: authUser };
        if (USE_SQL_CONNECTOR && SQL_QUERIES.user) {
            try {
                const { records } = await ConnectorService.query(SQL_QUERIES.user);
                return { success: true, data: records?.[0] || null };
            } catch (e) {
                return { success: false, error: e.message, data: null };
            }
        }
        // Không gọi /user/info mặc định vì nhiều môi trường không có endpoint này.
        return { success: true, data: null };
    }

    async getOverviewStats(filters = {}) {
        if (!USE_SQL_CONNECTOR || !SQL_QUERIES.overview) {
            return {
                success: false,
                error: 'Chưa cấu hình SQL overview (EXPO_PUBLIC_SQL_OVERVIEW).',
                data: null,
            };
        }
        try {
            const { records } = await ConnectorService.query(
                SQL_QUERIES.overview,
                undefined,
                { MONTHKEY: filters.monthKey }
            );
            return { success: true, data: normalizeOverviewRow(records?.[0] || {}) };
        } catch (e) {
            return { success: false, error: e.message, data: null };
        }
    }

    async getStatistics(filters = {}) {
        if (!USE_SQL_CONNECTOR || !SQL_QUERIES.statistics) {
            return {
                success: false,
                error: 'Chưa cấu hình SQL statistics (EXPO_PUBLIC_SQL_STATISTICS).',
                data: null,
            };
        }
        try {
            // Ưu tiên định nghĩa theo filter nếu có (hỗ trợ gộp nhiều LOAICAPCHA).
            if (TASK_UNIT_DEFS?.length && SQL_QUERIES.statistics.includes('{{UNIT_FILTER}}')) {
                const rows = [];
                for (let i = 0; i < TASK_UNIT_DEFS.length; i += 1) {
                    const def = TASK_UNIT_DEFS[i];
                    const { records } = await ConnectorService.query(
                        SQL_QUERIES.statistics,
                        undefined,
                        { MONTHKEY: filters.monthKey, UNIT_FILTER: def.filter }
                    );
                    rows.push(normalizeOneStatisticsRow(records?.[0] || {}, def.label, i));
                }
                return { success: true, data: rows };
            }

            // Fallback: query theo từng đơn vị nếu có token {{UNIT_NAME}}.
            if (SQL_QUERIES.statistics.includes('{{UNIT_NAME}}')) {
                const rows = [];
                for (let i = 0; i < TASK_UNITS.length; i += 1) {
                    const unitName = TASK_UNITS[i];
                    const { records } = await ConnectorService.query(
                        SQL_QUERIES.statistics,
                        undefined,
                        { MONTHKEY: filters.monthKey, UNIT_NAME: unitName }
                    );
                    rows.push(normalizeOneStatisticsRow(records?.[0] || {}, unitName, i));
                }
                return { success: true, data: rows };
            }

            const { records } = await ConnectorService.query(
                SQL_QUERIES.statistics,
                undefined,
                { MONTHKEY: filters.monthKey }
            );
            return { success: true, data: normalizeStatisticsRows(records || []) };
        } catch (e) {
            return { success: false, error: e.message, data: null };
        }
    }

    async getNews() {
        if (USE_SQL_CONNECTOR && SQL_QUERIES.news) {
            try {
                const { records } = await ConnectorService.query(SQL_QUERIES.news);
                return { success: true, data: records || [] };
            } catch (e) {
                return { success: true, data: DEFAULT_NEWS, warning: `News fallback: ${e.message}` };
            }
        }
        return { success: true, data: DEFAULT_NEWS };
    }

    async getExploreFeatures() {
        // Màn Khám phá hiện dùng dữ liệu cấu hình nội bộ.
        return { success: true, data: DEFAULT_FEATURES };
    }

    async getAppInfo() {
        return { success: true, data: DEFAULT_APP_INFO };
    }

    async sendChatMessage(message) {
        try {
            const response = await apiClient.post(API_ENDPOINTS.CHAT_SEND, { message });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export default new DataService();