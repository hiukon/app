/**
 * Xóa trigger tokens khỏi text và làm sạch các ký tự không mong muốn
 * Định dạng: <#:label>, </:codeName>, <@:subType=id>
 * @see Assistant — API & Data Protocol Reference §12
 */
export function removeTriggerTokens(text) {
    if (!text || typeof text !== 'string') return text || '';

    let cleaned = text;

    // 1. Xóa các trigger tokens dạng <xxx:xxx> (tất cả các dạng)
    cleaned = cleaned.replace(/<[#/@]:[^>]+>/g, '');

    // 1.5. Xóa các ký tự control và invisible characters (lấy chừng)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 2. Xóa khoảng trắng thừa trong mỗi dòng (GIỮ NGUYÊN dấu xuống dòng \n)
    cleaned = cleaned.replace(/[ \t]+/g, ' ');

    // 2.5. Xóa khoảng trắng thừa ở đầu và cuối mỗi dòng
    cleaned = cleaned
        .split('\n')
        .map(line => line.trim())
        .join('\n');

    // 3. Xóa nhiều dòng trống liên tiếp (giữ lại 1 dòng trống tối đa)
    cleaned = cleaned.replace(/\n\n+/g, '\n\n');

    // 4. Chuẩn hóa danh sách Markdown
    // AI thường hay viết dính lẹo "-**Từ khóa**". Markdown bắt buộc phải là "- **Từ khóa**".
    cleaned = cleaned.replace(/^-\s*/gm, '- ');

    // 4.5. Chuẩn hóa danh sách đánh số
    cleaned = cleaned.replace(/^\d+\.\s*/gm, (match) => {
        const num = match.match(/^\d+/)[0];
        return num + '. ';
    });

    // 4.6. Chuyển các mention @[]() thành chỉ tên hiển thị
    cleaned = cleaned.replace(/@\[(.*?)\]\([^\)]+\)/g, '$1');

    // 5. Loại bỏ khoảng trắng thừa ở hai đầu
    return cleaned.trim();
}