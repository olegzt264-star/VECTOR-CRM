import { useState, useEffect, useRef, useMemo } from "react";
import { subscribeToKey } from "./storage-supabase.js";
import { supabaseUrl, supabaseAnonKey } from "./supabaseClient.js";
import {
  Calendar as CalendarIcon,
  Package,
  Users,
  Briefcase,
  Plus,
  X,
  Edit2,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Phone,
  StickyNote,
  Search,
  Wrench,
  Wallet,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

// ---------- constants ----------

const STATUS = {
  planned: { label: "Заплановано", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  confirmed: { label: "Підтверджено", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { label: "У процесі", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  done: { label: "Завершено", dot: "bg-neutral-400", chip: "bg-neutral-100 text-neutral-600 border-neutral-200" },
  cancelled: { label: "Скасовано", dot: "bg-rose-400", chip: "bg-rose-50 text-rose-500 border-rose-200 line-through" },
};

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const EXPENSE_CATEGORIES = [
  "Логістика/транспорт",
  "Оплата бригади",
  "Оренда додаткового обладнання",
  "Витратні матеріали",
  "Інше",
];

const STORAGE_KEY = "rental-crm-state-v1";

function sum(arr) {
  return arr.reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

function toISO(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function fmtMoney(n) {
  if (!n && n !== 0) return "";
  return new Intl.NumberFormat("uk-UA").format(n) + " грн";
}

// ---------- seed data ----------

const seedEquipment = [
  { id: uid("eq"), name: "Активна колонка JBL EON715", category: "Звук", qty: 8 },
  { id: uid("eq"), name: "Мікшерний пульт Behringer X32", category: "Звук", qty: 2 },
  { id: uid("eq"), name: "Радіомікрофон Shure SM58", category: "Звук", qty: 12 },
  { id: uid("eq"), name: "Прожектор Clay Paky Sharpy", category: "Світло", qty: 16 },
  { id: uid("eq"), name: "Пульт світла GrandMA2", category: "Світло", qty: 2 },
  { id: uid("eq"), name: "Ферма трас (2м)", category: "Конструкції", qty: 20 },
  { id: uid("eq"), name: "Сценічний подіум 2x1м", category: "Конструкції", qty: 30 },
];

const seedClients = [
  { id: uid("cl"), name: "ТОВ «Івент Груп»", phone: "+380 67 111 22 33", notes: "Постійний клієнт, оплата за фактом" },
  { id: uid("cl"), name: "Фестиваль «Замкова гора»", phone: "+380 50 222 33 44", notes: "Щорічний фестиваль, велике замовлення в серпні" },
];

const seedEmployees = [
  { id: uid("em"), name: "Олег Ткаченко", role: "Звукорежисер", phone: "+380 63 111 44 55", notes: "" },
  { id: uid("em"), name: "Артем Бойко", role: "Світлотехнік", phone: "+380 66 222 55 66", notes: "" },
  { id: uid("em"), name: "Ірина Гнатюк", role: "Менеджер проекту", phone: "+380 67 333 66 77", notes: "" },
];

// ---------- main app ----------

export default function App() {
  const [tab, setTab] = useState("calendar");
  const [equipment, setEquipment] = useState(seedEquipment);
  const [clients, setClients] = useState(seedClients);
  const [employees, setEmployees] = useState(seedEmployees);
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const loadedRef = useRef(false);
  const saveTimer = useRef(null);
  const lastSyncedRawRef = useRef(null);

  // ---- load from persistent storage on mount ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          if (data.equipment) setEquipment(data.equipment);
          if (data.clients) setClients(data.clients);
          if (data.employees) setEmployees(data.employees);
          if (data.projects) setProjects(data.projects);
          lastSyncedRawRef.current = res.value;
        }
      } catch (e) {
        // Нічого немає в Supabase — перевіряємо, чи є старі дані в
        // localStorage цього браузера (з попередньої версії застосунку),
        // і якщо є, переносимо їх у спільну базу один раз.
        try {
          const legacyRaw =
            typeof window !== "undefined" ? window.localStorage.getItem("personal:" + STORAGE_KEY) : null;
          if (legacyRaw) {
            const data = JSON.parse(legacyRaw);
            if (data.equipment) setEquipment(data.equipment);
            if (data.clients) setClients(data.clients);
            if (data.employees) setEmployees(data.employees);
            if (data.projects) setProjects(data.projects);
            lastSyncedRawRef.current = legacyRaw;
            await window.storage.set(STORAGE_KEY, legacyRaw, false).catch(() => {});
          }
        } catch (e2) {
          // no legacy data either — starts with seed data, that's fine
        }
      } finally {
        loadedRef.current = true;
        setLoaded(true);
      }
    })();
  }, []);

  // ---- live sync: pick up changes saved from another device ----
  useEffect(() => {
    const unsubscribe = subscribeToKey(STORAGE_KEY, false, (rawValue) => {
      // Ігноруємо відлуння власного щойно виконаного збереження —
      // порівнюємо вміст, а не покладаємось на прапорець-таймінг
      // (той підхід міг помилково "зʼїдати" наступне реальне
      // збереження, якщо зміни вносились швидко одна за одною).
      if (rawValue === lastSyncedRawRef.current) return;
      try {
        const data = JSON.parse(rawValue);
        lastSyncedRawRef.current = rawValue;
        if (data.equipment) setEquipment(data.equipment);
        if (data.clients) setClients(data.clients);
        if (data.employees) setEmployees(data.employees);
        if (data.projects) setProjects(data.projects);
      } catch (e) {
        // ignore malformed payloads
      }
    });
    return unsubscribe;
  }, []);

  // ---- persist on change (debounced, with immediate flush on close) ----
  const flushSave = async () => {
    if (!loadedRef.current) return;
    const raw = JSON.stringify({ equipment, clients, employees, projects });
    if (raw === lastSyncedRawRef.current) return;
    try {
      await window.storage.set(STORAGE_KEY, raw, false);
      lastSyncedRawRef.current = raw;
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
    }
  };
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  useEffect(() => {
    if (!loadedRef.current) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSaveRef.current();
    }, 150);
    return () => clearTimeout(saveTimer.current);
  }, [equipment, clients, employees, projects]);

  // Надійне збереження саме на момент закриття вкладки чи всього
  // браузера: звичайний запит (fetch без keepalive) браузер може
  // обірвати, щойно почне закривати процес, і дані не встигають
  // дійти до сервера. keepalive:true спеціально призначений саме
  // для такого випадку — запит переживає закриття сторінки.
  const flushOnClose = () => {
    try {
      const raw = JSON.stringify({ equipment, clients, employees, projects });
      if (raw === lastSyncedRawRef.current) return;
      if (!supabaseUrl || !supabaseAnonKey) return;
      const body = JSON.stringify([
        { k: STORAGE_KEY, shared: false, v: raw, updated_at: new Date().toISOString() },
      ]);
      fetch(`${supabaseUrl}/rest/v1/kv_store?on_conflict=k,shared`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body,
        keepalive: true,
      }).catch(() => {});
      lastSyncedRawRef.current = raw;
    } catch (e) {
      // best effort — нічого страшного, якщо не вдалось
    }
  };
  const flushOnCloseRef = useRef(flushOnClose);
  flushOnCloseRef.current = flushOnClose;

  useEffect(() => {
    const handleClose = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flushOnCloseRef.current();
    };
    const onVisibility = () => {
      // Перемикання на іншу вкладку/згортання — сторінка ще жива,
      // тож звичайне збереження встигає завершитись нормально.
      if (document.visibilityState === "hidden") {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        flushSaveRef.current();
      }
    };
    window.addEventListener("beforeunload", handleClose);
    window.addEventListener("pagehide", handleClose);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleClose);
      window.removeEventListener("pagehide", handleClose);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const tabs = [
    { id: "calendar", label: "Календар", icon: CalendarIcon },
    { id: "projects", label: "Проекти", icon: Briefcase },
    { id: "finance", label: "Фінанси", icon: Wallet },
    { id: "inventory", label: "Склад", icon: Package },
    { id: "employees", label: "Співробітники", icon: Wrench },
    { id: "clients", label: "Клієнти", icon: Users },
  ];

  return (
    <div className="w-full h-full min-h-[700px] bg-neutral-50 text-neutral-900 flex flex-col">
      {/* header */}
      <div className="bg-neutral-950 text-neutral-100">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-amber-500 flex items-center justify-center text-neutral-950 font-bold text-sm">
              ▲
            </div>
            <div>
              <div className="font-semibold tracking-tight leading-none">СтейджРент CRM</div>
              <div className="text-[11px] text-neutral-400 leading-none mt-1">Оренда сценічного обладнання</div>
            </div>
          </div>
          <div className="text-[11px] text-neutral-500">
            {saveState === "saving" ? "Збереження…" : saveState === "saved" ? "Збережено" : ""}
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5 flex gap-1 border-t border-neutral-800">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-amber-500 text-white"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-5 py-6">
        {!loaded ? (
          <div className="text-sm text-neutral-400 py-20 text-center">Завантаження…</div>
        ) : tab === "calendar" ? (
          <CalendarTab
            projects={projects}
            clients={clients}
            equipment={equipment}
            employees={employees}
            setProjects={setProjects}
          />
        ) : tab === "projects" ? (
          <ProjectsTab
            projects={projects}
            setProjects={setProjects}
            clients={clients}
            equipment={equipment}
            employees={employees}
          />
        ) : tab === "finance" ? (
          <FinanceTab
            projects={projects}
            setProjects={setProjects}
            clients={clients}
            equipment={equipment}
            employees={employees}
          />
        ) : tab === "inventory" ? (
          <InventoryTab equipment={equipment} setEquipment={setEquipment} projects={projects} />
        ) : tab === "employees" ? (
          <EmployeesTab employees={employees} setEmployees={setEmployees} projects={projects} />
        ) : (
          <ClientsTab clients={clients} setClients={setClients} projects={projects} />
        )}
      </div>
    </div>
  );
}

