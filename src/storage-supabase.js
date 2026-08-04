import { supabase } from "./supabaseClient.js";

// Проста таблиця "ключ-значення" в Supabase замінює локальне сховище
// браузера, тому дані видно однаково з будь-якого пристрою.
// Структура таблиці (створюється один раз через SQL Editor в Supabase,
// SQL є у файлі supabase-setup.sql):
//   kv_store (k text, shared boolean, v text, updated_at timestamptz)

const TABLE = "kv_store";

const storageImpl = {
  async get(key, shared = false) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("v")
      .eq("k", key)
      .eq("shared", shared)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Key not found: " + key);
    return { key, value: data.v, shared };
  },

  async set(key, value, shared = false) {
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { k: key, shared, v: value, updated_at: new Date().toISOString() },
        { onConflict: "k,shared" }
      );
    if (error) throw error;
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    const { error } = await supabase.from(TABLE).delete().eq("k", key).eq("shared", shared);
    if (error) throw error;
    return { key, deleted: true, shared };
  },

  async list(prefix = "", shared = false) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("k")
      .eq("shared", shared)
      .like("k", `${prefix}%`);
    if (error) throw error;
    return { keys: (data || []).map((r) => r.k), prefix, shared };
  },
};

if (typeof window !== "undefined") {
  window.storage = storageImpl;
}

// Підписка на зміни конкретного ключа в реальному часі — коли хтось
// зберігає дані з іншого пристрою, тут спрацьовує callback з новим
// значенням, і застосунок може одразу оновити екран без перезавантаження.
export function subscribeToKey(key, shared, onChange) {
  const channel = supabase
    .channel(`kv_${key}_${shared}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `k=eq.${key}` },
      (payload) => {
        const row = payload.new;
        if (row && row.shared === shared && typeof row.v === "string") {
          onChange(row.v);
        }
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export default storageImpl;
