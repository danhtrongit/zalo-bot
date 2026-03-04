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
3. **Tính chi phí di chuyển**: Khi user muốn tính quãng đường / công tác phí, trả về JSON calculate_travel.
4. **Tư vấn**: Đưa ra gợi ý tiết kiệm, cảnh báo vượt ngân sách.
5. **Hỗ trợ chung**: Trả lời các câu hỏi liên quan đến quản lý chi tiêu.

## QUY TẮC TRÍCH XUẤT CHI TIÊU:

### Trường hợp 1: Một mục chi tiêu
Khi user chỉ nhập 1 chi tiêu, trả về:
\`\`\`json
{"action":"add_expense","data":{"description":"mô tả ngắn","amount":số tiền,"category":"tên danh mục","date":"YYYY-MM-DD","note":""}}
\`\`\`

### Trường hợp 2: NHIỀU mục chi tiêu (QUAN TRỌNG)
Khi user gửi danh sách nhiều mục chi tiêu (2 mục trở lên), PHẢI trả về:
\`\`\`json
{"action":"add_expenses","data":[{"description":"mô tả 1","amount":số tiền 1,"category":"danh mục","date":"YYYY-MM-DD","note":""},{"description":"mô tả 2","amount":số tiền 2,"category":"danh mục","date":"YYYY-MM-DD","note":""}]}
\`\`\`
Lưu ý: data là ARRAY chứa tất cả các mục. CHỈ trả về 1 JSON duy nhất cho tất cả.

## QUY TẮC NGÀY THÁNG (RẤT QUAN TRỌNG):
- Luôn trả về trường "date" trong JSON dưới dạng YYYY-MM-DD
- Hệ thống sẽ cung cấp [NGÀY HIỆN TẠI] ở cuối prompt, dùng ngày đó làm gốc
- "hôm nay" = ngày hiện tại
- "hôm qua" = ngày hiện tại trừ 1
- "hôm kia" = ngày hiện tại trừ 2
- "3 ngày trước" = ngày hiện tại trừ 3
- "tuần trước" = ngày hiện tại trừ 7
- "tháng trước" = tháng trước của ngày hiện tại
- "ngày 15" hoặc "15/2" = ngày 15 tháng 2 (năm hiện tại)
- Nếu user không đề cập ngày → dùng ngày hiện tại

Ví dụ (nếu hôm nay là 2026-03-03):
- User: "hôm qua ăn cơm hết 200k" → {"action":"add_expense","data":{"description":"Ăn cơm","amount":200000,"category":"Ăn uống & Tiếp khách","date":"2026-03-02","note":""}}
- User gửi danh sách 3 mục → {"action":"add_expenses","data":[...3 items...]}

## QUY TẮC SỐ TIỀN:
- "50 triệu" = 50000000
- "2tr5" hoặc "2.5tr" = 2500000
- "500k" = 500000
- "1 tỷ" = 1000000000
- "67.000" hoặc "67,000" = 67000
- Nếu không có đơn vị, mặc định là VND

## QUY TẮC QUAN TRỌNG:
- NẾU user yêu cầu ghi CHI TIÊU → PHẢI trả về JSON với action "add_expense" hoặc "add_expenses"
- NẾU user gửi DANH SÁCH nhiều mục → BẮT BUỘC dùng "add_expenses" (array)
- NẾU user hỏi báo cáo/tổng kết → trả về action "get_report"
- NẾU user muốn tính quãng đường / công tác phí / di chuyển từ A đến B → trả về action "calculate_travel"
- NẾU user hỏi thông tin chung → trả lời bình thường (không JSON)
- Luôn xác nhận lại chi tiêu sau khi ghi nhận
- Đơn vị tiền tệ mặc định là VND
- Khi không chắc về danh mục, chọn "Khác"
- LUÔN trả về trường "date" chính xác trong JSON

## TÍNH CHI PHÍ DI CHUYỂN:
Khi user muốn tính quãng đường, công tác phí, hoặc chi phí di chuyển từ điểm A đến điểm B, trả về:
\`\`\`json
{"action":"calculate_travel","data":{"origin":"địa chỉ đi đầy đủ","destination":"địa chỉ đến đầy đủ","vehicle":"car","note":"ghi chú nếu có"}}
\`\`\`

Quy tắc:
- origin và destination phải là địa chỉ cụ thể, đầy đủ (thêm thành phố/tỉnh nếu user không nói rõ)
- vehicle: "car" (ô tô, mặc định), "bike" (xe máy), "taxi" (taxi)
- Nếu user nói "xe máy" hoặc "chạy xe" → vehicle = "bike"
- Nếu user nói "taxi" hoặc "grab" → vehicle = "taxi"
- Nếu user chỉ nói km (VD: "đi 25km") mà không có địa chỉ → trả về: {"action":"calculate_travel","data":{"manual_km":25,"vehicle":"car","note":""}}
- Ví dụ: "đi từ quận 1 đến Bình Dương" → {"action":"calculate_travel","data":{"origin":"Quận 1, TP. Hồ Chí Minh","destination":"Bình Dương","vehicle":"car","note":""}}
- Ví dụ: "công tác từ văn phòng 123 Nguyễn Huệ đến KCN Tân Bình bằng xe máy" → {"action":"calculate_travel","data":{"origin":"123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh","destination":"KCN Tân Bình, TP. Hồ Chí Minh","vehicle":"bike","note":"công tác"}}
- Ví dụ: "đi 30km hôm nay" → {"action":"calculate_travel","data":{"manual_km":30,"vehicle":"car","note":""}}`;