// ---------- shared: equipment usage / conflicts ----------

function computeUsage(projects, equipmentId, start, end, excludeProjectId) {
  let used = 0;
  for (const p of projects) {
    if (p.id === excludeProjectId) continue;
    if (p.status === "cancelled") continue;
    if (!overlaps(p.startDate, p.endDate, start, end)) continue;
    const item = p.items.find((i) => i.equipmentId === equipmentId);
    if (item) used += item.qty;
  }
  return used;
}

// ---------- Calendar Tab ----------

function CalendarTab({ projects, clients, equipment, employees, setProjects }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toISO(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < startOffset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const projectsForDay = (iso) =>
    projects.filter((p) => p.status !== "cancelled" && overlaps(p.startDate, p.endDate, iso, iso));

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";

  const todayISO = toISO(new Date());
  const selectedProjects = projectsForDay(selectedDate);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
      {/* calendar grid */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="font-semibold text-neutral-800">
            {MONTHS[month]} {year}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCursor(new Date())}
              className="px-2 py-1 text-xs rounded hover:bg-neutral-100 text-neutral-500 font-medium"
            >
              Сьогодні
            </button>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-neutral-200 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, idx) => {
            if (!d)
              return <div key={idx} className="min-h-[92px] border-b border-r border-neutral-100 bg-neutral-50/40" />;
            const iso = toISO(d);
            const dayProjects = projectsForDay(iso);
            const isToday = iso === todayISO;
            const isSelected = iso === selectedDate;
            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(iso)}
                className={`min-h-[92px] border-b border-r border-neutral-100 p-1.5 text-left align-top flex flex-col gap-1 hover:bg-amber-50/60 transition-colors ${
                  isSelected ? "bg-amber-50 ring-1 ring-inset ring-amber-300" : ""
                }`}
              >
                <span
                  className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-amber-500 text-white font-semibold" : "text-neutral-500"
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-col gap-0.5">
                  {dayProjects.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="text-[10px] px-1 py-0.5 rounded truncate flex items-center gap-1 bg-neutral-100 text-neutral-700"
                      title={p.name}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS[p.status].dot}`} />
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                  {dayProjects.length > 3 && (
                    <div className="text-[10px] text-neutral-400 px-1">+{dayProjects.length - 3} ще</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* side panel */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4 h-fit">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm text-neutral-800">{fmtDate(selectedDate)}</div>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1 text-xs font-medium bg-neutral-900 text-white px-2.5 py-1.5 rounded-md hover:bg-neutral-800"
          >
            <Plus size={13} /> Проект
          </button>
        </div>
        {selectedProjects.length === 0 ? (
          <div className="text-sm text-neutral-400 py-6 text-center">Нічого не заплановано</div>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setEditing(p);
                  setShowForm(true);
                }}
                className="text-left border border-neutral-200 rounded-md p-2.5 hover:border-neutral-300 hover:bg-neutral-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-800 truncate">{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS[p.status].chip}`}>
                    {STATUS[p.status].label}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">{clientName(p.clientId)}</div>
                <div className="text-[11px] text-neutral-400 mt-1">
                  {fmtDate(p.startDate)} — {fmtDate(p.endDate)}
                </div>
                {p.responsibleId && (
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    Відп.: {employees.find((e) => e.id === p.responsibleId)?.name || "—"}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ProjectForm
          project={editing}
          defaultDate={selectedDate}
          clients={clients}
          equipment={equipment}
          employees={employees}
          projects={projects}
          onClose={() => setShowForm(false)}
          onSave={(p) => {
            setProjects((prev) => {
              const exists = prev.some((x) => x.id === p.id);
              return exists ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
            });
            setShowForm(false);
          }}
          onDelete={
            editing
              ? (id) => {
                  setProjects((prev) => prev.filter((x) => x.id !== id));
                  setShowForm(false);
                }
              : null
          }
        />
      )}
    </div>
  );
}

