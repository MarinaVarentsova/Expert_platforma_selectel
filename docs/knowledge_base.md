# База знаний: Палата судебных экспертов — платформа

> Обновлено: 21 июня 2026 г.  
> Статус: актуально для текущей реализации

---

## 1. Общее описание платформы

**Палата судебных экспертов** — маркетплейс для подбора судебных экспертов под конкретные заказы. Заказчики (юрлица, физлица) публикуют заявки на проведение экспертизы, система автоматически подбирает сертифицированных экспертов по направлению, региону и рейтингу.

### Роли пользователей
| Роль | Описание |
|---|---|
| `customer` | Заказчик: создаёт заявки, выбирает эксперта из предложенных |
| `expert` | Эксперт: принимает/отклоняет предложения, ведёт переписку с заказчиком |
| `admin` | Администратор: управляет всей платформой, ручной подбор, импорт реестров |

---

## 2. Технический стек

| Компонент | Технология |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Роутинг | Wouter (`/palata` base path) |
| UI | Tailwind CSS + shadcn/ui компоненты |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS + Storage) |
| State | React state + Tanstack Query |
| Монорепо | pnpm workspaces |
| Деплой | Replit (dev) + Vercel (Edge Functions для AI) |

### Переменные окружения
- `VITE_SUPABASE_URL` — URL Supabase проекта
- `VITE_SUPABASE_ANON_KEY` — публичный ключ Supabase
- `SESSION_SECRET` — секрет сессии
- `OPENAI_API_KEY` — для AI-определения направления экспертизы (Vercel Edge Function)

---

## 3. Структура файлов

```
artifacts/palata/src/
├── App.tsx                    # Роутер, провайдеры
├── main.tsx                   # Точка входа
├── lib/
│   ├── supabaseClient.ts      # Supabase клиент
│   ├── authContext.tsx        # AuthProvider, useAuth, useCurrentUser
│   ├── certificates.ts        # Верификация сертификатов Палаты
│   ├── matching.ts            # Логика автоподбора экспертов
│   ├── actionItems.ts         # Создание action items
│   └── notifyApi.ts           # Уведомления
├── pages/
│   ├── Home.tsx               # Публичная главная
│   ├── Login.tsx              # Вход
│   ├── Register.tsx           # Регистрация (customer + expert)
│   ├── CustomerDashboard.tsx  # ЛК заказчика
│   ├── ExpertDashboard.tsx    # ЛК эксперта
│   ├── NewRequest.tsx         # Форма новой заявки
│   ├── RequestDetail.tsx      # Детали заявки (канбан)
│   ├── AuthCallback.tsx       # PKCE callback после email confirm
│   ├── ResetPassword.tsx      # Сброс пароля
│   ├── AdminDashboard.tsx     # Панель администратора — все заказы
│   ├── AdminMetrics.tsx       # Метрики платформы
│   ├── AdminExperts.tsx       # Список и профили экспертов
│   ├── AdminCertImport.tsx    # Импорт реестра сертификатов из Excel
│   ├── AdminSettings.tsx      # Настройки платформы
│   ├── AdminActionItems.tsx   # Action items для администратора
│   ├── AdminEvents.tsx        # Лог событий
│   └── AdminEmailEvents.tsx   # Email события
└── components/
    ├── Nav.tsx                # Навигация (роль-зависимая)
    ├── KanbanBoard.tsx        # Канбан доска заявок
    ├── CertificateInputList.tsx # Поле ввода + верификация сертификатов
    ├── RegionMultiSelect.tsx  # Мультивыбор регионов
    └── ui/                    # shadcn компоненты
```

---

## 4. Маршруты приложения

| Путь | Страница | Доступ |
|---|---|---|
| `/` | Home | Публичный |
| `/login` | Login | Публичный |
| `/register` | Register | Публичный |
| `/customer` | CustomerDashboard | `customer` |
| `/customer/new-request` | NewRequest | `customer` |
| `/expert` | ExpertDashboard | `expert` |
| `/requests/:id` | RequestDetail | `customer` + `expert` |
| `/admin` | AdminDashboard | `admin` |
| `/admin/metrics` | AdminMetrics | `admin` |
| `/admin/experts` | AdminExperts | `admin` |
| `/admin/settings` | AdminSettings | `admin` |
| `/admin/action-items` | AdminActionItems | `admin` |
| `/admin/events` | AdminEvents | `admin` |
| `/admin/email-events` | AdminEmailEvents | `admin` |
| `/admin/cert-import` | AdminCertImport | `admin` |
| `/auth/callback` | AuthCallback | Supabase PKCE redirect |
| `/reset-password` | ResetPassword | Публичный |