async function callAI(messages) {
    try {
        const url = AI_PROXY_URL.endsWith('/')
            ? AI_PROXY_URL + 'v1/chat/completions'
            : AI_PROXY_URL + '/v1/chat/completions';

        const response = await axios.post(url, {
            model: AI_MODEL,
            messages: messages,
            temperature: 0.3,
            max_tokens: 4096,
        }, {
            headers: {
                'Authorization': `Bearer ${AI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
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

    // Get current date in Vietnam timezone (UTC+7)
    const now = new Date();
    const vnDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const today = vnDate.toISOString().split('T')[0];
    const dayOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][vnDate.getUTCDay()];

    const contextMessage = `
[NGÀY HIỆN TẠI: ${today} (${dayOfWeek})]
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
                const { description, amount, category, note, date } = actionData.data;

                // Find category
                let cat = dao.getCategoryByName(category);
                if (!cat) {
                    // Try partial match
                    const allCats = dao.getAllCategories();
                    cat = allCats.find(c => c.name.toLowerCase().includes(category.toLowerCase())) ||
                        allCats.find(c => c.name === 'Khác');
                }

                // Parse date from AI or default to now
                let expenseDate = null;
                if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    expenseDate = date + ' 12:00:00';
                }

                // Duplicate check
                const duplicate = dao.findDuplicateExpense(userId, amount, description);
                if (duplicate) {
                    reply = `⚠️ Chi tiêu có thể bị trùng!\n\n` +
                        `📝 "${duplicate.description}" - ${formatCurrency(duplicate.amount)}\n` +
                        `🆔 Mã: #${duplicate.id}\n` +
                        `⏰ Đã ghi nhận lúc: ${duplicate.created_at}\n\n` +
                        `Chi tiêu này rất giống với mục đã tồn tại.\n❌ Không tạo mới để tránh trùng lặp.\n\n` +
                        `💡 Nếu muốn thêm mới, hãy thay đổi mô tả hoặc số tiền.`;
                } else {

                    // Save expense
                    const expenseId = dao.addExpense({
                        category_id: cat ? cat.id : null,
                        description,
                        amount,
                        currency: 'VND',
                        note: note || '',
                        zalo_user_id: userId,
                        zalo_user_name: userName,
                        created_by: 'bot',
                        created_at: expenseDate
                    });

                    // Format display date
                    const displayDate = date || today;
                    const dateLabel = date === today ? 'Hôm nay' : displayDate;

                    reply = `✅ Đã ghi nhận chi tiêu!\n\n` +
                        `📝 ${description}\n` +
                        `💰 ${formatCurrency(amount)}\n` +
                        `📂 ${cat ? cat.icon + ' ' + cat.name : 'Chưa phân loại'}\n` +
                        `📅 ${dateLabel}\n` +
                        (note ? `📌 ${note}\n` : '') +
                        `🆔 Mã: #${expenseId}\n\n` +
                        `Nhập thêm chi tiêu hoặc gõ "báo cáo" để xem tổng kết.`;
                } // end duplicate else

            } else if (actionData.action === 'add_expenses' && Array.isArray(actionData.data)) {
                // ---- BATCH: multiple expenses ----
                const items = actionData.data;
                const allCats = dao.getAllCategories();
                let savedCount = 0;
                let skippedCount = 0;
                let totalAmount = 0;
                const savedItems = [];

                for (const item of items) {
                    const { description, amount, category, note, date } = item;
                    if (!description || !amount) continue;

                    // Find category
                    let cat = dao.getCategoryByName(category);
                    if (!cat) {
                        cat = allCats.find(c => c.name.toLowerCase().includes((category || '').toLowerCase())) ||
                            allCats.find(c => c.name === 'Khác');
                    }

                    // Parse date
                    let expenseDate = null;
                    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        expenseDate = date + ' 12:00:00';
                    }

                    // Duplicate check (skip duplicates silently in batch mode)
                    const duplicate = dao.findDuplicateExpense(userId, amount, description);
                    if (duplicate) {
                        skippedCount++;
                        continue;
                    }

                    const expenseId = dao.addExpense({
                        category_id: cat ? cat.id : null,
                        description,
                        amount,
                        currency: 'VND',
                        note: note || '',
                        zalo_user_id: userId,
                        zalo_user_name: userName,
                        created_by: 'bot',
                        created_at: expenseDate
                    });

                    savedCount++;
                    totalAmount += amount;
                    savedItems.push(`#${expenseId} ${description} - ${formatCurrency(amount)}`);
                }

                reply = `✅ Đã ghi nhận ${savedCount}/${items.length} chi tiêu!\n\n`;
                if (savedItems.length > 0) {
                    // Show first 15 items, summarize rest
                    const showItems = savedItems.slice(0, 15);
                    reply += showItems.map(s => `📝 ${s}`).join('\n') + '\n';
                    if (savedItems.length > 15) {
                        reply += `... và ${savedItems.length - 15} mục khác\n`;
                    }
                }
                reply += `\n💰 Tổng: ${formatCurrency(totalAmount)}`;
                if (skippedCount > 0) {
                    reply += `\n⚠️ Bỏ qua ${skippedCount} mục trùng lặp`;
                }
                reply += `\n\nGõ "báo cáo" để xem tổng kết.`;

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
            } else if (actionData.action === 'calculate_travel') {
                // ---- TRAVEL DISTANCE CALCULATION ----
                reply = await handleTravelCalculation(actionData.data, userId, userName, today);
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

const IMAGE_ANALYSIS_PROMPT = `Bạn là trợ lý AI phân tích ảnh hoá đơn/bill/receipt cho công ty VIETNEW ENTERTAINMENT.

## NHIỆM VỤ:
Phân tích ảnh hoá đơn/bill và trích xuất thông tin chi tiêu.

## DANH MỤC:
1. Thiết bị & Công nghệ  2. Văn phòng phẩm  3. Di chuyển & Vận chuyển
4. Ăn uống & Tiếp khách  5. Marketing & Quảng cáo  6. Nhân sự & Lương
7. Thuê mặt bằng  8. Sản xuất phim  9. Hậu kỳ & Dựng phim
10. Bản quyền & Pháp lý  11. Điện, nước, Internet  12. Khác

## OUTPUT FORMAT:
Trả về **ĐÚNG JSON** nếu nhận diện được hoá đơn:
\`\`\`json
{"action":"add_expense","data":{"description":"mô tả ngắn","amount":số tiền,"category":"tên danh mục","date":"YYYY-MM-DD","note":"chi tiết bổ sung từ bill"}}
\`\`\`

## QUY TẮC:
- Nếu ảnh là hoá đơn/bill → trích xuất và trả JSON
- Nếu ảnh không phải hoá đơn → trả text: "Ảnh này không phải hoá đơn/bill"
- Amount phải là số (number), không có đơn vị
- Nếu bill có ngày → dùng ngày trên bill
- Nếu bill không có ngày → dùng ngày hiện tại
- Mô tả ngắn gọn, note có thể ghi chi tiết hơn (tên cửa hàng, mã bill...)`;

async function processImage(userId, userName, imageBase64, caption = '') {
    const now = new Date();
    const vnDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const today = vnDate.toISOString().split('T')[0];

    const messages = [
        { role: 'system', content: IMAGE_ANALYSIS_PROMPT + `\n[NGÀY HIỆN TẠI: ${today}]` },
        {
            role: 'user',
            content: [
                {
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
                },
                ...(caption ? [{ type: 'text', text: `Ghi chú từ user: ${caption}` }] : [{ type: 'text', text: 'Phân tích ảnh hoá đơn/bill này.' }])
            ]
        }
    ];

    const aiResponse = await callAI(messages);

    if (!aiResponse) {
        return { text: '❌ Không thể phân tích ảnh. Vui lòng thử lại hoặc nhập chi tiêu bằng text.', expense: null };
    }

    try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*"action"[\s\S]*\}/);
        if (jsonMatch) {
            const actionData = JSON.parse(jsonMatch[0]);
            if (actionData.action === 'add_expense') {
                return { text: aiResponse, expense: actionData.data };
            }
        }
    } catch (e) {
        console.log('[AI] Image analysis - no JSON in response');
    }

    return { text: aiResponse, expense: null };
}

