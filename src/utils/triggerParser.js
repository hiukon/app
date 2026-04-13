/**
 * Xóa trigger tokens khỏi text
 * Định dạng: <#:label>, </:codeName>, <@:subType=id>
 * @see Assistant — API & Data Protocol Reference §12
 */
export function removeTriggerTokens(text) {
    if (!text || typeof text !== 'string') return text || '';

    // Xóa tất cả trigger tokens dạng <xxx:xxx>
    const cleaned = text.replace(/<(#|\/|@):[^>]+>/g, '');

    // Xóa khoảng trắng thừa
    return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Kiểm tra text có chứa trigger token không
 */
export function hasTriggerTokens(text) {
    if (!text) return false;
    return /<(#|\/|@):[^>]+>/g.test(text);
}