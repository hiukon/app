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
    constructor() {
        this._cachedConnectorId = null;
    }

    // Fetch the first active connector for the logged-in user's partner.
    async _discoverConnectorId() {
        const token = apiClient.getAuthToken();
        if (!token) return null;
        try {
            const res = await fetch(`${coreBaseUrl()}/api/v1/connectors`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            const json = await res.json().catch(() => ({}));
            if (json.code === 200 && Array.isArray(json.data) && json.data.length > 0) {
                const active = json.data.find((c) => c.status === 'active') || json.data[0];
                return active.id || null;
            }
        } catch {
            // ignore, fall back to config
        }
        return null;
    }

    // Returns the connector ID to use: cached discovery > config fallback.
    async _resolveConnectorId(preferredId) {
        // Caller explicitly passed a non-default ID — use it directly.
        if (preferredId && preferredId !== CONNECTOR_ID) return preferredId;

        if (this._cachedConnectorId) return this._cachedConnectorId;

        const discovered = await this._discoverConnectorId();
        if (discovered) {
            this._cachedConnectorId = discovered;
            return discovered;
        }

        // Fall back to .env value
        return preferredId || CONNECTOR_ID;
    }

    clearCache() {
        this._cachedConnectorId = null;
    }

    /**
     * POST {CORE_API_URL}/api/v1/connector/{connector_id}/query
     * Auto-discovers the connector for the current user if needed.
     */
    async query(sql, connectorId = CONNECTOR_ID, params = {}) {
        if (!sql || !String(sql).trim()) throw new Error('Missing SQL query');

        let token = apiClient.getAuthToken();
        if (!token) {
            await AuthService.bootstrapSession().catch(() => {});
            token = apiClient.getAuthToken();
        }
        if (!token) throw new Error('Missing access token (login required)');

        const resolvedId = await this._resolveConnectorId(connectorId);
        if (!resolvedId) throw new Error('Missing CONNECTOR_ID');

        const finalQuery = resolveQueryTemplateWithParams(sql, params);

        const runOnce = async (id) => {
            const currentToken = apiClient.getAuthToken();
            if (!currentToken) throw new Error('Missing access token (login required)');

            const res = await fetch(
                `${coreBaseUrl()}/api/v1/connector/${id}/query`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        Authorization: `Bearer ${currentToken}`,
                    },
                    body: JSON.stringify({ query: finalQuery }),
                }
            );

            const json = await res.json().catch(() => ({}));
            const errMsg = json.msg || json.message || '';
            return { res, json, errMsg };
        };

        let { res, json, errMsg } = await runOnce(resolvedId);

        if (!res.ok || json.code !== 200) {
            if (isLikelyAuthFailure(res.status, errMsg)) {
                const refreshed = await AuthService.refreshAccessToken();
                if (refreshed.success) {
                    const second = await runOnce(resolvedId);
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
