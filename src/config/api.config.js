function envBool(v, fallback) {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase().trim();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return fallback;
}

// ===== CHỈ CẦN SỬA DÒNG NÀY ĐỂ CHUYỂN SANG API THẬT =====
export const USE_MOCK_DATA = envBool(process.env.EXPO_PUBLIC_USE_MOCK_DATA, true); // false khi có API thật

/**
 * Chat qua Agent API (SSE) theo tài liệu Seinetime — cần Bearer token (apiClient).
 * Khi false: chat dùng mock / DataService như cũ.
 */
export const USE_AGENT_CHAT = envBool(process.env.EXPO_PUBLIC_USE_AGENT_CHAT, false);

/** Agent: conversations, messages SSE, artifacts, citations (§3, §4) */
export const AGENT_API_URL =
    process.env.EXPO_PUBLIC_AGENT_API_URL || 'https://agent.next.seinetime.ai';

/** Core platform: auth, connectors (§2, §7.6.5) — dùng khi tích hợp login thật */
export const CORE_API_URL =
    process.env.EXPO_PUBLIC_CORE_API_URL || 'https://api.next.seinetime.ai';

/**
 * true: đăng nhập/đăng ký giả lập (token mock).
 * false: gọi Core API — token thật từ login/refresh (§2.1–§2.2).
 */
export const USE_MOCK_AUTH = envBool(process.env.EXPO_PUBLIC_USE_MOCK_AUTH, true);

/** Lấy dữ liệu SQL qua Core connector query (§7.6.5). */
export const USE_SQL_CONNECTOR = envBool(process.env.EXPO_PUBLIC_USE_SQL_CONNECTOR, false);

/** Connector id dùng để chạy query. */
export const CONNECTOR_ID = process.env.EXPO_PUBLIC_CONNECTOR_ID || '';

/** SQL strings (nên trả đúng tên cột để map thẳng ra UI). */
export const SQL_QUERIES = {
    statistics: process.env.EXPO_PUBLIC_SQL_STATISTICS || '',
    overview: process.env.EXPO_PUBLIC_SQL_OVERVIEW || '',
    news: process.env.EXPO_PUBLIC_SQL_NEWS || '',
    user: process.env.EXPO_PUBLIC_SQL_USER || '',
};

/**
 * Danh sách mục "Nhận nhiệm vụ".
 * Sửa trong .env: EXPO_PUBLIC_TASK_UNITS="Trung Ương giao|Thành uỷ|UBND Thành phố|HĐND Thành phố"
 * hoặc thêm "Ủy ban MTTQ Việt Nam Thành phố" nếu muốn hiển thị mục này.
 */
/**
 * Danh sách mục "Nhận nhiệm vụ" có thể gộp nhiều LOAICAPCHA.
 *
 * Format:
 * EXPO_PUBLIC_TASK_UNIT_DEFS="Label::SQL_FILTER|Label2::SQL_FILTER2|..."
 *
 * Ví dụ gộp Trung Ương giao + Thành uỷ:
 * "Trung Ương giao Thành uỷ::LOAICAPCHA IN (N'Trung Ương giao',N'Thành uỷ')|UBND Thành phố::LOAICAPCHA = N'UBND Thành phố'|..."
 */
export const TASK_UNIT_DEFS = (process.env.EXPO_PUBLIC_TASK_UNIT_DEFS || '')
    .split('|')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
        const [label, filter] = chunk.split('::');
        return { label: (label || '').trim(), filter: (filter || '').trim() };
    })
    .filter((x) => x.label && x.filter);

export const TASK_UNITS =
    TASK_UNIT_DEFS.length > 0
        ? TASK_UNIT_DEFS.map((d) => d.label)
        : (process.env.EXPO_PUBLIC_TASK_UNITS ||
              'Trung Ương giao|Thành uỷ|UBND Thành phố|HĐND Thành phố')
              .split('|')
              .map((s) => s.trim())
              .filter(Boolean);

/** Đường dẫn auth Core (nối sau CORE_API_URL, có dấu / đầu). */
export const CORE_AUTH_PATHS = {
    login: '/api/v1/authentication/login',
    refresh: '/api/v1/authentication/refresh',
    /** Tài liệu SSE không mô tả đăng ký; chỉnh nếu backend của bạn khác. */
    register: '/api/v1/authentication/register',
};

/** Mã agent tùy chọn gửi trong body (§3.1). Để undefined nếu dùng agent mặc định server. */
export const AGENT_CODE = undefined;

// API Endpoints
export const API_ENDPOINTS = {
    BASE_URL: 'https://api.hanobrain.vn/v1',
    LOGIN: '/auth/login',
    STATISTICS: '/statistics',
    OVERVIEW: '/statistics/overview',
    NEWS: '/news',
    USER_INFO: '/user/info',
    CHAT_SEND: '/chat/send',
    CHAT_HISTORY: '/chat/history',
};

// Cấu hình request
export const API_CONFIG = {
    timeout: 30000,
    retryCount: 3,
    retryDelay: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
};