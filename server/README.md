# INTERNO Server

Собственный бэкенд INTERNO на сервере Eskiz: **PostgreSQL + Node.js (Fastify)**.
Со временем заменяет Firebase (база ERP) и amoCRM (CRM).

```
Фронтенд (React) ──HTTPS──▶ Caddy (сертификат Let's Encrypt) ──▶ API (Node.js) ──▶ PostgreSQL 16
                                                                     │
                                                                     └── ежедневный pg_dump → ./backups
```

## Как устроены данные

**ERP — «таблицы документов».** Каждая коллекция Firestore стала таблицей
(`students`, `payments`, `groups`, …) с колонками `id`, `tenant_id`, `data jsonb`:

- `id` остаётся тем же, что в Firestore, поэтому ссылки `studentId`, `groupId` и т. д. продолжают работать;
- `data` хранит документ целиком, в той же форме, что видит фронтенд сейчас;
- поля для фильтров и отчётов (`payments.amount`, `pay_date`, `student_id`, `students.phone_digits`…)
  вынесены в вычисляемые колонки с индексами.

Поэтому фронтенд можно перевести с Firestore на этот API, заменив только слой данных
(`DataContext`, `AuthContext`), а не каждую страницу. Дальше поля по одному переносятся в обычные колонки.

**CRM — полностью реляционная** (`crm_pipelines`, `crm_stages`, `crm_contacts`, `crm_leads`,
`crm_activities`, `crm_tasks`). Каждый переход между этапами пишется в `crm_activities`,
поэтому воронка, конверсия и время реакции считаются одним SQL-запросом.

**Безопасность** (по сравнению с текущим Firebase):

| Было | Стало |
|---|---|
| Пароли сотрудников хранятся открытым текстом, и весь список с паролями загружается в браузер | Хеши bcrypt хранятся отдельно от документа; ни один ответ API их не содержит |
| Любой, у кого есть токен App Check, читает и пишет любые коллекции | Вход по JWT; на каждый запрос проверяются школа (`tenant_id`) и роль |
| Студент может прочитать телефоны и балансы всех учеников | Студент видит только свои записи и разделы LMS |
| Уволенный сотрудник остаётся в системе до перезагрузки страницы | Доступ закрывается на следующем же запросе, открытые realtime-потоки рвутся |
| Сотрудник может сам повысить себе роль | Роль, статус и права меняют только владелец, администратор и HR |

## Что готово (этап 1) и что дальше

- [x] Схема PostgreSQL: все коллекции ERP и CRM
- [x] Вход: логин или телефон в любом формате, несколько школ, смена пароля, выход на всех устройствах
- [x] API коллекций, совместимый с Firestore: запросы `where/orderBy/limit`, `addDoc/setDoc/updateDoc/deleteDoc`, `writeBatch`, `increment`, `arrayUnion`, `serverTimestamp`, `deleteField`
- [x] Realtime через Server-Sent Events, замена `onSnapshot`
- [x] CRM: воронки и этапы, канбан, сделки, контакты с защитой от дублей по телефону, журнал действий, задачи, отчёт по воронке и по менеджерам, публичная форма заявки для лендинга
- [x] Импорт из Firestore и из amoCRM (повторяемый, без дублей)
- [x] Docker Compose, HTTPS, ежедневные бэкапы
- [x] 36 автотестов на настоящем PostgreSQL

Дальше:

1. **Фронтенд на новом API.** Новый слой данных за флагом `VITE_BACKEND=server`, параллельная работа со сверкой.
2. **Интерфейс CRM** в приложении: канбан, карточка сделки, задачи. API уже готов.
3. **Перенос `api/*` с Vercel на сервер:** Payme, Telegram-бот, OnlinePBX, cron-напоминания, ИИ-агент. Каналы будут писать сразу в CRM.
4. **Instagram через Meta API** (нужно пройти App Review), затем отключение amoCRM.
5. **Переключение:** последний импорт, перевод Firestore в режим «только чтение», переключение фронтенда.

Пока не сделано, учесть на следующих этапах:
- регистрация сотрудников и школ (`Register`, `RegisterSchool`);
- кросс-школьный доступ суперадмина;
- пароли LMS в документах студентов (`lmsPassword`) пока лежат открытым текстом, как и в Firestore;
- загрузка файлов: Firebase Storage пока остаётся.

## Развёртывание на сервере Eskiz

### 1. Сервер и домен
- **Eskiz VPS 3**: 2 ядра, 4 ГБ RAM, 80 ГБ NVMe. Система: **Ubuntu 24.04** (или 22.04).
  `docker-compose.yml` настроен под этот размер. На VPS 4 и выше можно поднять `shared_buffers`
  и `effective_cache_size` (≈ 25% и 50% RAM).
- Уточните у Eskiz до оплаты: скорость канала **в интернет** (не только TAS-IX; серверу нужны
  Telegram, OpenAI и вебхуки Meta), выделенный IPv4 в цене и переход на VPS 4 без переустановки.
- В DNS создайте A-запись, например `api.interno.uz` → IP сервера.
- Вход только по SSH-ключу: в `/etc/ssh/sshd_config` выставьте `PasswordAuthentication no`.

