export default {
  async fetch(request, env, ctx) {
    try {
      await ensureSchema(env);
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return cors(new Response(null, { status: 204 }));
      }

      if (url.pathname === "/health") {
        return cors(json({ ok: true }));
      }

      if (url.pathname === "/checkin/today" && request.method === "GET") {
        return handleCheckinPage(url, env);
      }

      if (url.pathname === "/checkin/today" && request.method === "POST") {
        return handleCheckinConfirmation(request, env);
      }

      if (url.pathname === "/status/sync" && request.method === "POST") {
        await requireAuth(request, env);
        const body = await request.json();
        await syncStatus(env, body);
        return cors(json({ ok: true }));
      }

      if (url.pathname === "/reminders/config" && request.method === "POST") {
        await requireAuth(request, env);
        const body = await request.json();
        await upsertUserConfig(env, body);
        return cors(json({ ok: true }));
      }

      if (url.pathname === "/reminders/test" && request.method === "POST") {
        await requireAuth(request, env);
        const body = await request.json();
        const user = await getUser(env, body.email);
        if (!user) {
          return cors(json({ error: "Unknown reminder user." }, 404));
        }

        await sendReminderEmail(env, user, true);
        return cors(json({ ok: true }));
      }

      return cors(json({ error: "Not found." }, 404));
    } catch (error) {
      if (error instanceof Response) {
        return cors(error);
      }

      console.error("Reminder worker request failed", error);
      return cors(json({ error: "Internal server error." }, 500));
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await ensureSchema(env);
      await runReminderSweep(env);
    })());
  }
};

async function runReminderSweep(env) {
  const users = await env.DB.prepare(
    "SELECT email, timezone, reminder_time_local, reminders_enabled FROM users WHERE reminders_enabled = 1"
  ).all();

  for (const user of users.results ?? []) {
    const today = todayInTimezone(user.timezone);
    const nowMinutes = currentMinutesInTimezone(user.timezone);
    const targetMinutes = hhmmToMinutes(user.reminder_time_local);

    if (nowMinutes < targetMinutes || nowMinutes > targetMinutes + 59) {
      continue;
    }

    const status = await env.DB.prepare(
      "SELECT MAX(complete) AS complete FROM daily_status_sources WHERE email = ? AND date = ?"
    ).bind(user.email, today).first();

    const alreadySent = await env.DB.prepare(
      "SELECT status FROM deliveries WHERE email = ? AND date = ?"
    ).bind(user.email, today).first();

    if (alreadySent) {
      continue;
    }

    if (status?.complete === 1) {
      continue;
    }

    await sendReminderEmail(env, user, false);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO deliveries (email, date, status, sent_at) VALUES (?, ?, ?, ?)"
    ).bind(user.email, today, "sent", new Date().toISOString()).run();
  }
}

