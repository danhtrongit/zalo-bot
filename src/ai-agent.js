const axios = require('axios');
require('dotenv').config();
const { dao } = require('./database');

const AI_PROXY_URL = process.env.AI_PROXY_URL || 'http://160.22.123.174:8317/';
const AI_API_KEY = process.env.AI_API_KEY || 'sk-Nj5w9O5aaISOZ1DHT';
const AI_MODEL = process.env.AI_MODEL || 'gpt-5.3-codex';

const SYSTEM_PROMPT = `Bạn là "Bot Quản Lý Chi Tiêu" của công ty VIETNEW ENTERTAINMENT - một công ty giải trí, sản xuất phim.

## VAI TRÒ:
Bạn là trợ lý AI chuyên hỗ trợ ghi nhận và quản lý chi tiêu cho công ty. Bạn giao tiếp bằng tiếng Việt, thân thiện, chuyên nghiệp.

## DANH MỤC CHI TIÊU CÓ SẴN:
1. Thiết bị & Công nghệ
2. Văn phòng phẩm
3. Di chuyển & Vận chuyển
4. Ăn uống & Tiếp khách
5. Marketing & Quảng cáo
6. Nhân sự & Lương
7. Thuê mặt bằng
8. Sản xuất phim
9. Hậu kỳ & Dựng phim
10. Bản quyền & Pháp lý
11. Điện, nước, Internet
12. Khác

## NHIỆM VỤ CHÍNH:
1. **Ghi nhận chi tiêu**: Khi user báo chi tiêu, hãy trích xuất thông tin và trả về JSON.
2. **Xem báo cáo**: Khi user hỏi về tổng chi tiêu, trả lời dựa trên dữ liệu.
3. **Tư vấn**: Đưa ra gợi ý tiết kiệm, cảnh báo vượt ngân sách.
4. **Hỗ trợ chung**: Trả lời các câu hỏi liên quan đến quản lý chi tiêu.

## QUY TẮC TRÍCH XUẤT CHI TIÊU:
Khi user nhập chi tiêu, trích xuất và trả về **ĐÚNG FORMAT JSON** như sau:
\`\`\`json
{"action":"add_expense","data":{"description":"mô tả ngắn","amount":số tiền (number),"category":"tên danh mục","note":"ghi chú thêm nếu có"}}
\`\`\`

Ví dụ:
- User: "mua máy quay 50 triệu" → {"action":"add_expense","data":{"description":"Mua máy quay phim","amount":50000000,"category":"Sản xuất phim","note":""}}
- User: "ăn trưa team 2tr5" → {"action":"add_expense","data":{"description":"Ăn trưa team","amount":2500000,"category":"Ăn uống & Tiếp khách","note":""}}
- User: "thuê studio quay phim 15tr" → {"action":"add_expense","data":{"description":"Thuê studio quay phim","amount":15000000,"category":"Sản xuất phim","note":""}}

## QUY TẮC SỐ TIỀN:
- "50 triệu" = 50000000
- "2tr5" hoặc "2.5tr" = 2500000
- "500k" = 500000
- "1 tỷ" = 1000000000
- Nếu không có đơn vị, mặc định là VND

## QUY TẮC QUAN TRỌNG:
- NẾU user yêu cầu ghi chi tiêu → PHẢI trả về JSON với action "add_expense"
- NẾU user hỏi báo cáo/tổng kết → trả về action "get_report" 
- NẾU user hỏi thông tin chung → trả lời bình thường (không JSON)
- Luôn xác nhận lại chi tiêu sau khi ghi nhận
- Đơn vị tiền tệ mặc định là VND
- Khi không chắc về danh mục, chọn "Khác"`;

