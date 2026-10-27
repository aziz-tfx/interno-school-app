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
- [x] **Фронтенд на новом API** за флагом `VITE_BACKEND=server` (этап 2, см. ниже)
- [x] Публичные страницы без прямого доступа к базе: регистрация, лендинг курса, подписание договора, Telegram-приложение
- [x] **Интерфейс CRM** в приложении (этап 3, раздел «CRM» в меню серверной сборки)
- [x] Ежедневные автоматизации (напоминания об оплате, должники, блокировка LMS, списки доплат менеджерам) и Telegram-бот (привязка учеников по `/start`) — на сервере
- [x] **Бывшие функции Vercel** — на сервере: уведомления о продажах в Telegram, amoCRM-отчёты и выгрузка продаж,
  OnlinePBX, ИИ-агент для Instagram/Telegram (с напоминаниями клиентам каждые 5 минут), ИИ-помощник в LMS, Payme.
  Код перенесён почти без изменений (`src/vercel/`) поверх слоя, повторяющего Firestore на наших таблицах
  (`src/vercel/_lib/firestore.js`). Заявки с лендинга дублируются в amoCRM, пока продажи работают там.
- [x] 63 автотеста на настоящем PostgreSQL + проверка в браузере

**Работает и с Vercel, и без него.** Сайт по-прежнему отдаёт Vercel, а все адреса `app.internoedu.uz/api/…` он
пересылает на сервер (`vercel.json`). Поэтому вебхуки, прописанные в amoCRM (ИИ-агент), Payme и Telegram, менять
не нужно. Приложение само обращается к серверу напрямую, со входом; школа берётся из входа, а не из запроса —
на Vercel любой мог вызвать эти функции с чужим `tenantId`.

Дальше:

1. **Instagram и Telegram напрямую в CRM** (Meta API, нужно пройти App Review), затем отключение amoCRM.
2. Домен `api.internoedu.uz` вместо sslip.io.

Пока не сделано, учесть на следующих этапах:
- кросс-школьный доступ суперадмина (страница SuperAdmin видит только свою школу);
- пароли LMS в документах студентов (`lmsPassword`) пока лежат открытым текстом, как и в Firestore;
- загрузка файлов: Firebase Storage пока остаётся.

## Развёртывание на сервере Eskiz

### 1. Сервер и домен
- **Eskiz VPS 3**: 2 ядра, 4 ГБ RAM, 80 ГБ NVMe. Система: **Ubuntu 24.04** (или 22.04).
  `docker-compose.yml` настроен под этот размер. На VPS 4 и выше можно поднять `shared_buffers`
  и `effective_cache_size` (≈ 25% и 50% RAM).
- Уточните у Eskiz до оплаты: скорость канала **в интернет** (не только TAS-IX; серверу нужны
  Telegram, OpenAI и вебхуки Meta), выделенный IPv4 в цене и переход на VPS 4 без переустановки.
- Домен должен указывать на IP сервера (A-запись). Eskiz выдаёт `vpsNNNNN.eskiz.uz`; свой, например
  `api.interno.uz`, можно подключить позже.

### 2. Установка (один раз, ~10 минут)
Код лежит в приватном репозитории, поэтому сначала серверу выдаётся ключ «только чтение» (deploy key).
Подключитесь к серверу (`ssh root@IP` или веб-консоль в панели Eskiz) и выполните:

```bash
apt-get update -q && apt-get install -yq git
ssh-keygen -q -t ed25519 -N '' -C interno-server -f /root/.ssh/interno_deploy
printf 'Host github.com\n  IdentityFile /root/.ssh/interno_deploy\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' >> /root/.ssh/config
cat /root/.ssh/interno_deploy.pub
```
Последняя строка выведет ключ `ssh-ed25519 …`. Добавьте его в GitHub:
**репозиторий → Settings → Deploy keys → Add deploy key** (Title: `interno-server`, без «Allow write access»).
Затем:

```bash
git clone -b claude/vigilant-cerf-m3ppn4 git@github.com:aziz-tfx/interno-school-app.git /opt/interno
bash /opt/interno/server/deploy/install.sh
```

`deploy/install.sh` делает всё остальное и его можно запускать повторно:
обновление системы и автообновления безопасности, часовой пояс Ташкента, файл подкачки 2 ГБ,
файрвол (открыты только 22/80/443), fail2ban против подбора пароля SSH, Docker, `.env` со случайными
паролями, проверка DNS, сборка и запуск, проверка `https://<домен>/api/health`.
Домен по умолчанию — `<IP-через-дефисы>.sslip.io` (для 45.92.173.35: `45-92-173-35.sslip.io`): он сам
указывает на IP сервера, DNS настраивать не нужно. Свой домен, когда его A-запись укажет на сервер:
`API_DOMAIN=api.interno.uz bash …/install.sh` (пароли в `.env` при этом не меняются), и тот же адрес — в
`VITE_API_URL` на Vercel.
Миграции базы применяются автоматически при каждом старте.

