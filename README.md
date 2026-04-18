# 🇰🇭 ប្រព័ន្ធគ្រប់គ្រងបុគ្គលិក - Setup Guide

## 📁 រចនាសម្ព័ន្ធឯកសារ

```
employee-system/
├── frontend/
│   ├── index.html      ← ទំព័រ HTML ចម្បង
│   ├── style.css       ← រចនាបថ CSS
│   └── app.js          ← JavaScript (Frontend Logic)
│
└── worker/
    ├── src/
    │   └── index.js    ← Cloudflare Worker API
    └── wrangler.toml   ← ការកំណត់ Wrangler
```

---

## 🚀 ជំហានដំឡើង

### ជំហាន 1: ដំឡើង Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### ជំហាន 2: បង្កើត D1 Database

```bash
cd worker
wrangler d1 create employee_db
```

**Copy** `database_id` ដែលបានបង្ហាញ ហើយដាក់ក្នុង `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "employee_db"
database_id = "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← ដាក់ ID នៅទីនេះ
```

### ជំហាន 3: Deploy Worker

```bash
wrangler deploy
```

Worker URL នឹងស្រដៀង: `https://employee-management-api.YOUR_NAME.workers.dev`

### ជំហាន 4: Initialize Database

```bash
curl -X POST https://employee-management-api.YOUR_NAME.workers.dev/init
```

### ជំហាន 5: ភ្ជាប់ Frontend ទៅ API

ក្នុង `frontend/app.js` ផ្លាស់ប្តូរ:

```javascript
const API_BASE = 'https://employee-management-api.YOUR_NAME.workers.dev';
```

### ជំហាន 6: Deploy Frontend

អាចប្រើ **Cloudflare Pages**, **Netlify**, ឬ **GitHub Pages**:

```bash
# Cloudflare Pages
wrangler pages deploy ./frontend

# ឬបើក local
cd frontend && python -m http.server 3000
```

---

## 🗃️ D1 Database Schema

```sql
-- នាយកដ្ឋាន
CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  manager TEXT,
  icon TEXT DEFAULT '🏢',
  color TEXT DEFAULT '#118AB2',
  created_at TEXT,
  updated_at TEXT
);

-- បុគ្គលិក
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT DEFAULT 'male',
  position TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  phone TEXT,
  email TEXT,
  salary REAL DEFAULT 0,
  hire_date TEXT,
  status TEXT DEFAULT 'active',  -- active | on_leave | inactive
  created_at TEXT,
  updated_at TEXT
);

-- វត្តមាន
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT DEFAULT 'present',  -- present | late | absent
  notes TEXT,
  created_at TEXT,
  UNIQUE(employee_id, date)
);

-- ប្រាក់ខែ
CREATE TABLE salary_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month TEXT NOT NULL,  -- YYYY-MM format
  base_salary REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  deduction REAL DEFAULT 0,
  net_salary REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending | paid
  notes TEXT,
  paid_at TEXT,
  created_at TEXT,
  UNIQUE(employee_id, month)
);
```

---

## 🔌 API Endpoints

| Method | Endpoint | មុខងារ |
|--------|----------|--------|
| `POST` | `/init` | Initialize database |
| `GET` | `/stats` | Dashboard stats |
| `GET` | `/employees` | បញ្ជីបុគ្គលិក |
| `POST` | `/employees` | បន្ថែមបុគ្គលិក |
| `GET` | `/employees/:id` | ព័ត៌មានបុគ្គលិក |
| `PUT` | `/employees/:id` | កែប្រែ |
| `DELETE` | `/employees/:id` | លុប |
| `GET` | `/departments` | បញ្ជីនាយកដ្ឋាន |
| `POST` | `/departments` | បន្ថែម |
| `PUT` | `/departments/:id` | កែប្រែ |
| `DELETE` | `/departments/:id` | លុប |
| `GET` | `/attendance?date=YYYY-MM-DD` | វត្តមាន |
| `POST` | `/attendance` | កត់វត្តមាន |
| `GET` | `/salary?month=YYYY-MM` | ប្រាក់ខែ |
| `POST` | `/salary` | បន្ថែមកំណត់ត្រា |
| `PUT` | `/salary/:id/pay` | បង់ប្រាក់ |

### ឧទាហរណ៍ API Calls

```bash
# Get all employees
curl https://your-worker.workers.dev/employees

# Search employees
curl "https://your-worker.workers.dev/employees?search=ហ្គីម&department=IT"

# Create employee
curl -X POST https://your-worker.workers.dev/employees \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ហ្គីម ស្រ័យ",
    "position": "Developer",
    "department_id": 1,
    "salary": 1200,
    "status": "active"
  }'

# Record attendance
curl -X POST https://your-worker.workers.dev/attendance \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": 1,
    "date": "2025-01-15",
    "check_in": "08:05",
    "check_out": "17:00",
    "status": "present"
  }'
```

---

## ✨ មុខងារ

- ✅ **Dashboard** - ស្ថិតិ និងទិន្នន័យសំខាន់ៗ
- ✅ **គ្រប់គ្រងបុគ្គលិក** - CRUD ពេញលេញ + ស្វែងរក + ចម្រោស
- ✅ **នាយកដ្ឋាន** - គ្រប់គ្រង + រាប់ចំនួន
- ✅ **វត្តមាន** - កត់ចូល/ចេញ ប្រចាំថ្ងៃ
- ✅ **ប្រាក់ខែ** - គ្រប់គ្រង + ការបង់ + ស្ថិតិ
- ✅ **ភាសាខ្មែរ** - ទាំងស្រុង
- ✅ **Demo Mode** - ដំណើរការដោយគ្មាន API
- ✅ **Responsive** - ស្រួលប្រើ Mobile

---

## 🔒 Security (Production)

ដើម្បីការពារ API ក្នុង production, បន្ថែម JWT auth:

```javascript
// ក្នុង worker/src/index.js - ដំបូង request
async function authenticate(request, env) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || token !== env.API_SECRET) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  return null; // OK
}
```

ហើយ set secret:
```bash
wrangler secret put API_SECRET
```

---

## 📞 ជំនួយ

- 📚 Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- 🗃️ D1 Database Docs: https://developers.cloudflare.com/d1/
- 🚀 Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/
