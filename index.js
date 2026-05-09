// ============================================================
// Cloudflare Workers + D1 Database - Employee Management API
// ============================================================
// Deploy with: wrangler deploy
// ============================================================

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

// ===== CORS HEADERS =====
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// ===== ROUTER =====
async function handleRequest(request, env) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // ===== EMPLOYEES =====
    if (path === '/employees') {
      if (method === 'GET') return getEmployees(request, env);
      if (method === 'POST') return createEmployee(request, env);
    }
    if (path.match(/^\/employees\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'GET') return getEmployee(id, env);
      if (method === 'PUT') return updateEmployee(id, request, env);
      if (method === 'DELETE') return deleteEmployee(id, env);
    }
    if (path.match(/^\/employees\/\d+\/photo$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'POST') return saveEmpMedia(id,'photo_data',request,env);
      if (method === 'DELETE') return deleteEmpMedia(id,'photo_data',env);
    }
    if (path.match(/^\/employees\/\d+\/qr$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'POST') return saveEmpMedia(id,'qr_data',request,env);
      if (method === 'DELETE') return deleteEmpMedia(id,'qr_data',env);
    }
    // ===== FIX DB — force run all column migrations =====
    if (path === '/fix-db' && method === 'POST') {
      const results = await Promise.allSettled([
        env.DB.prepare("ALTER TABLE attendance ADD COLUMN scanner_id INTEGER DEFAULT NULL").run(),
        env.DB.prepare("ALTER TABLE attendance ADD COLUMN notes TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN custom_id TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN bank TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN bank_account TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN bank_holder TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN photo_data TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN qr_data TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN work_history TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN off_days TEXT DEFAULT '[]'").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN work_location TEXT DEFAULT ''").run(),
        env.DB.prepare("ALTER TABLE employees ADD COLUMN allowance REAL DEFAULT 0").run(),
      ]);
      const summary = results.map((r,i) => r.status === 'fulfilled' ? 'ok' : 'skip');
      return json({ message: 'DB fix done', results: summary });
    }

    // ===== MIGRATE ATTENDANCE TABLE — remove old CHECK constraint =====
    if (path === '/migrate-attendance' && method === 'POST') {
      try {
        // Step 1: rename old table
        await env.DB.prepare('ALTER TABLE attendance RENAME TO attendance_old').run().catch(()=>{});
        // Step 2: create new table without CHECK constraint
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS attendance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id),
          date TEXT NOT NULL,
          check_in TEXT DEFAULT '',
          check_out TEXT DEFAULT '',
          status TEXT DEFAULT 'present',
          notes TEXT DEFAULT '',
          scanner_id INTEGER DEFAULT NULL,
          created_at TEXT,
          UNIQUE(employee_id, date)
        )`).run();
        // Step 3: copy data, mapping old statuses
        await env.DB.prepare(`INSERT OR IGNORE INTO attendance (id,employee_id,date,check_in,check_out,status,notes,scanner_id,created_at)
          SELECT id, employee_id, date,
            COALESCE(check_in,''), COALESCE(check_out,''),
            CASE WHEN status IN ('present','late','absent','holiday','half_day_am','half_day_pm') THEN status ELSE 'present' END,
            COALESCE(notes,''), scanner_id, created_at
          FROM attendance_old`).run();
        // Step 4: drop old table
        await env.DB.prepare('DROP TABLE IF EXISTS attendance_old').run();
        const cnt = await env.DB.prepare('SELECT COUNT(*) as n FROM attendance').first();
        return json({ message: 'Migration done! Attendance table recreated without CHECK constraint.', rows: cnt.n });
      } catch(e) {
        return json({ error: e.message }, 500);
      }
    }

    // ===== DEBUG ATTENDANCE =====
    if (path === '/debug-attendance' && method === 'GET') {
      try {
        const cols = await env.DB.prepare("PRAGMA table_info(attendance)").all();
        const empCols = await env.DB.prepare("PRAGMA table_info(employees)").all();
        const count = await env.DB.prepare("SELECT COUNT(*) as total FROM attendance").first();
        const empCount = await env.DB.prepare("SELECT COUNT(*) as total FROM employees").first();
        return json({ att_columns: cols.results.map(c=>c.name), emp_columns: empCols.results.map(c=>c.name), att_total: count.total, emp_total: empCount.total });
      } catch(e) {
        return json({ error: e.message });
      }
    }

    // ===== DEBUG DB CHECK =====
    if (path === '/check-db' && method === 'GET') {
      try {
        const cols = await env.DB.prepare("PRAGMA table_info(employees)").all();
        const colNames = cols.results.map(c => c.name);
        const hasAllowance = colNames.includes('allowance');
        // Try to get one employee with allowance
        const sample = await env.DB.prepare("SELECT id, name, salary, allowance FROM employees LIMIT 3").all();
        return json({ columns: colNames, hasAllowance, sample: sample.results });
      } catch(e) {
        return json({ error: e.message });
      }
    }

    if (path === '/config') {
      if (method === 'GET') return getAppConfig(env);
      if (method === 'POST') return saveAppConfig(request,env);
    }

    // ===== AUTH =====
    if (path === '/login' && method === 'POST') return handleLogin(request, env);

    // ===== USER ACCOUNTS =====
    if (path === '/accounts') {
      if (method === 'GET') return getAccounts(env);
      if (method === 'POST') return createAccount(request, env);
    }
    if (path.match(/^\/accounts\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateAccount(id, request, env);
      if (method === 'DELETE') return deleteAccount(id, env);
    }

    // ===== DEPARTMENTS =====
    if (path === '/departments') {
      if (method === 'GET') return getDepartments(env);
      if (method === 'POST') return createDepartment(request, env);
    }
    if (path.match(/^\/departments\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateDepartment(id, request, env);
      if (method === 'DELETE') return deleteDepartment(id, env);
    }

    // ===== ATTENDANCE =====
    if (path === '/attendance') {
      if (method === 'GET') return getAttendance(request, env);
      if (method === 'POST') return createAttendance(request, env);
    }
    if (path.match(/^\/attendance\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateAttendance(id, request, env);
      if (method === 'DELETE') return deleteRecord(id, env, 'attendance');
    }

    // ===== SALARY =====
    if (path === '/salary') {
      if (method === 'GET') return getSalary(request, env);
      if (method === 'POST') return createSalaryRecord(request, env);
    }
    if (path.match(/^\/salary\/\d+\/pay$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return paySalary(id, env);
    }
    if (path.match(/^\/salary\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateSalaryRecord(id, request, env);
      if (method === 'DELETE') return deleteSalaryRecord(id, env);
    }

    // ===== OVERTIME =====
    if (path === '/overtime') {
      if (method === 'GET') return getAll(env, 'overtime', 'ot.*, e.name as employee_name', 'overtime ot JOIN employees e ON ot.employee_id=e.id', 'ot.created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'overtime', ['employee_id','date','hours','rate','pay','reason','status']);
    }
    if (path.match(/^\/overtime\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateRecord(id, request, env, 'overtime');
      if (method === 'DELETE') return deleteRecord(id, env, 'overtime');
    }

    // ===== ALLOWANCES =====
    if (path === '/allowances') {
      if (method === 'GET') return getAll(env, 'allowances', 'al.*, e.name as employee_name', 'allowances al JOIN employees e ON al.employee_id=e.id', 'al.created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'allowances', ['employee_id','type','amount','month','note']);
    }
    if (path.match(/^\/allowances\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'DELETE') return deleteRecord(id, env, 'allowances');
    }

    // ===== LOANS =====
    if (path === '/loans') {
      if (method === 'GET') return getAll(env, 'loans', 'ln.*, e.name as employee_name', 'loans ln JOIN employees e ON ln.employee_id=e.id', 'ln.created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'loans', ['employee_id','amount','loan_date','due_date','note','paid_amount','status','installment_months','installment_amount']);
    }
    if (path.match(/^\/loans\/\d+\/repay$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return repayLoan(id, request, env);
    }
    if (path.match(/^\/loans\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'DELETE') return deleteRecord(id, env, 'loans');
    }

    // ===== EXPENSE REQUESTS =====
    if (path === '/expenses') {
      if (method === 'GET') return getAll(env, 'expense_requests', 'er.*, e.name as employee_name', 'expense_requests er JOIN employees e ON er.employee_id=e.id', 'er.created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'expense_requests', ['employee_id','category','amount','request_date','description','status']);
    }
    if (path.match(/^\/expenses\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateRecord(id, request, env, 'expense_requests');
      if (method === 'DELETE') return deleteRecord(id, env, 'expense_requests');
    }

    // ===== GENERAL EXPENSES =====
    if (path === '/general-expenses') {
      if (method === 'GET') return getAll(env, 'general_expenses', '*', 'general_expenses', 'created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'general_expenses', ['title','category','amount','expense_date','responsible','status','note']);
    }
    if (path.match(/^\/general-expenses\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateRecord(id, request, env, 'general_expenses');
      if (method === 'DELETE') return deleteRecord(id, env, 'general_expenses');
    }

    // ===== LEAVE =====
    if (path === '/leave') {
      if (method === 'GET') return getAll(env, 'leave_requests', 'lr.*, e.name as employee_name', 'leave_requests lr JOIN employees e ON lr.employee_id=e.id', 'lr.created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'leave_requests', ['employee_id','leave_type','start_date','end_date','days','reason','status']);
    }
    if (path.match(/^\/leave\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateRecord(id, request, env, 'leave_requests');
      if (method === 'DELETE') return deleteRecord(id, env, 'leave_requests');
    }

    // ===== DAY SWAP =====
    if (path === '/dayswap' || path.match(/^\/dayswap\/\d+$/)) {
      // Auto-create table if not exists
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS day_swaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        work_day INTEGER NOT NULL,
        off_day INTEGER NOT NULL,
        swap_date TEXT NOT NULL,
        off_date TEXT,
        reason TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        created_at TEXT, updated_at TEXT
      )`).run();
      // Migrate: add off_date column if missing (for existing DBs)
      try {
        await env.DB.prepare(`ALTER TABLE day_swaps ADD COLUMN off_date TEXT`).run();
      } catch(_) { /* column already exists */ }
    }
    if (path === '/dayswap') {
      if (method === 'GET') return getAll(env, 'day_swaps', 'ds.*, e.name as employee_name', 'day_swaps ds JOIN employees e ON ds.employee_id=e.id', 'ds.created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'day_swaps', ['employee_id','work_day','off_day','swap_date','off_date','reason','status']);
    }
    if (path.match(/^\/dayswap\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'GET') return getSingle(id, env, 'day_swaps ds JOIN employees e ON ds.employee_id=e.id', 'ds.*, e.name as employee_name', 'ds');
      if (method === 'PUT') return updateRecord(id, request, env, 'day_swaps');
      if (method === 'DELETE') return deleteRecord(id, env, 'day_swaps');
    }


    // ===== SCAN LOCATIONS =====
    if (path === '/locations' || path.match(/^\/locations\/\d+$/)) {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scan_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT, updated_at TEXT
      )`).run();
    }
    if (path === '/locations') {
      if (method === 'GET') return getAll(env, 'scan_locations', '*', 'scan_locations', 'created_at DESC');
      if (method === 'POST') return insertRecord(request, env, 'scan_locations', ['name','description']);
    }
    if (path.match(/^\/locations\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') return updateRecord(id, request, env, 'scan_locations');
      if (method === 'DELETE') return deleteRecord(id, env, 'scan_locations');
    }

    if (path === '/stats' && method === 'GET') return getStats(env);

    // ===== SALARY INCREASES =====
    if (path === '/salary-increases' || path.match(/^\/salary-increases\/\d+$/)) {
      // Auto-create table if not exists (migration-safe)
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS salary_increases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        amount REAL DEFAULT 0,
        salary_before REAL DEFAULT 0,
        salary_after REAL DEFAULT 0,
        reason TEXT DEFAULT '',
        effective_date TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at TEXT
      )`).run().catch(()=>{});
    }

    if (path === '/salary-increases') {
      if (method === 'GET') {
        const empId = url.searchParams.get('employee_id');
        let q = `SELECT si.*, e.name as employee_name FROM salary_increases si JOIN employees e ON si.employee_id=e.id`;
        const params = [];
        if (empId) { q += ' WHERE si.employee_id=?'; params.push(parseInt(empId)); }
        q += ' ORDER BY si.effective_date DESC, si.created_at DESC';
        const result = await env.DB.prepare(q).bind(...params).all();
        return json(result.results || []);
      }
      if (method === 'POST') {
        const body = await request.json();
        const { employee_id, amount, reason, effective_date, note } = body;
        if (!employee_id || !amount || !effective_date) return error('employee_id, amount, effective_date required');
        const now = new Date().toISOString();
        // Get current salary for reference
        const emp = await env.DB.prepare('SELECT salary FROM employees WHERE id=?').bind(employee_id).first();
        const salary_before = emp ? emp.salary : 0;
        const salary_after = salary_before + parseFloat(amount);
        const r = await env.DB.prepare(
          `INSERT INTO salary_increases (employee_id, amount, salary_before, salary_after, reason, effective_date, note, created_at) VALUES (?,?,?,?,?,?,?,?)`
        ).bind(employee_id, parseFloat(amount), salary_before, salary_after, reason||'', effective_date, note||'', now).run();
        return json({ message: 'Salary increase recorded', id: r.meta.last_row_id, salary_after }, 201);
      }
    }
    if (path.match(/^\/salary-increases\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM salary_increases WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
      if (method === 'PUT') {
        const body = await request.json();
        const { amount, salary_before, salary_after, reason, effective_date, note } = body;
        if (!amount || !effective_date) return error('amount, effective_date required');
        await env.DB.prepare(
          `UPDATE salary_increases SET amount=?, salary_before=?, salary_after=?, reason=?, effective_date=?, note=? WHERE id=?`
        ).bind(parseFloat(amount), parseFloat(salary_before||0), parseFloat(salary_after||0), reason||'', effective_date, note||'', id).run();
        return json({ message: 'Updated', salary_after: parseFloat(salary_after||0) });
      }
    }

    // ===== INIT DB =====
    if (path === '/init' && method === 'POST') return initDatabase(env);

    return error('Not Found', 404);
  } catch (e) {
    // Log full error for debugging
    console.error('Worker error:', e.message, e.stack);
    // ALWAYS return CORS headers even on 500 errors
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: e.message,
      path: new URL(request.url).pathname,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
}

