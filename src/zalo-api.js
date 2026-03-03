const axios = require('axios');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ZALO_API_BASE = `https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}`;

const zaloApi = {
    async getMe() {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/getMe`);
            return res.data;
        } catch (err) {
            console.error('[Zalo API] getMe error:', err.message);
            return null;
        }
    },

    async sendMessage(chatId, text) {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/sendMessage`, {
                chat_id: chatId,
                text: text,
            });
            return res.data;
        } catch (err) {
            console.error('[Zalo API] sendMessage error:', err.message);
            return null;
        }
    },

    async sendChatAction(chatId, action = 'typing') {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/sendChatAction`, {
                chat_id: chatId,
                action: action,
            });
            return res.data;
        } catch (err) {
            console.error('[Zalo API] sendChatAction error:', err.message);
            return null;
        }
    },

    async sendPhoto(chatId, photoUrl, caption = '') {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/sendPhoto`, {
                chat_id: chatId,
                photo: photoUrl,
                caption: caption,
            });
            return res.data;
        } catch (err) {
            console.error('[Zalo API] sendPhoto error:', err.message);
            return null;
        }
    },

    async setWebhook(url, secretToken) {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/setWebhook`, {
                url: url,
                secret_token: secretToken,
            });
            return res.data;
        } catch (err) {
            console.error('[Zalo API] setWebhook error:', err.message);
            return null;
        }
    },

    async deleteWebhook() {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/deleteWebhook`);
            return res.data;
        } catch (err) {
            console.error('[Zalo API] deleteWebhook error:', err.message);
            return null;
        }
    },

    async getWebhookInfo() {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/getWebhookInfo`);
            return res.data;
        } catch (err) {
            console.error('[Zalo API] getWebhookInfo error:', err.message);
            return null;
        }
    },

    async getUpdates(timeout = 25) {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/getUpdates`, {
                timeout: timeout,
            }, {
                timeout: (timeout + 10) * 1000,
            });
            return res.data;
        } catch (err) {
            const status = err.response?.status;

            // 502 Bad Gateway / 408 Timeout / 5xx — Zalo server-side issues
            // These are expected during long polling, handle silently
            if (status === 502 || status === 408 || status === 503 || status === 504) {
                // Silent — this is normal for long polling, Zalo gateway resets periodically
                return { _retryable: true, _status: status };
            }

            // Connection timeout (axios side) — also normal for long polling
            if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
                return { _retryable: true, _status: err.code };
            }

            // 429 Rate limit — need longer backoff
            if (status === 429) {
                console.warn('[Zalo API] ⚠️  Rate limited (429). Will back off.');
                return { _retryable: true, _rateLimited: true, _status: 429 };
            }

            // Other real errors — log them
            console.error('[Zalo API] getUpdates error:', status || err.code, err.message);
            return null;
        }
    },

    async getFile(fileId) {
        try {
            const res = await axios.post(`${ZALO_API_BASE}/getFile`, {
                file_id: fileId,
            });
            return res.data;
        } catch (err) {
            console.error('[Zalo API] getFile error:', err.message);
            return null;
        }
    },

    async downloadFile(url) {
        try {
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            return Buffer.from(res.data);
        } catch (err) {
            console.error('[Zalo API] downloadFile error:', err.message);
            return null;
        }
    },
};

module.exports = zaloApi;
