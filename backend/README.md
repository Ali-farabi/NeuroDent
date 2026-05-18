# NeuroDent Backend

Node.js backend без внешних npm-зависимостей. Он отдает frontend, предоставляет REST API для CRM и хранит данные в SQLite.

Требуется Node.js 22+, потому что backend использует встроенный `node:sqlite`.

## Запуск

```bash
npm start
```

После запуска приложение доступно по адресу:

```text
http://localhost:3000
```

Health-check:

```text
GET http://localhost:3000/api/health
```

## Авторизация

API использует cookie/Bearer session token `nd_token`. Все рабочие CRM-ручки, кроме `POST /api/auth/login` и `GET /api/health`, требуют авторизацию.

Стартовые сотрудники создаются в SQLite при первом запуске. Для локального входа используйте реальные телефоны из seed-данных:

```text
owner:     87001234567 / 1234
admin:     87007654321 / admin
doctor:    87005551234 / doctor
assistant: 87009871234 / assistant
```

Старый режим, где пароль `1234`, `admin` или `doctor` сам выбирал роль независимо от телефона, отключен. Роль `patient` ограничена только своим `patientId` на медицинских картах, визитах, файлах и счетах.

## Хранение данных

Данные сохраняются в `backend/data/neurodent.sqlite`. Файл создается автоматически при первом запуске и не коммитится в git. Если рядом есть старый `backend/data/db.json`, первый запуск импортирует его как стартовые данные.

## Основные API

```text
POST  /api/auth/login
GET   /api/auth/me
POST  /api/auth/logout
POST  /api/auth/change-password
GET   /api/reference/icd10?q=
POST  /api/ai/analyze-transcript
POST  /api/ai/protocol-draft
GET   /api/doctors
GET   /api/schedule?doctorId=&date=
POST  /api/appointments
GET   /api/appointments/active?patientId=
PATCH /api/appointments/:id/status
GET   /api/patients?q=
GET   /api/patients/:id
GET   /api/patients/:id/protocol
GET   /api/patients/:id/medical-card
GET   /api/patients/:id/treatment-plan
GET   /api/patients/:id/ai-context
GET   /api/patients/:id/tooth-chart
PUT   /api/patients/:id/tooth-chart
POST  /api/patients/:id/reminders
POST  /api/patients/:id/documents/protocol
POST  /api/patients
PUT   /api/patients/:id
POST  /api/visits/start
POST  /api/visits/finish
GET   /api/visits?patientId=
GET   /api/visits/all?q=&doctorId=&from=&to=
GET   /api/visits/:id/materials
GET   /api/visits/:id/services
GET   /api/files?patientId=&visitId=
POST  /api/files
GET   /api/files/:id/download
DELETE /api/files/:id
POST  /api/documents/:id/sign
GET   /api/payments?date=
GET   /api/payments/patient/:id
GET   /api/payments/export?date=
POST  /api/payments
GET   /api/debtors?q=
GET   /api/reports/day?date=
GET   /api/reports/period?dateFrom=&dateTo=
GET   /api/analytics/business?dateFrom=&dateTo=
GET   /api/notifications
POST  /api/notifications/generate
PATCH /api/notifications/:id/read
GET   /api/audit-logs
GET   /api/audit-logs/export?entityType=&entityId=&dateFrom=&dateTo=
GET   /api/conversations?q=&channel=&status=&patientId=
POST  /api/conversations
GET   /api/conversations/:id
PATCH /api/conversations/:id/status
GET   /api/conversations/:id/messages
POST  /api/conversations/:id/messages
POST  /api/conversations/:id/ai-draft
GET   /api/inventory
POST  /api/inventory
PATCH /api/inventory/:id/quantity
GET   /api/price-items?q=&activeOnly=
POST  /api/price-items
PUT   /api/price-items/:id
PATCH /api/price-items/:id/active
GET   /api/invoices?patientId=&status=&dateFrom=&dateTo=
POST  /api/invoices
GET   /api/invoices/:id
POST  /api/invoices/:id/pay
GET   /api/stock-movements?inventoryId=&dateFrom=&dateTo=
POST  /api/stock-movements
GET   /api/users?q=
POST  /api/users
PUT   /api/users/:id
```

API documentation:

```text
GET /api/docs
GET /api/openapi.json
```
