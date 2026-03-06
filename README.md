# Lifelong Calendar

<p align="center">
  <img src="./assets/lifelong-calendar-icon.svg" alt="Lifelong Calendar icon" width="140" />
</p>

`Lifelong Calendar` is an Obsidian plugin for keeping a date-based timeline of your life inside your vault.

It is designed for people who want to record what they read, learned, built, visited, or experienced on specific dates, while keeping the actual data in Markdown files they control.

The plugin supports:

- timeline entries stored in your vault as Markdown
- internal Obsidian note links and external URLs
- a dedicated timeline view with search and filtering
- reminder emails for incomplete days
- grounded AI questions over timeline entries and linked notes

## What The Plugin Does

The plugin creates and manages dated timeline entries under a folder in your vault, which defaults to:

```text
Lifelong Calendar/Entries
```

Each entry is stored as a normal Markdown file with frontmatter and note content. This means:

- your timeline data remains portable
- you can inspect and edit entries manually
- your data is not locked into a proprietary backend

The plugin also offers optional cloud-based reminder support. That part uses a small Cloudflare Worker and D1 database so reminders can still function when Obsidian is closed.

## Main Features

- Dedicated `Lifelong Calendar` view inside Obsidian
- Create and edit entries with date, title, category, links, and note
- Attach internal Obsidian links or external URLs
- Preview-first workflow from the detail pane
- Search entries by text
- Filter by year and category
- Open a random memory
- Sync today's completion state to a reminder backend
- Send reminder emails through Resend
- Ask grounded AI questions over entries and linked notes

## How Entries Are Stored

Each entry is stored as one Markdown file. Filenames are generated from the date and a slug of the title.

Example:

```md
---
lc_id: 123e4567-e89b-12d3-a456-426614174000
date: 2026-03-06
title: Read chapter 1
type: reading
links:
  - "[[Book Notes]]"
  - "https://example.com/article"
created_at: 2026-03-06T20:00:00.000Z
updated_at: 2026-03-06T20:00:00.000Z
---

Short note about the day.
```

Important behavior:

- one file per entry
- unknown frontmatter fields are preserved
- links may be plain internal paths, wikilinks, Markdown links, or external URLs
- for reminder purposes, a day is considered complete if at least one timeline entry exists for that date

## Installation

This repository contains the plugin source and build output.

To install manually into Obsidian:

1. Run:

```bash
npm install
npm run build
```

2. Copy these files into your vault plugin folder:

- `manifest.json`
- `main.js`
- `styles.css`

Target path:

```text
<your-vault>/.obsidian/plugins/lifelong-calendar/
```

3. In Obsidian, open `Settings -> Community plugins`.
4. Enable `Lifelong Calendar`.

## Community Plugin Release Checklist

If you plan to submit this plugin to the official Obsidian Community Plugins directory, use this checklist:

1. Keep these files in the root of your GitHub repository:
   - `README.md`
   - `LICENSE`
   - `manifest.json`
   - `versions.json`
2. Keep your source code in the repository.
3. Do not commit `main.js` to the repository. Generate it only for releases.
4. Update `manifest.json` with the release version.
5. Create a GitHub release whose tag exactly matches the plugin version in `manifest.json`.
6. Upload these release assets:
   - `main.js`
   - `manifest.json`
   - `styles.css`
7. Submit the repository to `community-plugins.json` in `obsidianmd/obsidian-releases`.

Notes:

- `versions.json` only needs updates when `minAppVersion` changes.
- Obsidian Community Plugins currently does not support a custom listing icon through `manifest.json`.
- The icon in `assets/lifelong-calendar-icon.svg` is for repository branding, README display, and other external use.