// ============================================================
// EMPLOYEES
// ============================================================

async function getEmployees(request, env) {
  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const dept = url.searchParams.get('department') || '';
  const status = url.searchParams.get('status') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  // Run migrations once (safe — ignores if already exists)
  const colMigrations = [
    `ALTER TABLE employees ADD COLUMN custom_id TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN bank TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN bank_account TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN bank_holder TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN photo_data TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN qr_data TEXT DEFAULT ''`,
    `ALTER TABLE attendance ADD COLUMN scanner_id INTEGER DEFAULT NULL`,
    `ALTER TABLE attendance ADD COLUMN notes TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN work_history TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN off_days TEXT DEFAULT '[]'`,
    `ALTER TABLE employees ADD COLUMN work_location TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN allowance REAL DEFAULT 0`,
  ];
  await Promise.allSettled(colMigrations.map(sql => env.DB.prepare(sql).run()));

  const selectCols = `
    e.id, e.name, e.gender, e.position, e.department_id, e.phone, e.email,
    e.salary, COALESCE(e.allowance,0) as allowance, e.hire_date, e.status, e.created_at, e.updated_at,
    COALESCE(e.custom_id,'') as custom_id,
    COALESCE(e.bank,'') as bank,
    COALESCE(e.bank_account,'') as bank_account,
    COALESCE(e.bank_holder,'') as bank_holder,
    COALESCE(e.photo_data,'') as photo_data,
    COALESCE(e.qr_data,'') as qr_data,
    COALESCE(e.termination_date,'') as termination_date,
    COALESCE(e.work_history,'') as work_history,
    COALESCE(e.off_days,'[]') as off_days,
    COALESCE(e.work_location,'') as work_location,
    d.name as department_name, d.icon as dept_icon
  `;

  let query = `SELECT ${selectCols} FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE 1=1`;
  const params = [];

  if (search) {
    query += ` AND (e.name LIKE ? OR e.position LIKE ? OR e.email LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (dept) { query += ` AND d.name = ?`; params.push(dept); }
  if (status) { query += ` AND e.status = ?`; params.push(status); }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE 1=1`
    + (search ? ` AND (e.name LIKE ? OR e.position LIKE ? OR e.email LIKE ?)` : '')
    + (dept ? ` AND d.name = ?` : '')
    + (status ? ` AND e.status = ?` : '')
  ).bind(...params).first();

  query += ` ORDER BY e.id ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...params).all();

  return json({
    employees: result.results,
    total: countResult.total,
    page,
    limit,
    pages: Math.ceil(countResult.total / limit),
  });
}

async function getEmployee(id, env) {
  // Auto-migrate
  await Promise.allSettled([
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN work_history TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN off_days TEXT DEFAULT '[]'`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN allowance REAL DEFAULT 0`).run(),
  ]);

  const emp = await env.DB.prepare(`
    SELECT e.id, e.name, e.gender, e.position, e.department_id, e.phone, e.email,
           e.salary, COALESCE(e.allowance,0) as allowance, e.hire_date, e.status, e.created_at, e.updated_at,
           COALESCE(e.custom_id,'') as custom_id,
           COALESCE(e.bank,'') as bank,
           COALESCE(e.bank_account,'') as bank_account,
           COALESCE(e.bank_holder,'') as bank_holder,
           COALESCE(e.photo_data,'') as photo_data,
           COALESCE(e.qr_data,'') as qr_data,
           COALESCE(e.termination_date,'') as termination_date,
           COALESCE(e.work_history,'') as work_history,
           COALESCE(e.off_days,'[]') as off_days,
    COALESCE(e.work_location,'') as work_location,
           d.name as department_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE e.id = ?
  `).bind(id).first();

  if (!emp) return error('Employee not found', 404);
  return json(emp);
}

async function createEmployee(request, env) {
  const body = await request.json();
  const { name, position, department_id, phone, email, salary, hire_date, status, gender, custom_id, bank, bank_account, bank_holder, termination_date, work_history } = body;

  if (!name || !position || !department_id) {
    return error('name, position, department_id are required');
  }

  const result = await env.DB.prepare(`
    INSERT INTO employees (name, position, department_id, phone, email, salary, allowance, hire_date, status, gender, custom_id, bank, bank_account, bank_holder, termination_date, work_history, off_days, work_location, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    name, position, department_id,
    phone||'', email||'', salary||0, body.allowance||0,
    hire_date||new Date().toISOString().split('T')[0],
    status||'active', gender||'male',
    custom_id||'', bank||'', bank_account||'', bank_holder||'',
    termination_date||'', work_history||'',
    JSON.stringify(body.off_days||[]), body.work_location||''
  ).run();

  const newEmp = await env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(result.meta.last_row_id).first();
  return json({ message: 'Employee created', id: result.meta.last_row_id, employee: newEmp }, 201);
}