---

## 5. Схема базы данных (Supabase)

### `palata_users`
Основная таблица пользователей (синхронизируется с Supabase Auth через триггер).
| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | = auth.users.id |
| `role` | text | `customer` / `expert` / `admin` |
| `full_name` | text | ФИО |
| `email` | text | Email (уникальный) |
| `phone` | text | Телефон |
| `is_active` | boolean | Активен ли аккаунт |
| `created_at` | timestamptz | Дата регистрации |

### `palata_expert_profiles`
Расширенный профиль эксперта.
| Поле | Тип | Описание |
|---|---|---|
| `user_id` | uuid FK → palata_users | |
| `bio` | text | О себе |
| `experience_years` | int | Стаж |
| `education` | text | Образование |
| `business_trip_ready` | boolean | Готов к командировкам |
| `accepts_requests` | boolean | Принимает заявки |
| `palata_registry_verified` | boolean | Сертифицирован Палатой |
| `palata_registry_number` | text | Номер сертификата (текстовый, напр. "PS 006521") |
| `centrsudexpert_verified` | boolean | Участник СРО ЦСЭ |
| `centrsudexpert_registry_number` | text | |
| `avg_customer_rating` | numeric | Средний рейтинг |
| `completed_orders_count` | int | Количество завершённых заказов |
| `decline_rate` | numeric | Доля отклонений |

### `palata_expert_certificates` ⭐ Ключевая для матчинга
Верифицированные сертификаты экспертов. **Матчинг читает только отсюда**.
| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `expert_id` | uuid FK → palata_users | |
| `certificate_number` | text | Нормализованный номер ("PS 006521") |
| `status` | text | `verified` / `pending` |
| `cert_valid_to` | date | Дата окончания действия |
| `cert_expert_name` | text | ФИО из реестра |
| `cert_direction_ids` | uuid[] | Массив UUID направлений экспертизы |

### `palata_expert_directions`
Направления экспертизы эксперта (денормализация для быстрой фильтрации).
| Поле | Тип | Описание |
|---|---|---|
| `expert_id` | uuid FK | |
| `expertise_direction_id` | uuid FK → palata_expertise_directions | |

### `palata_expert_regions`
Регионы работы эксперта.
| Поле | Тип | Описание |
|---|---|---|
| `expert_id` | uuid FK | |
| `region_id` | uuid FK → palata_regions | |

### `palata_certificates` (Реестр Палаты)
Загружается из Excel-файла администратором. Источник истины для верификации.
| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `certificate_number` | text | Номер (напр. "# PS 006521") |
| `expert_full_name` | text | ФИО из реестра |
| `specialty_code` | text | Коды специальностей через запятую ("16.1,16.7") |
| `specialty_code_id` | uuid | (не используется в верификации) |
| `specialty_text` | text | Текстовое описание специальности |
| `valid_from` | date | Начало действия |
| `valid_to` | date | Окончание действия |
| `is_active` | boolean | Активен ли сертификат |
| `source_file_name` | text | Имя загруженного файла |
| `source_loaded_at` | timestamptz | Дата загрузки |

### `palata_specialty_codes` (Справочник кодов → направлений)
Связь кодов специальностей с направлениями экспертизы.
| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `code` | text | Код (напр. "16.1") |
| `name` | text | Название (сейчас NULL для всех — не используется) |
| `expertise_direction_id` | uuid FK → palata_expertise_directions | |
| `is_active` | boolean | |

### `palata_expertise_directions` (Справочник направлений)
| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Название направления |
| `sort_order` | int | Порядок отображения |

### `palata_requests` (Заявки)
| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `customer_id` | uuid FK | |
| `title` | text | Название |
| `description` | text | Описание |
| `expertise_direction_id` | uuid FK | Направление экспертизы |
| `region_id` | uuid FK | Регион |
| `requires_travel` | boolean | Требуется выезд |
| `status` | text | Статус заявки (см. ниже) |
| `matching_round` | int | Текущий раунд подбора |

### Статусы заявок
```
new → matching → expert_selection → accepted → in_progress → completed
                                              ↘ cancelled
```

### `palata_request_matches` (Матчи заявок и экспертов)
| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `request_id` | uuid FK | |
| `expert_id` | uuid FK | |
| `matching_round` | int | Раунд подбора |
| `status` | text | `proposed` / `declined` / `selected_by_customer` / `accepted` / `withdrawn` / `closed_by_other_expert` / `accepted_work` / `completed` |

