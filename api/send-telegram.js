// Serverless-функція Vercel. Виконується на сервері, а не в браузері,
// тому токен бота (TELEGRAM_BOT_TOKEN) ніколи не потрапляє в код,
// який бачить користувач.
//
// Приймає POST { chatIds: string[], message: string } і надсилає
// повідомлення кожному chat ID через Telegram Bot API.

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