async function updateEmployee(id, request, env) {
  const body = await request.json();
  const { name, position, department_id, phone, email, salary, hire_date, status, gender, custom_id, bank, bank_account, bank_holder, termination_date, work_history } = body;

  // Ensure allowance column exists
  await env.DB.prepare(`ALTER TABLE employees ADD COLUMN allowance REAL DEFAULT 0`).run().catch(()=>{});

  const existing = await env.DB.prepare('SELECT id FROM employees WHERE id = ?').bind(id).first();
  if (!existing) return error('Employee not found', 404);

  await env.DB.prepare(`
    UPDATE employees SET
      name=?, position=?, department_id=?, phone=?, email=?,
      salary=?, allowance=?, hire_date=?, status=?, gender=?,
      termination_date=?, work_history=?,
      custom_id=COALESCE(?,custom_id),
      bank=COALESCE(?,bank), bank_account=COALESCE(?,bank_account), bank_holder=COALESCE(?,bank_holder),
      off_days=?, work_location=?,
      updated_at=datetime('now')
    WHERE id=?
  `).bind(
    name, position, department_id, phone||'', email||'',
    salary||0, body.allowance||0, hire_date||'', status||'active', gender||'male',
    termination_date||'', work_history||'',
    custom_id||null, bank||null, bank_account||null, bank_holder||null,
    JSON.stringify(body.off_days||[]), body.work_location||'',
    id
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first();
  return json({ message: 'Employee updated', employee: updated });
}

async function deleteEmployee(id, env) {
  const existing = await env.DB.prepare('SELECT id FROM employees WHERE id = ?').bind(id).first();
  if (!existing) return error('Employee not found', 404);

  // Delete all related records first (cascade)
  const tables = ['attendance','salary_records','overtime','allowances','loans','expense_requests','leave_requests','day_swaps'];
  for (const tbl of tables) {
    try {
      await env.DB.prepare('DELETE FROM ' + tbl + ' WHERE employee_id = ?').bind(id).run();
    } catch(_) { /* table may not have employee_id column */ }
  }
  await env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id).run();
  return json({ message: 'Employee deleted' });
}

