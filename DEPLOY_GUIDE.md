# 🚀 HR Pro — ការណែនាំ Deploy ពេញលេញ
## Cloudflare Worker + D1 Database

---

## 📋 តម្រូវការ

| ធាតុ | ការណែនាំ |
|------|----------|
| **Node.js** | v18+ — [nodejs.org](https://nodejs.org) |
| **npm** | មកជាមួយ Node.js |
| **Cloudflare Account** | Free — [cloudflare.com](https://cloudflare.com) |
| **Internet** | ត្រូវការ |

---

## ⚡ ជម្រើស A — Auto Deploy (ងាយបំផុត)

```bash
# 1. Clone / Download project
# 2. ចូល terminal ក្នុង folder project
chmod +x deploy.sh
bash deploy.sh
```

Script នឹង:
- ✅ Install Wrangler
- ✅ Login Cloudflare
- ✅ បង្កើត D1 Database
- ✅ Deploy Worker
- ✅ Initialize Database Tables

---

## 🔧 ជម្រើស B — Manual Deploy (ជំហានម្ដងៗ)

### ជំហាន 1 — Install Wrangler

```bash
npm install -g wrangler
wrangler --version   # ពិនិត្យ
```

### ជំហាន 2 — Login Cloudflare

```bash
wrangler login
# Browser នឹងបើក → Login → Allow → ត្រឡប់
wrangler whoami      # ពិនិត្យ
```

### ជំហាន 3 — បង្កើត D1 Database

```bash
cd worker/
wrangler d1 create employee_db
```

Output:
```
✅ Successfully created DB 'employee_db'

[[d1_databases]]
binding = "DB"
database_name = "employee_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← COPY THIS
```

### ជំហាន 4 — ដាក់ Database ID ក្នុង wrangler.toml

បើក `worker/wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "employee_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← paste ទីនេះ
```

### ជំហាន 5 — Deploy Worker

```bash
cd worker/
wrangler deploy
```

Output:
```
✅ Deployed employee-management-api
   https://employee-management-api.YOUR_NAME.workers.dev
```

**Copy URL នោះ!**

### ជំហាន 6 — Initialize Database

```bash
curl -X POST https://employee-management-api.YOUR_NAME.workers.dev/init
```

Response:
```json
{ "message": "Database initialized successfully!" }
```

### ជំហាន 7 — ភ្ជាប់ Frontend

1. បើក `frontend/index.html` ក្នុង browser
2. Login ជាមួយ `admin / admin123`
3. ចុច **⚙️ Settings** → Tab **API/Database**
4. ដាក់ Worker URL: `https://employee-management-api.YOUR_NAME.workers.dev`
5. ចុច **🔌 Test** → ចុច **💾 Save & ភ្ជាប់**

---

## 🧪 ពិនិត្យ API

```bash
# ស្ថានភាព
curl https://your-worker.workers.dev/stats

# បញ្ជីបុគ្គលិក
curl https://your-worker.workers.dev/employees

# បន្ថែមបុគ្គលិក
curl -X POST https://your-worker.workers.dev/employees \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ហ្គីម ស្រ័យ",
    "position": "Developer",
    "department_id": 1,
    "salary": 1200,
    "status": "active"
  }'
```

---

## 🗺️ API Endpoints ទាំងអស់

```
GET    /stats                    Dashboard stats
POST   /init                     Initialize DB

GET    /employees                List (search, filter, paginate)
POST   /employees                Create
GET    /employees/:id            Get one
PUT    /employees/:id            Update
DELETE /employees/:id            Delete

GET    /departments              List
POST   /departments              Create
PUT    /departments/:id          Update
DELETE /departments/:id          Delete

GET    /attendance               List (by date/month)
POST   /attendance               Record

GET    /salary                   List (by month)
POST   /salary                   Create record
PUT    /salary/:id/pay           Mark as paid

GET    /overtime                 List
POST   /overtime                 Create
PUT    /overtime/:id             Update status

GET    /allowances               List
POST   /allowances               Create
DELETE /allowances/:id           Delete

GET    /loans                    List
POST   /loans                    Create
PUT    /loans/:id/repay          Record repayment
DELETE /loans/:id                Delete

GET    /expenses                 List
POST   /expenses                 Create
PUT    /expenses/:id             Update status
DELETE /expenses/:id             Delete

GET    /general-expenses         List
POST   /general-expenses         Create
PUT    /general-expenses/:id     Update
DELETE /general-expenses/:id     Delete

GET    /leave                    List
POST   /leave                    Create
PUT    /leave/:id                Update status
DELETE /leave/:id                Delete
```

---

## 🔒 CORS — ដំណោះស្រាយ

Worker បានដាក់ CORS headers រួចហើយ:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

ប្រសិនបើ CORS error នៅ — ពិនិត្យ:
1. Worker URL ត្រឹមត្រូវ (https://, គ្មាន trailing slash)
2. Worker Deploy ជោគជ័យ
3. `/init` endpoint បាន call

---

## 💰 តម្លៃ

| Plan | Workers Requests | D1 Reads | D1 Writes | តម្លៃ |
|------|-----------------|----------|-----------|-------|
| **Free** | 100K/day | 25M/day | 100K/day | **$0** |
| Paid | 10M/month | 25M/day | 50M/month | $5/month |

HR Pro ជាមធ្យម **< 10K requests/day** → **Free Plan** ​ ​គ្រប់គ្រាន់ ✅

---

## 🐛 ការដោះស្រាយបញ្ហា

| Error | ដំណោះស្រាយ |
|-------|-----------|
| `CORS error` | ពិនិត្យ Worker URL, Deploy ថ្មី |
| `404 Not Found` | ពិនិត្យ endpoint path |
| `D1_ERROR` | Run `/init` ម្ដងទៀត |
| `wrangler: command not found` | `npm install -g wrangler` |
| `Authentication error` | `wrangler login` ម្ដងទៀត |
| `database_id missing` | ដាក់ ID ក្នុង wrangler.toml |

---

## 📞 ជំនួយ

- 📚 [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- 🗃️ [D1 Database Docs](https://developers.cloudflare.com/d1/)
- 🛠️ [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