// ---------- Projects Tab ----------

function ProjectsTab({ projects, setProjects, clients, equipment, employees }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";

  const sorted = useMemo(() => {
    return [...projects]
      .filter((p) => (statusFilter === "all" ? true : p.status === statusFilter))
      .filter((p) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) || clientName(p.clientId).toLowerCase().includes(q);
      })
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }, [projects, query, statusFilter, clients]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук проекту або клієнта…"
              className="pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-neutral-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">Усі статуси</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 text-sm font-medium bg-neutral-900 text-white px-3 py-2 rounded-md hover:bg-neutral-800"
        >
          <Plus size={15} /> Новий проект
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-neutral-400 py-16 text-center border border-dashed border-neutral-200 rounded-lg">
          Проектів не знайдено. Створіть перший проект.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setEditing(p);
                setShowForm(true);
              }}
              className="text-left bg-white border border-neutral-200 rounded-lg p-3.5 hover:border-neutral-300 hover:shadow-sm transition-all flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-800 truncate">{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS[p.status].chip}`}>
                    {STATUS[p.status].label}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {clientName(p.clientId)} · {fmtDate(p.startDate)} — {fmtDate(p.endDate)} · {p.items.length} позицій
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-medium text-neutral-700">{fmtMoney(p.price)}</div>
                <div className={`text-[11px] ${sum(p.payments || []) >= p.price && p.price > 0 ? "text-emerald-600" : "text-neutral-400"}`}>
                  Отримано: {fmtMoney(sum(p.payments || []))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <ProjectForm
          project={editing}
          clients={clients}
          equipment={equipment}
          employees={employees}
          projects={projects}
          onClose={() => setShowForm(false)}
          onSave={(p) => {
            setProjects((prev) => {
              const exists = prev.some((x) => x.id === p.id);
              return exists ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
            });
            setShowForm(false);
          }}
          onDelete={
            editing
              ? (id) => {
                  setProjects((prev) => prev.filter((x) => x.id !== id));
                  setShowForm(false);
                }
              : null
          }
        />
      )}
    </div>
  );
}

// ---------- Finance Tab ----------

function FinanceTab({ projects, setProjects, clients, equipment, employees }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";

  const paymentStatus = (p) => {
    const paid = sum(p.payments || []);
    if (p.price > 0 && paid >= p.price) return "paid";
    if (paid > 0) return "partial";
    return "unpaid";
  };

  const PAYMENT_STATUS_LABEL = {
    paid: { label: "Оплачено повністю", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    partial: { label: "Частково оплачено", chip: "bg-amber-50 text-amber-700 border-amber-200" },
    unpaid: { label: "Не оплачено", chip: "bg-rose-50 text-rose-600 border-rose-200" },
  };

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (p.status === "cancelled") return false;
      if (periodFrom && p.startDate < periodFrom) return false;
      if (periodTo && p.startDate > periodTo) return false;
      if (clientFilter !== "all" && p.clientId !== clientFilter) return false;
      if (statusFilter !== "all" && paymentStatus(p) !== statusFilter) return false;
      return true;
    });
  }, [projects, periodFrom, periodTo, clientFilter, statusFilter]);

  const totals = useMemo(() => {
    let price = 0,
      paid = 0,
      expenses = 0;
    for (const p of filtered) {
      price += Number(p.price) || 0;
      paid += sum(p.payments || []);
      expenses += sum(p.expenses || []);
    }
    return { price, paid, expenses, remaining: Math.max(0, price - paid), profit: paid - expenses };
  }, [filtered]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => (a.startDate < b.startDate ? 1 : -1)), [filtered]);

  const hasFilters = periodFrom || periodTo || clientFilter !== "all" || statusFilter !== "all";

  return (
    <div>
      {/* filters */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4 mb-4 flex flex-wrap items-end gap-3">
        <Field label="Період з">
          <input
            type="date"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </Field>
        <Field label="Період по">
          <input
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </Field>
        <Field label="Клієнт">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">Усі клієнти</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Статус оплати">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">Усі статуси</option>
            <option value="paid">Оплачено повністю</option>
            <option value="partial">Частково оплачено</option>
            <option value="unpaid">Не оплачено</option>
          </select>
        </Field>
        {hasFilters && (
          <button
            onClick={() => {
              setPeriodFrom("");
              setPeriodTo("");
              setClientFilter("all");
              setStatusFilter("all");
            }}
            className="text-xs text-neutral-500 hover:text-neutral-700 underline pb-2"
          >
            Скинути фільтри
          </button>
        )}
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <div className="bg-white border border-neutral-200 rounded-lg p-3.5">
          <div className="text-[11px] text-neutral-400 mb-1">Сума проектів</div>
          <div className="text-base font-semibold text-neutral-800">{fmtMoney(totals.price)}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3.5">
          <div className="text-[11px] text-neutral-400 mb-1 flex items-center gap-1">
            <TrendingUp size={11} className="text-emerald-500" /> Отримано
          </div>
          <div className="text-base font-semibold text-emerald-600">{fmtMoney(totals.paid)}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3.5">
          <div className="text-[11px] text-neutral-400 mb-1">Заборгованість</div>
          <div className="text-base font-semibold text-neutral-800">{fmtMoney(totals.remaining)}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3.5">
          <div className="text-[11px] text-neutral-400 mb-1 flex items-center gap-1">
            <TrendingDown size={11} className="text-rose-500" /> Витрати
          </div>
          <div className="text-base font-semibold text-rose-500">{fmtMoney(totals.expenses)}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3.5">
          <div className="text-[11px] text-neutral-400 mb-1">Прибуток</div>
          <div className={`text-base font-semibold ${totals.profit >= 0 ? "text-neutral-800" : "text-rose-500"}`}>
            {fmtMoney(totals.profit)}
          </div>
        </div>
      </div>

      {/* project list */}
      {sorted.length === 0 ? (
        <div className="text-sm text-neutral-400 py-16 text-center border border-dashed border-neutral-200 rounded-lg">
          Немає проектів за обраними фільтрами.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((p) => {
            const st = paymentStatus(p);
            const paid = sum(p.payments || []);
            const remaining = Math.max(0, (Number(p.price) || 0) - paid);
            return (
              <button
                key={p.id}
                onClick={() => {
                  setEditing(p);
                  setShowForm(true);
                }}
                className="text-left bg-white border border-neutral-200 rounded-lg p-3.5 hover:border-neutral-300 hover:shadow-sm transition-all flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-800 truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PAYMENT_STATUS_LABEL[st].chip}`}>
                      {PAYMENT_STATUS_LABEL[st].label}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {clientName(p.clientId)} · {fmtDate(p.startDate)} — {fmtDate(p.endDate)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-neutral-700">{fmtMoney(p.price)}</div>
                  <div className="text-[11px] text-neutral-400">
                    Отримано {fmtMoney(paid)}
                    {remaining > 0 ? ` · Борг ${fmtMoney(remaining)}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <ProjectForm
          project={editing}
          clients={clients}
          equipment={equipment}
          employees={employees}
          projects={projects}
          onClose={() => setShowForm(false)}
          onSave={(p) => {
            setProjects((prev) => {
              const exists = prev.some((x) => x.id === p.id);
              return exists ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
            });
            setShowForm(false);
          }}
          onDelete={(id) => {
            setProjects((prev) => prev.filter((x) => x.id !== id));
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- Project Form (modal) ----------

function ProjectForm({ project, defaultDate, clients, equipment, employees, projects, onClose, onSave, onDelete }) {
  const [name, setName] = useState(project?.name || "");
  const [clientId, setClientId] = useState(project?.clientId || clients[0]?.id || "");
  const [startDate, setStartDate] = useState(project?.startDate || defaultDate || toISO(new Date()));
  const [endDate, setEndDate] = useState(project?.endDate || defaultDate || toISO(new Date()));
  const [status, setStatus] = useState(project?.status || "planned");
  const [price, setPrice] = useState(project?.price || "");
  const [notes, setNotes] = useState(project?.notes || "");
  const [items, setItems] = useState(project?.items || []);
  const [responsibleId, setResponsibleId] = useState(project?.responsibleId || "");
  const [crew, setCrew] = useState(project?.crew || []);
  const [payments, setPayments] = useState(project?.payments || []);
  const [expenses, setExpenses] = useState(project?.expenses || []);

  const toggleCrew = (empId) => {
    setCrew((prev) => (prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]));
  };

  const addPayment = () => setPayments((prev) => [...prev, { id: uid("pay"), date: toISO(new Date()), amount: "", note: "" }]);
  const updatePayment = (idx, patch) => setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removePayment = (idx) => setPayments((prev) => prev.filter((_, i) => i !== idx));

  const addExpense = () =>
    setExpenses((prev) => [...prev, { id: uid("exp"), date: toISO(new Date()), amount: "", category: EXPENSE_CATEGORIES[0], note: "" }]);
  const updateExpense = (idx, patch) => setExpenses((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const removeExpense = (idx) => setExpenses((prev) => prev.filter((_, i) => i !== idx));

  const totalPaid = useMemo(() => sum(payments), [payments]);
  const totalExpenses = useMemo(() => sum(expenses), [expenses]);

  const addItem = () => {
    if (equipment.length === 0) return;
    setItems((prev) => [...prev, { equipmentId: equipment[0].id, qty: 1 }]);
  };
  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const conflicts = useMemo(() => {
    const list = [];
    for (const it of items) {
      const eq = equipment.find((e) => e.id === it.equipmentId);
      if (!eq) continue;
      const usedByOthers = computeUsage(projects, it.equipmentId, startDate, endDate, project?.id);
      const total = usedByOthers + it.qty;
      if (total > eq.qty) {
        list.push({ eq, needed: it.qty, usedByOthers, total, available: eq.qty });
      }
    }
    return list;
  }, [items, startDate, endDate, equipment, projects, project]);

  const canSave = name.trim() && clientId && startDate && endDate && startDate <= endDate;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: project?.id || uid("pr"),
      name: name.trim(),
      clientId,
      startDate,
      endDate,
      status,
      price: price === "" ? 0 : Number(price),
      notes,
      items,
      responsibleId,
      crew,
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) || 0 })),
      expenses: expenses.map((e) => ({ ...e, amount: Number(e.amount) || 0 })),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 sticky top-0 bg-white">
          <div className="font-semibold text-neutral-800">{project ? "Редагувати проект" : "Новий проект"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3.5">
          <Field label="Назва проекту">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Наприклад: Весілля Олени та Ігоря"
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>

          <Field label="Клієнт">
            {clients.length === 0 ? (
              <div className="text-xs text-neutral-400">Спочатку додайте клієнта у вкладці «Клієнти»</div>
            ) : (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Відповідальний">
              <select
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Не призначено</option>
                {employees.map((em) => (
                  <option key={em.id} value={em.id}>
                    {em.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Бригада">
              {employees.length === 0 ? (
                <div className="text-xs text-neutral-400 pt-2">Немає співробітників</div>
              ) : (
                <div className="border border-neutral-300 rounded-md px-2.5 py-1.5 max-h-24 overflow-y-auto flex flex-col gap-1">
                  {employees.map((em) => (
                    <label key={em.id} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input type="checkbox" checked={crew.includes(em.id)} onChange={() => toggleCrew(em.id)} />
                      {em.name}
                    </label>
                  ))}
                </div>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата початку">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </Field>
            <Field label="Дата завершення">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </Field>
          </div>
          {startDate > endDate && (
            <div className="text-xs text-rose-500 -mt-2">Дата завершення раніше дати початку</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Статус">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Сума, грн">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </Field>
          </div>

          <Field label="Обладнання">
            <div className="flex flex-col gap-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={it.equipmentId}
                    onChange={(e) => updateItem(idx, { equipmentId: e.target.value })}
                    className="flex-1 border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {equipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-16 border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addItem}
                disabled={equipment.length === 0}
                className="text-xs font-medium text-neutral-600 border border-dashed border-neutral-300 rounded-md py-1.5 hover:bg-neutral-50 disabled:opacity-40"
              >
                + Додати обладнання
              </button>
            </div>
          </Field>

          {conflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-md p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-rose-700 text-xs font-semibold">
                <AlertTriangle size={13} /> Конфлікт по датах — недостатньо обладнання
              </div>
              {conflicts.map((c, i) => (
                <div key={i} className="text-xs text-rose-600">
                  «{c.eq.name}»: потрібно {c.needed}, вже заброньовано {c.usedByOthers} з {c.available} на ці дати
                  (не вистачає {c.total - c.available}).
                </div>
              ))}
            </div>
          )}

          <Field label="Оплати від клієнта">
            <div className="flex flex-col gap-2">
              {payments.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={p.date}
                    onChange={(e) => updatePayment(idx, { date: e.target.value })}
                    className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <input
                    type="number"
                    value={p.amount}
                    onChange={(e) => updatePayment(idx, { amount: e.target.value })}
                    placeholder="Сума"
                    className="w-24 border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <input
                    value={p.note}
                    onChange={(e) => updatePayment(idx, { note: e.target.value })}
                    placeholder="Примітка (аванс, фінрозрахунок…)"
                    className="flex-1 border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button onClick={() => removePayment(idx)} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addPayment}
                className="text-xs font-medium text-neutral-600 border border-dashed border-neutral-300 rounded-md py-1.5 hover:bg-neutral-50"
              >
                + Додати оплату
              </button>
            </div>
          </Field>

          <Field label="Витрати по проекту">
            <div className="flex flex-col gap-2">
              {expenses.map((exp, idx) => (
                <div key={exp.id} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={exp.date}
                    onChange={(e) => updateExpense(idx, { date: e.target.value })}
                    className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <select
                    value={exp.category}
                    onChange={(e) => updateExpense(idx, { category: e.target.value })}
                    className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={exp.amount}
                    onChange={(e) => updateExpense(idx, { amount: e.target.value })}
                    placeholder="Сума"
                    className="w-24 border border-neutral-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button onClick={() => removeExpense(idx)} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addExpense}
                className="text-xs font-medium text-neutral-600 border border-dashed border-neutral-300 rounded-md py-1.5 hover:bg-neutral-50"
              >
                + Додати витрату
              </button>
            </div>
          </Field>

          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 grid grid-cols-2 gap-2 text-xs">
            <div className="text-neutral-500">Сума проекту</div>
            <div className="text-right font-medium text-neutral-800">{fmtMoney(Number(price) || 0)}</div>
            <div className="text-neutral-500 flex items-center gap-1">
              <TrendingUp size={12} className="text-emerald-500" /> Отримано
            </div>
            <div className="text-right font-medium text-emerald-600">{fmtMoney(totalPaid)}</div>
            <div className="text-neutral-500">Залишок до оплати</div>
            <div className="text-right font-medium text-neutral-800">{fmtMoney(Math.max(0, (Number(price) || 0) - totalPaid))}</div>
            <div className="text-neutral-500 flex items-center gap-1">
              <TrendingDown size={12} className="text-rose-500" /> Витрати
            </div>
            <div className="text-right font-medium text-rose-500">{fmtMoney(totalExpenses)}</div>
            <div className="text-neutral-500 font-medium pt-1 border-t border-neutral-200">Прибуток (отримано − витрати)</div>
            <div className="text-right font-semibold text-neutral-900 pt-1 border-t border-neutral-200">
              {fmtMoney(totalPaid - totalExpenses)}
            </div>
          </div>

          <Field label="Примітки">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Адреса, контактна особа, особливі умови…"
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-neutral-200 sticky bottom-0 bg-white">
          {onDelete ? (
            <button
              onClick={() => onDelete(project.id)}
              className="text-sm text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> Видалити
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-md text-neutral-600 hover:bg-neutral-100">
              Скасувати
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="text-sm font-medium px-3.5 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

// ---------- Inventory Tab ----------

function InventoryTab({ equipment, setEquipment, projects }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const todayISO = toISO(new Date());

  const categories = useMemo(() => {
    const map = {};
    for (const eq of equipment) {
      map[eq.category] = map[eq.category] || [];
      map[eq.category].push(eq);
    }
    return map;
  }, [equipment]);

  const handleDelete = (id) => {
    setEquipment((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-neutral-500">Наявність обладнання показана на сьогодні ({fmtDate(todayISO)})</div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 text-sm font-medium bg-neutral-900 text-white px-3 py-2 rounded-md hover:bg-neutral-800"
        >
          <Plus size={15} /> Обладнання
        </button>
      </div>

      {equipment.length === 0 ? (
        <div className="text-sm text-neutral-400 py-16 text-center border border-dashed border-neutral-200 rounded-lg">
          Склад порожній. Додайте перший інвентар.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {Object.entries(categories).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">{cat}</div>
              <div className="bg-white border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                {items.map((eq) => {
                  const usedToday = computeUsage(projects, eq.id, todayISO, todayISO, null);
                  const available = eq.qty - usedToday;
                  return (
                    <button
                      key={eq.id}
                      onClick={() => {
                        setEditing(eq);
                        setShowForm(true);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 text-left"
                    >
                      <span className="text-sm font-medium text-neutral-800">{eq.name}</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-neutral-400">Всього: {eq.qty}</span>
                        <span
                          className={`font-medium px-2 py-0.5 rounded-full ${
                            available <= 0
                              ? "bg-rose-50 text-rose-600"
                              : available <= eq.qty * 0.2
                              ? "bg-amber-50 text-amber-600"
                              : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          Вільно сьогодні: {available}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <EquipmentForm
          equipment={editing}
          onClose={() => setShowForm(false)}
          onSave={(eq) => {
            setEquipment((prev) => {
              const exists = prev.some((x) => x.id === eq.id);
              return exists ? prev.map((x) => (x.id === eq.id ? eq : x)) : [...prev, eq];
            });
            setShowForm(false);
          }}
          onDelete={
            editing
              ? (id) => {
                  handleDelete(id);
                  setShowForm(false);
                }
              : null
          }
        />
      )}
    </div>
  );
}