To generate the exact release assets locally, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-release.ps1
```

This creates a versioned folder and zip file under `release/` containing only:

- `main.js`
- `manifest.json`
- `styles.css`

## Basic Usage

Typical usage flow:

1. Open the command palette.
2. Run `Open Lifelong Calendar`.
3. Create entries for today or any past date.
4. Attach relevant notes or external links.
5. Search or filter the timeline later.

You can create entries with:

- `Add Timeline Entry`
- `Add Current Note to Timeline`
- `Add External Link to Timeline`

The entry modal requires:

- a valid `YYYY-MM-DD` date
- a title
- at least one link or a note

## Commands

The plugin currently provides these commands:

- `Open Lifelong Calendar`
- `Add Timeline Entry`
- `Add Current Note to Timeline`
- `Add External Link to Timeline`
- `Open Random Memory`
- `Ask Lifelong Calendar`
- `Sync Today's Reminder Status`
- `Send Test Reminder Email`

## Settings

### General

- `Entries folder`: folder where timeline entry Markdown files are stored
- `Default categories`: comma-separated category suggestions in the entry modal
- `Open internal links in new tab`: open internal note links in a new leaf

### Reminder Cloud

- `Backend URL`: deployed Cloudflare Worker URL
- `Backend token`: shared bearer token used by the plugin
- `Reminder email`: address that receives reminder emails
- `Reminder timezone`: timezone used to determine the current day
- `Reminder time`: daily reminder time in `HH:MM` format
- `Enable reminders`: enables completion sync

Reminder action buttons:

- `Save config`: sends reminder settings to the backend
- `Sync today`: sends today's completion state to the backend
- `Test email`: sends a test reminder email

### AI Chat

- `Provider`: `OpenAI`, `Groq`, `Gemini`, `Ollama`, or `Custom OpenAI-compatible`
- `API key`: required for cloud providers
- `Base URL`: optional override, required for custom endpoints
- `Model`: model name
- `Max retrieved chunks`: number of local sources sent to the model

## Reminder System Overview

The reminder system is optional.

When configured, the plugin syncs whether today is complete to a small backend. That backend can send reminder emails even when Obsidian is closed.

The backend stores:

- reminder email
- reminder time
- reminder timezone
- reminder completion state
- reminder delivery records

The backend does not store:

- your vault
- your Markdown files
- the full contents of your timeline entries for reminder purposes
- your AI chat answers

Reminder behavior:

- a day is complete if your timeline contains at least one entry for that date
- the plugin syncs today's completion automatically when relevant entry files change
- completion from Obsidian and web check-in is merged per source instead of blindly overwriting
- email links do not mutate reminder state on `GET`
- the email check-in flow requires an explicit confirmation `POST`

## Full Reminder Setup

This section is written for first-time Cloudflare users and assumes you want to set up reminders for yourself.

### 1. Prerequisites

You need:

- a Cloudflare account
- a Resend account
- your Obsidian plugin already installed locally

For self-testing only:

- you may use `onboarding@resend.dev` as the sender address
- your reminder recipient should be the same email address tied to your Resend account

For sending real reminders more broadly later:

- you should verify your own domain in Resend

### 2. Create The D1 Database

Open a terminal in the backend folder:

```powershell
cd D:\Opensource_repos\lifelong_calendar\backend
```

Log in to Cloudflare through Wrangler:

```powershell
npx wrangler@latest login
```

Create the D1 database:

```powershell
npx wrangler@latest d1 create lifelong-calendar
```

Cloudflare will print a `database_id`.

When Wrangler asks whether it should automatically add the binding snippet, choose `n`.

Reason:

- this repo already expects the binding name to be `DB`
- the Worker code uses `env.DB`

### 3. Update `backend/wrangler.jsonc`

Open [backend/wrangler.jsonc](./backend/wrangler.jsonc) and replace the placeholder values.

Keep:

- `"binding": "DB"`
- `"database_name": "lifelong-calendar"`

Replace:

- `"database_id": "replace-me"` with your real D1 database ID
- `"PUBLIC_BASE_URL": "https://replace-me.workers.dev"` later, after the first deploy

