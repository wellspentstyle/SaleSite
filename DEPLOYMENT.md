# Deployment Guide: Migrating from Replit to Railway + Vercel

This guide will help you deploy your application with the backend on Railway and the frontend on Vercel.

## Architecture Overview

- **Backend (Railway)**: Node.js/Express server, PostgreSQL database, background jobs, scrapers, bots
- **Frontend (Vercel)**: React + Vite static site

---

## Part 1: Deploy Backend to Railway

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your `SaleSite` repository
4. Select the `feature/migrate-from-replit` branch

### Step 3: Add PostgreSQL Database
1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically create a `DATABASE_URL` environment variable

### Step 4: Configure Environment Variables

Go to your service → Variables tab and add these:

#### Required Backend Variables:
```
DATABASE_URL=<automatically set by Railway>
PORT=3001

# AI APIs
ANTHROPIC_API_KEY=<your-key>
AI_INTEGRATIONS_OPENAI_API_KEY=<your-key>
AI_INTEGRATIONS_OPENAI_BASE_URL=<your-base-url>

# Airtable
AIRTABLE_PAT=<your-personal-access-token>
AIRTABLE_BASE_ID=<your-base-id>

# Telegram Bot (if using)
TELEGRAM_BOT_TOKEN=<your-token>
TELEGRAM_CHAT_ID=<your-chat-id>

# Instagram API (if using)
INSTAGRAM_ACCESS_TOKEN=<your-token>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<your-account-id>

# Google APIs (if using)
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REFRESH_TOKEN=<your-refresh-token>
```

### Step 5: Deploy
1. Railway will automatically deploy your backend
2. Once deployed, copy your Railway URL (e.g., `https://salesite-production.up.railway.app`)
3. Keep this URL handy for the next steps

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Update vercel.json
Before deploying to Vercel, update the `vercel.json` file:

1. Open `vercel.json`
2. Replace `https://your-railway-app.railway.app` with your actual Railway URL from Part 1, Step 5

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-ACTUAL-RAILWAY-URL.railway.app/:path*"
    }
  ]
}
```

### Step 2: Create Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub

### Step 3: Import Project
1. Click "Add New..." → "Project"
2. Import your `SaleSite` repository
3. Select the `feature/migrate-from-replit` branch

### Step 4: Configure Build Settings
Vercel should auto-detect these, but verify:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `build`

### Step 5: Add Environment Variables

In Vercel project settings → Environment Variables, add:

```
# Site URL (your Vercel deployment URL)
VITE_SITE_URL=https://your-site.vercel.app

# Backend API URL (your Railway URL)
VITE_API_URL=https://YOUR-RAILWAY-URL.railway.app

# Airtable (for frontend)
AIRTABLE_PAT=<your-personal-access-token>
AIRTABLE_BASE_ID=<your-base-id>
```

### Step 6: Deploy
1. Click "Deploy"
2. Vercel will build and deploy your frontend
3. Your site will be live at `https://your-site.vercel.app`

---

## Part 3: Database Migration (if needed)

If you need to migrate data from Replit's PostgreSQL to Railway:

### Option 1: Using pg_dump (Recommended)
```bash
# On Replit, export your database
pg_dump $DATABASE_URL > backup.sql

# Import to Railway (get Railway DATABASE_URL from dashboard)
psql <RAILWAY_DATABASE_URL> < backup.sql
```

### Option 2: Using Railway's Database Import
1. In Railway, click on your PostgreSQL service
2. Go to "Data" tab
3. Use the import feature

---

## Part 4: Testing

### Test Backend
1. Visit `https://YOUR-RAILWAY-URL.railway.app/api/health` (if you have a health endpoint)
2. Check Railway logs for any errors

### Test Frontend
1. Visit your Vercel URL
2. Open browser DevTools → Network tab
3. Verify API calls are going to your Railway backend

### Test Full Flow
1. Test a complete user flow in your application
2. Verify database connections work
3. Check that all integrations (Telegram, Instagram, etc.) are functioning

---

## Part 5: Custom Domain (Optional)

### For Frontend (Vercel)
1. In Vercel → Settings → Domains
2. Add your custom domain (e.g., `www.wellspentstyle.com`)
3. Follow Vercel's DNS configuration instructions

### For Backend (Railway)
1. Railway Pro plan required for custom domains
2. Or keep using the Railway subdomain (this is fine!)

---

## Troubleshooting

### Backend won't start
- Check Railway logs for errors
- Verify all environment variables are set
- Check that `npm start` works locally

### Frontend can't connect to backend
- Verify `VITE_API_URL` is set correctly in Vercel
- Check `vercel.json` has correct Railway URL
- Verify CORS is enabled on backend

### Database connection errors
- Check `DATABASE_URL` in Railway
- Verify database is running in Railway dashboard
- Check connection string format

---

## Environment Variables Checklist

Use this to make sure you've set everything:

### Railway (Backend)
- [ ] DATABASE_URL (auto-set)
- [ ] PORT (set to 3001)
- [ ] ANTHROPIC_API_KEY
- [ ] AI_INTEGRATIONS_OPENAI_API_KEY
- [ ] AI_INTEGRATIONS_OPENAI_BASE_URL
- [ ] AIRTABLE_PAT
- [ ] AIRTABLE_BASE_ID
- [ ] TELEGRAM_BOT_TOKEN
- [ ] TELEGRAM_CHAT_ID
- [ ] INSTAGRAM_ACCESS_TOKEN
- [ ] INSTAGRAM_BUSINESS_ACCOUNT_ID
- [ ] GOOGLE_CLIENT_ID
- [ ] GOOGLE_CLIENT_SECRET
- [ ] GOOGLE_REFRESH_TOKEN

### Vercel (Frontend)
- [ ] VITE_SITE_URL
- [ ] VITE_API_URL
- [ ] AIRTABLE_PAT
- [ ] AIRTABLE_BASE_ID

---

## Next Steps After Deployment

1. **Update DNS**: Point your domain to Vercel (if using custom domain)
2. **Set up monitoring**: Use Railway and Vercel's built-in monitoring
3. **Configure CI/CD**: Both platforms auto-deploy on git push
4. **Set up backups**: Railway has automatic database backups
5. **Review costs**: Monitor usage to stay within free tiers

---

## Cost Estimates

### Railway (Free Tier)
- $5 credit per month
- Usually sufficient for small projects
- Upgrade to Pro ($20/month) if needed

### Vercel (Hobby - Free)
- Free for personal projects
- 100GB bandwidth/month
- Serverless function executions included

**Total estimated cost**: $0-20/month depending on usage