function EquipmentForm({ equipment, onClose, onSave, onDelete }) {
  const [name, setName] = useState(equipment?.name || "");
  const [category, setCategory] = useState(equipment?.category || "Звук");
  const [qty, setQty] = useState(equipment?.qty ?? 1);

  const canSave = name.trim() && qty > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200">
          <div className="font-semibold text-neutral-800">{equipment ? "Редагувати позицію" : "Нова позиція"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-400">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-3.5">
          <Field label="Назва">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Наприклад: Прожектор Sharpy"
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Категорія">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Звук / Світло / Конструкції…"
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Загальна кількість">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-neutral-200">
          {onDelete ? (
            <button
              onClick={() => onDelete(equipment.id)}
              className="text-sm text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> Видалити
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-md text-neutral-600 hover:bg-neutral-100">
              Скасувати
            </button>
            <button
              onClick={() =>
                onSave({ id: equipment?.id || uid("eq"), name: name.trim(), category: category.trim() || "Інше", qty: Number(qty) })
              }
              disabled={!canSave}
              className="text-sm font-medium px-3.5 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Clients Tab ----------

function ClientsTab({ clients, setClients, projects }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const projectCount = (clientId) => projects.filter((p) => p.clientId === clientId).length;

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 text-sm font-medium bg-neutral-900 text-white px-3 py-2 rounded-md hover:bg-neutral-800"
        >
          <Plus size={15} /> Клієнт
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="text-sm text-neutral-400 py-16 text-center border border-dashed border-neutral-200 rounded-lg">
          Клієнтів ще немає.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setEditing(c);
                setShowForm(true);
              }}
              className="text-left bg-white border border-neutral-200 rounded-lg p-4 hover:border-neutral-300 hover:shadow-sm transition-all"
            >
              <div className="font-medium text-neutral-800">{c.name}</div>
              {c.phone && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1.5">
                  <Phone size={12} /> {c.phone}
                </div>
              )}
              {c.notes && (
                <div className="flex items-start gap-1.5 text-xs text-neutral-400 mt-1">
                  <StickyNote size={12} className="mt-0.5 shrink-0" /> <span className="line-clamp-2">{c.notes}</span>
                </div>
              )}
              <div className="text-[11px] text-neutral-400 mt-2 pt-2 border-t border-neutral-100">
                Проектів: {projectCount(c.id)}
              </div>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <ClientForm
          client={editing}
          onClose={() => setShowForm(false)}
          onSave={(c) => {
            setClients((prev) => {
              const exists = prev.some((x) => x.id === c.id);
              return exists ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c];
            });
            setShowForm(false);
          }}
          onDelete={
            editing
              ? (id) => {
                  setClients((prev) => prev.filter((x) => x.id !== id));
                  setShowForm(false);
                }
              : null
          }
        />
      )}
    </div>
  );
}