// ============================================================
// DEPARTMENTS
// ============================================================

async function getDepartments(env) {
  const result = await env.DB.prepare(`
    SELECT d.*, COUNT(e.id) as head_count
    FROM departments d
    LEFT JOIN employees e ON d.id = e.department_id AND e.status != 'inactive'
    GROUP BY d.id
    ORDER BY d.name
  `).all();
  return json(result.results);
}

async function createDepartment(request, env) {
  const { name, manager, icon, color } = await request.json();
  if (!name) return error('name is required');

  const result = await env.DB.prepare(`
    INSERT INTO departments (name, manager, icon, color, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(name, manager || '', icon || '🏢', color || '#118AB2').run();

  const dept = await env.DB.prepare('SELECT * FROM departments WHERE id = ?').bind(result.meta.last_row_id).first();
  return json({ message: 'Department created', department: dept }, 201);
}

async function updateDepartment(id, request, env) {
  const { name, manager, icon, color } = await request.json();
  const existing = await env.DB.prepare('SELECT id FROM departments WHERE id = ?').bind(id).first();
  if (!existing) return error('Department not found', 404);

  await env.DB.prepare(`
    UPDATE departments SET name = ?, manager = ?, icon = ?, color = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(name, manager, icon, color, id).run();

  const updated = await env.DB.prepare('SELECT * FROM departments WHERE id = ?').bind(id).first();
  return json({ message: 'Department updated', department: updated });
}

async function deleteDepartment(id, env) {
  const count = await env.DB.prepare('SELECT COUNT(*) as c FROM employees WHERE department_id = ?').bind(id).first();
  if (count.c > 0) return error('Cannot delete department with employees. Move employees first.');

  await env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(id).run();
  return json({ message: 'Department deleted' });
}

// ============================================================
// ATTENDANCE
// ============================================================

async function getAttendance(request, env) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const empId = url.searchParams.get('employee_id');
  const month = url.searchParams.get('month');
  const limit = parseInt(url.searchParams.get('limit')) || null;
  const attId = url.searchParams.get('id'); // lookup by single ID

  // Single record lookup
  if (attId) {
    const r = await env.DB.prepare(`SELECT a.*, e.name as employee_name FROM attendance a JOIN employees e ON a.employee_id=e.id WHERE a.id=?`).bind(parseInt(attId)).first();
    return json({ record: r || null });
  }

  let query = `
    SELECT a.*, e.name as employee_name, d.name as department, COALESCE(e.work_location,'') as work_location
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE 1=1
  `;
  const params = [];

  const scannerId = url.searchParams.get('scanner_id');
  if (empId) { query += ' AND a.employee_id = ?'; params.push(empId); }
  if (scannerId) { query += ' AND a.scanner_id = ?'; params.push(parseInt(scannerId)); }
  if (month) { query += " AND strftime('%Y-%m', a.date) = ?"; params.push(month); }
  else { query += ' AND a.date = ?'; params.push(date); }

  query += ' ORDER BY a.date DESC, e.name';
  if (limit) query += ' LIMIT ' + limit;

  const result = await env.DB.prepare(query).bind(...params).all();

  // Stats
  const present = result.results.filter(r => r.status === 'present').length;
  const late = result.results.filter(r => r.status === 'late').length;
  const absent = result.results.filter(r => r.status === 'absent').length;
  const half_day = result.results.filter(r => r.status === 'half_day_am' || r.status === 'half_day_pm').length;
  const checked_in = result.results.filter(r => r.check_in).length;
  const checked_out = result.results.filter(r => r.check_out).length;
  const not_scanned = result.results.filter(r => !r.check_in).length;

  return json({ records: result.results, stats: { present, late, absent, half_day, total: result.results.length, checked_in, checked_out, not_scanned } });
}