async function syncStatus(env, body) {
  validateBody(body, ["email", "date", "complete", "source", "observedAt"]);
  if (!isReminderSource(body.source)) {
    throw new Response(JSON.stringify({ error: "Invalid reminder status source." }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  const observedAt = normalizeIsoTimestamp(body.observedAt);
  if (!observedAt) {
    throw new Response(JSON.stringify({ error: "Invalid observedAt timestamp." }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  await env.DB.prepare(
    `INSERT INTO daily_status_sources (email, date, source, complete, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email, date, source) DO UPDATE SET
       complete = excluded.complete,
       updated_at = excluded.updated_at
     WHERE daily_status_sources.updated_at <= excluded.updated_at`
  ).bind(
    body.email,
    body.date,
    body.source,
    body.complete ? 1 : 0,
    observedAt
  ).run();
}

async function upsertUserConfig(env, body) {
  validateBody(body, ["email", "reminderTimeLocal", "timezone", "enabled"]);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO users (email, timezone, reminder_time_local, reminders_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    body.email,
    body.timezone,
    body.reminderTimeLocal,
    body.enabled ? 1 : 0,
    new Date().toISOString()
  ).run();
}

async function getUser(env, email) {
  return env.DB.prepare(
    "SELECT email, timezone, reminder_time_local, reminders_enabled FROM users WHERE email = ?"
  ).bind(email).first();
}

async function sendReminderEmail(env, user, isTest) {
  const today = todayInTimezone(user.timezone);
  const checkinToken = await signToken(env.CHECKIN_SECRET, `${user.email}:${today}`);
  const checkinUrl = `${env.PUBLIC_BASE_URL}/checkin/today?email=${encodeURIComponent(user.email)}&date=${encodeURIComponent(today)}&token=${encodeURIComponent(checkinToken)}`;
  const subject = isTest
    ? "Test reminder from Lifelong Calendar"
    : `Fill today's Lifelong Calendar entry (${today})`;

  const html = `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <h2>${escapeHtml(subject)}</h2>
      <p>${isTest ? "This is a test email from your reminder backend." : "You haven't filled today's calendar entry yet."}</p>
      <p><a href="${checkinUrl}" style="display:inline-block;padding:12px 16px;background:#0f766e;color:white;text-decoration:none;border-radius:8px;">Confirm today's completion</a></p>
      <p style="color:#666;">This only updates today's completion status for reminders. Your actual notes still live in Obsidian.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [user.email],
      subject,
      html
    })
  });

  if (!response.ok) {
    throw new Error(`Resend error (${response.status}): ${await response.text()}`);
  }
}

async function handleCheckinPage(url, env) {
  const email = url.searchParams.get("email");
  const date = url.searchParams.get("date");
  const token = url.searchParams.get("token");

  if (!email || !date || !token) {
    return htmlPage("Invalid check-in link.", false);
  }

  const valid = await verifyToken(env.CHECKIN_SECRET, `${email}:${date}`, token);
  if (!valid) {
    return htmlPage("This check-in link is invalid or expired.", false);
  }

  return renderCheckinConfirmationPage(email, date, token);
}

async function handleCheckinConfirmation(request, env) {
  const formData = await request.formData();
  const email = formData.get("email");
  const date = formData.get("date");
  const token = formData.get("token");

  if (typeof email !== "string" || typeof date !== "string" || typeof token !== "string") {
    return htmlPage("Invalid check-in request.", false);
  }

  const valid = await verifyToken(env.CHECKIN_SECRET, `${email}:${date}`, token);
  if (!valid) {
    return htmlPage("This check-in link is invalid or expired.", false);
  }

  await syncStatus(env, {
    email,
    date,
    complete: true,
    source: "web",
    observedAt: new Date().toISOString()
  });

  return htmlPage(`Marked ${date} complete for ${email}.`, true);
}

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      timezone TEXT NOT NULL,
      reminder_time_local TEXT NOT NULL,
      reminders_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS daily_status_sources (
      email TEXT NOT NULL,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      complete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (email, date, source)
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS deliveries (
      email TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      PRIMARY KEY (email, date)
    )`
  ).run();

  const legacyStatusTable = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'daily_status'"
  ).first();

  if (legacyStatusTable) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO daily_status_sources (email, date, source, complete, updated_at)
       SELECT email, date, source, complete, updated_at FROM daily_status`
    ).run();
  }
}

async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${env.AUTH_TOKEN}`) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}

function validateBody(body, fields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Response(JSON.stringify({ error: "Request body must be a JSON object." }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  for (const field of fields) {
    if (!(field in body)) {
      throw new Response(JSON.stringify({ error: `Missing field: ${field}` }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
}

function todayInTimezone(timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function currentMinutesInTimezone(timezone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const [hour, minute] = formatter.format(new Date()).split(":").map(Number);
  return (hour * 60) + minute;
}

function hhmmToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour * 60) + minute;
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function isReminderSource(value) {
  return value === "obsidian" || value === "web";
}

async function signToken(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(signature);
}

async function verifyToken(secret, payload, token) {
  const expected = await signToken(secret, payload);
  return expected === token;
}

function toBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function htmlPage(message, success) {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;padding:24px;">
      <h2>${success ? "Done" : "Check-in failed"}</h2>
      <p>${escapeHtml(message)}</p>
    </body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    }
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function renderCheckinConfirmationPage(email, date, token) {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;padding:24px;line-height:1.5;">
      <h2>Confirm check-in</h2>
      <p>This will mark <strong>${escapeHtml(date)}</strong> complete for reminder tracking on <strong>${escapeHtml(email)}</strong>.</p>
      <p>Your actual notes still live in Obsidian.</p>
      <form method="POST">
        <input type="hidden" name="email" value="${escapeHtml(email)}" />
        <input type="hidden" name="date" value="${escapeHtml(date)}" />
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <button type="submit" style="padding:12px 16px;background:#0f766e;color:white;border:none;border-radius:8px;cursor:pointer;">Mark today complete</button>
      </form>
    </body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    }
  );
}

function cors(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return response;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
