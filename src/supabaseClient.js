import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error(
    "Не задані VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Додайте їх у налаштуваннях проєкту на Vercel (Settings → Environment Variables) " +
      "і в файлі .env для локальної розробки."
  );
}

export const supabaseUrl = url;
export const supabaseAnonKey = key;
export const supabase = createClient(url, key);