async function updateAttendance(id, request, env) {
  try {
    const existing = await env.DB.prepare('SELECT id FROM attendance WHERE id = ?').bind(id).first();
    if (!existing) return error('Attendance record not found', 404);
    const body = await request.json();
    const { date, notes } = body;
    const validStatuses = ['present','late','absent','holiday','half_day_am','half_day_pm'];
    const status = validStatuses.includes(body.status) ? body.status : null;
    // Normalize time values — strip AM/PM if browser sends 12h format
    function normalizeTime(t) {
      if (!t) return null;
      t = String(t).trim();
      if (/^\d{1,2}:\d{2}$/.test(t)) return t;
      const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (m) {
        let h = parseInt(m[1]);
        const min = m[2];
        const ampm = m[3].toUpperCase();
        if (ampm === 'AM' && h === 12) h = 0;
        if (ampm === 'PM' && h !== 12) h += 12;
        return String(h).padStart(2,'0') + ':' + min;
      }
      return t;
    }
    const check_in  = normalizeTime(body.check_in);
    const check_out = normalizeTime(body.check_out);
    // Try with notes column, fall back without
    try {
      await env.DB.prepare('UPDATE attendance SET date=COALESCE(?,date), check_in=COALESCE(?,check_in), check_out=COALESCE(?,check_out), status=COALESCE(?,status), notes=COALESCE(?,notes) WHERE id=?')
        .bind(date||null, check_in||null, check_out||null, status||null, notes||null, id).run();
    } catch(_) {
      await env.DB.prepare('UPDATE attendance SET date=COALESCE(?,date), check_in=COALESCE(?,check_in), check_out=COALESCE(?,check_out), status=COALESCE(?,status) WHERE id=?')
        .bind(date||null, check_in||null, check_out||null, status||null, id).run();
    }
    return json({ message: 'Attendance updated' });
  } catch(e) {
    console.error('updateAttendance error:', e.message);
    return new Response(JSON.stringify({ error: 'DB error', message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
    });
  }
}

async function createAttendance(request, env) {
  let body;
  try { body = await request.json(); } catch(e) { return error('Invalid JSON body: ' + e.message); }

  const { employee_id, date, check_in, check_out, status, notes, scanner_id } = body || {};

  if (!employee_id) return error('employee_id is required');

  const attDate = date || new Date().toISOString().split('T')[0];
  // Validate status — accept all known values including half_day
  const validStatuses = ['present','late','absent','holiday','half_day_am','half_day_pm'];
  const safeStatus = validStatuses.includes(status) ? status : 'present';

  // Normalize time values — strip any AM/PM suffix just in case browser sends it
  function normalizeTime(t) {
    if (!t) return '';
    t = String(t).trim();
    // Already HH:MM 24h format
    if (/^\d{1,2}:\d{2}$/.test(t)) return t;
    // Handle "HH:MM AM/PM" format
    const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m) {
      let h = parseInt(m[1]);
      const min = m[2];
      const ampm = m[3].toUpperCase();
      if (ampm === 'AM' && h === 12) h = 0;
      if (ampm === 'PM' && h !== 12) h += 12;
      return String(h).padStart(2,'0') + ':' + min;
    }
    return t;
  }
  const safeCheckIn  = normalizeTime(check_in);
  const safeCheckOut = normalizeTime(check_out);

  // Run attendance column migrations every time (safe — silently ignores if already exists)
  await Promise.allSettled([
    env.DB.prepare('ALTER TABLE attendance ADD COLUMN scanner_id INTEGER DEFAULT NULL').run(),
    env.DB.prepare("ALTER TABLE attendance ADD COLUMN notes TEXT DEFAULT ''").run(),
  ]);

  try {
    // Check if record already exists for this employee+date
    const existing = await env.DB.prepare(
      'SELECT id, check_in FROM attendance WHERE employee_id = ? AND date = ?'
    ).bind(parseInt(employee_id), attDate).first();

    if (existing) {
      // Update existing — preserve check_in if not provided
      const newCheckIn  = safeCheckIn  || existing.check_in || '';
      const newCheckOut = safeCheckOut || '';
      // Try with notes first, fall back without if column missing
      try {
        await env.DB.prepare(
          'UPDATE attendance SET check_in=?, check_out=?, status=?, notes=?, scanner_id=COALESCE(?,scanner_id) WHERE id=?'
        ).bind(newCheckIn, newCheckOut, safeStatus, notes||'', scanner_id||null, existing.id).run();
      } catch(_) {
        await env.DB.prepare(
          'UPDATE attendance SET check_in=?, check_out=?, status=? WHERE id=?'
        ).bind(newCheckIn, newCheckOut, safeStatus, existing.id).run();
      }
      return json({ message: 'Attendance updated', id: existing.id });
    }

    // Insert new record — try with notes/scanner_id, fall back to basic columns
    let insertId;
    try {
      const result = await env.DB.prepare(
        "INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes, scanner_id, created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))"
      ).bind(parseInt(employee_id), attDate, safeCheckIn, safeCheckOut, safeStatus, notes||'', scanner_id||null).run();
      insertId = result.meta.last_row_id;
    } catch(e1) {
      try {
        // Fallback: insert without notes/scanner_id columns (old DB schema)
        const result2 = await env.DB.prepare(
          "INSERT INTO attendance (employee_id, date, check_in, check_out, status, created_at) VALUES (?,?,?,?,?,datetime('now'))"
        ).bind(parseInt(employee_id), attDate, safeCheckIn, safeCheckOut, safeStatus).run();
        insertId = result2.meta.last_row_id;
      } catch(e2) {
        // Last resort: try INSERT OR REPLACE in case of UNIQUE conflict missed by SELECT
        try {
          const result3 = await env.DB.prepare(
            "INSERT OR REPLACE INTO attendance (employee_id, date, check_in, check_out, status, created_at) VALUES (?,?,?,?,?,datetime('now'))"
          ).bind(parseInt(employee_id), attDate, safeCheckIn, safeCheckOut, safeStatus).run();
          insertId = result3.meta.last_row_id;
        } catch(e3) {
          console.error('createAttendance insert failed:', e1.message, '|', e2.message, '|', e3.message);
          return new Response(JSON.stringify({ error: 'DB error', e1: e1.message, e2: e2.message, e3: e3.message, employee_id, date: attDate, ci: safeCheckIn, co: safeCheckOut, st: safeStatus }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
          });
        }
      }
    }
    return json({ message: 'Attendance recorded', id: insertId }, 201);

  } catch(e) {
    console.error('createAttendance error:', e.message, e.stack);
    return new Response(JSON.stringify({ error: 'DB error', message: e.message, employee_id, date: attDate }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
    });
  }
}