async function callAI(messages) {
    try {
        const url = AI_PROXY_URL.endsWith('/')
            ? AI_PROXY_URL + 'v1/chat/completions'
            : AI_PROXY_URL + '/v1/chat/completions';

        const response = await axios.post(url, {
            model: AI_MODEL,
            messages: messages,
            temperature: 0.3,
            max_tokens: 1024,
        }, {
            headers: {
                'Authorization': `Bearer ${AI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('[AI Error]', error.message);
        if (error.response) {
            console.error('[AI Response Error]', error.response.status, error.response.data);
        }
        return null;
    }
}

async function processMessage(userId, userName, userMessage) {
    // Save user message to history
    dao.addChatMessage(userId, 'user', userMessage);

    // Get recent chat history for context
    const history = dao.getChatHistory(userId, 6);

    // Get current stats for context
    const stats = dao.getDashboardStats();

    const contextMessage = `
[THỐNG KÊ HIỆN TẠI]
- Chi tiêu hôm nay: ${formatCurrency(stats.today.total)} (${stats.today.count} giao dịch)
- Chi tiêu tháng này: ${formatCurrency(stats.month.total)} (${stats.month.count} giao dịch)
- Tổng tất cả: ${formatCurrency(stats.all_time.total)} (${stats.all_time.count} giao dịch)
`;

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT + '\n' + contextMessage },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: userMessage }
    ];

    const aiResponse = await callAI(messages);

    if (!aiResponse) {
        return 'Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau! 🙏';
    }

    // Try to parse JSON action from AI response
    let reply = aiResponse;

    try {
        // Check if response contains JSON
        const jsonMatch = aiResponse.match(/\{[\s\S]*"action"[\s\S]*\}/);
        if (jsonMatch) {
            const actionData = JSON.parse(jsonMatch[0]);

            if (actionData.action === 'add_expense') {
                const { description, amount, category, note } = actionData.data;

                // Find category
                let cat = dao.getCategoryByName(category);
                if (!cat) {
                    // Try partial match
                    const allCats = dao.getAllCategories();
                    cat = allCats.find(c => c.name.toLowerCase().includes(category.toLowerCase())) ||
                        allCats.find(c => c.name === 'Khác');
                }

                // Save expense
                const expenseId = dao.addExpense({
                    category_id: cat ? cat.id : null,
                    description,
                    amount,
                    currency: 'VND',
                    note: note || '',
                    zalo_user_id: userId,
                    zalo_user_name: userName,
                    created_by: 'bot'
                });

                reply = `✅ Đã ghi nhận chi tiêu!\n\n` +
                    `📝 ${description}\n` +
                    `💰 ${formatCurrency(amount)}\n` +
                    `📂 ${cat ? cat.icon + ' ' + cat.name : 'Chưa phân loại'}\n` +
                    (note ? `📌 ${note}\n` : '') +
                    `🆔 Mã: #${expenseId}\n\n` +
                    `Nhập thêm chi tiêu hoặc gõ "báo cáo" để xem tổng kết.`;

            } else if (actionData.action === 'get_report') {
                const summary = dao.getExpenseSummary();
                const stats = dao.getDashboardStats();

                reply = `📊 BÁO CÁO CHI TIÊU - VIETNEW ENTERTAINMENT\n` +
                    `━━━━━━━━━━━━━━━━━━━\n\n` +
                    `📅 Hôm nay: ${formatCurrency(stats.today.total)} (${stats.today.count} giao dịch)\n` +
                    `📅 Tháng này: ${formatCurrency(stats.month.total)} (${stats.month.count} giao dịch)\n` +
                    `📅 Tổng cộng: ${formatCurrency(stats.all_time.total)} (${stats.all_time.count} giao dịch)\n\n`;

                if (summary.by_category.length > 0) {
                    reply += `📂 THEO DANH MỤC:\n`;
                    summary.by_category.forEach(cat => {
                        const percentage = summary.total_amount > 0
                            ? ((cat.total / summary.total_amount) * 100).toFixed(1)
                            : '0';
                        reply += `${cat.icon} ${cat.name}: ${formatCurrency(cat.total)} (${percentage}%)\n`;
                    });
                }

                reply += `\n💡 Xem dashboard chi tiết tại trang quản lý.`;
            }
        }
    } catch (parseError) {
        // AI response is plain text, use as-is
        console.log('[AI] Plain text response, no JSON action');
    }

    // Save bot response
    dao.addChatMessage(userId, 'assistant', reply);

    return reply;
}

function formatCurrency(amount) {
    if (!amount || amount === 0) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

module.exports = { processMessage, callAI, formatCurrency };
