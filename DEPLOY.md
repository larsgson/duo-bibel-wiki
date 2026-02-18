# Deployment Guide

## Prerequisites

- A [GitHub](https://github.com/) account
- A [Netlify](https://www.netlify.com/) account (free tier works)
- A [Digital Bible Platform](https://4.dbt.io/) API key

## 1. Push to GitHub

```bash
git remote add origin git@github.com:YOUR_USERNAME/duo-bibel-wiki.git
git push -u origin main
```

## 2. Connect to Netlify

1. Log in to [Netlify](https://app.netlify.com/)
2. Click **Add new site** > **Import an existing project**
3. Select **GitHub** and authorize access
4. Choose the `duo-bibel-wiki` repository
5. Netlify will auto-detect the settings from `netlify.toml`:
   - Build command: `pnpm build`
   - Publish directory: `dist`
   - Node version: 20

## 3. Set Environment Variables

In the Netlify dashboard:

1. Go to **Site configuration** > **Environment variables**
2. Add the following variables:

| Variable | Value |
|----------|-------|
| `DBT_API_KEY` | Your Digital Bible Platform API key |
| `DBT_API_BASE_URL` | The DBT API base URL (provided separately) |

## 4. Custom Domain (optional)

1. Go to **Domain management** > **Add a domain**
2. Enter your domain (e.g. `duo.bibel.wiki`)
3. Follow Netlify's instructions to update your DNS records
4. Netlify will automatically provision an SSL certificate

## 5. Deploy

Netlify deploys automatically on every push to `main`. You can also trigger a manual deploy from the Netlify dashboard under **Deploys** > **Trigger deploy**.

## Project Configuration

The deployment is configured via these files:

- `netlify.toml` - Build settings, Node version, cache headers
- `astro.config.mjs` - Astro framework config with Netlify adapter
- `netlify/functions/dbt-proxy.cjs` - Serverless function that proxies Bible API requests (keeps the API key server-side)
