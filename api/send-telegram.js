// Serverless-функція Vercel. Виконується на сервері, а не в браузері,
// тому токен бота (TELEGRAM_BOT_TOKEN) ніколи не потрапляє в код,
// який бачить користувач.
//
// Приймає POST { chatIds: string[], message: string } і надсилає
// повідомлення кожному chat ID через Telegram Bot API.

// Serverless-функція Vercel. Виконується на сервері, а не в браузері,
// тому токен бота (TELEGRAM_BOT_TOKEN) ніколи не потрапляє в код,
// який бачить користувач.
//
// Приймає POST { chatIds: string[], message: string } і надсилає
// повідомлення кожному chat ID через Telegram Bot API.
//
// Захист: запит приймається лише від того, хто справді залогінений
// у застосунку (перевіряємо токен сесії Supabase на сервері) —
// сторонній не зможе скористатись цією адресою для розсилки.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: "TELEGRAM_BOT_TOKEN не налаштовано на сервері" });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: "Supabase не налаштовано на сервері" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const userToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!userToken) {
    res.status(401).json({ error: "Не авторизовано" });
    return;
  }

  try {
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!verifyRes.ok) {
      res.status(401).json({ error: "Недійсна сесія" });
      return;
    }
  } catch (e) {
    res.status(401).json({ error: "Не вдалось перевірити сесію" });
    return;
  }

  const { chatIds, message } = req.body || {};
  if (!message || !Array.isArray(chatIds) || chatIds.length === 0) {
    res.status(400).json({ error: "Потрібні chatIds (масив) та message" });
    return;
  }

  const results = await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message }),
        });
        const data = await r.json();
        return { chatId, ok: !!data.ok, description: data.description || null };
      } catch (e) {
        return { chatId, ok: false, description: String(e) };
      }
    })
  );

  const anyFailed = results.some((r) => !r.ok);
  res.status(anyFailed ? 207 : 200).json({ results });
}
