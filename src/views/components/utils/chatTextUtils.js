// Text processing utilities shared by chat components

export const convertTokensToDisplayWithMap = (text, domainIdToCodeMap) => {
    if (!text) return '';
    let converted = text;
    converted = converted.replace(/<\/([^>]+)>/g, (match, code) => {
        const cleanCode = code.replace(/^:/, '');
        return `/${cleanCode}`;
    });
    converted = converted.replace(/<@:domain=([^>]+)>/g, (match, id) => {
        const codeName = domainIdToCodeMap?.[id];
        return codeName ? `@${codeName}` : match;
    });
    converted = converted.replace(/<#:(.*?)>/g, '#$1');
    return converted;
};

export const sanitizeTechnicalText = (text) => {
    if (!text) return '';
    const patterns = [/syntaxerror/i, /traceback/i, /exception/i, /http\s*\d{3}/i];
    return patterns.some(p => p.test(text)) ? 'Đã có lỗi xảy ra. Vui lòng thử lại.' : text;
};

const PROCESS_PATTERNS = [
    'tôi đã trả về phản hồi không hợp lệ', 'để tôi thử lại', 'tìm kiếm báo cáo',
    'tìm kiếm thông tin', 'người dùng muốn biết', 'tìm kiếm kỹ năng', 'observe the result',
    'dựa trên kết quả', 'theo hướng dẫn', 'tôi sẽ tổng hợp', 'tôi cần tìm kiếm',
    'tôi đã tìm kiếm', 'sau khi tìm kiếm', 'tìm thấy kỹ năng', 'kích hoạt kỹ năng', 'cortex',
    'tôi sẽ tìm kiếm', 'tôi sẽ tra cứu', 'tôi sẽ kiểm tra', 'tôi sẽ thực hiện',
    'tôi sẽ xem xét', 'tôi cần tìm', 'tôi đang tìm kiếm', 'tôi đang thực hiện',
    'tôi đang xử lý', 'tôi đang phân tích', 'thực hiện tìm kiếm', 'thực hiện kế hoạch',
    'kế hoạch hành động', 'đang thực hiện bước', 'bước tiếp theo là', 'hãy để tôi tìm',
    'cho phép tôi tìm', 'tôi sẽ sử dụng công cụ', 'gọi công cụ', 'calling tool',
    'xác nhận chế độ', 'xác nhận ngữ cảnh', 'chế độ tài liệu', 'document mode',
    'ngữ cảnh tài liệu', 'vui lòng xác nhận', 'để tôi hiểu rõ hơn ngữ cảnh',
    'bạn muốn tôi phân tích', 'bạn muốn tôi tìm kiếm trong',
    'trước khi trả lời, tôi cần', 'trước khi thực hiện',
];

export const isProcessLine = (line) => {
    const lower = line.toLowerCase().trim();
    return PROCESS_PATTERNS.some(p => lower.includes(p));
};

export const cleanBotText = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    const filtered = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return true; // giữ dòng trống để giữ ngắt đoạn
        return !isProcessLine(trimmed);
    });
    const hasRealContent = filtered.some(line => !!line.trim());
    if (!hasRealContent) return null;
    // Collapse dòng trống liên tiếp (tối đa 1 dòng trống) sau khi lọc
    return filtered.join('\n').replace(/\n{3,}/g, '\n\n');
};

export const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isCommandText = (text) => {
    if (!text) return false;
    const trimmed = text.trim();
    return trimmed.startsWith('/') || trimmed.startsWith('@') ||
        trimmed.includes('</:') || trimmed.includes('<@:');
};

export const truncateHistoryText = (text, maxLines = 2, maxChars = 100) => {
    if (!text) return '';
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    let truncated = lines.slice(0, maxLines).join('\n');
    if (truncated.length > maxChars) {
        truncated = truncated.substring(0, maxChars).trim() + '...';
    } else if (lines.length > maxLines) {
        truncated += '...';
    }
    return truncated;
};

export const formatVietnamTime = (dateString) => {
    if (!dateString) return '';
    try {
        if (typeof dateString === 'string' && dateString.startsWith('01k')) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${day}/${month} ${hours}:${minutes}`;
    } catch { return ''; }
};
