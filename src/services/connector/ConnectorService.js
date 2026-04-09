import { CONNECTOR_ID, CORE_API_URL } from '../../config/api.config';
import apiClient from '../api/apiClient';
import AuthService from '../AuthService';

function isLikelyAuthFailure(status, msg) {
    if (status === 401 || status === 403) return true;
    const t = `${msg || ''}`.toLowerCase();
    return (
        /unauthoriz|token|expired|invalid|hết hạn|hết hạn token|jwt|bearer/i.test(t) &&
        !/syntax|sql|query|column|table|object/i.test(t)
    );
}

function coreBaseUrl() {
    return (CORE_API_URL || '').replace(/\/$/, '');
}

function rowsToRecords(columns, rows) {
    if (!Array.isArray(columns) || !Array.isArray(rows)) return [];
    return rows.map((r) => {
        const obj = {};
        for (let i = 0; i < columns.length; i += 1) obj[columns[i]] = r[i];
        return obj;
    });
}

function currentMonthKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
}

function resolveQueryTemplate(sql) {
    return resolveQueryTemplateWithParams(sql, {});
}

function resolveQueryTemplateWithParams(sql, params = {}) {
    const q = String(sql || '');
    let out = q
        .replace(/\{\{\s*CURRENT_MONTHKEY\s*\}\}/g, currentMonthKey())
        .replace(/\{\{\s*CURRENT_YYYYMM\s*\}\}/g, currentMonthKey());
    const monthKey = params?.MONTHKEY ? String(params.MONTHKEY) : '';
    const year = monthKey && monthKey.length >= 4 ? monthKey.slice(0, 4) : '';
    if (year) {
        out = out
            .replace(/\{\{\s*YEAR\s*\}\}/g, year)
            .replace(/\{\{\s*YEAR_START_MONTHKEY\s*\}\}/g, `${year}01`);
    }
    Object.entries(params || {}).forEach(([k, v]) => {
        const safe = v === undefined || v === null ? '' : String(v);
        const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
        out = out.replace(re, safe);
    });
    return out;
}

class ConnectorService {
    /**
     * POST {CORE_API_URL}/api/v1/connector/{connector_id}/query
     * Body: { query: "<sql>" }
     * Nếu 401/403 hoặc lỗi token: thử refresh (§2.2) rồi gọi lại tối đa 1 lần.
     */
    async query(sql, connectorId = CONNECTOR_ID, params = {}) {
        if (!connectorId) throw new Error('Missing CONNECTOR_ID');
        if (!sql || !String(sql).trim()) throw new Error('Missing SQL query');

        const finalQuery = resolveQueryTemplateWithParams(sql, params);

        const runOnce = async () => {
            const token = apiClient.getAuthToken();
            if (!token) throw new Error('Missing access token (login required)');

            const res = await fetch(
                `${coreBaseUrl()}/api/v1/connector/${connectorId}/query`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ query: finalQuery }),
                }
            );

            const json = await res.json().catch(() => ({}));
            const errMsg = json.msg || json.message || '';
            return { res, json, errMsg };
        };

        let { res, json, errMsg } = await runOnce();

        if (!res.ok || json.code !== 200) {
            if (isLikelyAuthFailure(res.status, errMsg)) {
                const refreshed = await AuthService.refreshAccessToken();
                if (refreshed.success) {
                    const second = await runOnce();
                    res = second.res;
                    json = second.json;
                    errMsg = second.errMsg;
                }
            }
        }

        if (!res.ok || json.code !== 200) {
            throw new Error(errMsg || `Connector query failed (HTTP ${res.status})`);
        }

        const data = json.data || {};
        return {
            ...data,
            records: rowsToRecords(data.columns, data.rows),
        };
    }
}

export default new ConnectorService();