### 2. Подготовка (один раз)
```bash
sudo apt update && sudo apt -y upgrade && sudo apt -y install unattended-upgrades ufw git
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # перелогиниться после этого

# Файл подкачки 2 ГБ: страховка от нехватки памяти во время сборки образа и импортов
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl -p /etc/sysctl.d/99-swap.conf
```
Логи контейнеров ограничены 30 МБ на каждый сервис, так что диск ими не забьётся.

### 3. Запуск
```bash
# репозиторий приватный: добавьте серверу deploy key (GitHub → Settings → Deploy keys, только чтение)
git clone git@github.com:aziz-tfx/interno-school-app.git
cd interno-school-app/server
cp .env.example .env
nano .env        # API_DOMAIN, POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGINS
docker compose up -d --build
curl https://api.interno.uz/api/health    # → {"ok":true}
```
Миграции базы применяются автоматически при каждом старте.

### 4. Перенос данных
Сначала Firestore, потом amo: сделки связываются с уже перенесёнными сотрудниками и учениками.
Добавьте `FIREBASE_SERVICE_ACCOUNT_KEY` в `.env` (тот же JSON, что на Vercel, одной строкой), затем:

```bash
# Firestore → PostgreSQL. Из Firestore только читаем.
docker compose run --rm api npm run import:firestore -- --dry-run   # посчитать, ничего не записывая
docker compose run --rm api npm run import:firestore

# amoCRM → CRM (ключи amo берутся из перенесённых tenantIntegrations)
docker compose run --rm api npm run import:amo -- --tenant=default
```
Оба импорта можно запускать повторно сколько угодно: изменения обновляются, дублей нет.
Перед переключением запустите их ещё раз, чтобы перенести то, что изменилось за это время.
Если токен amo истёк, импорт обновит его и сохранит новую пару **и в Firestore, и в Postgres**,
чтобы не сломать текущую интеграцию на Vercel.

Аварийный вход, если войти не может никто:
```bash
docker compose run --rm api npm run create-owner -- --login=owner --password='…' --name='Азиз'
```

### 5. Бэкапы
Контейнер `backup` каждую ночь в 03:00 по Ташкенту пишет `./backups/interno-ДАТА.dump` и хранит 14 дней.
**Этого мало:** бэкапы лежат на том же диске, что и база. Настройте копирование на другой сервер
(например, `rclone` или `rsync` по cron). Чтобы данные не покидали страну, вторую копию тоже держите
в Узбекистане: у другого провайдера или хотя бы на офисном компьютере. Если Eskiz делает
снапшоты сервера, включите и их. Раз в месяц проверяйте восстановление:
```bash
docker compose exec -T db pg_restore --clean --if-exists -U interno -d interno < backups/interno-….dump
```

### 6. Обновление
```bash
cd interno-school-app && git pull && cd server && docker compose up -d --build
```

## Разработка

```bash
cd server && npm install
createdb interno_test
TEST_DATABASE_URL=postgres://localhost/interno_test npm test
DATABASE_URL=postgres://localhost/interno JWT_SECRET=$(openssl rand -base64 48) npm run dev
```

## API — кратко

Все запросы, кроме входа, health и публичной формы, идут с заголовком `Authorization: Bearer <token>`.

| | |
|---|---|
| `POST /api/auth/login` `{login, password, tenantId?}` | → `{token, user}` |
| `GET /api/auth/me`, `POST /api/auth/password`, `POST /api/auth/logout-all` | |
| `GET /api/collections/:name?where=[["field","==",v]]&orderBy=&direction=&limit=` | список, как `getDocs(query(...))` |
| `GET/PUT(?merge=1)/PATCH/DELETE /api/collections/:name/:id`, `POST /api/collections/:name` | `getDoc/setDoc/updateDoc/deleteDoc/addDoc` |
| `POST /api/batch` `{ops:[{op, collection, id, data}]}` | `writeBatch`, всё или ничего |
| `POST /api/realtime/ticket` → `GET /api/realtime?ticket=&collections=students,crm_leads` | SSE: `{collection, id, op}` |
| `GET/POST /api/crm/pipelines`, `PATCH /api/crm/pipelines/:id`, `POST /api/crm/pipelines/:id/stages`, `PATCH/DELETE /api/crm/stages/:id` | воронки |
| `GET /api/crm/board?pipelineId=&q=&responsibleId=` | канбан: этапы с количеством, суммой и сделками |
| `GET/POST /api/crm/leads`, `GET/PATCH/DELETE /api/crm/leads/:id` | сделки; смена `stageId` пишется в историю |
| `GET /api/crm/leads/:id/activities`, `POST …/notes`, `POST …/activities` | журнал: примечания, звонки, сообщения |
| `GET/POST /api/crm/contacts`, `GET/PATCH /api/crm/contacts/:id` | контакты; на дубль телефона возвращается 409 с существующим контактом |
| `GET/POST /api/crm/tasks`, `PATCH /api/crm/tasks/:id` | задачи (`?status=open\|overdue\|done`) |
| `GET /api/crm/analytics/funnel?pipelineId=&from=&to=` | воронка, конверсия, время реакции, по менеджерам |
| `POST /api/public/leads?tenantId=` | заявка с лендинга без входа |

Роли в CRM: работают `owner`, `admin`, `branch_director`, `branch_admin`, `rop`, `sales`, `smm`;
воронки настраивают и сделки удаляют `owner`, `admin`, `branch_director`, `rop`.