Example structure:

```jsonc
{
  "name": "lifelong-calendar-reminders",
  "main": "worker.mjs",
  "compatibility_date": "2026-03-06",
  "triggers": {
    "crons": ["*/30 * * * *"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "lifelong-calendar",
      "database_id": "YOUR_REAL_DATABASE_ID"
    }
  ],
  "vars": {
    "PUBLIC_BASE_URL": "https://replace-me.workers.dev"
  }
}
```

### 4. Apply The Database Schema

Run:

```powershell
npx wrangler@latest d1 execute lifelong-calendar --file .\schema.sql --remote
```

If Wrangler asks whether to proceed even though the database may be temporarily unavailable, choose `y`.

This is expected when applying schema changes.

### 5. Prepare The Required Secrets

The Worker needs four secrets:

- `AUTH_TOKEN`
- `CHECKIN_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

What they are:

- `AUTH_TOKEN`: secret shared between the plugin and your Worker
- `CHECKIN_SECRET`: secret used to sign reminder email check-in links
- `RESEND_API_KEY`: API key from your Resend account
- `RESEND_FROM_EMAIL`: sender email address used by Resend

#### Generate `AUTH_TOKEN` and `CHECKIN_SECRET`

Use PowerShell:

```powershell
"AUTH_TOKEN=" + [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 } | ForEach-Object { [byte]$_ }))
"CHECKIN_SECRET=" + [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 } | ForEach-Object { [byte]$_ }))
```

Use the first value as `AUTH_TOKEN` and the second value as `CHECKIN_SECRET`.

They must be different.

#### Get `RESEND_API_KEY`

In the Resend dashboard:

1. Open `API Keys`
2. Create an API key
3. Copy the key value

#### Choose `RESEND_FROM_EMAIL`

For self-testing only, you can use:

```text
onboarding@resend.dev
```

This is suitable if you only want to send to the same email address associated with your Resend account.

### 6. Upload Secrets To Cloudflare

Run these commands one by one:

```powershell
npx wrangler@latest secret put AUTH_TOKEN
npx wrangler@latest secret put CHECKIN_SECRET
npx wrangler@latest secret put RESEND_API_KEY
npx wrangler@latest secret put RESEND_FROM_EMAIL
```

Paste the correct values when Wrangler prompts you.

### 7. First Deploy

Deploy the Worker:

```powershell
npx wrangler@latest deploy
```

Cloudflare will print a Worker URL similar to:

```text
https://lifelong-calendar-reminders.<your-subdomain>.workers.dev
```

Copy that URL.

### 8. Set `PUBLIC_BASE_URL`

Open [backend/wrangler.jsonc](./backend/wrangler.jsonc) again.

Replace:

```json
"PUBLIC_BASE_URL": "https://replace-me.workers.dev"
```

with the real deployed Worker URL.

Then deploy again:

```powershell
npx wrangler@latest deploy
```

This second deploy matters because reminder email links are built from `PUBLIC_BASE_URL`.

### 9. Verify The Worker

Open this in your browser:

```text
<your-worker-url>/health
```

Expected result:

```json
{"ok":true}
```

### 10. Connect The Plugin To The Backend

In Obsidian, open the plugin settings and fill:

- `Backend URL`: your deployed Worker URL
- `Backend token`: exactly the same value as `AUTH_TOKEN`
- `Reminder email`: your recipient email
- `Reminder timezone`: your timezone, for example `Asia/Kolkata`
- `Reminder time`: for example `20:00`
- enable `Enable reminders`

Then click:

1. `Save config`
2. `Sync today`
3. `Test email`

### 11. End-To-End Reminder Test

Verify the following:

1. The test email arrives.
2. Clicking the email link opens a confirmation page first.
3. The day is only marked complete after clicking the confirmation button.
4. Creating a timeline entry for today and syncing today marks the day complete from the plugin side as well.

### 12. Troubleshooting Reminder Setup

If something fails:

#### Check Worker logs

Run:

```powershell
npx wrangler@latest tail
```

Then retry the failed action and inspect the logs.

#### Common issues

- `database_id` in `backend/wrangler.jsonc` was not replaced
- `binding` was changed from `DB` to something else
- `PUBLIC_BASE_URL` still points to the placeholder URL
- `Backend token` in Obsidian does not match `AUTH_TOKEN`
- `schema.sql` was not applied to the remote D1 database
- `RESEND_FROM_EMAIL` is invalid for your test mode or domain setup

## AI Chat Setup

The AI feature is optional.

`Ask Lifelong Calendar` searches your timeline entries and linked internal notes, then sends the top retrieved chunks to the configured model.

### Recommended setup options

#### Option A: OpenAI

- `Provider`: `OpenAI`
- `API key`: your OpenAI API key
- `Base URL`: leave blank
- `Model`: a valid model such as `gpt-4.1-mini`

#### Option B: Gemini

If you use the built-in Gemini provider:

- `Provider`: `Gemini`
- `API key`: your Gemini API key
- `Base URL`: leave blank
- `Model`: use a valid Gemini model

Important:

- do not set the Gemini `Base URL` to the OpenAI-compatible Gemini endpoint when using `Provider = Gemini`
- the built-in Gemini provider in this plugin uses the native `generateContent` API

If you specifically want the OpenAI-compatible Gemini endpoint:

- set `Provider` to `Custom OpenAI-compatible`
- set `Base URL` to the Gemini OpenAI-compatible root URL
- use a valid Gemini-compatible model name

#### Option C: Ollama

- `Provider`: `Ollama`
- `Base URL`: `http://localhost:11434`
- `Model`: a locally available Ollama model

