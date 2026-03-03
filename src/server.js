require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const zaloApi = require('./zalo-api');
const { processMessage } = require('./ai-agent');
const apiRoutes = require('./api-routes');
const { dao } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN || 'vietnew_ent_secret_2026';
const ADMIN_ZALO_ID = process.env.ADMIN_ZALO_ID;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files (public, no auth needed)
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));
app.use('/logo-dashboard.png', express.static(path.join(__dirname, '..', 'logo-dashboard.png')));

// ============= Auth Middleware =============
function authMiddleware(req, res, next) {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
        return res.redirect('/login');
    }

    const session = dao.validateSession(sessionToken);
    if (!session) {
        res.clearCookie('session_token');
        return res.redirect('/login');
    }

    req.user = session;
    next();
}

function apiAuthMiddleware(req, res, next) {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const session = dao.validateSession(sessionToken);
    if (!session) {
        return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    req.user = session;
    next();
}

// ============= Login Page =============
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Login via token (from /login command in Zalo)
app.get('/auth/token/:token', (req, res) => {
    const tokenData = dao.validateLoginToken(req.params.token);

    if (!tokenData) {
        return res.send(`
      <html><head><meta charset="utf-8"><title>Lỗi đăng nhập</title>
      <style>body{font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f2f5;margin:0;}
      .card{background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);text-align:center;max-width:400px;}
      h2{color:#ef4444;margin-bottom:8px;}p{color:#5a6b62;}</style></head>
      <body><div class="card"><h2>❌ Link đăng nhập không hợp lệ</h2><p>Link đã hết hạn hoặc đã được sử dụng.</p><p>Hãy gõ <strong>/login</strong> trong Zalo để nhận link mới.</p></div></body></html>
    `);
    }

    // Create session
    const user = dao.getAllowedUser(tokenData.zalo_user_id);
    const role = user?.role || 'user';
    const name = user?.display_name || 'User';
    const sessionToken = dao.createSession(tokenData.zalo_user_id, name, role);

    res.cookie('session_token', sessionToken, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    });

    console.log(`[Auth] ✅ User ${name} (${tokenData.zalo_user_id}) logged in via token`);
    res.redirect('/');
});

// Logout
app.get('/logout', (req, res) => {
    const sessionToken = req.cookies?.session_token;
    if (sessionToken) {
        dao.deleteSession(sessionToken);
        res.clearCookie('session_token');
    }
    res.redirect('/login');
});

// Get current user info
app.get('/api/auth/me', apiAuthMiddleware, (req, res) => {
    res.json({
        ok: true,
        result: {
            zalo_user_id: req.user.zalo_user_id,
            display_name: req.user.display_name,
            role: req.user.role
        }
    });
});

// ============= Protected API Routes =============
app.use('/api', apiAuthMiddleware, apiRoutes);

