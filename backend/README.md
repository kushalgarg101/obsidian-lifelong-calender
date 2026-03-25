# Reminder Backend Setup

This backend sends daily reminder emails when you haven't logged an entry for the day.

## Quick Setup (Recommended)

### Prerequisites

1. **Cloudflare account** - Sign up at [cloudflare.com](https://cloudflare.com)
2. **Resend account** - Sign up at [resend.com](https://resend.com) to send emails
   - For testing, you can use `onboarding@resend.dev` as the sender

### Step 1: Get Your Resend API Key

1. Go to [resend.com/api-keys](https://resend.com/api-keys)
2. Create a new API key
3. Copy the key value

### Step 2: Run the Setup Script

Run this command from the project root (works on Windows, Mac, and Linux):

```bash
npm run setup-reminder
```

The script will:
- Log you into Cloudflare
- Create the D1 database
- Set up all required secrets
- Deploy the worker

### Step 3: Connect to the Plugin

When the script finishes, it will show:
- Your **Worker URL** (e.g., `https://lifelong-calendar-reminders.xxx.workers.dev`)
- Your **AUTH_TOKEN**

In Obsidian:
1. Open Settings → Lifelong Calendar
2. Set **Backend URL** to your worker URL
3. Set **Backend token** to your auth token
4. Set your **Reminder email**
5. Set **Reminder timezone** (e.g., `America/New_York`)
6. Set **Reminder time** (e.g., `20:00`)
7. Enable **Enable reminders**
8. Click **Save config**
9. Click **Sync today**
10. Click **Test email**

## That's It!

Your reminder system is now running. You'll receive daily emails at your specified time if you haven't logged an entry for the day.

## Troubleshooting

### Worker not responding
Run this to check:
```bash
npx wrangler tail
```
Then test your worker URL in a browser.

### Emails not sending
- Verify your Resend API key is correct
- Check [Resend dashboard](https://resend.com/emails) for delivery status
- Ensure the sender email is verified (or use `onboarding@resend.dev` for testing)

### Need to update settings?
To reconfigure reminders, update the plugin settings and click "Save config".

## Manual Setup (Advanced)

If you prefer to set up manually without the script:

1. Install Wrangler: `npm install -g wrangler`
2. Run `wrangler login`
3. Create database: `npx wrangler d1 create lifelong-calendar`
4. Update `wrangler.toml` with the database ID
5. Apply schema: `npx wrangler d1 execute lifelong-calendar --file ./schema.sql --remote`
6. Set secrets manually:
   - `npx wrangler secret put AUTH_TOKEN`
   - `npx wrangler secret put CHECKIN_SECRET`
   - `npx wrangler secret put RESEND_API_KEY`
   - `npx wrangler secret put RESEND_FROM_EMAIL`
7. Deploy: `npx wrangler deploy`

## Architecture

- **Cloudflare Worker** - Handles reminder logic and email sending
- **Cloudflare D1** - Stores reminder configuration and completion state
- **Resend** - Sends reminder emails