function ClientForm({ client, onClose, onSave, onDelete }) {
  const [name, setName] = useState(client?.name || "");
  const [phone, setPhone] = useState(client?.phone || "");
  const [notes, setNotes] = useState(client?.notes || "");

  const canSave = name.trim();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200">
          <div className="font-semibold text-neutral-800">{client ? "Редагувати клієнта" : "Новий клієнт"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-400">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-3.5">
          <Field label="Назва / ПІБ">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Телефон">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+380…"
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Примітки">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </Field>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-neutral-200">
          {onDelete ? (
            <button
              onClick={() => onDelete(client.id)}
              className="text-sm text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> Видалити
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-md text-neutral-600 hover:bg-neutral-100">
              Скасувати
            </button>
            <button
              onClick={() => onSave({ id: client?.id || uid("cl"), name: name.trim(), phone: phone.trim(), notes: notes.trim() })}
              disabled={!canSave}
              className="text-sm font-medium px-3.5 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Employees Tab ----------

function EmployeesTab({ employees, setEmployees, projects }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const projectCount = (empId) =>
    projects.filter((p) => p.responsibleId === empId || (p.crew || []).includes(empId)).length;

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 text-sm font-medium bg-neutral-900 text-white px-3 py-2 rounded-md hover:bg-neutral-800"
        >
          <Plus size={15} /> Співробітник
        </button>
      </div>

      {employees.length === 0 ? (
        <div className="text-sm text-neutral-400 py-16 text-center border border-dashed border-neutral-200 rounded-lg">
          Співробітників ще немає.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {employees.map((em) => (
            <button
              key={em.id}
              onClick={() => {
                setEditing(em);
                setShowForm(true);
              }}
              className="text-left bg-white border border-neutral-200 rounded-lg p-4 hover:border-neutral-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-neutral-800">{em.name}</span>
                {em.role && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-neutral-50 text-neutral-600 border-neutral-200 shrink-0">
                    {em.role}
                  </span>
                )}
              </div>
              {em.phone && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1.5">
                  <Phone size={12} /> {em.phone}
                </div>
              )}
              {em.notes && (
                <div className="flex items-start gap-1.5 text-xs text-neutral-400 mt-1">
                  <StickyNote size={12} className="mt-0.5 shrink-0" /> <span className="line-clamp-2">{em.notes}</span>
                </div>
              )}
              <div className="text-[11px] text-neutral-400 mt-2 pt-2 border-t border-neutral-100">
                Задіяний у проектах: {projectCount(em.id)}
              </div>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <EmployeeForm
          employee={editing}
          onClose={() => setShowForm(false)}
          onSave={(em) => {
            setEmployees((prev) => {
              const exists = prev.some((x) => x.id === em.id);
              return exists ? prev.map((x) => (x.id === em.id ? em : x)) : [...prev, em];
            });
            setShowForm(false);
          }}
          onDelete={
            editing
              ? (id) => {
                  setEmployees((prev) => prev.filter((x) => x.id !== id));
                  setShowForm(false);
                }
              : null
          }
        />
      )}
    </div>
  );
}

function EmployeeForm({ employee, onClose, onSave, onDelete }) {
  const [name, setName] = useState(employee?.name || "");
  const [role, setRole] = useState(employee?.role || "");
  const [phone, setPhone] = useState(employee?.phone || "");
  const [notes, setNotes] = useState(employee?.notes || "");

  const canSave = name.trim();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200">
          <div className="font-semibold text-neutral-800">{employee ? "Редагувати співробітника" : "Новий співробітник"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-400">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-3.5">
          <Field label="Ім'я">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Роль">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Звукорежисер, світлотехнік, монтажник, водій…"
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Телефон">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+380…"
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Примітки">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </Field>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-neutral-200">
          {onDelete ? (
            <button
              onClick={() => onDelete(employee.id)}
              className="text-sm text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> Видалити
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-md text-neutral-600 hover:bg-neutral-100">
              Скасувати
            </button>
            <button
              onClick={() =>
                onSave({
                  id: employee?.id || uid("em"),
                  name: name.trim(),
                  role: role.trim(),
                  phone: phone.trim(),
                  notes: notes.trim(),
                })
              }
              disabled={!canSave}
              className="text-sm font-medium px-3.5 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