### `palata_certificates_import` (Промежуточная таблица ETL)
Используется при загрузке Excel-реестра.
| Поле | Описание |
|---|---|
| `certificate_number` | Номер сертификата |
| `expert_full_name` | ФИО |
| `specialty_text` | Текст специальности |
| `certificate_period` | Период действия |
| `codes` | Коды (из Excel) |
| `directions` | Направления (текст) |
| `valid_from`, `valid_to` | Даты |
| `certificate_status` | Статус |
| `load_status` | Статус загрузки ETL |

---

## 6. Логика верификации сертификатов

**Файл:** `artifacts/palata/src/lib/certificates.ts`

### Алгоритм `verifyCertificate(raw, allDirections, fullName)`

1. Нормализует номер (`normalizeCertNumber`): убирает `№`, `#`, лишние пробелы
2. Если нет ФИО → статус `no_name`
3. `extractNumericId` — извлекает цифровую часть: "PS 006521" → "006521"
4. Запрос к `palata_certificates WHERE certificate_number ILIKE '%006521%'`
5. Если не найдено → `not_found`
6. Проверяет `is_active` → если false → `not_found`
7. Проверяет `valid_to >= today` → если просрочен → `expired`
8. Сравнивает ФИО (нормализованное) → если не совпадает → `name_mismatch`
9. Берёт `specialty_code` (напр. "16.1,16.7"), разбивает по `,` или `;`
10. Запрос к `palata_specialty_codes WHERE code IN (...)` → получает `expertise_direction_id`
11. Если ни одного направления → fallback: ищет направление с "другие" в имени
12. Возвращает `CertResult` со статусом `verified`, `directionIds[]`, `validTo`

### Типы статусов `CertStatus`
```typescript
"idle" | "verifying" | "verified" | "not_found" | "expired" | "no_name" | "name_mismatch"
```

---

## 7. Регистрация эксперта — полный флоу

**Файл:** `artifacts/palata/src/pages/Register.tsx`

### Поля формы
- **Обязательные:** ФИО, Email, Пароль, Подтверждение пароля, **Регион работы (≥1)**, Сертификат Палаты (≥1 действующий)
- **Необязательные:** Телефон, О себе, Готовность к командировкам, ЦСЭ

### Алгоритм `handleSubmit`
1. Валидация: ФИО → пароль длина → пароли совпадают → **регионы ≥ 1** → сертификат Палаты
2. Проверка дубля email в `palata_users`
3. Очистка устаревшей сессии (если есть)
4. Для роли `expert`: предварительная верификация всех введённых сертификатов (`verifyCertificate`)
   - Если ни один не прошёл → ошибка, регистрация блокируется
   - Предупреждения по каждому невалидному сертификату собираются
5. `supabase.auth.signUp()` с metadata включая:
   - `role`, `full_name`, `phone`, `bio`, `business_trip_ready`
   - `palata_registry_verified`, `palata_registry_number`
   - `centrsudexpert_verified`, `centrsudexpert_registry_number`
   - `region_ids[]` — UUID регионов (для триггера БД)
   - **`verified_certs[]`** — верифицированные сертификаты с `directionIds` (для восстановления после email confirmation)

### ⚠️ Ветка email confirmation (продакшн)
Supabase возвращает `data.session = null` → код идёт в ветку "success" (показывает экран с направлениями) и **не пишет в БД**. Данные сохранены в auth metadata.

### Ветка без email confirmation (dev / immediate session)
Пишет всё напрямую: `palata_expert_profiles`, `palata_expert_certificates`, `palata_expert_directions`, `palata_expert_regions`.

---

## 8. ЛК эксперта — авто-восстановление сертификатов

**Файл:** `artifacts/palata/src/pages/ExpertDashboard.tsx`  
**Компонент:** `ProfileView` → useEffect([userId, allDirections.length])

### Проблема (исторический баг)
После email confirmation `palata_expert_certificates` был пустым — данные терялись. Эксперт видел зелёный статус в форме, но в матчинг не попадал.

### Решение (авто-heal)
При каждом открытии ЛК эксперта система проверяет `palata_expert_certificates`:

```
palata_expert_certificates пуст?
         ↓ ДА
1. Проверить auth metadata → verified_certs[]
   Если есть → INSERT в palata_expert_certificates + palata_expert_directions
         ↓ НЕТ
2. Проверить profile.palata_registry_verified + palata_registry_number
   Если есть → verifyCertificate() → INSERT
         ↓
Готово — эксперт появится в матчинге
```