### AI Behavior Notes

- retrieval is currently lexical, not embedding-based
- citations are shown only when the model returns valid grounded citation IDs
- if a model returns malformed JSON or plain text, the answer may still display without citations

### Troubleshooting AI

If `Ask Lifelong Calendar` says `Failed to fetch`, the most common reasons are:

- wrong provider selected
- wrong base URL
- local Ollama server not running
- invalid endpoint path
- network or firewall issue

For example:

- if `Provider = Gemini`, leave `Base URL` blank
- if using a custom OpenAI-compatible endpoint, set `Base URL` to the API root, not `/chat/completions`

## Data Ownership

Your actual timeline data stays in your vault as Markdown files.

That means:

- you can inspect entries manually
- you can back them up normally with your vault
- the plugin can rebuild its index from stored files

## Limitations

- reminder emails require your own Cloudflare and Resend setup
- AI chat requires your own provider configuration
- retrieval is lexical only for now
- reminder completeness is currently based on whether at least one entry exists for that date

## Development

Install dependencies:

```bash
npm install
```

Type-check the plugin:

```bash
npm run check
```

Build the plugin:

```bash
npm run build
```

Validate the Worker syntax:

```bash
node --check backend/worker.mjs
```

## Project Structure

- [src/](./src): plugin source code
- [main.js](./main.js): built plugin bundle used by Obsidian
- [styles.css](./styles.css): plugin styles
- [manifest.json](./manifest.json): Obsidian plugin manifest
- [assets/lifelong-calendar-icon.svg](./assets/lifelong-calendar-icon.svg): repository branding icon
- [backend/worker.mjs](./backend/worker.mjs): Cloudflare Worker reminder service
- [backend/schema.sql](./backend/schema.sql): D1 schema
- [backend/wrangler.jsonc](./backend/wrangler.jsonc): Cloudflare Worker configuration

## Current State

The project currently includes:

- a working Obsidian timeline plugin
- Markdown-backed entry storage
- a deployable reminder backend
- AI retrieval and grounded-answer foundation

The remaining work is mostly product polish, deployment testing, and retrieval improvements.
