# NeuroDent Backend

Node.js backend без внешних зависимостей. Он отдает frontend и предоставляет REST API для CRM.

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

## Хранение данных

Данные сохраняются в `backend/data/db.json`. Файл создается автоматически при первом запуске и не коммитится в git.

## Основные API

```text
POST  /api/auth/login
GET   /api/doctors
GET   /api/schedule?doctorId=&date=
POST  /api/appointments
GET   /api/appointments/active?patientId=
PATCH /api/appointments/:id/status
GET   /api/patients?q=
GET   /api/patients/:id
GET   /api/patients/:id/protocol
POST  /api/patients
PUT   /api/patients/:id
POST  /api/visits/start
POST  /api/visits/finish
GET   /api/visits?patientId=
GET   /api/payments?date=
GET   /api/payments/export?date=
POST  /api/payments
GET   /api/debtors?q=
GET   /api/reports/day?date=
GET   /api/inventory
POST  /api/inventory
PATCH /api/inventory/:id/quantity
GET   /api/users?q=
POST  /api/users
PUT   /api/users/:id
```
