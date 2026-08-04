// Просте сховище на основі localStorage браузера.
// Повторює API window.storage, яке використовує App.jsx,
// тому сам код застосунку можна не змінювати.

function fullKey(key, shared) {
  return (shared ? "shared:" : "personal:") + key;
}

const storageImpl = {
  async get(key, shared = false) {
    const raw = localStorage.getItem(fullKey(key, shared));
    if (raw === null) {
      throw new Error("Key not found: " + key);
    }
    return { key, value: raw, shared };
  },

  async set(key, value, shared = false) {
    localStorage.setItem(fullKey(key, shared), value);
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    localStorage.removeItem(fullKey(key, shared));
    return { key, deleted: true, shared };
  },

  async list(prefix = "", shared = false) {
    const marker = shared ? "shared:" : "personal:";
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(marker))
      .map((k) => k.slice(marker.length))
      .filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared };
  },
};

if (typeof window !== "undefined") {
  window.storage = storageImpl;
}

export default storageImpl;