### 3. Перенос данных
Нужен ключ сервисного аккаунта Firebase (Firebase console → Project settings → Service accounts →
Generate new private key; тот же JSON, что `FIREBASE_SERVICE_ACCOUNT_KEY` на Vercel). Загрузите его на
сервер как `/root/firebase-key.json` и выполните:

```bash
bash /opt/interno/server/deploy/import.sh /root/firebase-key.json --dry-run   # посчитать, ничего не записывая
bash /opt/interno/server/deploy/import.sh /root/firebase-key.json             # Firestore, затем amoCRM
shred -u /root/firebase-key.json                                              # ключ больше не нужен
```
Сначала переносится Firestore, потом amo: сделки связываются с уже перенесёнными сотрудниками и учениками.
Оба импорта можно запускать повторно: изменения обновляются, дублей нет. Перед переключением запустите
ещё раз, чтобы перенести то, что изменилось за это время. Если токен amo истёк, импорт обновит его и
сохранит новую пару **и в Firestore, и в Postgres**, чтобы не сломать текущую интеграцию на Vercel.

**amoCRM.** Доступ берётся из «Интеграций» или, для основной школы, из `AMO_SUBDOMAIN` и `AMO_ACCESS_TOKEN`
в `.env` (те же, что на Vercel). Первый полный импорт большого аккаунта идёт часами — запускайте в фоне:
```bash
cd /opt/interno/server
nohup docker compose run --rm -T api npm run --silent import:amo -- --tenant=default > /root/amo-import.log 2>&1 &
tail -f /root/amo-import.log          # Ctrl+C — выйти из просмотра, импорт продолжится
```
Дальше `import.sh` догружает только изменения (`--changed`, минуты). Обрывы связи с amo импорт
переживает сам (повторяет запрос), а второй импорт той же школы, пока идёт первый, не запустится.

Аварийный вход, если войти не может никто:
```bash
cd /opt/interno/server && docker compose run --rm api npm run create-owner -- --login=owner --password='…' --name='Азиз'
```

### 4. Безопасность доступа
- Смените пароль root (`passwd`), если он передавался по почте или в переписке.
- Лучше входить по SSH-ключу: добавьте свой публичный ключ в `/root/.ssh/authorized_keys`, проверьте
  вход, затем выставьте `PasswordAuthentication no` в `/etc/ssh/sshd_config` и `systemctl restart ssh`.
  (Не отключайте пароль, пока вход по ключу не проверен — иначе потеряете доступ.)

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
bash /opt/interno/server/deploy/update.sh     # свежий код ветки, пересборка, проверка
```

### 6а. Ключи интеграций
Для основной школы часть ключей хранится не в «Интеграциях», а в переменных Vercel. Перенести их на сервер
(ввод скрыт, Enter — оставить как есть):
```bash
bash /opt/interno/server/deploy/secrets.sh
```
Telegram-бот и чаты, amoCRM, OnlinePBX, ключ ИИ-помощника LMS (`GOOGLE_AI_KEY`). Значения из «Интеграций» важнее.

### 7. Переключение app.internoedu.uz на сервер

**Днём, заранее:**
1. `bash /opt/interno/server/deploy/update.sh` — свежий код на сервере.
2. В превью-версии: «Интеграции → Telegram» — проверить, что заполнены токен бота и чаты филиалов
   (если пусто — вписать те же значения, что `TG_BOT_TOKEN` / `TG_CHAT_*` на Vercel, и сохранить).
3. «Автоматизации → Проверить» — пробный прогон: сколько напоминаний, должников и блокировок будет. Ничего не отправляет.

**Вечером (≈30 минут, сотрудники в это время ничего не вносят):**
1. Последний перенос данных — после него новые изменения в старой версии на сервер уже не попадут:
   `bash /opt/interno/server/deploy/import.sh /root/firebase-key.json`
   (ключ удалён после первого импорта — загрузить снова, после — `shred -u`).
   amoCRM при этом догружается только изменениями с прошлого импорта (`import:amo --changed`) — минуты, не часы.
2. `bash /opt/interno/server/deploy/cutover.sh` — пускает `app.internoedu.uz` к API и включает ежедневные автоматизации в 14:00.
3. Vercel → Settings → Environment Variables, **Production**: `VITE_BACKEND=server`, `VITE_API_URL=https://<домен API>`.
4. Влить ветку в `main` — Vercel соберёт прод на сервере; cron автоматизаций на Vercel отключится этим же слиянием.
5. «Интеграции → Telegram → Подключить бота к серверу» — привязка учеников по ссылке из кабинета теперь пишет в новую базу.
6. Сотрудникам: обновить страницу и войти тем же логином и паролем. Проверить вход, учеников, оплаты, CRM.