**Ветка 1** — для новых экспертов (после сегодняшнего фикса)  
**Ветка 2** — для старых экспертов (Тимофеев и аналогичные)  
Срабатывает **однократно** при первом открытии ЛК.

### Ограничения в редактировании профиля
- **Обязательные поля:** ФИО (не пустое), Регионы работы (≥1) — проверяются в `handleSave()`
- **Сертификаты:** нельзя удалить (`allowRemove={false}` в CertificateInputList), только добавить новые

---

## 9. Алгоритм матчинга экспертов

**Файл:** `artifacts/palata/src/lib/matching.ts`

### Функция `runMatching(input: MatchingInput)`

**Входные данные:**
- `requestId` — UUID заявки
- `expertiseDirectionId` — UUID направления (null = невозможно подобрать)
- `regionIds[]` — регионы заявки
- `requiresTravel` — требуется выезд
- `customerId` — UUID заказчика

**Алгоритм:**
1. **Сценарий "нет направления"** → ошибка, action item администратору
2. **Сценарий "выезд без региона"** → ошибка
3. Собрать `declinedIds` и `activelyProposedIds` из предыдущих раундов
4. **Запрос к `palata_expert_certificates`** WHERE status='verified' AND cert_valid_to ≥ today AND cert_direction_ids ∋ expertiseDirectionId
5. **Запрос к `palata_expert_profiles`** WHERE accepts_requests=true AND user_id IN (qualifiedIds)
6. **Фильтрация по региону** (только если requiresTravel=true):
   - `business_trip_ready=true` → без проверки региона
   - `business_trip_ready=false` → проверяем пересечение регионов эксперта с регионами заявки
7. **Скоринг** каждого кандидата: рейтинг (×10) + palata_verified (+2) + centrsud_verified (+2) + completed_orders (×0.1, макс 1) - decline_rate (×5)
8. Топ-5 кандидатов → INSERT в `palata_request_matches`
9. Обновить статус заявки → `expert_selection`
10. Action item заказчику "Подобраны эксперты"

### Функция `runAllPendingMatching()`
Запускает матчинг для всех заявок со статусом `matching`. Вызывается при регистрации нового эксперта.

---

## 10. Импорт реестра сертификатов

**Файл:** `artifacts/palata/src/pages/AdminCertImport.tsx`  
**Маршрут:** `/admin/cert-import`

### Процесс
1. Администратор загружает Excel-файл с реестром Палаты
2. Frontend парсит Excel через `xlsx` (SheetJS)
3. Данные INSERT в `palata_certificates_import` через RPC `bulk_insert_certificates_import()` (SECURITY DEFINER — обходит RLS)
4. ETL SQL (`cert_import_migration_v2.sql`) переносит данные из `palata_certificates_import` в `palata_certificates`:
   - Извлекает коды специальностей
   - Проверяет даты действия
   - Устанавливает `is_active`

### Структура Excel
Ожидаемые колонки: ФИО эксперта, Номер сертификата, Коды специальностей, Дата начала, Дата окончания, Статус

### SQL-миграции для ETL
- `supabase/cert_import_migration_v2.sql` — основной ETL (использует CTID для обновлений)
- `supabase/cert_import_fix_rls.sql` — функция bulk_insert_certificates_import() для обхода RLS

---

## 11. AI-определение направления экспертизы

**Файл:** `api/ai-detect-direction.ts`  
**Vercel Edge Function**

Определяет направление экспертизы по текстовому описанию заявки. Вызывается из `NewRequest.tsx` при создании заявки. Если AI возвращает направление → автоматически подставляется. Если нет → показывается предупреждение с просьбой уточнить вручную.

### tsconfig для Edge Functions
`api/tsconfig.json` с `lib: ["ES2022","DOM","DOM.Iterable"]` + `@types/node` — фикс для TypeScript ошибок с `Request`, `Response`, `fetch`, `process`.

---

## 12. Известные диагностические запросы SQL

### Проверка почему эксперт не попадает в матчинг
```sql
-- 1. Есть ли сертификат в реестре?
SELECT id, certificate_number, expert_full_name, specialty_code, is_active, valid_to
FROM palata_certificates WHERE certificate_number ILIKE '%006521%';

-- 2. Заполнена ли таблица кодов?
SELECT code, name, expertise_direction_id FROM palata_specialty_codes ORDER BY code LIMIT 30;

-- 3. Записи у конкретного эксперта
SELECT ec.*, u.full_name, u.email
FROM palata_expert_certificates ec
JOIN palata_users u ON u.id = ec.expert_id
WHERE u.email = 'email@example.com';

-- 4. Направления эксперта
SELECT ed.name FROM palata_expert_directions epd
JOIN palata_expertise_directions ed ON ed.id = epd.expertise_direction_id
JOIN palata_users u ON u.id = epd.expert_id
WHERE u.email = 'email@example.com';
```