// Process multiple images as parts of a single invoice
async function processMultiImage(userId, userName, imagesBase64, caption = '') {
    const now = new Date();
    const vnDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const today = vnDate.toISOString().split('T')[0];

    const imageContents = imagesBase64.map((img, idx) => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${img}` }
    }));

    const messages = [
        {
            role: 'system',
            content: IMAGE_ANALYSIS_PROMPT +
                `\n[NGÀY HIỆN TẠI: ${today}]` +
                `\n\n⚠️ QUAN TRỌNG: User gửi ${imagesBase64.length} ảnh. Đây có thể là NHIỀU PHẦN của cùng 1 hoá đơn dài (bị chia thành nhiều ảnh). ` +
                `Hãy ghép nội dung tất cả ảnh lại và phân tích như MỘT hoá đơn duy nhất. CHỈ trả về 1 JSON duy nhất.`
        },
        {
            role: 'user',
            content: [
                ...imageContents,
                {
                    type: 'text',
                    text: caption
                        ? `Ghi chú từ user: ${caption}\n\nĐây là ${imagesBase64.length} ảnh của cùng 1 hoá đơn. Hãy ghép và phân tích.`
                        : `Đây là ${imagesBase64.length} ảnh của cùng 1 hoá đơn dài. Hãy ghép nội dung và phân tích thành 1 chi tiêu.`
                }
            ]
        }
    ];

    const aiResponse = await callAI(messages);

    if (!aiResponse) {
        return { text: '❌ Không thể phân tích ảnh. Vui lòng thử lại.', expense: null };
    }

    try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*"action"[\s\S]*\}/);
        if (jsonMatch) {
            const actionData = JSON.parse(jsonMatch[0]);
            if (actionData.action === 'add_expense') {
                return { text: aiResponse, expense: actionData.data };
            }
        }
    } catch (e) {
        console.log('[AI] Multi-image analysis - no JSON in response');
    }

    return { text: aiResponse, expense: null };
}

// ============= Travel Distance Calculation =============
async function handleTravelCalculation(data, userId, userName, today) {
    const kmRate = parseFloat(dao.getSetting('km_rate')) || 10000;
    const goongApiKey = dao.getSetting('goong_api_key');

    // Case 1: Manual km
    if (data.manual_km) {
        const km = parseFloat(data.manual_km);
        const totalAmount = Math.round(km * kmRate);
        const description = `Di chuyển ${km} km`;

        const transportCat = dao.getAllCategories().find(c => c.name.includes('Di chuyển'));
        const expenseId = dao.addExpense({
            category_id: transportCat ? transportCat.id : null,
            description,
            amount: totalAmount,
            currency: 'VND',
            note: `${km} km x ${formatCurrency(kmRate)}/km` + (data.note ? ` | ${data.note}` : ''),
            zalo_user_id: userId,
            zalo_user_name: userName,
            created_by: 'bot',
            created_at: today + ' 12:00:00',
        });

        return `✅ Đã ghi nhận chi phí di chuyển!\n\n` +
            `🚗 ${description}\n` +
            `📏 Quãng đường: ${km} km\n` +
            `💰 ${formatCurrency(totalAmount)} (${formatCurrency(kmRate)}/km)\n` +
            `🆔 Mã: #${expenseId}`;
    }

    // Case 2: Address-based calculation via Goong
    if (!goongApiKey) {
        return `⚠️ Chưa cấu hình Goong API Key.\n\nVui lòng nhờ Admin vào Dashboard > Cài đặt > Cài đặt tính quãng đường để thêm API Key.\n\n💡 Hoặc bạn có thể nhắn: "đi 25km" để nhập số km thủ công.`;
    }

    const { origin, destination, vehicle } = data;
    if (!origin || !destination) {
        return `❌ Vui lòng cung cấp đầy đủ điểm đi và điểm đến.\n\nVí dụ: "đi từ Quận 1 đến Bình Dương"`;
    }

    try {
        // Step 1: Geocode origin
        const originGeo = await goongGeocode(goongApiKey, origin);
        if (!originGeo) {
            return `❌ Không tìm thấy địa chỉ: "${origin}"\n\nVui lòng thử lại với địa chỉ cụ thể hơn.`;
        }

        // Step 2: Geocode destination
        const destGeo = await goongGeocode(goongApiKey, destination);
        if (!destGeo) {
            return `❌ Không tìm thấy địa chỉ: "${destination}"\n\nVui lòng thử lại với địa chỉ cụ thể hơn.`;
        }

        // Step 3: Get direction
        const dirRes = await axios.get('https://rsapi.goong.io/Direction', {
            params: {
                api_key: goongApiKey,
                origin: `${originGeo.lat},${originGeo.lng}`,
                destination: `${destGeo.lat},${destGeo.lng}`,
                vehicle: vehicle || 'car',
            },
        });

        const route = dirRes.data?.routes?.[0];
        const leg = route?.legs?.[0];
        if (!leg) {
            return `❌ Không tìm được tuyến đường từ "${origin}" đến "${destination}".\n\nVui lòng thử lại với địa chỉ khác.`;
        }

        const distanceKm = Math.round((leg.distance.value / 1000) * 10) / 10;
        const distanceText = leg.distance.text;
        const durationText = leg.duration.text;
        const totalAmount = Math.round(distanceKm * kmRate);

        const vehicleLabel = { car: 'Ô tô', bike: 'Xe máy', taxi: 'Taxi' }[vehicle] || 'Ô tô';
        const description = `Di chuyển: ${origin} → ${destination}`;

        // Save expense
        const transportCat = dao.getAllCategories().find(c => c.name.includes('Di chuyển'));
        const expenseId = dao.addExpense({
            category_id: transportCat ? transportCat.id : null,
            description,
            amount: totalAmount,
            currency: 'VND',
            note: `${distanceKm} km x ${formatCurrency(kmRate)}/km | ${vehicleLabel}` + (data.note ? ` | ${data.note}` : ''),
            zalo_user_id: userId,
            zalo_user_name: userName,
            created_by: 'bot',
            created_at: today + ' 12:00:00',
        });

        return `✅ Đã ghi nhận chi phí di chuyển!\n\n` +
            `🚗 ${vehicleLabel}\n` +
            `📍 ${origin}\n` +
            `📍 → ${destination}\n` +
            `📏 Quãng đường: ${distanceText}\n` +
            `⏱️ Thời gian: ${durationText}\n` +
            `💰 ${formatCurrency(totalAmount)} (${formatCurrency(kmRate)}/km)\n` +
            `🆔 Mã: #${expenseId}`;

    } catch (err) {
        console.error('[Travel] Error:', err.message);
        return `❌ Lỗi khi tính quãng đường: ${err.message}\n\n💡 Bạn có thể nhắn: "đi 25km" để nhập thủ công.`;
    }
}

async function goongGeocode(apiKey, address) {
    try {
        // Use Autocomplete to find place_id, then Place Detail for coordinates
        const acRes = await axios.get('https://rsapi.goong.io/Place/AutoComplete', {
            params: { api_key: apiKey, input: address, limit: 1 },
        });
        const prediction = acRes.data?.predictions?.[0];
        if (!prediction) return null;

        const detailRes = await axios.get('https://rsapi.goong.io/Place/Detail', {
            params: { api_key: apiKey, place_id: prediction.place_id },
        });
        const result = detailRes.data?.result;
        if (!result?.geometry?.location) return null;

        return {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            address: result.formatted_address || address,
        };
    } catch (err) {
        console.error('[Goong Geocode] Error:', err.message);
        return null;
    }
}

function formatCurrency(amount) {
    if (!amount || amount === 0) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

module.exports = { processMessage, processImage, processMultiImage, callAI, formatCurrency };