// ============================================================
// SALARY
// ============================================================

async function getSalary(request, env) {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

  const result = await env.DB.prepare(`
    SELECT sr.*, e.name as employee_name, d.name as department
    FROM salary_records sr
    JOIN employees e ON sr.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE sr.month = ?
    ORDER BY e.name
  `).bind(month).all();

  const totalNet = result.results.reduce((s, r) => s + (r.net_salary || 0), 0);
  const totalBase = result.results.reduce((s, r) => s + (r.base_salary || 0), 0);
  const paid = result.results.filter(r => r.status === 'paid').length;

  return json({
    records: result.results,
    summary: { total_net: totalNet, total_base: totalBase, paid, pending: result.results.length - paid }
  });
}

async function createSalaryRecord(request, env) {
  const { employee_id, month, base_salary, bonus, deduction, notes } = await request.json();
  if (!employee_id || !month || !base_salary) return error('employee_id, month, base_salary required');

  const net = (base_salary || 0) + (bonus || 0) - (deduction || 0);

  const existing = await env.DB.prepare(
    'SELECT id FROM salary_records WHERE employee_id = ? AND month = ?'
  ).bind(employee_id, month).first();

  if (existing) return error('Salary record already exists for this month');

  await env.DB.prepare(`
    INSERT INTO salary_records (employee_id, month, base_salary, bonus, deduction, net_salary, status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
  `).bind(employee_id, month, base_salary, bonus || 0, deduction || 0, net, notes || '').run();

  return json({ message: 'Salary record created', net_salary: net }, 201);
}

async function updateSalaryRecord(id, request, env) {
  const existing = await env.DB.prepare('SELECT id FROM salary_records WHERE id = ?').bind(id).first();
  if (!existing) return error('Salary record not found', 404);

  const body = await request.json();
  const { base_salary, bonus, deduction, notes } = body;
  const net = (base_salary || 0) + (bonus || 0) - (deduction || 0);

  await env.DB.prepare(`
    UPDATE salary_records
    SET base_salary = ?, bonus = ?, deduction = ?, net_salary = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(base_salary || 0, bonus || 0, deduction || 0, net, notes || '', id).run();

  return json({ message: 'Salary record updated', net_salary: net });
}

async function deleteSalaryRecord(id, env) {
  const existing = await env.DB.prepare('SELECT id FROM salary_records WHERE id = ?').bind(id).first();
  if (!existing) return error('Salary record not found', 404);
  await env.DB.prepare('DELETE FROM salary_records WHERE id = ?').bind(id).run();
  return json({ message: 'Salary record deleted' });
}

async function paySalary(id, env) {
  const existing = await env.DB.prepare('SELECT id FROM salary_records WHERE id = ?').bind(id).first();
  if (!existing) return error('Salary record not found', 404);

  await env.DB.prepare(`
    UPDATE salary_records SET status = 'paid', paid_at = datetime('now') WHERE id = ?
  `).bind(id).run();

  return json({ message: 'Salary marked as paid' });
}

// ============================================================
// DASHBOARD STATS
// ============================================================


// ── Photo/QR/Config helpers ──────────────────────────────────────────────
async function saveEmpMedia(id, col, request, env) {
  try {
    const body = await request.json();
    const data = body.data || '';
    if (data.length > 2500000) return error('Too large', 413);
    await env.DB.prepare('UPDATE employees SET '+col+'=? WHERE id=?').bind(data, id).run();
    return json({ message: 'saved' });
  } catch(e) { return error(e.message); }
}
async function deleteEmpMedia(id, col, env) {
  try {
    await env.DB.prepare("UPDATE employees SET "+col+"='' WHERE id=?").bind(id).run();
    return json({ message: 'deleted' });
  } catch(e) { return error(e.message); }
}
async function getAppConfig(env) {
  try {
    // Return all config keys as one object
    const rows = await env.DB.prepare("SELECT key, value FROM app_config").all();
    const cfg = {};
    for (const r of (rows.results||[])) {
      try { cfg[r.key] = JSON.parse(r.value); } catch { cfg[r.key] = r.value; }
    }
    // Backward compat: merge company key into root
    if (cfg.company && typeof cfg.company === 'object') Object.assign(cfg, cfg.company);
    return json(cfg);
  } catch(_) { return json({}); }
}
async function saveAppConfig(request, env) {
  try {
    const body = await request.json();
    // If body has 'key' field → generic key-value save
    if (body.key) {
      await env.DB.prepare("INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(body.key, typeof body.value === 'string' ? body.value : JSON.stringify(body.value)).run();
      return json({ message: 'saved', key: body.key });
    }
    // Otherwise → save as 'company' config (backward compat)
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('company',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(JSON.stringify(body)).run();
    return json({ message: 'saved' });
  } catch(e) { return error(e.message); }
}
async function getStats(env) {
  const [empCount, deptCount, activeEmp, todayAtt, monthlySalary] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM employees').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM departments').first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM employees WHERE status = 'active'").first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM attendance WHERE date = date('now')`).first(),
    env.DB.prepare(`
      SELECT SUM(net_salary) as total FROM salary_records
      WHERE strftime('%Y-%m', month) = strftime('%Y-%m', 'now')
    `).first(),
  ]);

  return json({
    total_employees: empCount.count,
    total_departments: deptCount.count,
    active_employees: activeEmp.count,
    today_attendance: todayAtt.count,
    monthly_salary: monthlySalary.total || 0,
  });
}

