-- Виконайте цей скрипт один раз у Supabase: SQL Editor → New query → вставити → Run

create table if not exists kv_store (
  k text not null,
  shared boolean not null default false,
  v text not null,
  updated_at timestamptz not null default now(),
  primary key (k, shared)
);

alter table kv_store enable row level security;

-- Застосунок не має власного логіну, тому дозволяємо читання/запис
-- усім, хто має посилання на сайт (так само як з будь-яким
-- незахищеним внутрішнім інструментом). Якщо згодом знадобиться логін
-- для співробітників — ці політики можна звузити.
create policy "allow read for anon" on kv_store
  for select using (true);

create policy "allow insert for anon" on kv_store
  for insert with check (true);

create policy "allow update for anon" on kv_store
  for update using (true);

create policy "allow delete for anon" on kv_store
  for delete using (true);

-- Увімкнути realtime-оновлення для цієї таблиці (щоб зміни з одного
-- пристрою миттєво зʼявлялись на іншому без перезавантаження сторінки)
alter publication supabase_realtime add table kv_store;
