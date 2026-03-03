# 🚀 Hướng dẫn Deploy VPS - Zalo Bot Quản Lý Chi Tiêu

## Yêu cầu hệ thống

- **OS:** Ubuntu 20.04+ / CentOS 7+
- **Node.js:** v18+
- **PM2:** Cài global
- **Nginx:** Reverse proxy + SSL
- **Domain:** Trỏ về IP VPS (bắt buộc cho Webhook)

---

## Bước 1: Cài đặt trên VPS

```bash
# Cài Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cài PM2 global
sudo npm install -g pm2

# Cài Nginx
sudo apt-get install -y nginx
```

## Bước 2: Clone và cấu hình

```bash
# Clone repo
cd /home
git clone https://github.com/danhtrongit/zalo-bot.git
cd zalo-bot

# Cài dependencies
npm install

# Tạo thư mục cần thiết
mkdir -p data logs

# Copy file cấu hình và chỉnh sửa
cp .env.example .env
nano .env
```

### Nội dung file `.env` cần chỉnh:

```env
# ---- Zalo Bot ----
BOT_TOKEN=2990040385862152348:GlrZnCrxryiDcnfXNlyZYqWcCQAlPNDFFVJscnSifeaHFMMpsAmZaMyhUUMaPnkZ
WEBHOOK_SECRET_TOKEN=vietnew_ent_secret_2026

# ---- AI Agent ----
AI_PROXY_URL=http://160.22.123.174:8317/
AI_API_KEY=sk-Nj5w9O5aaISOZ1DHT
AI_MODEL=gpt-5.3-codex

# ---- Server ----
PORT=8888
NODE_ENV=production

# ---- Authentication ----
ADMIN_ZALO_ID=e8991cb826edcfb396fc
SESSION_SECRET=your_random_secret_string_change_this_32chars

# ---- Branding ----
COMPANY_NAME=VIETNEW ENTERTAINMENT
PRIMARY_COLOR=#00582a
```

> ⚠️ **Quan trọng:** `NODE_ENV=production` để server chạy ở chế độ **Webhook** (không polling).

## Bước 3: Khởi chạy với PM2

```bash
# Chạy app
pm2 start ecosystem.config.js

# Xem logs
pm2 logs vietnew-zalo-bot

# Lưu config PM2 (tự khởi động khi VPS reboot)
pm2 save
pm2 startup
# Chạy lệnh mà PM2 in ra (sudo env PATH=...)
```

### Các lệnh PM2 hữu ích:

```bash
pm2 status                    # Xem trạng thái
pm2 logs vietnew-zalo-bot     # Xem logs
pm2 restart vietnew-zalo-bot  # Restart
pm2 stop vietnew-zalo-bot     # Dừng
pm2 delete vietnew-zalo-bot   # Xóa
pm2 monit                     # Monitor CPU/RAM
```

## Bước 4: Cấu hình Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/zalo-bot
```

### Nội dung:

```nginx
server {
    listen 80;
    server_name bot.yourdomain.com;  # Thay bằng domain của bạn

    # Redirect HTTP -> HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name bot.yourdomain.com;  # Thay bằng domain của bạn

    # SSL Certificate (dùng Certbot/Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/bot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
```

### Kích hoạt:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/zalo-bot /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Cài SSL (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d bot.yourdomain.com

# Restart Nginx
sudo systemctl restart nginx
```

## Bước 5: Cấu hình Webhook trên Zalo Bot

### Cách 1: Qua Dashboard (khuyến nghị)

1. Mở dashboard: `https://bot.yourdomain.com`
2. Đăng nhập (gõ `/login` trong Zalo)
3. Vào **Cài đặt Bot** → **Cấu hình Webhook**
4. Nhập URL: `https://bot.yourdomain.com/webhooks`
5. Nhấn **Thiết lập Webhook**

### Cách 2: Qua API (dùng curl)

```bash
# Set webhook (chạy trên VPS)
curl -X POST https://bot.yourdomain.com/api/webhook/set \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=YOUR_SESSION_TOKEN" \
  -d '{"url": "https://bot.yourdomain.com/webhooks"}'
```

### Cách 3: Qua Zalo Bot Platform

1. Truy cập: https://bot.zaloplatforms.com
2. Chọn Bot của bạn
3. Vào **Webhook Settings**
4. Điền:
   - **Webhook URL:** `https://bot.yourdomain.com/webhooks`
   - **Secret Token:** `vietnew_ent_secret_2026` (giống WEBHOOK_SECRET_TOKEN trong .env)

---

## Kiểm tra hoạt động

```bash
# Kiểm tra PM2
pm2 status

# Kiểm tra bot đang chạy
curl http://localhost:8888/api/bot-info

# Kiểm tra webhook
curl http://localhost:8888/api/bot-info | jq '.result.webhook'

# Xem logs realtime
pm2 logs vietnew-zalo-bot --lines 50
```

## Cập nhật code

```bash
cd /home/zalo-bot
git pull origin main
npm install           # Nếu có dependency mới
pm2 restart vietnew-zalo-bot
```

---

## Tóm tắt kiến trúc

```
Zalo Server
    │
    ▼ (HTTPS POST /webhooks)
┌──────────────┐
│    Nginx     │  ← SSL termination (port 443)
│  (HTTPS)     │
└──────┬───────┘
       │ proxy_pass
       ▼
┌──────────────┐
│   Node.js    │  ← PM2 managed (port 8888)
│  server.js   │
├──────────────┤
│  Dashboard   │  ← https://bot.yourdomain.com
│  Webhook     │  ← https://bot.yourdomain.com/webhooks
│  API         │  ← https://bot.yourdomain.com/api/*
│  Auth        │  ← Session-based login
└──────────────┘
       │
       ▼
┌──────────────┐
│   SQLite     │  ← data/expenses.db
│  Database    │
└──────────────┘
```