// ============= Users Management API (admin only) =============
app.get('/api/users', apiAuthMiddleware, (req, res) => {
    try {
        const users = dao.getAllAllowedUsers();
        res.json({ ok: true, result: users });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/users', apiAuthMiddleware, (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Chỉ Admin mới có quyền thêm người dùng' });
        }
        const { zalo_user_id, display_name, role } = req.body;
        if (!zalo_user_id) return res.status(400).json({ ok: false, error: 'Zalo User ID là bắt buộc' });

        const id = dao.addAllowedUser(zalo_user_id, display_name || '', role || 'user', req.user.zalo_user_id);
        res.json({ ok: true, result: { id } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.put('/api/users/:id', apiAuthMiddleware, (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Chỉ Admin mới có quyền sửa' });
        }
        dao.updateAllowedUser(req.params.id, req.body);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.delete('/api/users/:id', apiAuthMiddleware, (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Chỉ Admin mới có quyền xóa' });
        }
        dao.removeAllowedUser(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Webhook Endpoint (no auth, uses secret token) =============
app.post('/webhooks', async (req, res) => {
    const secretToken = req.headers['x-bot-api-secret-token'];

    if (secretToken !== WEBHOOK_SECRET_TOKEN) {
        console.warn('[Webhook] Unauthorized request');
        return res.status(403).json({ message: 'Unauthorized' });
    }

    try {
        const body = req.body;
        // Log more for image messages to debug structure
        const logLen = body.event_name?.includes('image') ? 2000 : 200;
        console.log('[Webhook] Received:', JSON.stringify(body).substring(0, logLen));

        // Webhook sends data directly: {event_name, message, ...}
        // Polling wraps it: {ok: true, result: {event_name, message, ...}}
        if (body.ok && body.result) {
            await handleUpdate(body.result);
        } else if (body.event_name) {
            await handleUpdate(body);
        }

        res.json({ message: 'Success' });
    } catch (err) {
        console.error('[Webhook] Error:', err.message);
        res.json({ message: 'Error processed' });
    }
});

// ============= Handle incoming update =============
async function handleUpdate(update) {
    const { event_name, message } = update;

    if (!message) return;

    const chatId = message.chat?.id;
    const userId = message.from?.id;
    const userName = message.from?.display_name || 'Unknown';
    const isBot = message.from?.is_bot;

    if (isBot || !chatId) return;

    console.log(`[Bot] Message from ${userName} (${userId}): ${event_name}`);

    if (event_name === 'message.text.received' && message.text) {
        const text = message.text.trim();

        // ---- Command: /login ----
        if (text === '/login') {
            // Only admin or allowed users can login
            const isAllowed = dao.isUserAllowed(userId);
            if (!isAllowed) {
                await zaloApi.sendMessage(chatId,
                    `⛔ Bạn chưa được cấp quyền truy cập.\n\n` +
                    `🆔 ID của bạn: ${userId}\n\n` +
                    `Vui lòng liên hệ Admin để được thêm vào hệ thống.`
                );
                return;
            }

            const token = dao.createLoginToken(userId);
            const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
            const loginUrl = `${baseUrl}/auth/token/${token}`;

            await zaloApi.sendMessage(chatId,
                `🔐 Đăng nhập Dashboard\n\n` +
                `Nhấn vào link sau để đăng nhập:\n${loginUrl}\n\n` +
                `⏰ Link có hiệu lực trong 5 phút.\n` +
                `⚠️ Chỉ sử dụng 1 lần.`
            );
            console.log(`[Auth] Login link generated for ${userName} (${userId})`);
            return;
        }

        // ---- Command: /id ----
        if (text === '/id') {
            await zaloApi.sendMessage(chatId, `🆔 ID của bạn: ${userId}\n📛 Tên: ${userName}`);
            return;
        }

        // ---- Check if user is allowed ----
        if (!dao.isUserAllowed(userId)) {
            await zaloApi.sendMessage(chatId,
                `⛔ Bạn chưa được cấp quyền sử dụng Bot.\n\n` +
                `🆔 ID của bạn: ${userId}\n\n` +
                `Vui lòng gửi ID này cho Admin để được thêm vào hệ thống.`
            );
            return;
        }

        // Update user display name
        dao.updateUserName(userId, userName);

        // Show typing indicator
        await zaloApi.sendChatAction(chatId, 'typing');

        // Process with AI Agent
        const reply = await processMessage(userId, userName, message.text);

        // Send reply
        await zaloApi.sendMessage(chatId, reply);
        console.log(`[Bot] Replied to ${userName}`);
    } else if (event_name === 'message.image.received') {
        if (!dao.isUserAllowed(userId)) {
            await zaloApi.sendMessage(chatId, `⛔ Bạn chưa được cấp quyền.\n🆔 ID: ${userId}`);
            return;
        }
        dao.updateUserName(userId, userName);
        await zaloApi.sendChatAction(chatId, 'typing');

        try {
            // Get image URL from message
            // Zalo sends: message.photo_url (direct URL) and message.caption
            let imageUrl = message.photo_url || null;
            const caption = message.caption || message.text || '';

            // Fallback: try other possible fields
            if (!imageUrl && message.photo && message.photo.length > 0) {
                const bestPhoto = message.photo[message.photo.length - 1];
                imageUrl = bestPhoto.file_url || bestPhoto.url || bestPhoto.photo_url;
            }
            if (!imageUrl && message.url) {
                imageUrl = message.url;
            }
            if (!imageUrl && message.file_id) {
                const fileInfo = await zaloApi.getFile(message.file_id);
                if (fileInfo?.ok) {
                    imageUrl = fileInfo.result.file_url;
                }
            }

            if (!imageUrl) {
                await zaloApi.sendMessage(chatId, '❌ Không thể tải ảnh. Vui lòng thử gửi lại.');
                return;
            }

            // Download image
            const imageBuffer = await zaloApi.downloadFile(imageUrl);
            if (!imageBuffer) {
                await zaloApi.sendMessage(chatId, '❌ Lỗi tải ảnh. Vui lòng thử lại.');
                return;
            }

            // Save image to uploads folder
            const fs = require('fs');
            const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            const filename = `${Date.now()}_${userId}.jpg`;
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, imageBuffer);
            const savedImageUrl = `/uploads/${filename}`;

            console.log(`[Bot] Image saved: ${savedImageUrl}`);

            // Convert to base64 for AI
            const imageBase64 = imageBuffer.toString('base64');

            // Send to AI for analysis
            const { processImage } = require('./ai-agent');
            const result = await processImage(userId, userName, imageBase64, caption);

            if (result.expense) {
                const { description, amount, category, note, date } = result.expense;

                // Find category
                let cat = dao.getCategoryByName(category);
                if (!cat) {
                    const allCats = dao.getAllCategories();
                    cat = allCats.find(c => c.name.toLowerCase().includes(category.toLowerCase())) ||
                        allCats.find(c => c.name === 'Khác');
                }

                // Parse date
                let expenseDate = null;
                if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    expenseDate = date + ' 12:00:00';
                }

                // Save expense with image
                const expenseId = dao.addExpense({
                    category_id: cat ? cat.id : null,
                    description,
                    amount,
                    currency: 'VND',
                    note: note || '',
                    image_url: savedImageUrl,
                    zalo_user_id: userId,
                    zalo_user_name: userName,
                    created_by: 'bot',
                    created_at: expenseDate
                });

                const { formatCurrency } = require('./ai-agent');
                const displayDate = date || new Date().toISOString().split('T')[0];

                const reply = `📸 Đã phân tích hoá đơn & ghi nhận!\n\n` +
                    `📝 ${description}\n` +
                    `💰 ${formatCurrency(amount)}\n` +
                    `📂 ${cat ? cat.icon + ' ' + cat.name : 'Chưa phân loại'}\n` +
                    `📅 ${displayDate}\n` +
                    (note ? `📌 ${note}\n` : '') +
                    `🖼️ Ảnh đã lưu\n` +
                    `🆔 Mã: #${expenseId}\n\n` +
                    `Xem lại ảnh trên Dashboard.`;

                await zaloApi.sendMessage(chatId, reply);
                console.log(`[Bot] Image expense recorded for ${userName}: ${description} - ${amount}`);
            } else {
                // AI couldn't extract expense from image
                await zaloApi.sendMessage(chatId,
                    `📸 Đã nhận ảnh nhưng không nhận diện được hoá đơn.\n\n` +
                    `${result.text}\n\n` +
                    `💡 Bạn có thể nhập chi tiêu bằng text, ví dụ:\n"ăn trưa 200k hôm qua"`
                );
            }
        } catch (err) {
            console.error('[Bot] Image processing error:', err.message);
            await zaloApi.sendMessage(chatId, '❌ Lỗi xử lý ảnh. Vui lòng thử lại hoặc nhập bằng text.');
        }
    } else if (event_name === 'message.sticker.received') {
        if (!dao.isUserAllowed(userId)) {
            await zaloApi.sendMessage(chatId, `⛔ Bạn chưa được cấp quyền.\n🆔 ID: ${userId}`);
            return;
        }
        await zaloApi.sendMessage(chatId, '😊 Cảm ơn bạn! Để ghi nhận chi tiêu, vui lòng nhập theo format:\n"mô tả + số tiền"\nVD: "mua thiết bị quay 10tr"');
    } else if (event_name === 'message.unsupported.received') {
        await zaloApi.sendMessage(chatId, 'Tin nhắn này chưa được hỗ trợ. Vui lòng gửi tin nhắn văn bản.');
    }
}

// ============= Long Polling Mode (Development) =============
let pollingActive = false;

async function startPolling() {
    if (pollingActive) return;
    pollingActive = true;

    // Delete webhook first to enable polling
    console.log('[Polling] Deleting existing webhook...');
    await zaloApi.deleteWebhook();

    console.log('[Polling] ✅ Starting long polling mode...');
    console.log('[Polling] ℹ️  502 errors are NORMAL for long polling — Zalo gateway resets periodically.');
    console.log('[Polling] ℹ️  Bot will auto-reconnect with exponential backoff.\n');

    let consecutiveErrors = 0;
    const BASE_DELAY = 1000;
    const MAX_DELAY = 60000;
    const RATE_LIMIT_DELAY = 30000;

    while (pollingActive) {
        try {
            const result = await zaloApi.getUpdates(25);

            if (result && result._retryable) {
                consecutiveErrors++;
                let delay;
                if (result._rateLimited) {
                    delay = RATE_LIMIT_DELAY;
                    console.warn(`[Polling] ⚠️  Rate limited. Cooling down ${delay / 1000}s...`);
                } else {
                    delay = Math.min(BASE_DELAY * Math.pow(2, consecutiveErrors - 1), MAX_DELAY);
                    if (consecutiveErrors === 1) {
                        console.log(`[Polling] 🔄 Gateway reset (${result._status}). Reconnecting in ${delay / 1000}s...`);
                    } else if (consecutiveErrors % 10 === 0) {
                        console.log(`[Polling] 🔄 Still reconnecting... (${consecutiveErrors} retries, delay: ${delay / 1000}s)`);
                    }
                }
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            if (result && result.ok) {
                if (consecutiveErrors > 0) {
                    console.log(`[Polling] ✅ Reconnected successfully after ${consecutiveErrors} retries.`);
                    consecutiveErrors = 0;
                }
                if (result.result) {
                    const updates = Array.isArray(result.result) ? result.result : [result.result];
                    for (const update of updates) {
                        if (update.event_name) {
                            await handleUpdate(update);
                        }
                    }
                }
            }

            if (result === null) {
                consecutiveErrors++;
                const delay = Math.min(BASE_DELAY * Math.pow(2, consecutiveErrors - 1), MAX_DELAY);
                await new Promise(r => setTimeout(r, delay));
            }

        } catch (err) {
            console.error('[Polling] Unexpected error:', err.message);
            consecutiveErrors++;
            const delay = Math.min(5000 * consecutiveErrors, MAX_DELAY);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    console.log('[Polling] ⏹️  Polling stopped.');
}

function stopPolling() {
    pollingActive = false;
}

// ============= Protected Dashboard =============
app.get('/', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/payment-request', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'payment-request.html'));
});

// ============= Bot Info Endpoint =============
app.get('/api/bot-info', apiAuthMiddleware, async (req, res) => {
    try {
        const info = await zaloApi.getMe();
        const webhookInfo = await zaloApi.getWebhookInfo();
        res.json({
            ok: true,
            result: {
                bot: info?.result,
                webhook: webhookInfo?.result,
                mode: pollingActive ? 'polling' : 'webhook'
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Webhook management =============
app.post('/api/webhook/set', apiAuthMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
        const { url } = req.body;
        if (!url) return res.status(400).json({ ok: false, error: 'URL is required' });
        stopPolling();
        const result = await zaloApi.setWebhook(url, WEBHOOK_SECRET_TOKEN);
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/webhook/delete', apiAuthMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
        const result = await zaloApi.deleteWebhook();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/polling/start', apiAuthMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
        res.json({ ok: true, message: 'Polling started' });
        startPolling();
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/polling/stop', apiAuthMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
    stopPolling();
    res.json({ ok: true, message: 'Polling stopped' });
});

// ============= Clean up expired sessions periodically =============
setInterval(() => {
    dao.cleanExpiredSessions();
}, 60 * 60 * 1000); // Every hour

// ============= Start Server =============
app.listen(PORT, async () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🤖 VIETNEW ENTERTAINMENT - Bot Quản Lý Chi Tiêu       ║
║                                                          ║
║   Dashboard:  http://localhost:${PORT}                      ║
║   API:        http://localhost:${PORT}/api                   ║
║   Webhook:    http://localhost:${PORT}/webhooks               ║
║                                                          ║
║   🔐 Dashboard yêu cầu đăng nhập qua /login trên Zalo   ║
║   👤 Admin ID: ${(ADMIN_ZALO_ID || 'Chưa cấu hình').padEnd(40)}║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);

    // Verify bot token
    const botInfo = await zaloApi.getMe();
    if (botInfo && botInfo.ok) {
        console.log(`[Bot] ✅ Connected: ${botInfo.result.account_name} (${botInfo.result.account_type})`);
    } else {
        console.log('[Bot] ⚠️  Could not verify bot token. Check your BOT_TOKEN.');
    }

    // Start polling in development mode
    if (process.env.NODE_ENV !== 'production') {
        console.log('[Bot] Starting in POLLING mode (development)...');
        startPolling();
    } else {
        console.log('[Bot] Running in WEBHOOK mode (production).');
    }
});

module.exports = app;