// ============================================================
// GENERIC HELPERS
// ============================================================

async function getAll(env, table, fields, from, order) {
  const result = await env.DB.prepare(`SELECT ${fields} FROM ${from} ORDER BY ${order}`).all();
  return json({ records: result.results });
}

async function getSingle(id, env, from, fields, alias) {
  const tbl = alias || from.split(' ')[0];
  const rec = await env.DB.prepare(`SELECT ${fields} FROM ${from} WHERE ${tbl}.id=?`).bind(id).first();
  if (!rec) return error('Not found', 404);
  return json(rec);
}

async function insertRecord(request, env, table, fields) {
  const body = await request.json();
  const cols = fields.join(', ');
  const placeholders = fields.map(()=>'?').join(', ');
  const values = fields.map(f => body[f] ?? null);
  const result = await env.DB.prepare(
    `INSERT INTO ${table} (${cols}, created_at) VALUES (${placeholders}, datetime('now'))`
  ).bind(...values).run();
  return json({ message: 'Created', id: result.meta.last_row_id }, 201);
}

async function updateRecord(id, request, env, table) {
  const body = await request.json();
  const sets = Object.keys(body).map(k=>`${k}=?`).join(', ');
  const values = [...Object.values(body), id];
  await env.DB.prepare(`UPDATE ${table} SET ${sets}, updated_at=datetime('now') WHERE id=?`).bind(...values).run();
  return json({ message: 'Updated' });
}

async function deleteRecord(id, env, table) {
  await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
  return json({ message: 'Deleted' });
}

