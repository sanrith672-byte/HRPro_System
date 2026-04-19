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
    if (path === '/config') {
      if (method === 'GET') return getAppConfig(env);
      if (method === 'POST') return saveAppConfig(request,env);
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


    if (path === '/stats' && method === 'GET') return getStats(env);

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

  const selectCols = `
    e.id, e.name, e.gender, e.position, e.department_id, e.phone, e.email,
    e.salary, e.hire_date, e.status, e.created_at, e.updated_at,
    COALESCE(e.custom_id,'') as custom_id,
    COALESCE(e.bank,'') as bank,
    COALESCE(e.bank_account,'') as bank_account,
    COALESCE(e.bank_holder,'') as bank_holder,
    COALESCE(e.photo_data,'') as photo_data,
    COALESCE(e.qr_data,'') as qr_data,
    COALESCE(e.termination_date,'') as termination_date,
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
  const emp = await env.DB.prepare(`
    SELECT e.id, e.name, e.gender, e.position, e.department_id, e.phone, e.email,
           e.salary, e.hire_date, e.status, e.created_at, e.updated_at,
           COALESCE(e.custom_id,'') as custom_id,
           COALESCE(e.bank,'') as bank,
           COALESCE(e.bank_account,'') as bank_account,
           COALESCE(e.bank_holder,'') as bank_holder,
           COALESCE(e.photo_data,'') as photo_data,
           COALESCE(e.qr_data,'') as qr_data,
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
  const { name, position, department_id, phone, email, salary, hire_date, status, gender, custom_id, bank, bank_account, bank_holder, termination_date } = body;

  if (!name || !position || !department_id) {
    return error('name, position, department_id are required');
  }

  // Auto-migrate: add termination_date column if not exists
  try { await env.DB.prepare(`ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''`).run(); } catch(_) {}

  const result = await env.DB.prepare(`
    INSERT INTO employees (name, position, department_id, phone, email, salary, hire_date, status, gender, custom_id, bank, bank_account, bank_holder, termination_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    name, position, department_id,
    phone||'', email||'', salary||0,
    hire_date||new Date().toISOString().split('T')[0],
    status||'active', gender||'male',
    custom_id||'', bank||'', bank_account||'', bank_holder||'',
    termination_date||''
  ).run();

  const newEmp = await env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(result.meta.last_row_id).first();
  return json({ message: 'Employee created', id: result.meta.last_row_id, employee: newEmp }, 201);
}

async function updateEmployee(id, request, env) {
  const body = await request.json();
  const { name, position, department_id, phone, email, salary, hire_date, status, gender, custom_id, bank, bank_account, bank_holder, termination_date } = body;

  const existing = await env.DB.prepare('SELECT id FROM employees WHERE id = ?').bind(id).first();
  if (!existing) return error('Employee not found', 404);

  // Auto-migrate: add termination_date column if not exists
  try { await env.DB.prepare(`ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''`).run(); } catch(_) {}

  await env.DB.prepare(`
    UPDATE employees SET
      name=?, position=?, department_id=?, phone=?, email=?,
      salary=?, hire_date=?, status=?, gender=?,
      termination_date=?,
      custom_id=COALESCE(?,custom_id),
      bank=COALESCE(?,bank), bank_account=COALESCE(?,bank_account), bank_holder=COALESCE(?,bank_holder),
      updated_at=datetime('now')
    WHERE id=?
  `).bind(
    name, position, department_id, phone||'', email||'',
    salary||0, hire_date||'', status||'active', gender||'male',
    termination_date||'',
    custom_id||null, bank||null, bank_account||null, bank_holder||null,
    id
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first();
  return json({ message: 'Employee updated', employee: updated });
}

async function deleteEmployee(id, env) {
  const existing = await env.DB.prepare('SELECT id FROM employees WHERE id = ?').bind(id).first();
  if (!existing) return error('Employee not found', 404);

  // Delete all related records first (cascade)
  const tables = ['attendance','salary_records','overtime','allowances','loans','expense_requests','leave_requests'];
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
    SELECT a.*, e.name as employee_name, d.name as department
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (empId) { query += ' AND a.employee_id = ?'; params.push(empId); }
  if (month) { query += " AND strftime('%Y-%m', a.date) = ?"; params.push(month); }
  else if (!limit) { query += ' AND a.date = ?'; params.push(date); }

  query += ' ORDER BY a.date DESC, e.name';
  if (limit) query += ' LIMIT ' + limit;

  const result = await env.DB.prepare(query).bind(...params).all();

  // Stats
  const present = result.results.filter(r => r.status === 'present').length;
  const late = result.results.filter(r => r.status === 'late').length;
  const absent = result.results.filter(r => r.status === 'absent').length;

  return json({ records: result.results, stats: { present, late, absent, total: result.results.length } });
}

async function updateAttendance(id, request, env) {
  const existing = await env.DB.prepare('SELECT id FROM attendance WHERE id = ?').bind(id).first();
  if (!existing) return error('Attendance record not found', 404);
  const { date, check_in, check_out, status } = await request.json();
  await env.DB.prepare(`UPDATE attendance SET date=COALESCE(?,date), check_in=COALESCE(?,check_in), check_out=COALESCE(?,check_out), status=COALESCE(?,status) WHERE id=?`)
    .bind(date||null, check_in||null, check_out||null, status||null, id).run();
  return json({ message: 'Attendance updated' });
}

async function createAttendance(request, env) {
  let body;
  try { body = await request.json(); } catch(_) { return error('Invalid JSON body'); }

  const { employee_id, date, check_in, check_out, status, notes } = body || {};

  if (!employee_id) return error('employee_id is required');

  const attDate = date || new Date().toISOString().split('T')[0];

  // Check if record already exists for this employee+date
  const existing = await env.DB.prepare(
    'SELECT id, check_in FROM attendance WHERE employee_id = ? AND date = ?'
  ).bind(parseInt(employee_id), attDate).first();

  if (existing) {
    // Update existing — preserve check_in if not provided
    const newCheckIn = check_in || existing.check_in || '';
    const newCheckOut = check_out || '';
    const newStatus = status || 'present';
    await env.DB.prepare(
      'UPDATE attendance SET check_in=?, check_out=?, status=?, notes=? WHERE id=?'
    ).bind(newCheckIn, newCheckOut, newStatus, notes||'', existing.id).run();
    return json({ message: 'Attendance updated', id: existing.id });
  }

  // Insert new record
  const result = await env.DB.prepare(
    'INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes, created_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))'
  ).bind(parseInt(employee_id), attDate, check_in||'', check_out||'', status||'present', notes||'').run();

  return json({ message: 'Attendance recorded', id: result.meta.last_row_id }, 201);
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
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key='company'").first();
    return json(row ? JSON.parse(row.value||'{}') : {});
  } catch(_) { return json({}); }
}
async function saveAppConfig(request, env) {
  try {
    const body = await request.json();
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('company',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(body)).run();
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
      bank TEXT DEFAULT '',
      bank_account TEXT DEFAULT '',
      bank_holder TEXT DEFAULT '',
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
    `CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT DEFAULT '')`,
  ];
  for (const m of migrations) {
    try { await env.DB.prepare(m).run(); } catch(_) { /* column already exists — OK */ }
  }

  return json({ message: 'Database initialized successfully! All migrations applied.' });
}