**Откат** (если что-то пошло не так): Vercel → Deployments → прошлый прод → Instant Rollback;
`bash /opt/interno/server/deploy/cutover.sh --undo`; вебхук бота вернуть на
`https://app.internoedu.uz/api/telegram/notify?tenantId=default` (setWebhook). Внесённое за это время останется только на сервере.

## Фронтенд на новом API (этап 2)

Приложение выбирает базу при сборке:

| Переменные | Данные |
|---|---|
| не заданы | Firebase, как раньше (прод не меняется) |
| `VITE_BACKEND=server` + `VITE_API_URL=https://api.interno.uz` | этот сервер |

Код страниц почти не менялся: все импорты `firebase/firestore` заменены на `src/backend/firestore.js` —
те же функции (`getDocs`, `onSnapshot`, `setDoc`…), которые по флагу работают через Firestore или через
API (`src/backend/serverStore.js`, живые обновления по SSE).

**Превью для проверки** (прод не трогаем):
1. Vercel → Project → Settings → Environment Variables: добавить `VITE_BACKEND=server` и
   `VITE_API_URL=https://api.interno.uz` **только для Preview и ветки** `server-preview`.
2. Создать ветку `server-preview` от `main` и запушить — Vercel соберёт превью на новом API.
3. Добавить адрес превью в `CORS_ORIGINS` в `.env` сервера и перезапустить: `docker compose up -d`.
4. Перенести данные (`import:firestore`, `import:amo`) и сверить цифры со старой версией.

Что поменялось для пользователей в серверном режиме:
- вход проверяет сервер; до входа браузер не получает ни сотрудников, ни учеников, ни оплат;
- лендинг курса больше не показывает пароль, если номер уже зарегистрирован, — ученик входит своим паролем;
- Telegram-приложение пускает по подписи Telegram (если ученик подключил бота) или по логину и паролю
  ученика — номера телефона больше недостаточно;
- пароль при регистрации — от 6 символов.

## CRM в приложении (этап 3)

Раздел «CRM» появляется в меню только в серверной сборке. Права — раздел `crm` в «Доступах»:
по умолчанию у владельца, администратора, руководителей филиалов, РОП, продажников и SMM.

- **Сделки** — канбан по этапам: перетаскивание карточек, поиск по имени и цифрам телефона,
  фильтры по менеджеру и источнику, суммы по этапам. Красная метка — входящей заявке никто не ответил 15+ минут.
- **Карточка сделки** (`/crm?lead=<id>` — ссылкой можно поделиться): этап, сумма, ответственный, курс,
  контакт с телефонами, примечания и звонки, задачи, история этапов.
- **Отказ** спрашивает причину; **Успешно** предлагает оформить оплату — форма заполняется данными
  клиента, а после оплаты сделка закрывается и связывается с оплатой и учеником.
- **Задачи** — просрочено / сегодня / завтра / позже; руководители видят задачи всех.
- **Аналитика** — воронка за период, конверсия, сумма продаж, время первого ответа (только по входящим
  заявкам — сделки, заведённые вручную, его не искажают), разбивка по менеджерам.
- **Настройка воронки** (руководители) — этапы, цвета, порядок, новые воронки.
- Всё обновляется вживую: изменения коллег видны без перезагрузки.

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
| `POST /api/admin/automations/run` `{dryRun?}` | автоматизации своей школы сейчас (владелец/админ); `dryRun` — только посчитать |
| `POST /api/admin/telegram/webhook` | направить бота школы на этот сервер |
| `POST /api/telegram/webhook?tenantId=` | обновления от Telegram (проверяется секрет `X-Telegram-Bot-Api-Secret-Token`) |
| `POST /api/telegram/notify` | продажа → чат филиала (со входом) |
| `GET /api/amo/{status,users,calls,performance-v2,response-times}`, `POST /api/amo/{push-sale,token-refresh}` | amoCRM (со входом) |
| `GET /api/onpbx/calls?from=&to=` (`?status=1` — проверка) | OnlinePBX (со входом) |
| `POST /api/ai/chat` | ИИ-помощник в LMS |
| `/api/ai/amo-agent?mode=webhook\|followups&key=` | ИИ-агент: вебхук из amo (по ключу школы); `mode=log\|setup\|test` — со входом |
| `GET/POST /api/pay/payme?tenantId=` | Payme: публичная настройка для кабинета / Merchant API (Basic-авторизация Payme) |

Роли в CRM: работают `owner`, `admin`, `branch_director`, `branch_admin`, `rop`, `sales`, `smm`;
воронки настраивают и сделки удаляют `owner`, `admin`, `branch_director`, `rop`.