async function repayLoan(id, request, env) {
  const { amount } = await request.json();
  const loan = await env.DB.prepare('SELECT * FROM loans WHERE id=?').bind(id).first();
  if (!loan) return error('Loan not found', 404);
  const newPaid = (loan.paid_amount||0) + amount;
  const status = newPaid >= loan.amount ? 'paid' : 'active';
  await env.DB.prepare('UPDATE loans SET paid_amount=?, status=?, updated_at=datetime(\'now\') WHERE id=?').bind(newPaid, status, id).run();
  return json({ message: 'Repayment recorded', paid_amount: newPaid, status });
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================


// ============================================================
// USER ACCOUNTS (D1 SQL)
// ============================================================
async function ensureAccountsTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'Viewer',
    photo TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
  )`).run();
}

async function getAccounts(env) {
  try {
    await ensureAccountsTable(env);
    const rows = await env.DB.prepare(
      "SELECT id,username,name,role,photo,created_at,updated_at FROM user_accounts ORDER BY id ASC"
    ).all();
    return json({ accounts: rows.results || [] });
  } catch(e) { return error(e.message); }
}

async function createAccount(request, env) {
  try {
    await ensureAccountsTable(env);
    const body = await request.json();
    const { username, password, name, role = 'Viewer', photo = '' } = body;
    if (!username || !password || !name) return error('username, password, name required');
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      "INSERT INTO user_accounts(username,password,name,role,photo,created_at,updated_at) VALUES(?,?,?,?,?,?,?)"
    ).bind(username, password, name, role, photo, now, now).run();
    return json({ id: result.meta.last_row_id, username, name, role, message: 'created' }, 201);
  } catch(e) {
    if (e.message && e.message.includes('UNIQUE')) return error('Username នេះមានរួចហើយ!', 409);
    return error(e.message);
  }
}

async function updateAccount(id, request, env) {
  try {
    await ensureAccountsTable(env);
    const body = await request.json();
    const { password, name, role, photo } = body;
    const now = new Date().toISOString();
    const existing = await env.DB.prepare("SELECT * FROM user_accounts WHERE id=?").bind(id).first();
    if (!existing) return error('Account not found', 404);
    await env.DB.prepare(
      "UPDATE user_accounts SET name=?,role=?,photo=?,updated_at=?" +
      (password ? ",password=?" : "") +
      " WHERE id=?"
    ).bind(
      name || existing.name,
      role || existing.role,
      photo !== undefined ? photo : existing.photo,
      now,
      ...(password ? [password] : []),
      id
    ).run();
    return json({ message: 'updated', id });
  } catch(e) { return error(e.message); }
}

async function deleteAccount(id, env) {
  try {
    await ensureAccountsTable(env);
    const existing = await env.DB.prepare("SELECT username FROM user_accounts WHERE id=?").bind(id).first();
    if (!existing) return error('Account not found', 404);
    if (existing.username === 'admin') return error('Cannot delete admin account', 403);
    await env.DB.prepare("DELETE FROM user_accounts WHERE id=?").bind(id).run();
    return json({ message: 'deleted', id });
  } catch(e) { return error(e.message); }
}

async function initDatabase(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      manager TEXT DEFAULT '',
      icon TEXT DEFAULT '🏢',
      color TEXT DEFAULT '#118AB2',
      created_at TEXT,
      updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'male',
      custom_id TEXT DEFAULT '',
      position TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id),
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      salary REAL DEFAULT 0,
      hire_date TEXT,
      status TEXT DEFAULT 'active',
      termination_date TEXT DEFAULT '',
      work_history TEXT DEFAULT '',
      bank TEXT DEFAULT '',
      bank_account TEXT DEFAULT '',
      bank_holder TEXT DEFAULT '',
      off_days TEXT DEFAULT '[]',
      created_at TEXT,
      updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      check_in TEXT DEFAULT '',
      check_out TEXT DEFAULT '',
      status TEXT DEFAULT 'present',
      notes TEXT DEFAULT '',
      scanner_id INTEGER DEFAULT NULL,
      created_at TEXT,
      UNIQUE(employee_id, date)
    )`,

    `CREATE TABLE IF NOT EXISTS salary_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      month TEXT NOT NULL,
      base_salary REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      deduction REAL DEFAULT 0,
      net_salary REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      paid_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(employee_id, month)
    )`,

    `CREATE TABLE IF NOT EXISTS overtime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      hours REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      pay REAL DEFAULT 0,
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT, updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS allowances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      type TEXT NOT NULL,
      amount REAL DEFAULT 0,
      month TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      loan_date TEXT,
      due_date TEXT,
      note TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      installment_months INTEGER DEFAULT 1,
      installment_amount REAL DEFAULT 0,
      created_at TEXT, updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS expense_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      category TEXT NOT NULL,
      amount REAL DEFAULT 0,
      request_date TEXT,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT, updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS general_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL DEFAULT 0,
      expense_date TEXT,
      responsible TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      note TEXT DEFAULT '',
      created_at TEXT, updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER DEFAULT 1,
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT, updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS day_swaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      work_day INTEGER NOT NULL,
      off_day INTEGER NOT NULL,
      swap_date TEXT NOT NULL,
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT, updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS salary_increases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      amount REAL DEFAULT 0,
      salary_before REAL DEFAULT 0,
      salary_after REAL DEFAULT 0,
      reason TEXT DEFAULT '',
      effective_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT
    )`,

  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }

  // ── Migrations for existing DB (safe — ignores errors if column exists) ──
  const migrations = [
    // salary
    `ALTER TABLE salary_records ADD COLUMN updated_at TEXT`,
    // loans
    `ALTER TABLE loans ADD COLUMN installment_months INTEGER DEFAULT 1`,
    `ALTER TABLE loans ADD COLUMN installment_amount REAL DEFAULT 0`,
    // employees — new fields
    `ALTER TABLE employees ADD COLUMN custom_id TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN bank TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN bank_account TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN bank_holder TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN photo_data TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN qr_data TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''`,
    `ALTER TABLE employees ADD COLUMN work_history TEXT DEFAULT ''`,
    `CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS user_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Viewer',
      photo TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    )`,
    // employees — off_days (personal weekly day off)
    `ALTER TABLE employees ADD COLUMN off_days TEXT DEFAULT '[]'`,
    `ALTER TABLE employees ADD COLUMN work_location TEXT DEFAULT ''`,
    `CREATE TABLE IF NOT EXISTS salary_increases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      amount REAL DEFAULT 0,
      salary_before REAL DEFAULT 0,
      salary_after REAL DEFAULT 0,
      reason TEXT DEFAULT '',
      effective_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT
    )`,
  ];
  for (const m of migrations) {
    try { await env.DB.prepare(m).run(); } catch(_) { /* column already exists — OK */ }
  }

  // Ensure admin account exists
  try {
    const existing = await env.DB.prepare("SELECT id FROM user_accounts WHERE username='admin'").first();
    if (!existing) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO user_accounts(username,password,name,role,photo,created_at,updated_at) VALUES(?,?,?,?,?,?,?)"
      ).bind('admin','admin123','Admin','អ្នកគ្រប់គ្រង','',now,now).run();
    }
  } catch(_) {}

  return json({ message: 'Database initialized successfully! All migrations applied.' });
}
// ============================================================
// AUTH — Login endpoint
// ============================================================
async function handleLogin(request, env) {
  try {
    await ensureAccountsTable(env);
    const body = await request.json();
    const { username, password } = body || {};
    if (!username || !password) {
      return json({ success: false, message: 'សូមបំពេញ Username និង Password!' }, 400);
    }
    // Check DB first
    const user = await env.DB.prepare(
      "SELECT id, username, name, role, photo FROM user_accounts WHERE username=? AND password=?"
    ).bind(username, password).first();
    if (user) {
      // Try to find linked employee_id by matching name (for QR Scanner role)
      let empId = null;
      try {
        const empRow = await env.DB.prepare(
          "SELECT id FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1"
        ).bind(user.name).first();
        if (empRow) empId = empRow.id;
      } catch(_) {}
      return json({ success: true, user: { id: user.id, username: user.username, name: user.name, role: user.role, photo: user.photo || '', employee_id: empId } });
    }
    // Check hardcoded adminsupport
    if (username === 'adminsupport' && password === 'admin') {
      return json({ success: true, user: { id: 999, username: 'adminsupport', name: 'Admin Support', role: 'អ្នកគ្រប់គ្រង', photo: '' } });
    }
    return json({ success: false, message: 'Username ឬ Password មិនត្រឹមត្រូវ!' }, 401);
  } catch(e) {
    return error('Login error: ' + e.message);
  }
}