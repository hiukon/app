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

export const PROCESS_PATTERNS = [
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
    const lowerText = text.toLowerCase();
    const isReportMessage =
        lowerText.includes('báo cáo') || lowerText.includes('tải xuống') ||
        lowerText.includes('.doc') || lowerText.includes('kết quả') || text.length > 500;

    if (isReportMessage) {
        const cleaned = text
            .replace(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/gi, '')
            .replace(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/gi, '')
            .trim();
        return cleaned.length > 0 ? cleaned : text;
    }

    const filteredLines = text.split('\n').filter(line => {
        const lowerLine = line.toLowerCase().trim();
        if (line.trim().length < 10) return false;
        if (isProcessLine(line)) return false;
        if (lowerLine.match(/^\d{1,2}:\d{2}:\d{2}\s*(am|pm)?$/)) return false;
        if (lowerLine.match(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/i)) return false;
        return true;
    });

    let cleaned = filteredLines.join('\n').trim();
    if (cleaned) {
        const paragraphs = cleaned.split(/\n\s*\n/).filter(p => p.trim().length >= 10);
        let chosen = '';
        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const p = paragraphs[i].trim();
            const lowerP = p.toLowerCase();
            if (!PROCESS_PATTERNS.some(pat => lowerP.includes(pat))) { chosen = p; break; }
        }
        cleaned = chosen || paragraphs[paragraphs.length - 1] || cleaned;
    }
    cleaned = cleaned?.replace(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/gi, '');
    cleaned = cleaned?.replace(/\d{1,2}:\d{2}:\d{2}\s*(am|pm)/gi, '');
    if (!cleaned || cleaned.length < 15) return null;
    return cleaned;
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
        truncated = truncated + '...';
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
