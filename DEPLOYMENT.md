# VectorMesh — External Server Deployment Guide

This guide covers deploying VectorMesh on your own server, outside of Replit.

---

## Prerequisites

- **Node.js 20.x** (LTS recommended)
- **PostgreSQL 14+** (self-hosted or managed service)
- **npm** (comes with Node.js)
- A Linux server (Ubuntu/Debian recommended) or similar environment

---

## 1. Set Up PostgreSQL

### Option A: Install locally
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Option B: Use a managed service
Any PostgreSQL provider works (AWS RDS, DigitalOcean Managed Databases, Supabase, Neon, etc.)

### Create the database and user
```bash
sudo -u postgres psql
```
```sql
CREATE USER vectormesh WITH PASSWORD 'your-secure-password';
CREATE DATABASE vectormeshdb OWNER vectormesh;
\q
```

---

## 2. Import Existing Data

A database dump file is included at `vectormesh-db-backup.sql`. To import it:

```bash
psql -U vectormesh -d vectormeshdb -f vectormesh-db-backup.sql
```

If you're starting fresh instead (no existing data), the schema will be pushed automatically in Step 5.

---

## 3. Clone and Install

```bash
git clone <your-repo-url> vectormesh
cd vectormesh
npm install
```

---

## 4. Configure Environment Variables

Create a `.env` file in the project root (or set these in your server environment):

```env
# Required
DATABASE_URL=postgresql://vectormesh:your-secure-password@localhost:5432/vectormeshdb
SESSION_SECRET=generate-a-long-random-string-here
NODE_ENV=production

# Optional — Server
PORT=5000

# Optional — File Storage
# Default upload directory is ./data/uploads (also configurable from admin UI)
UPLOAD_DIR=./data/uploads

# Optional — Application URL (used in emails)
APP_URL=https://your-domain.com

# Optional — Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
SMTP_FROM=noreply@your-domain.com
```

Generate a secure session secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 5. Push Database Schema

If you imported the backup in Step 2, you can skip this. Otherwise, push the schema to your new database:

```bash
npx drizzle-kit push
```

---

## 6. Build and Run

### Build the production bundle
```bash
npm run build
```

This compiles the application into the `dist/` directory.

### Start the server
```bash
npm run start
```

The server will start on port 5000 (or whatever `PORT` is set to).

---

## 7. Process Management (Recommended)

Use PM2 or systemd to keep the app running and auto-restart on crashes.

### Using PM2
```bash
npm install -g pm2
pm2 start dist/index.cjs --name vectormesh --env NODE_ENV=production
pm2 save
pm2 startup  # Follow the instructions to enable auto-start on boot
```

### Using systemd
Create `/etc/systemd/system/vectormesh.service`:
```ini
[Unit]
Description=VectorMesh Display Management
After=network.target postgresql.service

[Service]
Type=simple
User=vectormesh
WorkingDirectory=/path/to/vectormesh
ExecStart=/usr/bin/node dist/index.cjs
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgresql://vectormesh:your-secure-password@localhost:5432/vectormeshdb
Environment=SESSION_SECRET=your-session-secret
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable vectormesh
sudo systemctl start vectormesh
```

---

## 8. Reverse Proxy (Recommended)

Use Nginx to serve the app behind HTTPS.

### Install Nginx and Certbot
```bash
sudo apt install nginx certbot python3-certbot-nginx
```

### Nginx config
Create `/etc/nginx/sites-available/vectormesh`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/vectormesh /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Enable HTTPS
```bash
sudo certbot --nginx -d your-domain.com
```

---

## 9. File Storage

Media files are stored on the local filesystem. The upload directory structure is:

```
<upload-root>/
  <client-id>/
    uploads/      # Media files (images, videos, etc.)
    thumbnails/   # Auto-generated video thumbnails
```

The upload root directory is determined by (in priority order):
1. Admin UI setting (Settings → Storage)
2. `UPLOAD_DIR` environment variable
3. Default: `./data/uploads`

Make sure the upload directory is:
- **Writable** by the Node.js process user
- **Backed up** regularly (it contains all uploaded media)
- **Not inside the git repo** (it's already in `.gitignore`)

---

## 10. Backups

### Database backup
```bash
pg_dump -U vectormesh vectormeshdb > backup-$(date +%Y%m%d).sql
```

### Media backup
```bash
tar -czf media-backup-$(date +%Y%m%d).tar.gz data/uploads/
```

Consider setting up a cron job for automated backups:
```bash
crontab -e
# Daily database backup at 2am
0 2 * * * pg_dump -U vectormesh vectormeshdb > /path/to/backups/db-$(date +\%Y\%m\%d).sql
# Daily media backup at 3am
0 3 * * * tar -czf /path/to/backups/media-$(date +\%Y\%m\%d).tar.gz /path/to/vectormesh/data/uploads/
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Install dependencies | `npm install` |
| Push schema to DB | `npx drizzle-kit push` |
| Build for production | `npm run build` |
| Start production server | `npm run start` |
| Start dev server | `npm run dev` |

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Random string for session encryption |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Server port (default: 5000) |
| `UPLOAD_DIR` | No | Upload root directory (default: `./data/uploads`) |
| `APP_URL` | No | Public URL for email links |
| `SMTP_HOST` | No | SMTP server for sending emails |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | From address for emails |