### Массовое восстановление palata_expert_certificates (для старых экспертов)
```sql
INSERT INTO palata_expert_certificates
  (expert_id, certificate_number, status, cert_valid_to, cert_expert_name, cert_direction_ids)
SELECT
  u.id, pc.certificate_number, 'verified', pc.valid_to, pc.expert_full_name,
  ARRAY(
    SELECT DISTINCT sc.expertise_direction_id
    FROM palata_specialty_codes sc
    WHERE sc.code = ANY(string_to_array(regexp_replace(pc.specialty_code,'\s','','g'),','))
    AND sc.expertise_direction_id IS NOT NULL
  )
FROM palata_users u
JOIN palata_expert_profiles ep ON ep.user_id = u.id
JOIN palata_certificates pc
  ON pc.certificate_number ILIKE
     '%' || regexp_replace(COALESCE(ep.palata_registry_number,''),'[^0-9]','','g') || '%'
WHERE ep.palata_registry_verified = true
  AND ep.palata_registry_number IS NOT NULL
  AND pc.is_active = true AND pc.valid_to >= CURRENT_DATE
  AND NOT EXISTS (SELECT 1 FROM palata_expert_certificates ec WHERE ec.expert_id = u.id);

-- Синхронизация направлений
INSERT INTO palata_expert_directions (expert_id, expertise_direction_id)
SELECT DISTINCT ec.expert_id, unnest(ec.cert_direction_ids)
FROM palata_expert_certificates ec
WHERE NOT EXISTS (
  SELECT 1 FROM palata_expert_directions ed
  WHERE ed.expert_id = ec.expert_id AND ed.expertise_direction_id = ANY(ec.cert_direction_ids)
) ON CONFLICT DO NOTHING;
```

---

## 13. Ключевые бизнес-правила

| Правило | Описание |
|---|---|
| Регистрация эксперта | Только при наличии действующего сертификата Палаты (ФИО должно совпадать) |
| Регион обязателен | При регистрации и редактировании профиля — минимум 1 регион |
| ФИО обязательно | Нельзя сохранить профиль с пустым ФИО |
| Нельзя удалить сертификат | В ЛК кнопка удаления сертификата скрыта (`allowRemove=false`) |
| Матчинг только по verified certs | Таблица `palata_expert_certificates`, поле cert_valid_to ≥ сегодня |
| accepts_requests=false | Автоматически устанавливается если нет ни одного верифицированного сертификата |
| Выездной эксперт | `business_trip_ready=true` → попадает в матчинг любого региона |
| Скоринг экспертов | Рейтинг (основной) + Палата (+2) + ЦСЭ (+2) + completed_orders + decline_rate |
| Топ-5 на раунд | Матчинг предлагает не более 5 экспертов за раунд |
| Повторный автоподбор | Эксперты из предыдущих раундов (не declined/withdrawn) исключаются |

---

## 14. Компоненты форм — особенности

### `CertificateInputList`
Проп `allowRemove?: boolean` (default `true`):
- В форме регистрации: `allowRemove=true` (удалять можно при >1 сертификате)
- В ЛК эксперта: `allowRemove=false` (удалять нельзя совсем)

Автоверификация по blur: при потере фокуса с заполненным полем автоматически запускается `verifyCertificate`.

### `RegionMultiSelect`
Компонент мультивыбора регионов. В форме заказчика `max=1` (один регион), для эксперта — неограниченно.

---

## 15. Известные технические долги

1. **`palata_specialty_codes.name` = NULL** для всех записей — не критично, поле не используется в логике, но нарушает семантику таблицы
2. **ETL миграции** (`cert_import_migration_v2.sql`, `cert_import_fix_rls.sql`) должны быть выполнены администратором вручную в Supabase SQL Editor до начала работы с импортом
3. **Старые эксперты** без записей в `palata_expert_certificates` — авто-heal срабатывает при открытии ЛК, но можно запустить массовый SQL (см. раздел 12)
4. **RLS политики** — необходимо убедиться что authenticated users могут читать `palata_expert_certificates` (миграция 029), иначе матчинг не найдёт экспертов
