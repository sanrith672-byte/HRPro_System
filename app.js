// ===== CONFIG =====
const STORAGE_KEY   = 'hr_api_base';
const DEMO_MODE_KEY = 'hr_demo_mode';
const AUTH_KEY      = 'hr_session';
const USERS_KEY     = 'hr_users';
const THEME_KEY     = 'hr_theme';

function getApiBase()  { return localStorage.getItem(STORAGE_KEY) || ''; }
function isDemoMode()  { return localStorage.getItem(DEMO_MODE_KEY) === '1' || !getApiBase(); }
function isLoggedIn()  { return !!localStorage.getItem(AUTH_KEY); }
function getSession()  { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch { return null; } }

// Default users (stored in localStorage so admin can add more)
function getUsers() {
  try {
    const u = JSON.parse(localStorage.getItem(USERS_KEY));
    if (u && u.length) return u;
  } catch {}
  return [
    { id:1, username:'admin',   password:'admin123', role:'អ្នកគ្រប់គ្រង', name:'Admin' },
    { id:2, username:'hr',      password:'hr1234',   role:'HR Officer',    name:'HR User' },
    { id:3, username:'finance', password:'fin1234',  role:'Finance',       name:'Finance User' },
  ];
}
function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

// ===== DEMO DATA STORE =====
const demoStore = {
  employees: [], departments: [], attendance: [], salaries: [],
  overtime: [], allowances: [], loans: [], expenses: [], genExpenses: [], leave: [], dayswap: [],
  _nextId: { employees:1, departments:1, attendance:1, salary:1, overtime:1, allowances:1, loans:1, expenses:1, genExpenses:1, leave:1, dayswap:1 },
};

// ===== STATE =====
const state = {
  employees: [],
  departments: [],
  currentPage: 'dashboard',
  editingId: null,
};

// ===== COLORS FOR AVATARS =====
const COLORS = ['#FF6B35','#06D6A0','#118AB2','#FFB703','#EF476F','#8338EC','#3A86FF','#FB5607'];
const getColor = (name) => COLORS[(name?.charCodeAt(0) || 0) % COLORS.length];

// ===== DOM HELPERS =====
const $ = (id) => document.getElementById(id);

// ===== PARSE off_days from DB (stored as JSON string "[0,6]" or already array) =====
function parseOffDays(emp) {
  if (!emp) return [0]; // default Sunday
  var od = emp.off_days;
  if (Array.isArray(od)) return od.length ? od : [0];
  if (typeof od === 'string' && od.trim().startsWith('[')) {
    try {
      var parsed = JSON.parse(od);
      return Array.isArray(parsed) && parsed.length ? parsed : [0];
    } catch(_) { return [0]; }
  }
  return [0]; // fallback Sunday
}
const contentArea = () => $('content-area');

// ===== API HELPER (Real + Demo fallback) =====
async function api(method, path, body = null) {
  if (isDemoMode()) return demoApi(method, path, body);
  const base = getApiBase().replace(/\/$/, '');
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(base + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
  } catch(e) {
    // If CORS/network error, show helpful message
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error('មិនអាចភ្ជាប់ Worker បាន។ សូមពិនិត្យ URL ក្នុង ⚙️ Settings');
    }
    throw e;
  }
}

// ===== DEMO API HANDLER =====
function demoApi(method, path, body) {
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const resource = seg[0];
  const id = seg[1] ? parseInt(seg[1]) : null;
  const sub = seg[2] || null;

  const stores = {
    employees: demoStore.employees, departments: demoStore.departments,
    attendance: demoStore.attendance, salary: demoStore.salaries,
    overtime: demoStore.overtime, allowances: demoStore.allowances,
    loans: demoStore.loans, expenses: demoStore.expenses,
    'general-expenses': demoStore.genExpenses, leave: demoStore.leave,
    dayswap: demoStore.dayswap,
  };
  const idKeys = {
    employees:'employees', departments:'departments', attendance:'attendance',
    salary:'salary', overtime:'overtime', allowances:'allowances',
    loans:'loans', expenses:'expenses', 'general-expenses':'genExpenses', leave:'leave',
    dayswap:'dayswap',
  };

  // Special routes
  if (resource === 'stats') {
    return {
      total_employees: demoStore.employees.length,
      total_departments: demoStore.departments.length,
      active_employees: demoStore.employees.filter(e=>e.status==='active').length,
      today_attendance: demoStore.attendance.filter(a=>a.date===today()).length,
      monthly_salary: demoStore.salaries.reduce((s,r)=>s+(r.net_salary||0),0),
    };
  }
  if (resource === 'init') return { message: 'Demo mode - no init needed' };

  const store = stores[resource];
  const idKey = idKeys[resource];
  if (!store) return {};

  // EMPLOYEES special: paginated list
  if (resource === 'employees' && !id && method === 'GET') {
    const params = new URLSearchParams(path.split('?')[1]||'');
    let list = [...store];
    const search = params.get('search');
    const dept = params.get('department');
    const status = params.get('status');
    if (search) list = list.filter(e=>e.name?.includes(search)||e.position?.includes(search));
    if (dept) list = list.filter(e=>e.department_name===dept||e.department===dept);
    if (status) list = list.filter(e=>e.status===status);
    return { employees: list, total: list.length, page:1, pages:1 };
  }

  // DEPARTMENTS: with head_count
  if (resource === 'departments' && !id && method === 'GET') {
    return demoStore.departments.map(d=>({...d, head_count: demoStore.employees.filter(e=>e.department_id===d.id).length }));
  }

  // ATTENDANCE GET
  if (resource === 'attendance' && !id && method === 'GET') {
    const params = new URLSearchParams(path.split('?')[1]||'');
    const date = params.get('date') || today();
    const list = store.filter(a=>a.date===date);
    return { records: list, stats: { present: list.filter(a=>a.status==='present').length, late: list.filter(a=>a.status==='late').length, absent: 0, total: list.length } };
  }

  // SALARY GET
  if (resource === 'salary' && !id && method === 'GET') {
    const params = new URLSearchParams(path.split('?')[1]||'');
    const month = params.get('month') || thisMonth();
    const list = store.filter(r=>r.month===month);
    return { records: list, summary: { total_net: list.reduce((s,r)=>s+(r.net_salary||0),0), total_base: list.reduce((s,r)=>s+(r.base_salary||0),0), paid: list.filter(r=>r.status==='paid').length, pending: list.filter(r=>r.status==='pending').length } };
  }

  // LOAN REPAY
  if (resource === 'loans' && sub === 'repay' && method === 'PUT') {
    const loan = store.find(r=>r.id===id);
    if (loan) {
      loan.paid_amount = (loan.paid_amount||0) + (body.amount||0);
      if (loan.paid_amount >= loan.amount) loan.status = 'paid';
      if (!loan.payments) loan.payments = [];
      loan.payments.push({
        date: body.date || new Date().toISOString().split('T')[0],
        amount: body.amount || 0,
        note: body.note || '',
        remaining: Math.max(0, loan.amount - loan.paid_amount)
      });
    }
    return { message: 'Repayment recorded' };
  }

  // SALARY PAY
  if (resource === 'salary' && sub === 'pay' && method === 'PUT') {
    const rec = store.find(r=>r.id===id);
    if (rec) rec.status = 'paid';
    return { message: 'Paid' };
  }

  // Generic GET list
  if (!id && method === 'GET') return { records: [...store] };

  // Generic GET single
  if (id && !sub && method === 'GET') return store.find(r=>r.id===id) || {};

  // Generic POST (create)
  if (!id && method === 'POST') {
    const newId = (demoStore._nextId[idKey] = (demoStore._nextId[idKey]||1));
    demoStore._nextId[idKey]++;
    // Enrich employee fields
    if (resource === 'employees') {
      const dept = demoStore.departments.find(d=>d.id===body.department_id);
      body.department_name = dept?.name || '';
      body.department = dept?.name || '';
    }
    if (resource === 'departments' || resource === 'attendance') {}
    if (resource === 'salary') { body.net_salary = (body.base_salary||0)+(body.bonus||0)-(body.deduction||0); }
    // Enrich join fields for display
    const emp = demoStore.employees.find(e=>e.id===body.employee_id);
    if (emp) { body.employee_name = emp.name; body.department = emp.department||emp.department_name||''; }
    const record = { id: newId, created_at: new Date().toISOString(), ...body };
    store.push(record);
    return { message: 'Created', id: newId, ...record };
  }

  // Generic PUT (update)
  if (id && !sub && method === 'PUT') {
    const idx = store.findIndex(r=>r.id===id);
    if (idx>=0) store[idx] = { ...store[idx], ...body };
    return { message: 'Updated' };
  }

  // Generic DELETE
  if (id && method === 'DELETE') {
    const idxD = store.findIndex(r=>r.id===id);
    if (idxD>=0) store.splice(idxD,1);
    return { message: 'Deleted' };
  }

  return {};
}

// ===== LOADING / ERROR =====
function showLoading() {
  contentArea().innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;
}

function showError(msg) {
  contentArea().innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h3>មានបញ្ហា</h3>
      <p>${msg}</p>
      <button class="btn btn-primary" style="margin-top:16px" onclick="openSettings()">⚙️ ដាក់ Worker URL</button>
    </div>`;
}

// ===== SETTINGS MODAL =====
function openSettings() {
  $('modal-title').textContent = '⚙️ ការកំណត់ API';
  const cur = getApiBase();
  const demo = isDemoMode();
  $('modal-body').innerHTML = `
    <div style="margin-bottom:20px;padding:14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div class="status-dot ${!demo&&cur?'online':''}"></div>
        <span style="font-weight:600;font-size:13px">${demo?'🟡 Demo Mode':'🟢 ភ្ជាប់ Worker'}</span>
      </div>
      <div style="font-size:12px;color:var(--text3)">${cur?'URL: '+cur:'មិនទាន់ដាក់ Worker URL'}</div>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label class="form-label">Cloudflare Worker URL</label>
      <input class="form-control" id="cfg-url" placeholder="https://my-worker.username.workers.dev" value="${cur}" />
      <div style="font-size:11px;color:var(--text3);margin-top:6px">ទទួលបាន URL បន្ទាប់ពី <code style="background:var(--bg4);padding:2px 5px;border-radius:4px">wrangler deploy</code></div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px">
      <button class="btn btn-primary" style="flex:1" onclick="saveSettings()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="20 6 9 17 4 12"/></svg>
        រក្សាទុក & ភ្ជាប់
      </button>
      <button class="btn btn-outline" onclick="testConnection()">🔌 សាកល្បង</button>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:16px">
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px;font-weight:600">ឬប្រើ Demo Mode (គ្មាន API)</div>
      <button class="btn ${isDemoMode()?'btn-primary':'btn-outline'}" style="width:100%" onclick="enableDemo()">
        🎮 ${isDemoMode()?'✅ Demo Mode កំពុងដំណើរការ':'ប្រើ Demo Mode'}
      </button>
    </div>
    <div id="conn-result" style="margin-top:14px"></div>
  `;
  openModal();
}

async function testConnection() {
  const url = $('cfg-url').value.trim().replace(/\/$/,'');
  const res = $('conn-result');
  if (!url) { res.innerHTML = '<span style="color:var(--danger)">❌ សូមដាក់ URL!</span>'; return; }
  res.innerHTML = '<span style="color:var(--text3)">⏳ កំពុងសាកល្បង...</span>';
  try {
    const r = await fetch(url+'/stats');
    if (r.ok) { res.innerHTML = '<span style="color:var(--success)">✅ ភ្ជាប់បានជោគជ័យ! Worker ដំណើរការ</span>'; }
    else { res.innerHTML = `<span style="color:var(--warning)">⚠️ Worker ឆ្លើយតប (${r.status}) - ត្រួតពិនិត្យ CORS ក្នុង Worker</span>`; }
  } catch(e) {
    res.innerHTML = '<span style="color:var(--danger)">❌ ភ្ជាប់មិនបាន - ពិនិត្យ URL និង CORS headers</span>';
  }
}

function saveSettings() {
  const url = $('cfg-url').value.trim().replace(/\/$/,'');
  if (!url) { showToast('សូមដាក់ Worker URL!','error'); return; }
  localStorage.setItem(STORAGE_KEY, url);
  localStorage.removeItem(DEMO_MODE_KEY);
  showToast('រក្សាទុកហើយ! ភ្ជាប់ Worker...','success');
  closeModal();
  updateApiStatus();
  navigate(state.currentPage);
}

function enableDemo() {
  localStorage.setItem(DEMO_MODE_KEY,'1');
  showToast('Demo Mode បើកហើយ!','success');
  closeModal();
  updateApiStatus();
  navigate(state.currentPage);
}

function updateApiStatus() {
  const el = $('api-status-indicator');
  if (!el) return;
  const demo = isDemoMode();
  const url = getApiBase();
  el.innerHTML = `
    <div class="status-dot ${!demo&&url?'online':''}"></div>
    <span>${demo?'Demo Mode':url?'Worker ភ្ជាប់':'មិនទាន់ Setting'}</span>
  `;
}

// ===== NAVIGATION =====
// Map page → permission key needed to access
const PAGE_PERMS = {
  employees:       'employees_view',
  departments:     'employees_view',
  attendance:      'attendance_view',
  salary:          'salary_view',
  overtime:        'salary_view',
  allowance:       'salary_view',
  reports:         'reports_view',
  loans:           'loans_view',
  expenses:        'expenses_view',
  general_expense: 'expenses_view',
  id_card:         'id_card_print',
  leave:           'leave_view',
  dayswap:         'leave_view',
  settings:        'settings_access',
  dashboard:       null, // always allowed
};

function updateNavVisibility() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.dataset.page;
    const permKey = PAGE_PERMS[page];
    const allowed = !permKey || hasPerm(permKey);
    el.style.display = allowed ? '' : 'none';
  });
}

function navigate(page) {
  // Permission check
  const permKey = PAGE_PERMS[page];
  if (permKey && !hasPerm(permKey)) {
    showToast('⛔ អ្នកគ្មានសិទ្ធចូល "'+page+'" !', 'error');
    // Redirect to dashboard
    page = 'dashboard';
  }

  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = {
    dashboard:'ទំព័រដើម', employees:'គ្រប់គ្រងបុគ្គលិក', departments:'នាយកដ្ឋាន',
    attendance:'វត្តមានប្រចាំថ្ងៃ', salary:'គ្រប់គ្រងបៀវត្ស', reports:'របាយការណ៍',
    overtime:'ថែមម៉ោង', allowance:'ប្រាក់ឧបត្ថម្ភ', loans:'ប្រាក់ខ្ចីបុគ្គលិក',
    expenses:'ស្នើរប្រាក់ចំណាយ', general_expense:'ការចំណាយទូទៅ',
    id_card:'កាតសម្គាល់ខ្លួនបុគ្គលិក', leave:'ច្បាប់ឈប់សម្រាក',
    dayswap:'ស្នើប្តូរថ្ងៃឈប់សម្រាក',
    settings:'ការកំណត់ប្រព័ន្ធ',
  };
  $('page-title').textContent = titles[page] || page;
  contentArea().innerHTML = '';
  syncMobileNav(page);
  const sb = document.getElementById('sidebar');
  if (sb && window.innerWidth <= 900) sb.classList.remove('open');
  ({
    dashboard:renderDashboard, employees:renderEmployees, departments:renderDepartments,
    attendance:renderAttendance, salary:renderSalary, reports:renderReports,
    overtime:renderOvertime, allowance:renderAllowance, loans:renderLoans,
    expenses:renderExpenses, general_expense:renderGeneralExpense,
    id_card:renderIdCard, leave:renderLeave, dayswap:renderDaySwap, settings:renderSettings,
  }[page] || renderDashboard)();
}

// ===== DASHBOARD =====
async function renderDashboard() {
  showLoading();
  try {
    const [stats, empData] = await Promise.all([api('GET', '/stats'), api('GET', '/employees?limit=500')]);
    contentArea().innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
          <div><div class="stat-label">បុគ្គលិកសរុប</div><div class="stat-value">${stats.total_employees}</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div><div class="stat-label">កំពុងធ្វើការ</div><div class="stat-value" style="color:var(--success)">${stats.active_employees}</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>
          <div><div class="stat-label">នាយកដ្ឋាន</div><div class="stat-value" style="color:var(--warning)">${stats.total_departments}</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div><div class="stat-label">បៀវត្សសរុប (USD)</div><div class="stat-value" style="color:var(--info)">$${(stats.monthly_salary||0).toLocaleString()}</div></div>
        </div>
      </div>
      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <span class="card-title">បុគ្គលិកចុងក្រោយ</span>
            <button class="btn btn-primary btn-sm" onclick="navigate('employees')">មើលទាំងអស់</button>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>ឈ្មោះ</th><th>តំណែង</th><th>នាយកដ្ឋាន</th><th>ស្ថានភាព</th></tr></thead>
              <tbody>
                ${empData.employees.length === 0
                  ? `<tr><td colspan="4"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានបុគ្គលិក</p></div></td></tr>`
                  : [...empData.employees].sort((a,b) => b.id - a.id).slice(0, 5).map(e => {
                      const photo = getEmpPhoto(e.id);
                      const avInner = photo ? '<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : e.name[0];
                      const avStyle = photo ? 'overflow:hidden;padding:0' : '';
                      return '<tr>'
                        +'<td><div class="employee-cell">'
                        +'<div class="emp-avatar" style="background:'+getColor(e.name)+';'+avStyle+'">'+avInner+'</div>'
                        +'<div><div class="emp-name">'+e.name+'</div><div class="emp-id">'+(e.custom_id ? e.custom_id : 'EMP'+String(e.id).padStart(3,'0'))+'</div></div>'
                        +'</div></td>'
                        +'<td>'+e.position+'</td><td>'+(e.department_name||'—')+'</td><td>'+statusBadge(e.status)+'</td>'
                        +'</tr>';
                    }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">ព័ត៌មានសង្ខេប</span></div>
          <div class="card-body">
            <div class="activity-list">
              ${[
                {label:'វត្តមានថ្ងៃនេះ', val:`${stats.today_attendance} នាក់`, color:'var(--success)'},
                {label:'បុគ្គលិកសរុប', val:`${stats.total_employees} នាក់`, color:'var(--primary)'},
                {label:'ប្រាក់ខែខែនេះ', val:`$${(stats.monthly_salary||0).toLocaleString()}`, color:'var(--info)'},
                {label:'នាយកដ្ឋាន', val:`${stats.total_departments}`, color:'var(--warning)'},
              ].map(s => `
                <div class="activity-item">
                  <div class="activity-dot" style="background:${s.color}"></div>
                  <div>
                    <div class="activity-text">${s.label}</div>
                    <div style="font-size:20px;font-weight:700;color:var(--text);font-family:var(--mono)">${s.val}</div>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  } catch(e) { showError(e.message); }
}

// ============================================================
// DATA MANAGEMENT — Backup / Restore / Delete
// ============================================================

async function backupAllData() {
  const res = document.getElementById('backup-status');
  if (res) res.innerHTML = '<span style="color:var(--text3)">⏳ កំពុង Backup...</span>';
  try {
    const cfg = getCompanyConfig();
    const [emps, depts, att, sal, leave, loans, exp, genExp, ot, allow] = await Promise.all([
      api('GET','/employees?limit=1000').catch(()=>({employees:[]})),
      api('GET','/departments').catch(()=>[]),
      api('GET','/attendance?limit=5000').catch(()=>({records:[]})),
      api('GET','/salary?month=all').catch(()=>({records:[]})),
      api('GET','/leave').catch(()=>({records:[]})),
      api('GET','/loans').catch(()=>({records:[]})),
      api('GET','/expenses').catch(()=>({records:[]})),
      api('GET','/general-expenses').catch(()=>({records:[]})),
      api('GET','/overtime').catch(()=>({records:[]})),
      api('GET','/allowances').catch(()=>({records:[]})),
    ]);

    const backup = {
      version: '1.0',
      created_at: new Date().toISOString(),
      company: cfg.company_name || 'HR Pro',
      data: {
        employees:    emps.employees || [],
        departments:  Array.isArray(depts) ? depts : [],
        attendance:   att.records || [],
        salary:       sal.records || [],
        leave:        leave.records || [],
        loans:        loans.records || [],
        expenses:     exp.records || [],
        general_expenses: genExp.records || [],
        overtime:     ot.records || [],
        allowances:   allow.records || [],
        accounts:     getUsers().map(u=>({...u, photo: photoCache['user_'+u.id]||u.photo||''})),
        config:       cfg,
        permissions:  getPermissions(),
      }
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0,10);
    a.href = url; a.download = (cfg.company_name||'HRPro')+'_Backup_'+date+'.json';
    a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);

    const total = Object.values(backup.data).reduce((s,v)=>s+(Array.isArray(v)?v.length:0),0);
    if (res) res.innerHTML = '<span style="color:var(--success)">✅ Backup បានជោគជ័យ! '+total+' records</span>';
  } catch(e) {
    if (res) res.innerHTML = '<span style="color:var(--danger)">❌ Error: '+e.message+'</span>';
  }
}

async function restoreAllData(input) {
  const file = input.files[0];
  if (!file) return;
  const res = document.getElementById('restore-status');

  if (!confirm('⚠️ Restore នឹង overwrite ទិន្នន័យបច្ចុប្បន្ន! យល់ព្រមមែនទេ?')) { input.value=''; return; }

  if (res) res.innerHTML = '<span style="color:var(--text3)">⏳ កំពុង Restore...</span>';
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup.data) throw new Error('Invalid backup file');

    const d = backup.data;
    let ok=0, fail=0;

    // Restore departments first
    for (const dept of (d.departments||[])) {
      try { await api('POST','/departments',dept); ok++; } catch(_) { fail++; }
    }
    // Restore employees
    for (const emp of (d.employees||[])) {
      try { await api('POST','/employees',emp); ok++; } catch(_) { fail++; }
    }
    // Restore other records
    const maps = [
      [d.attendance||[],   '/attendance'],
      [d.salary||[],       '/salary'],
      [d.leave||[],        '/leave'],
      [d.loans||[],        '/loans'],
      [d.expenses||[],     '/expenses'],
      [d.general_expenses||[], '/general-expenses'],
      [d.overtime||[],     '/overtime'],
      [d.allowances||[],   '/allowances'],
    ];
    for (const [records, endpoint] of maps) {
      for (const r of records) {
        try { await api('POST', endpoint, r); ok++; } catch(_) { fail++; }
      }
    }

    // Restore accounts
    if (d.accounts && d.accounts.length) {
      saveUsers(d.accounts);
      await syncAccountsToAPI(d.accounts);
    }

    // Restore config
    if (d.config) {
      saveCompanyConfig(d.config);
    }

    // Restore permissions
    if (d.permissions) savePermissions(d.permissions);

    if (res) res.innerHTML = '<span style="color:var(--success)">✅ Restore រួច! '+ok+' records ✅ '+fail+' skip</span>';
    showToast('Restore Data បានជោគជ័យ! 🎉','success');
    input.value = '';
    setTimeout(()=>navigate('dashboard'), 1500);
  } catch(e) {
    if (res) res.innerHTML = '<span style="color:var(--danger)">❌ Error: '+e.message+'</span>';
    input.value = '';
  }
}

async function deleteSelectedData() {
  const checked = [...document.querySelectorAll('.delete-cb:checked')].map(c=>c.value);
  if (!checked.length) { showToast('សូមជ្រើស table!','error'); return; }
  if (!confirm('🗑️ លុប: '+checked.join(', ')+'?\n\nការ​ DELETE មិន​អាច​ត្រឡប់​វិញ​ទេ!')) return;

  const res = document.getElementById('delete-status');
  if (res) res.innerHTML = '<span style="color:var(--text3)">⏳ កំពុងលុប...</span>';

  const endpointMap = {
    employees:   '/employees',
    attendance:  '/attendance',
    salary:      '/salary',
    leave:       '/leave',
    loans:       '/loans',
    expenses:    '/expenses',
    overtime:    '/overtime',
    allowances:  '/allowances',
  };

  let deleted = 0;
  for (const key of checked) {
    const ep = endpointMap[key];
    if (!ep) continue;
    try {
      // Fetch all records then delete each
      let records = [];
      if (key === 'employees') {
        const d = await api('GET', ep+'?limit=1000');
        records = d.employees || [];
      } else {
        const d = await api('GET', ep);
        records = d.records || [];
      }
      for (const r of records) {
        try { await api('DELETE', ep+'/'+r.id); deleted++; } catch(_) {}
      }
    } catch(_) {}
  }

  if (res) res.innerHTML = '<span style="color:var(--success)">✅ លុប '+deleted+' records បានជោគជ័យ!</span>';
  showToast('លុប Data '+deleted+' records ✅','success');
  document.querySelectorAll('.delete-cb').forEach(c=>c.checked=false);
}

// Create adminsupport account on first load
function ensureAdminSupport() {
  const users = getUsers();
  if (!users.find(u => u.username === 'adminsupport')) {
    users.push({
      id: 999,
      username: 'adminsupport',
      password: 'admin',
      role: 'អ្នកគ្រប់គ្រង',
      name: 'Admin Support',
      photo: ''
    });
    saveUsers(users);
    syncAccountsToAPI(users).catch(()=>{});
  }
}


const PERM_KEY = 'hr_permissions';

function getPermissions() {
  try {
    const p = JSON.parse(localStorage.getItem(PERM_KEY));
    if (p && typeof p === 'object') return p;
  } catch(_) {}
  // Default: HR Officer & Finance have most access, Viewer is read-only
  return {
    'HR Officer': {
      employees_view:true, employees_edit:true,
      attendance_view:true, attendance_edit:true,
      salary_view:true, salary_edit:false,
      reports_view:true, reports_export:true,
      leave_view:true, leave_edit:true,
      loans_view:true, loans_edit:false,
      expenses_view:true, expenses_edit:true,
      departments_edit:false, id_card_print:true, settings_access:false,
    },
    'Finance': {
      employees_view:true, employees_edit:false,
      attendance_view:true, attendance_edit:false,
      salary_view:true, salary_edit:true,
      reports_view:true, reports_export:true,
      leave_view:true, leave_edit:false,
      loans_view:true, loans_edit:true,
      expenses_view:true, expenses_edit:true,
      departments_edit:false, id_card_print:false, settings_access:false,
    },
    'Viewer': {
      employees_view:true, employees_edit:false,
      attendance_view:true, attendance_edit:false,
      salary_view:false, salary_edit:false,
      reports_view:false, reports_export:false,
      leave_view:true, leave_edit:false,
      loans_view:false, loans_edit:false,
      expenses_view:false, expenses_edit:false,
      departments_edit:false, id_card_print:false, settings_access:false,
    },
  };
}

function savePermissions(perms) {
  localStorage.setItem(PERM_KEY, JSON.stringify(perms));
}

// Check if current user has a specific permission
function hasPerm(key) {
  const session = getSession();
  if (!session) return false;
  const role = session.role || '';
  // Admin always has full access
  if (role === 'អ្នកគ្រប់គ្រង' || role.toLowerCase() === 'admin' || session.username === 'admin' || session.username === 'adminsupport') return true;
  const perms = getPermissions();
  const rolePerms = perms[role];
  if (!rolePerms) return false;
  // Explicit false = denied, explicit true = allowed, undefined = denied (strict)
  return rolePerms[key] === true;
}

function updatePermission(role, key, value) {
  const perms = getPermissions();
  if (!perms[role]) perms[role] = {};
  perms[role][key] = value;
  savePermissions(perms);
}

async function savePermissionsToAPI() {
  const perms = getPermissions();
  if (!isDemoMode()) {
    try {
      await api('POST', '/config', { key: 'hr_permissions', value: JSON.stringify(perms) });
      updateNavVisibility();
      showToast('រក្សាទុក & Sync សិទ្ធបានជោគជ័យ! ✅', 'success');
    } catch(e) { showToast('Error sync: '+e.message, 'error'); }
  } else {
    updateNavVisibility();
    showToast('រក្សាទុកសិទ្ធបានជោគជ័យ! ✅', 'success');
  }
}

async function loadPermissionsFromAPI() {
  if (isDemoMode()) return;
  try {
    const cfg = await api('GET', '/config');
    const raw = cfg && cfg.hr_permissions;
    if (!raw) return;
    const perms = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (perms && typeof perms === 'object') savePermissions(perms);
  } catch(_) {}
}

function resetPermissions() {
  if (!confirm('Reset សិទ្ធទៅ Default?')) return;
  localStorage.removeItem(PERM_KEY);
  showToast('Reset រួច!', 'success');
  renderSettings();
  setTimeout(() => switchSettingsTab('permissions', document.querySelector('.settings-tab:nth-child(6)')), 50);
}

// Override canEdit to use new permission system
function canEdit() {
  return hasPerm('employees_edit');
}



// ===== EMPLOYEES =====
let _empSortBy = 'id';

// ── Advanced Employee Search Modal ──
function openEmpAdvSearch() {
  // Get dept list from last loaded data
  const deptOpts = (window._lastDeptData||[]).map(d=>'<option value="'+d.name+'">'+d.name+'</option>').join('');
  const html = `
    <div id="emp-adv-search-overlay" onclick="if(event.target===this)closeEmpAdvSearch()" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:var(--bg2);border-radius:14px;padding:24px;width:100%;max-width:480px;box-shadow:0 8px 40px rgba(0,0,0,.4)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
          <h3 style="margin:0;font-size:16px">🔍 ស្វែងរកបុគ្គលិក</h3>
          <button onclick="closeEmpAdvSearch()" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;padding:0 4px">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">ឈ្មោះ / ID</label>
            <input id="adv-name" class="filter-input" style="width:100%;box-sizing:border-box" placeholder="ស្វែងរកតាមឈ្មោះ ឬ ID..."/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">តំណែង</label>
              <input id="adv-position" class="filter-input" style="width:100%;box-sizing:border-box" placeholder="តំណែង..."/>
            </div>
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">នាយកដ្ឋាន</label>
              <select id="adv-dept" class="filter-input" style="width:100%;box-sizing:border-box">
                <option value="">ទាំងអស់</option>
                ${deptOpts}
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">ស្ថានភាព</label>
              <select id="adv-status" class="filter-input" style="width:100%;box-sizing:border-box">
                <option value="">ទាំងអស់</option>
                <option value="active">✅ ធ្វើការ</option>
                <option value="on_leave">🌴 ច្បាប់</option>
                <option value="inactive">⛔ ផ្អាក/លាឈប់</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">ទីតាំង</label>
              <input id="adv-location" class="filter-input" style="width:100%;box-sizing:border-box" placeholder="ទីតាំង..."/>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">ប្រាក់ខែ ចាប់ពី ($)</label>
              <input id="adv-sal-min" class="filter-input" type="number" style="width:100%;box-sizing:border-box" placeholder="0"/>
            </div>
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">ប្រាក់ខែ រហូត ($)</label>
              <input id="adv-sal-max" class="filter-input" type="number" style="width:100%;box-sizing:border-box" placeholder="9999"/>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">ថ្ងៃចូល ចាប់ពី</label>
              <input id="adv-hire-from" class="filter-input" type="date" style="width:100%;box-sizing:border-box"/>
            </div>
            <div>
              <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">ថ្ងៃចូល រហូត</label>
              <input id="adv-hire-to" class="filter-input" type="date" style="width:100%;box-sizing:border-box"/>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-outline" onclick="resetEmpAdvSearch()" style="flex:1">🔄 Reset</button>
          <button class="btn btn-primary" onclick="applyEmpAdvSearch()" style="flex:2">🔍 ស្វែងរក</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('adv-name')&&document.getElementById('adv-name').focus(),100);
}

function closeEmpAdvSearch() {
  const el = document.getElementById('emp-adv-search-overlay');
  if (el) el.remove();
}

function resetEmpAdvSearch() {
  ['adv-name','adv-position','adv-dept','adv-status','adv-location','adv-sal-min','adv-sal-max','adv-hire-from','adv-hire-to']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
}

async function applyEmpAdvSearch() {
  const name     = (document.getElementById('adv-name')?.value||'').trim();
  const position = (document.getElementById('adv-position')?.value||'').trim();
  const dept     = document.getElementById('adv-dept')?.value||'';
  const status   = document.getElementById('adv-status')?.value||'';
  const location = (document.getElementById('adv-location')?.value||'').trim();
  const salMin   = parseFloat(document.getElementById('adv-sal-min')?.value)||0;
  const salMax   = parseFloat(document.getElementById('adv-sal-max')?.value)||999999;
  const hireFrom = document.getElementById('adv-hire-from')?.value||'';
  const hireTo   = document.getElementById('adv-hire-to')?.value||'';

  closeEmpAdvSearch();
  showLoading();
  try {
    let url = '/employees?limit=9999';
    if (status) url += '&status='+encodeURIComponent(status);
    if (dept)   url += '&department='+encodeURIComponent(dept);
    const r = await api('GET', url);
    let emps = r.employees || [];

    // Client-side filters
    if (name)     emps = emps.filter(e => (e.name||'').toLowerCase().includes(name.toLowerCase()) || (e.employee_code||'').toLowerCase().includes(name.toLowerCase()));
    if (position) emps = emps.filter(e => (e.position||'').toLowerCase().includes(position.toLowerCase()));
    if (location) emps = emps.filter(e => (e.location||'').toLowerCase().includes(location.toLowerCase()));
    if (salMin)   emps = emps.filter(e => parseFloat(e.salary||0) >= salMin);
    if (salMax < 999999) emps = emps.filter(e => parseFloat(e.salary||0) <= salMax);
    if (hireFrom) emps = emps.filter(e => (e.hire_date||'') >= hireFrom);
    if (hireTo)   emps = emps.filter(e => (e.hire_date||'') <= hireTo);

    // Reuse employee render with filtered data
    window._empAdvSearchResult = emps;
    renderEmployeesWithData(emps, `លទ្ធផលស្វែងរក: ${emps.length} នាក់`);
  } catch(e) { showError(e.message); }
}


// ── Render employees from pre-filtered array (used by advanced search) ──
function renderEmployeesWithData(emps, subtitle) {
  const tableRows = emps.length === 0
    ? '<tr><td colspan="10"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><h3>រកមិនឃើញ</h3><p>លក្ខខណ្ឌផ្សេង ឬ Reset ស្វែងរក</p></div></td></tr>'
    : emps.map(e => {
        const photo = getEmpPhoto(e.id);
        const avInner = photo ? '<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : e.name[0];
        const avStyle = photo ? 'overflow:hidden;padding:0' : '';
        const displayId = e.custom_id ? e.custom_id : 'EMP'+String(e.id).padStart(3,'0');
        const statusMap = { active:'<span class="badge badge-success">✅ ធ្វើការ</span>', on_leave:'<span class="badge badge-warning">🌴 ច្បាប់</span>', inactive:'<span class="badge badge-danger">⛔ ផ្អាក</span>' };
        const statusBadge = statusMap[e.status] || '<span class="badge">'+e.status+'</span>';
        const bankInfo = (e.bank && e.bank !== '—')
          ? '<div style="font-size:11px;font-weight:600;color:var(--text2)">'+e.bank+'</div>'+(e.bank_account?'<div style="font-size:10px;color:var(--text3)">'+e.bank_account+'</div>':'')
          : '<span style="color:var(--text3);font-size:11px">—</span>';
        const salaryFmt = e.salary ? '<span style="font-weight:700;color:var(--success);font-size:13px">$'+parseFloat(e.salary).toFixed(0)+'</span>' : '—';
        return '<tr>'
          +'<td><div style="display:flex;align-items:center;gap:8px"><div class="emp-avatar" style="'+avStyle+'">'+avInner+'</div><div><div style="font-weight:600;font-size:13px">'+e.name+'</div><div style="font-size:11px;color:var(--text3)">'+displayId+'</div></div></div></td>'
          +'<td><div style="font-size:12px">'+( e.position||'—')+'</div></td>'
          +'<td><div style="font-size:12px">'+( e.department||'—')+'</div></td>'
          +'<td>'+(e.location?'<span style="font-size:12px">📍 '+e.location+'</span>':'<span style="color:var(--text3)">—</span>')+'</td>'
          +'<td><div style="font-size:12px">'+(e.phone||'—')+'</div><div style="font-size:11px;color:var(--text3)">'+(e.email||'')+'</div></td>'
          +'<td>'+bankInfo+'</td>'
          +'<td>'+salaryFmt+'</td>'
          +'<td style="text-align:center"><span style="color:var(--text3);font-size:12px">—</span></td>'
          +'<td>'+statusBadge+'</td>'
          +'<td style="text-align:center"><div style="display:flex;gap:4px;justify-content:center">'
          +(canEdit()?'<button class="btn btn-outline btn-sm" onclick="openEmployeeModal('+e.id+')">✏️</button><button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="deleteEmployee('+e.id+')">🗑️</button>':'')
          +'</div></td>'
          +'</tr>';
      }).join('');

  contentArea().innerHTML =
    '<div class="page-header">'
    +'<div><h2>🔍 '+subtitle+'</h2><p>លទ្ធផលស្វែងរកលម្អិត</p></div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="btn btn-outline" style="border-color:var(--info);color:var(--info)" onclick="openEmpAdvSearch()">🔍 ស្វែងរកម្តងទៀត</button>'
    +'<button class="btn btn-outline" onclick="renderEmployees()">← ត្រឡប់</button>'
    +(canEdit()?'<button class="btn btn-primary" onclick="openEmployeeModal()">+ បន្ថែម</button>':'')
    +'</div></div>'
    +'<div class="card"><div class="table-container"><table>'
    +'<thead><tr><th>បុគ្គលិក</th><th>តំណែង</th><th>នាយកដ្ឋាន</th><th>📍 ទីតាំង</th><th>ទំនាក់ទំនង</th><th>ធនាគារ</th><th>បៀវត្ស</th><th>ថ្ងៃលាឈប់</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>'
    +'<tbody>'+tableRows+'</tbody>'
    +'</table></div></div>';
  hideLoading();
}


// ── Quick client-side employee filter (no API call, no re-render flicker) ──
function _empQuickFilter(val, dept, status) {
  // Update the filter bar input value without losing focus
  const input = document.querySelector('.filter-bar .filter-input');
  
  const q = (val||'').toLowerCase().trim();
  let emps = state.employees || [];
  
  if (dept)   emps = emps.filter(e => (e.department_name||e.department||'') === dept);
  if (status) emps = emps.filter(e => (e.status||'') === status);
  if (q)      emps = emps.filter(e =>
    (e.name||'').toLowerCase().includes(q) ||
    (e.position||'').toLowerCase().includes(q) ||
    (e.employee_code||'').toLowerCase().includes(q) ||
    (e.custom_id||'').toLowerCase().includes(q) ||
    (e.department_name||e.department||'').toLowerCase().includes(q) ||
    (e.work_location||'').toLowerCase().includes(q) ||
    String(e.id).includes(q)
  );

  const tbody = document.querySelector('.table-container tbody');
  if (!tbody) { renderEmployees(val, dept, status); return; }

  // Update count
  const countEl = document.querySelector('.page-header p');
  if (countEl) countEl.textContent = 'សរុប ' + emps.length + ' នាក់';

  if (emps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><h3>រកមិនឃើញ</h3><p>ស្វែងរកផ្សេង ឬបន្ថែមបុគ្គលិក</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = emps.map(e => {
    const photo = getEmpPhoto(e.id);
    const avInner = photo ? '<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : e.name[0];
    const avStyle = photo ? 'overflow:hidden;padding:0' : '';
    const displayId = e.custom_id ? e.custom_id : 'EMP'+String(e.id).padStart(3,'0');
    const statusMap = { active:'<span class="badge badge-success">✅ ធ្វើការ</span>', on_leave:'<span class="badge badge-warning">🌴 ច្បាប់</span>', inactive:'<span class="badge badge-danger">⛔ ផ្អាក</span>' };
    const statusBadge = statusMap[e.status] || '<span class="badge">'+e.status+'</span>';
    const bankInfo = (e.bank && e.bank !== '—')
      ? '<div style="font-size:11px;font-weight:600;color:var(--text2)">'+e.bank+'</div>'+(e.bank_account?'<div style="font-size:10px;color:var(--text3)">'+e.bank_account+'</div>':'')
      : '<span style="color:var(--text3);font-size:11px">—</span>';
    const salaryFmt = e.salary ? '<span style="font-weight:700;color:var(--success);font-size:13px">$'+parseFloat(e.salary).toFixed(0)+'</span>' : '—';
    const termCell = e.termination_date
      ? '<td style="text-align:center"><div style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--danger)">'+e.termination_date+'</div></td>'
      : '<td style="text-align:center;color:var(--text3);font-size:12px">—</td>';
    return '<tr>'
      +'<td><div style="display:flex;align-items:center;gap:8px"><div class="emp-avatar" style="'+avStyle+'">'+avInner+'</div><div><div style="font-weight:600;font-size:13px">'+e.name+'</div><div style="font-size:11px;color:var(--text3)">'+displayId+'</div></div></div></td>'
      +'<td><div style="font-size:12px">'+(e.position||'—')+'</div></td>'
      +'<td><div style="font-size:12px">'+(e.department||'—')+'</div></td>'
      +'<td>'+(e.location?'<span style="font-size:12px">📍 '+e.location+'</span>':'<span style="color:var(--text3)">—</span>')+'</td>'
      +'<td><div style="font-size:12px">'+(e.phone||'—')+'</div><div style="font-size:11px;color:var(--text3)">'+(e.email||'')+'</div></td>'
      +'<td>'+bankInfo+'</td>'
      +'<td>'+salaryFmt+'</td>'
      +termCell
      +'<td>'+statusBadge+'</td>'
      +'<td style="text-align:center"><div style="display:flex;gap:4px;justify-content:center">'
      +(canEdit()?'<button class="btn btn-outline btn-sm" onclick="openEmployeeModal('+e.id+')">✏️</button><button class="btn btn-outline btn-sm" style="color:var(--danger)" onclick="deleteEmployee('+e.id+')">🗑️</button>':'')
      +'</div></td>'
      +'</tr>';
  }).join('');
}

function renderEmployeesSort(sortBy) {
  _empSortBy = sortBy;
  renderEmployees();
}

async function renderEmployees(filter='', dept='', status='') {
  showLoading();
  try {
    const params = new URLSearchParams();
    if (filter) params.set('search', filter);
    if (dept) params.set('department', dept);
    if (status) params.set('status', status);
    const [empData, deptData] = await Promise.all([api('GET', `/employees?${params}`), api('GET', '/departments')]);
    state.employees = empData.employees;
    state.departments = deptData;
    window._lastDeptData = deptData;
    $('emp-count').textContent = empData.total;

    // Apply client-side sort
    const sortFn = {
      'id':            (a,b) => a.id - b.id,
      'name':          (a,b) => (a.name||'').localeCompare(b.name||''),
      'name_desc':     (a,b) => (b.name||'').localeCompare(a.name||''),
      'hire_date':     (a,b) => (a.hire_date||'') > (b.hire_date||'') ? 1 : -1,
      'hire_date_desc':(a,b) => (a.hire_date||'') < (b.hire_date||'') ? 1 : -1,
      'salary':        (a,b) => (a.salary||0) - (b.salary||0),
      'salary_desc':   (a,b) => (b.salary||0) - (a.salary||0),
    };
    if (sortFn[_empSortBy]) empData.employees = [...empData.employees].sort(sortFn[_empSortBy]);

    // Load leave days per employee
    window._empLeaveMap = {};
    try {
      const leaveData = await api('GET', '/leave');
      (leaveData.records||[]).forEach(r => {
        if (r.status === 'approved') {
          window._empLeaveMap[r.employee_id] = (window._empLeaveMap[r.employee_id]||0) + (r.days||0);
        }
      });
    } catch(_) {}
    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>គ្រប់គ្រងបុគ្គលិក</h2><p>សរុប '+empData.total+' នាក់</p></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      +(canEdit()?'<button class="btn btn-primary" onclick="openEmployeeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> + បន្ថែម</button>':'')
      +'<button class="btn btn-outline" style="border-color:var(--info);color:var(--info)" onclick="openEmpAdvSearch()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> 🔍 ស្វែងរក</button>'      +'<button class="btn btn-outline" onclick="openEmployeeReportModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> 🖨️ បោះពុម្ព / Export</button>'
      +'</div></div>'
      +'<div class="filter-bar">'
      +'<div style="display:flex;gap:6px;flex:1;min-width:200px">'+'<input id="emp-search-input" class="filter-input" style="flex:1" placeholder="ស្វែងរក..." value="'+filter+'" onkeydown="if(event.key===\'Enter\')_empQuickFilter(this.value,\''+dept+'\',\''+status+'\')"/>'+'<button class="btn btn-primary" style="padding:0 14px;white-space:nowrap;flex-shrink:0" onclick="_empQuickFilter(document.getElementById(\'emp-search-input\').value,\''+dept+'\',\''+status+'\')" title="ស្វែងរក">🔍 ស្វែងរក</button>'+'</div>'
      +'<select class="filter-input" onchange="renderEmployees(\''+filter+'\',this.value,\''+status+'\')"><option value="">នាយកដ្ឋានទាំងអស់</option>'
      +deptData.map(d=>'<option value="'+d.name+'"'+(dept===d.name?' selected':'')+'>'+d.name+'</option>').join('')
      +'</select>'
      +'<select class="filter-input" onchange="renderEmployees(\''+filter+'\',\''+dept+'\',this.value)"><option value="">ស្ថានភាពទាំងអស់</option>'
      +'<option value="active"'+(status==='active'?' selected':'')+'>✅ ធ្វើការ</option>'
      +'<option value="on_leave"'+(status==='on_leave'?' selected':'')+'>🌴 ច្បាប់</option>'
      +'<option value="inactive"'+(status==='inactive'?' selected':'')+'>⛔ ផ្អាក/លាឈប់</option>'
      +'</select>'
      +'<select class="filter-input" onchange="renderEmployeesSort(this.value)" id="emp-sort-sel">'
      +'<option value="id">Sort: ID</option>'
      +'<option value="name">Sort: ឈ្មោះ A→Z</option>'
      +'<option value="name_desc">Sort: ឈ្មោះ Z→A</option>'
      +'<option value="hire_date">Sort: ថ្ងៃចូល ចាស់→ថ្មី</option>'
      +'<option value="hire_date_desc">Sort: ថ្ងៃចូល ថ្មី→ចាស់</option>'
      +'<option value="salary">Sort: ប្រាក់ខែ ទាប→ខ្ពស់</option>'
      +'<option value="salary_desc">Sort: ប្រាក់ខែ ខ្ពស់→ទាប</option>'
      +'</select>'
      +'</div>'
      +'<div class="card"><div class="table-container"><table>'
      +'<thead><tr><th>បុគ្គលិក</th><th>តំណែង</th><th>នាយកដ្ឋាន</th><th>📍 ទីតាំង</th><th>ទំនាក់ទំនង</th><th>ធនាគារ</th><th>បៀវត្ស</th><th style="text-align:center">ថ្ងៃលាឈប់</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>'
      +'<tbody>'
      +(empData.employees.length===0
        ? '<tr><td colspan="9"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><h3>រកមិនឃើញ</h3><p>ស្វែងរកផ្សេង ឬបន្ថែមបុគ្គលិក</p></div></td></tr>'
        : empData.employees.map(e=>{
            const photo = getEmpPhoto(e.id);
            const avInner = photo ? '<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : e.name[0];
            const avStyle = photo ? 'overflow:hidden;padding:0' : '';
            const displayId = e.custom_id ? e.custom_id : 'EMP'+String(e.id).padStart(3,'0');
            const bankInfo = (e.bank && e.bank!=='—')
              ? '<div style="font-size:11px;font-weight:600;color:var(--text2)">'+e.bank+'</div>'
                +(e.bank_account?'<div style="font-size:10px;color:var(--text3);font-family:var(--mono)">'+e.bank_account+'</div>':'')
              : '<span style="color:var(--text3);font-size:11px">—</span>';
            // Termination date cell
            const termCell = e.termination_date
              ? '<td style="text-align:center"><div style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--danger)">'+e.termination_date+'</div></td>'
              : '<td style="text-align:center;color:var(--text3);font-size:12px">—</td>';
            return '<tr>'
              +'<td><div class="employee-cell"><div class="emp-avatar" style="background:'+getColor(e.name)+';'+avStyle+'">'+avInner+'</div>'
              +'<div><div class="emp-name">'+e.name+'</div><div class="emp-id">'+displayId+'</div></div></div></td>'
              +'<td>'+(e.position||'—')+'</td>'
              +'<td><span class="badge badge-blue">'+(e.department_name||'—')+'</span></td>'
              +'<td>'+(e.work_location?'<span style="font-size:11px;display:inline-flex;align-items:center;gap:3px;background:var(--bg3);padding:2px 8px;border-radius:12px;color:var(--text2)">📍 '+e.work_location+'</span>':'<span style="color:var(--text3)">—</span>')+'</td>'
              +'<td><div style="font-size:12px;color:var(--text3)">'+(e.phone||'—')+'<br/>'+(e.email||'—')+'</div></td>'
              +'<td>'+bankInfo+'</td>'
              +'<td><span style="font-family:var(--mono);color:var(--success);font-weight:600">$'+(e.salary||0)+'</span></td>'
              +termCell
              +'<td>'+statusBadge(e.status)+'</td>'
              +'<td><div class="action-btns">'
              +(canEdit()
                ? '<button class="btn btn-outline btn-sm" onclick="openEmployeeModal('+e.id+')">✏️</button>'
                  +'<button class="btn btn-outline btn-sm" onclick="openEmpHistoryModal('+e.id+',\''+e.name+'\')" title="ប្រវត្តិការងារ">📋</button>'
                  +'<button class="btn btn-danger btn-sm" onclick="deleteEmployee('+e.id+')">🗑️</button>'
                : '<span style="font-size:11px;color:var(--text3)">👁️</span>')
              +'</div></td></tr>';
          }).join('')
      )
      +'</tbody></table></div></div>';
  } catch(e) { showError(e.message); }
}

// ── Photo storage via IndexedDB (no size limit unlike localStorage) ──
const photoDB = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    return new Promise((res, rej) => {
      const req = indexedDB.open('hr_photos', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      req.onsuccess = e => { this._db = e.target.result; res(this._db); };
      req.onerror = () => rej(req.error);
    });
  },
  async get(id) {
    try {
      const db = await this.open();
      return new Promise(res => {
        const req = db.transaction('photos').objectStore('photos').get(id);
        req.onsuccess = () => res(req.result || '');
        req.onerror = () => res('');
      });
    } catch { return ''; }
  },
  async set(id, dataUrl) {
    try {
      const db = await this.open();
      return new Promise(res => {
        const req = db.transaction('photos','readwrite').objectStore('photos').put(dataUrl, id);
        req.onsuccess = () => res(true);
        req.onerror = () => res(false);
      });
    } catch { return false; }
  },
  async del(id) {
    try {
      const db = await this.open();
      db.transaction('photos','readwrite').objectStore('photos').delete(id);
    } catch {}
  },
  async getAll() {
    try {
      const db = await this.open();
      return new Promise(res => {
        const map = {};
        const req = db.transaction('photos').objectStore('photos').openCursor();
        req.onsuccess = e => {
          const cur = e.target.result;
          if (cur) { map[cur.key] = cur.value; cur.continue(); }
          else res(map);
        };
        req.onerror = () => res({});
      });
    } catch { return {}; }
  }
};

// Sync cache for rendering (avoids async in render loops)
const photoCache = {};

async function loadAllPhotos() {
  if (!isDemoMode()) {
    try {
      const res = await api('GET', '/employees?limit=500');
      const list = res.employees || res || [];
      for (const e of list) {
        if (e.photo_data) photoCache['emp_' + e.id] = e.photo_data;
        if (e.qr_data)   photoCache['qr_'  + e.id] = e.qr_data;
      }
      return;
    } catch(_) {}
  }
  const all = await photoDB.getAll();
  Object.assign(photoCache, all);
}
function getEmpPhoto(id) { return photoCache['emp_' + id] || ''; }
async function setEmpPhoto(id, dataUrl) {
  const key = 'emp_' + id;
  photoCache[key] = dataUrl;
  if (!isDemoMode()) {
    try { await api('POST', '/employees/'+id+'/photo', { data: dataUrl }); } catch(_) {}
  } else { await photoDB.set(key, dataUrl); }
}
async function delEmpPhoto(id) {
  const key = 'emp_' + id;
  delete photoCache[key];
  if (!isDemoMode()) {
    try { await api('DELETE', '/employees/'+id+'/photo'); } catch(_) {}
  } else { await photoDB.del(key); }
}
async function setEmpQR(id, dataUrl) {
  const key = 'qr_' + id;
  photoCache[key] = dataUrl;
  if (!isDemoMode()) {
    try { await api('POST', '/employees/'+id+'/qr', { data: dataUrl }); } catch(_) {}
  } else { await photoDB.set(key, dataUrl); }
}
async function delEmpQR(id) {
  const key = 'qr_' + id;
  delete photoCache[key];
  if (!isDemoMode()) {
    try { await api('DELETE', '/employees/'+id+'/qr'); } catch(_) {}
  } else { await photoDB.del(key); }
}


async function openEmployeeModal(id=null) {
  state.editingId = id;
  state._pendingPhoto = null;
  state._pendingQR = null;
  if (!state.departments.length) {
    try { state.departments = await api('GET', '/departments'); } catch(_) {}
  }
  let emp = null;
  if (id) { try { emp = await api('GET', '/employees/' + id); } catch(_) {} }

  // Auto-generate next ID for new employee
  let autoNextId = '';
  if (!id) {
    try {
      const allEmps = state.employees && state.employees.length ? state.employees : await api('GET', '/employees?limit=9999');
      const empList = Array.isArray(allEmps) ? allEmps : (allEmps?.employees || allEmps?.records || []);

      // ប្រើតែ custom_id ដែលមានស្រាប់ (មិនប្រើ DB row id)
      let maxNum = 0;
      empList.forEach(function(e) {
        const cid = (e.custom_id || '').replace(/\D/g, '');
        const n = parseInt(cid) || 0;
        if (n > maxNum) maxNum = n;
      });
      if (maxNum === 0) maxNum = empList.length;
      autoNextId = 'EMP' + String(maxNum + 1).padStart(3, '0');
    } catch(_) {}
  }

  const existingPhoto = id ? getEmpPhoto(id) : '';
  const existingQR = id ? (photoCache['qr_' + id] || '') : '';
  const deptOptions = state.departments.map(d =>
    '<option value="' + d.id + '"' + (emp?.department_id===d.id?' selected':'') + '>' + d.name + '</option>'
  ).join('');

  $('modal-title').textContent = id ? 'កែប្រែព័ត៌មានបុគ្គលិក' : 'បន្ថែមបុគ្គលិកថ្មី';
  $('modal-body').innerHTML =
    // ── Photo upload top section ──
    '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border);margin-bottom:10px">'
    + '<div id="emp-photo-preview" style="width:80px;height:80px;border-radius:50%;background:var(--bg4);border:3px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;cursor:pointer" onclick="$(\'emp-photo-input\').click()">'
    + (existingPhoto
        ? '<img src="' + existingPhoto + '" style="width:100%;height:100%;object-fit:cover" />'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="width:32px;height:32px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')
    + '</div>'
    + '<div>'
    + '<div style="font-weight:700;font-size:13px;margin-bottom:4px">រូបថតបុគ្គលិក</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">JPG, PNG — អតិបរមា 2MB · ចុចដើម្បីជ្រើស</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button class="btn btn-outline btn-sm" onclick="$(\'emp-photo-input\').click()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
    + ' Upload</button>'
    + (existingPhoto ? '<button class="btn btn-danger btn-sm" onclick="removeEmpPhoto()">🗑️ លុប</button>' : '')
    + '</div>'
    + '</div>'
    + '<input type="file" id="emp-photo-input" accept="image/*" style="display:none" onchange="handleEmpPhotoUpload(this)" />'
    + '</div>'

    // ── Form fields (3-column wide layout) ──
    + '<div class="form-grid-3">'    + '<div class="form-group"><label class="form-label">ឈ្មោះពេញ *</label><input class="form-control" id="f-name" placeholder="ឈ្មោះ..." value="' + (emp?.name||'') + '" /></div>'    + '<div class="form-group"><label class="form-label">លេខ ID <span style="font-size:10px;color:var(--success)">(' + (id ? 'កែបាន' : 'auto: ' + autoNextId) + ')</span></label><input class="form-control" id="f-custom-id" placeholder="' + (autoNextId || 'EMP001') + '" value="' + (emp?.custom_id || (id ? '' : autoNextId)) + '" /></div>'    + '<div class="form-group"><label class="form-label">ភេទ</label><select class="form-control" id="f-gender"><option value="male"' + (emp?.gender==='male'?' selected':'') + '>ប្រុស</option><option value="female"' + (emp?.gender==='female'?' selected':'') + '>ស្រី</option></select></div>'    + '<div class="form-group"><label class="form-label">តំណែង *</label><input class="form-control" id="f-position" placeholder="តំណែង..." value="' + (emp?.position||'') + '" /></div>'    + '<div class="form-group"><label class="form-label">នាយកដ្ឋាន *</label><select class="form-control" id="f-dept">' + deptOptions + '</select></div>'    + '<div class="form-group"><label class="form-label">បៀវត្ស (USD)</label><input class="form-control" id="f-salary" type="number" placeholder="1000" value="' + (emp?.salary||'') + '" /></div>'    + '<div class="form-group"><label class="form-label">លេខទូរស័ព្ទ</label><input class="form-control" id="f-phone" placeholder="012-xxx-xxx" value="' + (emp?.phone||'') + '" /></div>'    + '<div class="form-group"><label class="form-label">អ៊ីម៉ែល</label><input class="form-control" id="f-email" type="email" placeholder="email@example.com" value="' + (emp?.email||'') + '" /></div>'    + '<div class="form-group"><label class="form-label">ថ្ងៃចូលធ្វើការ</label><input class="form-control" id="f-hire" type="date" value="' + (emp?.hire_date||'') + '" /></div>'    + '<div class="form-group"><label class="form-label">📍 ទីតាំងធ្វើការ</label><input class="form-control" id="f-work-location" placeholder="ភ្នំពេញ / សាខាA / ជាន់៣..." value="' + (emp?.work_location||'') + '" /></div>'    + '<div class="form-group"><label class="form-label">ស្ថានភាព</label><select class="form-control" id="f-status" onchange="toggleTerminationDate(this.value)"><option value="active"' + (emp?.status==='active'?' selected':'') + '>✅ ធ្វើការ</option><option value="on_leave"' + (emp?.status==='on_leave'?' selected':'') + '>🌴 ច្បាប់</option><option value="inactive"' + (emp?.status==='inactive'?' selected':'') + '>⛔ ផ្អាក / លាឈប់</option></select></div>'    + '<div class="form-group" id="termination-date-row" style="display:'+(emp?.status==='inactive'?'flex':'none')+';flex-direction:column;gap:6px">'    + '<label class="form-label">📅 ថ្ងៃលាឈប់ពីការងារ</label>'    + '<input class="form-control" id="f-termination-date" type="date" value="'+(emp?.termination_date||'')+'" />'    + '</div>'    + '<div class="full-width"><label class="form-label" style="display:block;margin-bottom:8px">📅 ថ្ងៃសម្រាកប្រចាំសប្តាហ៍ (Day Off)</label><div style="display:flex;flex-wrap:wrap;gap:8px">'    + (function(){var days=[['អាទិត្យ',0],['ច័ន្ទ',1],['អង្គារ',2],['ពុធ',3],['ព្រហស្បតិ៍',4],['សុក្រ',5],['សៅរ៍',6]];var offArr=parseOffDays(emp);return days.map(function(d){var chk=offArr.indexOf(d[1])!==-1?' checked':'';return '<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;padding:5px 12px;border-radius:20px;border:1.5px solid var(--border)"><input type="checkbox" class="f-offday" value="'+d[1]+'"'+chk+' style="cursor:pointer"/> '+d[0]+'</label>';}).join('');}).call(this)    + '</div></div>'    + '</div>'    // Re-hire section
    + '<div class="form-group full-width" id="rehire-row" style="display:'+(emp?.status==='inactive'&&emp?.termination_date?'block':'none')+'">'
    + '<div style="padding:12px 14px;background:rgba(6,214,160,.08);border:1px solid rgba(6,214,160,.25);border-radius:8px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--success);margin-bottom:8px">🔄 ចូលធ្វើការឡើងវិញ</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">ប្រសិនបើបុគ្គលិកចូលធ្វើការថ្មីវិញ — ប្រវត្តិការងារចាស់នឹងត្រូវរក្សាទុក</div>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input class="form-control" type="date" id="f-rehire-date" placeholder="ថ្ងៃចូលថ្មី" style="flex:1" />'
    + '<button class="btn btn-success btn-sm" onclick="applyRehire('+id+')">🔄 ចូលថ្មី</button>'
    + '</div>'
    + '</div>'
    + '</div>'
    // Work history display
    + (emp?.work_history ? (() => {
        try {
          const hist = JSON.parse(emp.work_history);
          if (!hist.length) return '';
          return '<div class="form-group full-width">'
            +'<div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px">'
            +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px">📋 ប្រវត្តិការងារ</div>'
            +hist.map((h,i)=>'<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)">'
              +'<span style="color:var(--text3)">ដំណាក់ '+(i+1)+':</span>'
              +'<span style="font-family:var(--mono)">'+h.hire_date+' → '+h.termination_date+'</span>'
              +'<span style="color:var(--primary);font-weight:600">'+calcWorkDuration(h.hire_date,h.termination_date)+'</span>'
              +'</div>').join('')
            +'</div></div>';
        } catch { return ''; }
      })() : '')
    + '</div>'
    // QR Bank section
    + '<div style="margin-top:10px;padding:10px 14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px;display:flex;align-items:center;gap:6px">🏦 QR ធនាគារ (សម្រាប់ ID Card)</div>'
    + '<div class="form-grid-3">'
    + '<div class="form-group"><label class="form-label">ធនាគារ</label>'
    + '<select class="form-control" id="f-bank">'
    + ['—','ABA','ACLEDA','Canadia','Wing','True Money','Prince Bank','Chip Mong','AMK','Bred'].map(b=>'<option'+(emp?.bank===b?' selected':'')+'>'+b+'</option>').join('')
    + '</select></div>'
    + '<div class="form-group"><label class="form-label">លេខគណនី</label><input class="form-control" id="f-bank-acc" placeholder="1234567890" value="' + (emp?.bank_account||'') + '" /></div>'
    + '<div class="form-group"><label class="form-label">ឈ្មោះអ្នកកាន់គណនី</label><input class="form-control" id="f-bank-name" placeholder="ឈ្មោះ..." value="' + (emp?.bank_holder||'') + '" /></div>'
    + '</div>'
    + '<div style="margin-top:10px">'
    + '<label class="form-label">Upload QR Code ធនាគារ</label>'
    + '<div style="display:flex;align-items:center;gap:12px;margin-top:6px">'
    + '<div id="qr-preview" style="width:80px;height:80px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;background:var(--bg4)" onclick="$(\'qr-input\').click()">'
    + (existingQR ? '<img src="' + existingQR + '" style="width:100%;height:100%;object-fit:contain" />' : '<span style="font-size:28px">📷</span>')
    + '</div>'
    + '<div><button class="btn btn-outline btn-sm" onclick="$(\'qr-input\').click()">📂 ជ្រើស QR</button>'
    + '<div style="font-size:10px;color:var(--text3);margin-top:4px">PNG, JPG — QR Code ធនាគារ</div></div>'
    + '</div>'
    + '<input type="file" id="qr-input" accept="image/*" style="display:none" onchange="handleQRUpload(this)" />'
    + '</div>'
    + '</div>'
    + '<div class="form-actions">'
    + '<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    + '<button class="btn btn-primary" id="save-emp-btn" onclick="saveEmployee()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>'
    + (id ? ' រក្សាទុក' : ' បន្ថែម')
    + '</button>'
    + '</div>';

  document.getElementById('modal').classList.add('modal--wide');
  openModal();
}

function toggleTerminationDate(status) {
  const row = document.getElementById('termination-date-row');
  if (row) row.style.display = status === 'inactive' ? 'flex' : 'none';
  // Auto-fill today if empty
  if (status === 'inactive') {
    const dateEl = document.getElementById('f-termination-date');
    if (dateEl && !dateEl.value) dateEl.value = today();
  }
}

// Handle photo file selection
function handleEmpPhotoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('រូបថតធំពេក! អតិបរមា 2MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const url = e.target.result;
    // Update preview
    const preview = document.getElementById('emp-photo-preview');
    if (preview) {
      preview.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover" />';
    }
    // Store temporarily in state
    state._pendingPhoto = url;
    showToast('Upload រូបថតបានជោគជ័យ!', 'success');
  };
  reader.readAsDataURL(file);
}

function removeEmpPhoto() {
  state._pendingPhoto = '__remove__';
  const preview = document.getElementById('emp-photo-preview');
  if (preview) {
    preview.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="width:32px;height:32px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }
  showToast('លុបរូបថតរួច', 'success');
}
function removeEmpQR() {
  state._pendingQR = '__remove__';
  const p = document.getElementById('qr-preview');
  if (p) p.innerHTML = '<span style="font-size:28px">📷</span>';
  showToast('លុប QR រួច', 'success');
}
// Handle QR upload
function handleQRUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state._pendingQR = e.target.result;
    const p = document.getElementById('qr-preview');
    if (p) p.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:contain" />';
    showToast('Upload QR Code រួច!', 'success');
  };
  reader.readAsDataURL(file);
}

async function saveEmployee() {
  const btn = $('save-emp-btn');
  btn.disabled = true; btn.textContent = 'កំពុងរក្សា...';
  const data = {
    name:          $('f-name')?.value.trim(),
    gender:        $('f-gender')?.value,
    custom_id:     $('f-custom-id')?.value.trim() || null,  // null = keep server-side auto
    position:      $('f-position')?.value.trim(),
    department_id: parseInt($('f-dept')?.value) || 0,
    phone:         $('f-phone')?.value.trim(),
    email:         $('f-email')?.value.trim(),
    salary:        parseFloat($('f-salary')?.value) || 0,
    hire_date:     $('f-hire')?.value,
    status:        $('f-status')?.value,
    termination_date: $('f-termination-date')?.value || null,
    bank:          $('f-bank')?.value !== '—' ? $('f-bank')?.value : '',
    bank_account:  $('f-bank-acc')?.value.trim(),
    bank_holder:   $('f-bank-name')?.value.trim(),
    off_days:      Array.from(document.querySelectorAll('.f-offday:checked')).map(function(c){return parseInt(c.value);}),
    work_location: $('f-work-location')?.value.trim() || '',
  };
  if (!data.name || !data.position) {
    showToast('សូមបំពេញឈ្មោះ និងតំណែង!','error');
    btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg> រក្សាទុក';
    return;
  }
  try {
    let savedId = state.editingId;
    if (state.editingId) {
      await api('PUT', '/employees/' + state.editingId, data);
      showToast('កែប្រែបានជោគជ័យ!', 'success');
    } else {
      const res = await api('POST', '/employees', data);
      savedId = res?.id || res?.employee?.id;
      showToast('បន្ថែមបុគ្គលិកថ្មី!', 'success');
    }

    // Save photo
    if (state._pendingPhoto === '__remove__') {
      if (savedId) await delEmpPhoto(savedId);
    } else if (state._pendingPhoto && savedId) {
      await setEmpPhoto(savedId, state._pendingPhoto);
    }
    state._pendingPhoto = null;
    // Save QR
    if (state._pendingQR === '__remove__') {
      if (savedId) await delEmpQR(savedId);
    } else if (state._pendingQR && savedId) {
      await setEmpQR(savedId, state._pendingQR);
    }
    state._pendingQR = null;

    closeModal();
    renderEmployees();
  } catch(e) {
    showToast('បញ្ហា: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg> រក្សាទុក';
  }
}



function openEmployeeReportModal() {
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const lastDay  = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().split('T')[0];
  $('modal-title').textContent = '🖨️ បោះពុម្ព / Export បុគ្គលិក';
  $('modal-body').innerHTML =
    // Date range section
    '<div style="margin-bottom:12px;padding:14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">'
    +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px">📅 ជ្រើសរើសរយៈពេល (ថ្ងៃចូលធ្វើការ)</div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--bg4);border-radius:8px;cursor:pointer" onclick="toggleRptAllDates()">'
    +'<input type="checkbox" id="rpt-all" style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer" onchange="toggleRptAllDates()" />'
    +'<div><div style="font-weight:700;font-size:12px">ទាំងអស់ (មិន filter ថ្ងៃ)</div></div>'
    +'</div>'
    +'<div id="rpt-date-range" class="form-grid">'
    +'<div class="form-group"><label class="form-label">ពីថ្ងៃទី</label>'
    +'<input class="form-control" type="date" id="rpt-from" value="'+firstDay+'" /></div>'
    +'<div class="form-group"><label class="form-label">ដល់ថ្ងៃទី</label>'
    +'<input class="form-control" type="date" id="rpt-to" value="'+lastDay+'" /></div>'
    +'</div>'
    +'</div>'

    // Filter + Sort section
    +'<div style="margin-bottom:12px;padding:14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">'
    +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px">🔽 Filter & Sort</div>'
    +'<div class="form-grid">'
    +'<div class="form-group"><label class="form-label">ស្ថានភាព</label>'
    +'<select class="form-control" id="rpt-status">'
    +'<option value="">ទាំងអស់</option>'
    +'<option value="active">✅ ធ្វើការ</option>'
    +'<option value="on_leave">🌴 ច្បាប់</option>'
    +'<option value="inactive">⛔ ផ្អាក/លាឈប់</option>'
    +'</select></div>'
    +'<div class="form-group"><label class="form-label">Sort ដោយ</label>'
    +'<select class="form-control" id="rpt-sort">'
    +'<option value="name">ឈ្មោះ (A→Z)</option>'
    +'<option value="name_desc">ឈ្មោះ (Z→A)</option>'
    +'<option value="hire_date">ថ្ងៃចូល (ចាស់→ថ្មី)</option>'
    +'<option value="hire_date_desc">ថ្ងៃចូល (ថ្មី→ចាស់)</option>'
    +'<option value="salary">ប្រាក់ខែ (ទាប→ខ្ពស់)</option>'
    +'<option value="salary_desc">ប្រាក់ខែ (ខ្ពស់→ទាប)</option>'
    +'<option value="id">ID (A→Z)</option>'
    +'</select></div>'
    +'</div>'
    +'</div>'

    // Format buttons
    +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px">ជ្រើស Format</div>'
    +'<div style="display:flex;flex-direction:column;gap:10px">'
    +'<button class="btn btn-outline" style="justify-content:flex-start;gap:10px;padding:12px 16px" onclick="doEmployeeReport(\'print\')">'
    +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;flex-shrink:0"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
    +'<div style="text-align:left"><div style="font-weight:700">🖨️ បោះពុម្ព / PDF</div><div style="font-size:11px;color:var(--text3)">Print window — A4 Landscape + ហត្ថលេខា</div></div>'
    +'</button>'
    +'<button class="btn btn-success" style="justify-content:flex-start;gap:10px;padding:12px 16px" onclick="doEmployeeReport(\'excel\')">'
    +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;flex-shrink:0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    +'<div style="text-align:left"><div style="font-weight:700">📊 Export Excel (.xlsx)</div><div style="font-size:11px;color:var(--text3)">Download file Excel — មានស្ថិតិសរុប</div></div>'
    +'</button>'
    +'</div>'
    +'<div class="form-actions" style="margin-top:16px"><button class="btn btn-outline" onclick="closeModal()">បិទ</button></div>';
  openModal();
}

function toggleRptAllDates() {
  const cb = document.getElementById('rpt-all');
  const range = document.getElementById('rpt-date-range');
  if (!cb || !range) return;
  // Toggle checkbox if clicked on the div (not the checkbox itself)
  const isChecked = cb.checked;
  range.style.opacity = isChecked ? '0.3' : '1';
  range.style.pointerEvents = isChecked ? 'none' : '';
}

async function doEmployeeReport(type) {
  const allChecked = document.getElementById('rpt-all')?.checked;
  const from       = allChecked ? '' : ($('rpt-from')?.value || '');
  const to         = allChecked ? '' : ($('rpt-to')?.value   || '');
  const statusFilt = $('rpt-status')?.value || '';
  const sortBy     = $('rpt-sort')?.value   || 'name';

  // Fetch fresh data
  let allEmps = state.employees || [];
  try {
    const fresh = await api('GET', '/employees?limit=500');
    if (fresh.employees && fresh.employees.length) allEmps = fresh.employees;
  } catch(_) {}

  // Filter by date
  let emps = allEmps;
  if (!allChecked && (from || to)) {
    emps = emps.filter(e => {
      if (!e.hire_date) return true;
      const d = e.hire_date;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  // Filter by status
  if (statusFilt) emps = emps.filter(e => e.status === statusFilt);

  // Sort
  emps = [...emps].sort((a, b) => {
    switch(sortBy) {
      case 'name':          return (a.name||'').localeCompare(b.name||'');
      case 'name_desc':     return (b.name||'').localeCompare(a.name||'');
      case 'hire_date':     return (a.hire_date||'') > (b.hire_date||'') ? 1 : -1;
      case 'hire_date_desc':return (a.hire_date||'') < (b.hire_date||'') ? 1 : -1;
      case 'salary':        return (a.salary||0) - (b.salary||0);
      case 'salary_desc':   return (b.salary||0) - (a.salary||0);
      case 'id':            return a.id - b.id;
      default:              return 0;
    }
  });

  const statusLabel = statusFilt === 'active' ? '✅ ធ្វើការ' : statusFilt === 'on_leave' ? '🌴 ច្បាប់' : statusFilt === 'inactive' ? '⛔ ផ្អាក/លាឈប់' : 'ទាំងអស់';
  const sortLabel   = {'name':'ឈ្មោះ↑','name_desc':'ឈ្មោះ↓','hire_date':'ថ្ងៃចូល↑','hire_date_desc':'ថ្ងៃចូល↓','salary':'ប្រាក់ខែ↑','salary_desc':'ប្រាក់ខែ↓','id':'ID'}[sortBy]||'';
  const rangeLabel  = allChecked ? 'ទាំងអស់' : (from && to) ? from+' — '+to : (from ? 'ចាប់ពី '+from : (to ? 'រហូតដល់ '+to : 'ទាំងអស់'));
  const fullLabel   = rangeLabel + (statusFilt ? ' · '+statusLabel : '') + ' · Sort: '+sortLabel;

  // Fetch leave data
  let leaveMap = {};
  try {
    const leaveData = await api('GET', '/leave');
    const records = leaveData.records || [];
    records.forEach(r => {
      if (r.status === 'approved') {
        leaveMap[r.employee_id] = (leaveMap[r.employee_id] || 0) + (r.days || 0);
      }
    });
  } catch(_) {}

  closeModal();
  if (type === 'print') {
    printEmployeeReport(emps, fullLabel, leaveMap);
  } else {
    exportEmployeeExcelFiltered(emps, fullLabel, leaveMap);
  }
}

// ── Print helper — uses hidden iframe to avoid popup blocking ──
function printHTML(html) {
  // Remove any existing print iframe
  const old = document.getElementById('_print_frame');
  if (old) old.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '_print_frame';
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for fonts/images to load then print
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch(e) {
        // Fallback: open in new tab
        const w = window.open('','_blank');
        if (w) { w.document.write(html); w.document.close(); setTimeout(()=>{ w.focus(); w.print(); }, 600); }
        else showToast('សូម allow popup ក្នុង browser settings!','warning');
      }
    }, 600);
  };
}

// Calculate work duration — supports work_history JSON for re-hired employees
function calcWorkDuration(hireDate, termDate, workHistoryJson) {
  // Helper: days between two dates
  function daysBetween(a, b) {
    const d1 = new Date(a), d2 = new Date(b);
    if (isNaN(d1)||isNaN(d2)) return 0;
    return Math.max(0, Math.round((d2-d1)/(1000*60*60*24)));
  }
  // Helper: format total days → X ឆ្នាំ Y ខែ Z ថ្ងៃ
  function formatDays(total) {
    const years  = Math.floor(total/365);
    const months = Math.floor((total%365)/30);
    const days   = total%365%30;
    const parts  = [];
    if (years  > 0) parts.push(years  + ' ឆ្នាំ');
    if (months > 0) parts.push(months + ' ខែ');
    if (days   > 0) parts.push(days   + ' ថ្ងៃ');
    return parts.length ? parts.join(' ') : '< 1 ថ្ងៃ';
  }

  if (!hireDate) return '—';

  // Sum from work history (past periods)
  let totalDays = 0;
  if (workHistoryJson) {
    try {
      const hist = JSON.parse(workHistoryJson);
      hist.forEach(h => { totalDays += daysBetween(h.hire_date, h.termination_date); });
    } catch(_) {}
  }

  // Add current period
  const endDate = (termDate && termDate !== '') ? termDate : new Date().toISOString().split('T')[0];
  totalDays += daysBetween(hireDate, endDate);

  return totalDays > 0 ? formatDays(totalDays) : '< 1 ថ្ងៃ';
}

async function applyRehire(empId) {
  const rehireDate = document.getElementById('f-rehire-date')?.value;
  if (!rehireDate) { showToast('សូមដាក់ថ្ងៃចូលថ្មី!','error'); return; }

  // Get current employee data
  let emp = null;
  try { emp = await api('GET', '/employees/'+empId); } catch(e) { showToast('Error: '+e.message,'error'); return; }
  if (!emp || !emp.hire_date) { showToast('មិនឃើញ employee!','error'); return; }

  // Build new history entry
  let history = [];
  try { if (emp.work_history) history = JSON.parse(emp.work_history); } catch(_) {}
  history.push({ hire_date: emp.hire_date, termination_date: emp.termination_date||today() });

  // Update employee: new hire_date, clear termination, active, save history
  try {
    await api('PUT', '/employees/'+empId, {
      ...emp,
      status: 'active',
      hire_date: rehireDate,
      termination_date: '',
      work_history: JSON.stringify(history),
    });
    showToast('ចូលធ្វើការថ្មីបានជោគជ័យ! ប្រវត្តិ '+history.length+' ដំណាក់កាល','success');
    closeModal();
    renderEmployees();
  } catch(e) { showToast('Error: '+e.message,'error'); }
}


function printEmployeeReport(emps, rangeLabel, leaveMap) {
  emps = emps || state.employees || [];
  rangeLabel = rangeLabel || 'ទាំងអស់';
  const cfg = getCompanyConfig();
  if (!emps.length) { showToast('មិនទាន់មានបុគ្គលិក!','error'); return; }
  const totalSalary      = emps.reduce((s,e)=>s+(e.salary||0),0);
  const activeCount      = emps.filter(e=>e.status==='active').length;
  const terminatedCount  = emps.filter(e=>e.termination_date&&e.termination_date!=='').length;

  const rows = emps.map((e,i)=>{
    const displayId  = e.custom_id ? e.custom_id : 'EMP'+String(e.id).padStart(3,'0');
    const gender     = e.gender==='male'?'ប្រុស':'ស្រី';
    const statusTxt  = e.status==='active'?'✅ ធ្វើការ':e.status==='on_leave'?'🌴 ច្បាប់':'⛔ ផ្អាក/លាឈប់';
    const termDate   = (e.termination_date && e.termination_date!=='') ? e.termination_date : '—';
    const duration   = calcWorkDuration(e.hire_date, e.termination_date, e.work_history);
    return '<tr style="background:'+(i%2===0?'white':'#f8faff')+'">'
      +'<td style="text-align:center;color:#666">'+(i+1)+'</td>'
      +'<td style="font-family:monospace;font-weight:700;color:#1d4ed8">'+displayId+'</td>'
      +'<td style="font-weight:600">'+e.name+'</td>'
      +'<td>'+gender+'</td>'
      +'<td>'+(e.position||'—')+'</td>'
      +'<td style="font-family:monospace">'+(e.phone||'—')+'</td>'
      +'<td style="font-family:monospace">'+(e.hire_date||'—')+'</td>'
      +'<td style="font-weight:600;color:#0369a1">'+duration+'</td>'
      +'<td style="font-family:monospace;font-weight:700;color:#16a34a">$'+(e.salary||0)+'</td>'
      +'<td style="text-align:center;font-family:monospace;font-weight:700;color:'+(termDate!=='—'?'#dc2626':'#94a3b8')+'">'+termDate+'</td>'
      +'<td>'+statusTxt+'</td>'
      +'</tr>';
  }).join('');

  const logoHtml = cfg.logo_url
    ? '<img src="'+cfg.logo_url+'" style="width:44px;height:44px;object-fit:contain;border-radius:6px;margin-right:12px;flex-shrink:0" />'
    : '<div style="width:44px;height:44px;background:#1a3a8f;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:18px;margin-right:12px;flex-shrink:0">HR</div>';

  printHTML('<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;800&display=swap" rel="stylesheet">'
    +'<title>បញ្ជីបុគ្គលិក</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;font-family:"Noto Sans Khmer",sans-serif}'
    +'body{padding:16px;color:#1a1f2e;background:white}'
    +'.header{display:flex;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #1a3a8f}'
    +'.co-name{font-size:17px;font-weight:800;color:#1a3a8f}'
    +'.rpt-title{font-size:13px;font-weight:700;margin:2px 0}'
    +'.rpt-sub{font-size:10px;color:#64748b}'
    +'.summary{display:flex;gap:10px;margin-bottom:14px}'
    +'.sum-box{flex:1;padding:8px 12px;background:#f8faff;border:1px solid #e2eaff;border-radius:8px;text-align:center}'
    +'.sum-val{font-size:18px;font-weight:800;color:#1d4ed8}'
    +'.sum-lbl{font-size:9px;color:#64748b;margin-top:2px}'
    +'table{width:100%;border-collapse:collapse;font-size:10px}'
    +'th{background:#1a3a8f;color:white;padding:7px 6px;text-align:left}'
    +'td{padding:5px 6px;border-bottom:1px solid #e5e7eb}'
    +'.sign{border-top:1px dashed #999;padding-top:4px;font-size:9px;color:#64748b;text-align:center;margin-top:24px}'
    +'.footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:14px}'
    +'@media print{@page{size:A4 landscape;margin:8mm}body{padding:0}}'
    +'</style></head><body>'
    +'<div class="header">'+logoHtml
    +'<div><div class="co-name">'+(cfg.company_name||'HR Pro')+'</div>'
    +'<div class="rpt-title">បញ្ជីសរុបបុគ្គលិក</div>'
    +'<div class="rpt-sub">រយៈពេល: '+rangeLabel+' &nbsp;|&nbsp; បោះពុម្ព: '+new Date().toLocaleDateString('km-KH',{year:'numeric',month:'long',day:'numeric'})+'</div>'
    +'</div></div>'
    +'<div class="summary">'
    +'<div class="sum-box"><div class="sum-val">'+emps.length+'</div><div class="sum-lbl">👥 សរុប</div></div>'
    +'<div class="sum-box"><div class="sum-val" style="color:#16a34a">'+activeCount+'</div><div class="sum-lbl">✅ ធ្វើការ</div></div>'
    +'<div class="sum-box"><div class="sum-val" style="color:#d97706">'+emps.filter(e=>e.status==='on_leave').length+'</div><div class="sum-lbl">🌴 ច្បាប់</div></div>'
    +'<div class="sum-box"><div class="sum-val" style="color:#dc2626">'+emps.filter(e=>e.status==='inactive').length+'</div><div class="sum-lbl">⛔ ផ្អាក/លាឈប់</div></div>'
    +'<div class="sum-box"><div class="sum-val" style="color:#dc2626">'+terminatedCount+'</div><div class="sum-lbl">📅 លាឈប់ (មានថ្ងៃ)</div></div>'
    +'<div class="sum-box"><div class="sum-val" style="color:#0284c7;font-size:14px">$'+totalSalary.toLocaleString()+'</div><div class="sum-lbl">💵 ប្រាក់ខែសរុប</div></div>'
    +'</div>'
    +'<table><thead><tr>'
    +'<th style="width:26px">លេខ</th><th>ID</th><th>ឈ្មោះពេញ</th><th>ភេទ</th><th>តំណែង</th><th>លេខទូរស័ព្ទ</th><th>ថ្ងៃចូលធ្វើការ</th><th>រយៈពេលធ្វើការ</th><th>ប្រាក់ខែគោល</th><th style="text-align:center">ថ្ងៃលាឈប់ពីការងារ</th><th>ស្ថានភាព</th>'
    +'</tr></thead><tbody>'+rows
    +'<tr style="background:#dbeafe;border-top:2px solid #1a3a8f">'
    +'<td colspan="8" style="text-align:right;font-weight:700;padding:8px 6px">សរុប:</td>'
    +'<td style="font-weight:800;color:#1a3a8f;font-family:monospace">$'+totalSalary.toLocaleString()+'</td>'
    +'<td style="text-align:center;font-weight:800;color:#dc2626">'+terminatedCount+' នាក់</td>'
    +'<td></td>'
    +'</tr></tbody></table>'
    +'<div class="footer">'
    +'<div class="sign">ហត្ថលេខាអ្នកត្រួតពិនិត្យ</div>'
    +'<div class="sign">ហត្ថលេខា HR</div>'
    +'<div class="sign">ហត្ថលេខានាយក</div>'
    +'</div>'
    +'</body></html>');

}

async function exportEmployeeExcelFiltered(emps, rangeLabel, leaveMap) {
  emps = emps || state.employees || [];
  rangeLabel = rangeLabel || 'ទាំងអស់';
  leaveMap = leaveMap || {};
  const cfg = getCompanyConfig();
  const headers = ['#','ID','ឈ្មោះពេញ','ភេទ','តំណែង','នាយកដ្ឋាន','លេខទូរស័ព្ទ','អ៊ីម៉ែល','ថ្ងៃចូលធ្វើការ','រយៈពេលធ្វើការ','ប្រាក់ខែគោល','ថ្ងៃលាឈប់ពីការងារ','ស្ថានភាព'];
  const rows = emps.map((e,i)=>[
    i+1,
    e.custom_id ? e.custom_id : 'EMP'+String(e.id).padStart(3,'0'),
    e.name||'',
    e.gender==='male'?'ប្រុស':'ស្រី',
    e.position||'',
    e.department_name||e.department||'',
    e.phone||'',
    e.email||'',
    e.hire_date||'',
    calcWorkDuration(e.hire_date, e.termination_date),
    e.salary||0,
    e.termination_date||'—',
    e.status==='active'?'ធ្វើការ':e.status==='on_leave'?'ច្បាប់':'ផ្អាក/លាឈប់'
  ]);
  downloadBlob(
    buildXLSX([{ name:'បុគ្គលិក ('+rangeLabel+')', headers, rows }]),
    (cfg.company_name||'HR')+'_Employees_'+rangeLabel.replace(/[^0-9a-zA-Z]/g,'_')+'.xlsx'
  );
  showToast('Download Excel បានជោគជ័យ! ✅','success');
}

function exportEmployeePDF() { openEmployeeReportModal(); }


function openQuickLeaveModal(empId, empName) {
  $('modal-title').textContent = '🌴 ច្បាប់ឈប់សម្រាក — ' + empName;
  const leaveDays = (window._empLeaveMap && window._empLeaveMap[empId]) || 0;
  $('modal-body').innerHTML =
    // Leave summary
    '<div style="display:flex;align-items:center;gap:16px;padding:14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border);margin-bottom:16px">'
    +'<div style="font-size:36px">🌴</div>'
    +'<div>'
    +'<div style="font-size:12px;color:var(--text3)">ថ្ងៃលាឈប់សរុប (អនុម័ត)</div>'
    +'<div style="font-size:28px;font-weight:800;color:var(--warning)">'+leaveDays+' <span style="font-size:14px;font-weight:400">ថ្ងៃ</span></div>'
    +'</div>'
    +'</div>'
    // New leave form
    +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px">+ ស្នើរច្បាប់ថ្មី</div>'
    +'<div class="form-grid">'
    +'<div class="form-group"><label class="form-label">ប្រភេទ *</label>'
    +'<select class="form-control" id="ql-type" onchange="calcQLDays()">'
    +'<option>ច្បាប់ប្រចាំឆ្នាំ</option>'
    +'<option>ច្បាប់ជំងឺ</option>'
    +'<option>ច្បាប់សម្ភព</option>'
    +'<option>ច្បាប់អាពាហ៍ពិពាហ៍</option>'
    +'<option>ច្បាប់គ្មានប្រាក់</option>'
    +'<option>ផ្សេងៗ</option>'
    +'</select></div>'
    +'<div class="form-group"><label class="form-label">ថ្ងៃចាប់ផ្តើម *</label>'
    +'<input class="form-control" type="date" id="ql-start" value="'+today()+'" onchange="calcQLDays()" /></div>'
    +'<div class="form-group"><label class="form-label">ថ្ងៃបញ្ចប់ *</label>'
    +'<input class="form-control" type="date" id="ql-end" value="'+today()+'" onchange="calcQLDays()" /></div>'
    +'<div class="form-group"><label class="form-label">ចំនួនថ្ងៃ</label>'
    +'<div id="ql-days-display" style="padding:10px 12px;background:var(--bg3);border-radius:8px;font-family:var(--mono);color:var(--warning);font-weight:700;font-size:16px">1 ថ្ងៃ</div>'
    +'</div>'
    +'<div class="form-group full-width"><label class="form-label">មូលហេតុ</label>'
    +'<textarea class="form-control" id="ql-reason" rows="2" placeholder="មូលហេតុ..."></textarea></div>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" onclick="saveQuickLeave('+empId+')">🌴 ស្នើរ</button>'
    +'</div>';
  openModal();
}

function calcQLDays() {
  const s = new Date($('ql-start')?.value);
  const e = new Date($('ql-end')?.value);
  const el = $('ql-days-display');
  if (!isNaN(s)&&!isNaN(e)&&e>=s) {
    const days = Math.round((e-s)/(1000*60*60*24))+1;
    if (el) el.textContent = days+' ថ្ងៃ';
  } else {
    if (el) el.textContent = '—';
  }
}

async function saveQuickLeave(empId) {
  const s = new Date($('ql-start')?.value);
  const e = new Date($('ql-end')?.value);
  if (isNaN(s)||isNaN(e)||e<s) { showToast('ថ្ងៃមិនត្រឹមត្រូវ!','error'); return; }
  const days = Math.round((e-s)/(1000*60*60*24))+1;
  try {
    await api('POST','/leave',{
      employee_id: empId,
      leave_type: $('ql-type')?.value,
      start_date: $('ql-start')?.value,
      end_date: $('ql-end')?.value,
      days, reason: $('ql-reason')?.value,
      status: 'approved'
    });
    showToast('ស្នើរច្បាប់ '+days+' ថ្ងៃ បានជោគជ័យ!','success');
    closeModal();
    renderEmployees();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

async function openEmpHistoryModal(empId, empName) {
  $('modal-title').textContent = '📋 ប្រវត្តិការងារ — ' + empName;
  $('modal-body').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">⏳ កំពុងទាញ...</div>';
  openModal();

  let emp = null;
  try { emp = await api('GET', '/employees/' + empId); } catch(e) { $('modal-body').innerHTML = '<p style="color:var(--danger)">Error: '+e.message+'</p>'; return; }

  // Parse work history
  let history = [];
  try { if (emp.work_history) history = JSON.parse(emp.work_history); } catch(_) {}

  // Current period
  const currentPeriod = {
    hire_date: emp.hire_date,
    termination_date: emp.termination_date || '',
    status: emp.status,
    isCurrent: true
  };

  // All periods (history + current)
  const allPeriods = [...history.map((h,i) => ({...h, index: i+1, isCurrent: false})),
    {...currentPeriod, index: history.length + 1}];

  const totalDuration = calcWorkDuration(
    allPeriods[0]?.hire_date,
    currentPeriod.termination_date,
    emp.work_history
  );

  $('modal-body').innerHTML =
    // Summary
    '<div style="display:flex;gap:12px;margin-bottom:16px">'
    +'<div style="flex:1;text-align:center;padding:12px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">'
    +'<div style="font-size:24px;font-weight:800;color:var(--primary)">'+allPeriods.length+'</div>'
    +'<div style="font-size:11px;color:var(--text3)">ដំណាក់កាលធ្វើការ</div></div>'
    +'<div style="flex:1;text-align:center;padding:12px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">'
    +'<div style="font-size:24px;font-weight:800;color:var(--danger)">'+history.length+'</div>'
    +'<div style="font-size:11px;color:var(--text3)">ដងលាឈប់</div></div>'
    +'<div style="flex:1;text-align:center;padding:12px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">'
    +'<div style="font-size:24px;font-weight:800;color:var(--success)">'+history.length+'</div>'
    +'<div style="font-size:11px;color:var(--text3)">ដងចូលថ្មី</div></div>'
    +'<div style="flex:1;text-align:center;padding:12px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">'
    +'<div style="font-size:13px;font-weight:800;color:var(--info)">'+totalDuration+'</div>'
    +'<div style="font-size:11px;color:var(--text3)">រយៈពេលធ្វើការសរុប</div></div>'
    +'</div>'

    // Timeline
    +'<div style="position:relative">'
    + allPeriods.map((p, idx) => {
        const dur = calcWorkDuration(p.hire_date, p.termination_date||'');
        const isActive = p.isCurrent && (!p.termination_date || p.termination_date==='');
        const dotColor = isActive ? 'var(--success)' : (p.termination_date ? 'var(--danger)' : 'var(--warning)');
        const statusLabel = isActive ? '🟢 កំពុងធ្វើការ' : (p.termination_date ? '🔴 លាឈប់' : '🟡 ផ្អាក');

        return '<div style="display:flex;gap:12px;margin-bottom:12px">'
          // Dot + line
          +'<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">'
          +'<div style="width:16px;height:16px;border-radius:50%;background:'+dotColor+';border:2px solid var(--bg);box-shadow:0 0 0 2px '+dotColor+'44;flex-shrink:0"></div>'
          +(idx < allPeriods.length-1 ? '<div style="width:2px;flex:1;background:var(--border);min-height:30px;margin:4px 0"></div>' : '')
          +'</div>'
          // Content
          +'<div style="flex:1;padding:12px 14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border);margin-bottom:4px">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
          +'<div style="font-weight:700;font-size:13px">ដំណាក់កាល '+(idx+1)+(p.isCurrent?' <span style="font-size:10px;color:var(--success);font-weight:600">(បច្ចុប្បន្ន)</span>':'')+'</div>'
          +'<span style="font-size:11px">'+statusLabel+'</span>'
          +'</div>'
          +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
          +'<div><div style="font-size:10px;color:var(--text3)">📅 ចូលធ្វើការ</div>'
          +'<div style="font-family:var(--mono);font-weight:700;color:var(--success);font-size:12px">'+(p.hire_date||'—')+'</div></div>'
          +'<div><div style="font-size:10px;color:var(--text3)">📅 ថ្ងៃលាឈប់</div>'
          +'<div style="font-family:var(--mono);font-weight:700;color:'+(p.termination_date?'var(--danger)':'var(--text3)')+';font-size:12px">'+(p.termination_date||'—')+'</div></div>'
          +'<div style="grid-column:1/-1"><div style="font-size:10px;color:var(--text3)">⏱ រយៈពេល</div>'
          +'<div style="font-weight:700;color:var(--info);font-size:12px">'+dur+'</div></div>'
          +'</div>'
          +'</div>'
          +'</div>';
      }).join('')
    +'</div>'
    +'<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បិទ</button></div>';
}

async function deleteEmployee(id) {
  if (!confirm('តើអ្នកចង់លុបបុគ្គលិកនេះមែនទេ?')) return;
  try { await api('DELETE',`/employees/${id}`); showToast('លុបបានជោគជ័យ!','success'); renderEmployees(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ===== DEPARTMENTS =====
async function renderDepartments() {
  showLoading();
  try {
    const depts = await api('GET', '/departments');
    state.departments = depts;
    contentArea().innerHTML = `
      <div class="page-header">
        <div><h2>នាយកដ្ឋាន</h2><p>សរុប ${depts.length} នាយកដ្ឋាន</p></div>
        <button class="btn btn-primary" onclick="openDeptModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          បន្ថែមនាយកដ្ឋាន
        </button>
      </div>
      ${depts.length===0
        ? `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><h3>មិនទាន់មាននាយកដ្ឋាន</h3><p>ចុចបន្ថែមដើម្បីចាប់ផ្តើម</p></div>`
        : `<div class="dept-grid">${depts.map(d=>`
            <div class="dept-card">
              <div class="dept-icon" style="background:${d.color}22">${d.icon}</div>
              <div class="dept-name">${d.name}</div>
              <div class="dept-count">បុគ្គលិក <span>${d.head_count||0}</span> នាក់</div>
              <div style="font-size:12px;color:var(--text3);margin-top:6px">👤 ${d.manager||'—'}</div>
              <div style="margin-top:14px;display:flex;gap:8px">
                <button class="btn btn-outline btn-sm" style="flex:1" onclick="openDeptModal(${d.id})">✏️ កែប្រែ</button>
                <button class="btn btn-danger btn-sm" onclick="deleteDept(${d.id})">🗑️</button>
              </div>
            </div>`).join('')}</div>`}`;
  } catch(e) { showError(e.message); }
}

function openDeptModal(id=null) {
  state.editingId = id;
  const dept = id ? state.departments.find(d=>d.id===id) : null;
  $('modal-title').textContent = id ? 'កែប្រែនាយកដ្ឋាន' : 'បន្ថែមនាយកដ្ឋានថ្មី';
  $('modal-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label class="form-label">ឈ្មោះ *</label><input class="form-control" id="d-name" placeholder="ឈ្មោះ..." value="${dept?.name||''}" /></div>
      <div class="form-group"><label class="form-label">អ្នកគ្រប់គ្រង</label><input class="form-control" id="d-manager" placeholder="ឈ្មោះ..." value="${dept?.manager||''}" /></div>
      <div class="form-group"><label class="form-label">Icon (Emoji)</label><input class="form-control" id="d-icon" placeholder="💻" value="${dept?.icon||'🏢'}" /></div>
      <div class="form-group"><label class="form-label">ពណ៌</label><input class="form-control" id="d-color" type="color" value="${dept?.color||'#118AB2'}" style="height:42px;cursor:pointer" /></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>
      <button class="btn btn-primary" id="save-dept-btn" onclick="saveDept()">រក្សាទុក</button>
    </div>`;
  openModal();
}

async function saveDept() {
  const btn = $('save-dept-btn');
  btn.disabled=true; btn.textContent='កំពុងរក្សា...';
  const data = { name:$('d-name').value.trim(), manager:$('d-manager').value.trim(), icon:$('d-icon').value.trim()||'🏢', color:$('d-color').value };
  if (!data.name) { showToast('សូមបំពេញឈ្មោះ!','error'); btn.disabled=false; btn.textContent='រក្សាទុក'; return; }
  try {
    if (state.editingId) { await api('PUT',`/departments/${state.editingId}`,data); showToast('កែប្រែបានជោគជ័យ!','success'); }
    else { await api('POST','/departments',data); showToast('បន្ថែមនាយកដ្ឋានថ្មី!','success'); }
    closeModal(); renderDepartments();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); btn.disabled=false; btn.textContent='រក្សាទុក'; }
}

async function deleteDept(id) {
  if (!confirm('លុបនាយកដ្ឋាននេះ?')) return;
  try { await api('DELETE',`/departments/${id}`); showToast('លុបបានជោគជ័យ!','success'); renderDepartments(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ===== ATTENDANCE =====
async function renderAttendance(date='') {
  showLoading();
  const today = date || new Date().toISOString().split('T')[0];
  try {
    const [attData, empData] = await Promise.all([api('GET','/attendance?date='+today), api('GET','/employees')]);
    state.employees = empData.employees;
    const label = new Date(today+'T00:00:00').toLocaleDateString('km-KH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const attRows = attData.records.length===0
      ? '<tr><td colspan="6"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានការកត់វត្តមានសម្រាប់ថ្ងៃនេះ</p></div></td></tr>'
      : attData.records.map(a => {
          const photo = getEmpPhoto(a.employee_id);
          const av = photo
            ? '<div class="emp-avatar" style="background:'+getColor(a.employee_name)+';overflow:hidden;padding:0"><img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
            : '<div class="emp-avatar" style="background:'+getColor(a.employee_name)+'">'+(a.employee_name||'?')[0]+'</div>';
          return '<tr>'
            +'<td><div class="employee-cell">'+av+'<div class="emp-name">'+a.employee_name+'</div></div></td>'
            +'<td>'+(a.department||'—')+'</td>'
            +'<td><span style="font-family:var(--mono);color:var(--success)">'+(a.check_in||'—')+'</span></td>'
            +'<td><span style="font-family:var(--mono);color:var(--text3)">'+(a.check_out||'—')+'</span></td>'
            +'<td>'+(a.status==='present'?'<span class="badge badge-green">✅ វត្តមាន</span>':a.status==='late'?'<span class="badge badge-yellow">⏰ យឺត</span>':'<span class="badge badge-red">❌ អវត្តមាន</span>')+'</td>'
            +'<td><div class="action-btns">'
            +'<button class="btn btn-outline btn-sm" onclick="openEditAttModal('+a.id+',\''+a.employee_name+'\')">✏️</button>'
            +'<button class="btn btn-outline btn-sm" onclick="quickCheckOut('+a.employee_id+',\''+today+'\')">🚪</button>'
            +'<button class="btn btn-danger btn-sm" onclick="deleteAttendance('+a.id+',\''+today+'\')">🗑️</button>'
            +'</div></td>'
            +'</tr>';
        }).join('');

    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>វត្តមានប្រចាំថ្ងៃ</h2><p>'+label+'</p></div>'
      +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +'<input class="filter-input" type="date" value="'+today+'" onchange="renderAttendance(this.value)" />'
      +'<button class="btn btn-success" onclick="openQRScanModal(\''+today+'\')">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
      +' 📷 ស្កេន QR</button>'
      +'<button class="btn btn-primary" onclick="openAttModal(\''+today+'\')">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> កត់វត្តមាន</button>'
      +'<button class="btn btn-outline" onclick="openBulkAbsenceModal(\''+today+'\')\" style="border-color:var(--danger);color:var(--danger)">📋 អវត្តមាន/ឈប់</button>'
      +'<button class="btn btn-outline" onclick="renderMonthlyAttendance(\''+today.slice(0,7)+'\')" style="border-color:var(--info);color:var(--info)">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      +' 📊 តារាងប្រចាំខែ</button>'
      +'</div></div>'
      +'<div class="att-summary">'
      +'<div class="att-box"><div class="att-num" style="color:var(--success)">'+attData.stats.present+'</div><div class="att-lbl">✅ មានវត្តមាន</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--warning)">'+attData.stats.late+'</div><div class="att-lbl">⏰ មកយឺត</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--danger)">'+attData.stats.absent+'</div><div class="att-lbl">❌ អវត្តមាន</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--info)">'+attData.stats.total+'</div><div class="att-lbl">👥 សរុប</div></div>'
      +'</div>'
      +'<div class="card">'
      +'<div class="card-header"><span class="card-title">ក្បាលបញ្ជីវត្តមាន</span></div>'
      +'<div class="table-container"><table>'
      +'<thead><tr><th>បុគ្គលិក</th><th>នាយកដ្ឋាន</th><th>ម៉ោងចូល</th><th>ម៉ោងចេញ</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>'
      +'<tbody>'+attRows+'</tbody>'
      +'</table></div></div>';
  } catch(e) { showError(e.message); }
}

async function deleteAttendance(id, date) {
  if (!confirm('លុបកំណត់ត្រាវត្តមាននេះ?')) return;
  try {
    await api('DELETE', '/attendance/' + id);
    showToast('លុបបានជោគជ័យ!', 'success');
    renderAttendance(date);
  } catch(e) { showToast('បញ្ហា: ' + e.message, 'error'); }
}

// ===== MONTHLY ATTENDANCE TABLE =====
async function renderMonthlyAttendance(month='') {
  showLoading();
  const currentMonth = month || new Date().toISOString().slice(0,7);
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const rules = getSalaryRules();
  const maxAbsent = rules.max_absent_days !== undefined ? rules.max_absent_days : 2;

  try {
    const [empData, attData, swapDataRaw] = await Promise.all([
      api('GET','/employees?limit=500'),
      api('GET','/attendance?date='+currentMonth+'-01&limit=9999'),
      api('GET','/dayswap').catch(()=>({records:[]}))
    ]);
    // Build swap map: empId -> { dd -> swapRecord } keyed by swap_date (work date this month)
    const swapMap = {};
    // Build off-date map: empId -> { dd -> swapRecord } keyed by off_date (compensation OFF date)
    const offDateMap = {};
    (swapDataRaw.records||[]).forEach(s => {
      if (s.status !== 'approved') return;
      // swap_date = ថ្ងៃ OFF ដែលមកធ្វើការ
      if (s.swap_date && s.swap_date.startsWith(currentMonth)) {
        if (!swapMap[s.employee_id]) swapMap[s.employee_id] = {};
        const dd = s.swap_date.slice(-2);
        swapMap[s.employee_id][dd] = s;
      }
      // off_date = ថ្ងៃធ្វើការ ដែល OFF ជំនួស (exact date)
      if (s.off_date && s.off_date.startsWith(currentMonth)) {
        if (!offDateMap[s.employee_id]) offDateMap[s.employee_id] = {};
        const dd = s.off_date.slice(-2);
        offDateMap[s.employee_id][dd] = s;
      }
    });
    // Load all attendance for the month by fetching each week? No — use limit trick with month filter
    // Fetch all attendance records for the month
    let allRecords = [];
    try {
      // Try fetching with month param
      const r1 = await api('GET','/attendance?month='+currentMonth+'&limit=9999');
      allRecords = r1.records || [];
    } catch(_) {}
    if (!allRecords.length) {
      // fallback: fetch by date range
      const promises = [];
      for (let d=1; d<=daysInMonth; d++) {
        const dd = String(d).padStart(2,'0');
        promises.push(api('GET','/attendance?date='+currentMonth+'-'+dd).catch(()=>({records:[]})));
      }
      const results = await Promise.all(promises);
      results.forEach(r => { allRecords = allRecords.concat(r.records||[]); });
    }

    const emps = empData.employees || [];
    // Build map: empId -> { dayStr -> record }
    const attMap = {};
    allRecords.forEach(a => {
      if (!attMap[a.employee_id]) attMap[a.employee_id] = {};
      const day = (a.date||'').slice(-2);
      attMap[a.employee_id][day] = a;
    });

    // Build ALL day columns for the month (used for table headers)
    const allDays = [];
    for (let d=1; d<=daysInMonth; d++) {
      const dt = new Date(y, m-1, d);
      const wd = dt.getDay();
      allDays.push({ d, dd: String(d).padStart(2,'0'), wd });
    }
    // Use allDays minus Sunday for header (Sunday=0 excluded by default if no emp off_days set)
    const days = allDays.filter(({wd}) => wd !== 0);

    // Helper: get working days for a specific employee (exclude their personal off_days)
    function getEmpWorkDays(emp) {
      var offDays = parseOffDays(emp); // default: skip Sunday
      return allDays.filter(function({wd}) { return offDays.indexOf(wd) === -1; });
    }

    // Summary per employee
    const summaries = emps.map(emp => {
      const rec = attMap[emp.id] || {};
      const empDays = getEmpWorkDays(emp);
      let present=0, late=0, absent=0, swap=0;
      empDays.forEach(({dd}) => {
        // Skip if this working day is a compensation OFF day (OFF+)
        const compSwap = (offDateMap[emp.id]||{})[dd];
        if (compSwap) return; // treated as OFF+, not absent
        const a = rec[dd];
        if (a) {
          if (a.status==='present') present++;
          else if (a.status==='late') late++;
          else if (a.status==='holiday') { /* ថ្ងៃឈប់សម្រាក — មិនគិតជា absent */ }
          else if (a.status==='absent') absent++;
        } else {
          absent++;
        }
      });
      // Count swap days: OFF days where employee came to work (swap approved this month)
      const empSwapDays = swapMap[emp.id] || {};
      Object.keys(empSwapDays).forEach(dd => {
        // Only count if there's an actual attendance record or just the swap approval
        swap++;
        present++; // swap day counts as present
      });
      const overAbsent = Math.max(0, absent - maxAbsent);
      const workingDaysCount = empDays.length;
      const dailyRate = workingDaysCount > 0 ? (emp.salary || 0) / workingDaysCount : 0;
      const deduction = parseFloat((overAbsent * dailyRate).toFixed(2));
      return { emp, present, late, absent, swap, overAbsent, deduction, dailyRate, workingDaysCount };
    });

    // Build union of all employee off_days for header highlight
    const allOffWds = new Set();
    emps.forEach(function(e) { parseOffDays(e).forEach(function(w){ allOffWds.add(w); }); });

    // Weekday short names in Khmer (0=Sun...6=Sat)
    const wdNames = ['អា','ច','អ','ព','ព្រ','សុ','ស'];

    // Table header row 1: day numbers
    const dayThs = allDays.map(({d,wd}) => {
      const isToday = (new Date().toISOString().slice(0,7)===currentMonth && new Date().getDate()===d);
      const isWeekend = (wd === 0 || wd === 6);
      const bg = isToday ? 'background:var(--primary);color:white;' : isWeekend ? 'background:var(--bg2);color:var(--text3);' : '';
      return '<th style="padding:2px 1px;font-size:11px;font-weight:600;text-align:center;'+bg+'">' + d + '</th>';
    }).join('');

    // Table header row 2: weekday names
    const wdThs = allDays.map(({wd}) => {
      const isWeekend = (wd === 0 || wd === 6);
      const color = isWeekend ? 'color:var(--danger);' : 'color:var(--text3);';
      return '<th style="padding:1px 0;font-size:9px;text-align:center;font-weight:400;'+color+'">' + wdNames[wd] + '</th>';
    }).join('');

    const dayRows = summaries.map(({emp, present, late, absent, swap, overAbsent, deduction}) => {
      const rec = attMap[emp.id] || {};
      const empOff = parseOffDays(emp);
      const cells = allDays.map(({dd, wd}) => {
        const swapRec = (swapMap[emp.id]||{})[dd];
        const a = (attMap[emp.id]||{})[dd];

        // Check holiday first (overrides OFF day display)
        if (a && a.status === 'holiday') {
          return '<td style="text-align:center;font-size:9px;padding:1px 0" title="ថ្ងៃឈប់សម្រាក">🎉</td>';
        }

        // This day is employee's day off
        if (empOff.indexOf(wd) !== -1) {
          if (swapRec) {
            // Employee came to work on their OFF day (swap approved)
            return '<td style="text-align:center;font-size:8px;padding:1px 0;color:var(--primary)" title="ប្តូរ">🔄</td>';
          }
          return '<td style="text-align:center;font-size:9px;padding:2px 0;color:var(--text3);background:var(--bg2)">OFF</td>';
        }
        // Check if this working day is the exact compensation OFF date
        const compSwap = (offDateMap[emp.id]||{})[dd];
        if (compSwap) {
          return '<td style="text-align:center;font-size:8px;padding:2px 0;font-weight:700;color:var(--warning);background:rgba(255,190,11,.1)" title="OFF+">OFF+</td>';
        }
        if (!a) return '<td style="text-align:center;font-size:11px;padding:2px 0;color:var(--danger)">—</td>';
        if (a.status==='present') return '<td style="text-align:center;font-size:12px;padding:2px 0;color:var(--success);text-align:center">✔</td>';
        if (a.status==='late') return '<td style="text-align:center;font-size:11px;padding:2px 0;color:var(--warning)">⏰</td>';
        return '<td style="text-align:center;font-size:12px;padding:2px 0;color:var(--danger);text-align:center">✗</td>';
      }).join('');
      const photo = getEmpPhoto(emp.id);
      const av = photo
        ? '<img src="'+photo+'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0"/>'
        : '<div style="width:20px;height:20px;border-radius:50%;background:'+getColor(emp.name)+';display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:700;flex-shrink:0">'+emp.name[0]+'</div>';
      const deductCell = overAbsent > 0
        ? '<td style="text-align:center;font-weight:700;color:var(--danger);font-size:12px">-$'+deduction.toFixed(0)+'</td>'
        : '<td style="text-align:center;color:var(--success);font-size:11px">—</td>';
      return '<tr>'
        +'<td style="padding:6px 8px;white-space:nowrap;position:sticky;left:0;z-index:1;background:var(--bg2);box-shadow:2px 0 5px rgba(0,0,0,.12)"><div style="display:flex;align-items:center;gap:6px">'+av+'<span style="font-size:12px;font-weight:600">'+emp.name+'</span></div></td>'
        +'<td style="text-align:center;font-weight:700;color:var(--success);font-size:13px;width:30px;position:sticky;left:160px;z-index:1;background:var(--bg2);padding:3px 0;text-align:center;font-weight:700">'+present+'</td>'
        +'<td style="text-align:center;font-weight:700;color:var(--warning);font-size:13px;width:30px;position:sticky;left:190px;z-index:1;background:var(--bg2);padding:3px 0;text-align:center;font-weight:700">'+late+'</td>'
        +'<td style="text-align:center;font-weight:700;color:var(--danger);font-size:13px;width:30px;position:sticky;left:220px;z-index:1;background:var(--bg2);padding:3px 0;text-align:center;font-weight:700">'+absent+'</td>'
        +'<td style="text-align:center;font-weight:700;color:var(--primary);font-size:13px;width:30px;position:sticky;left:250px;z-index:1;background:var(--bg2);padding:3px 0;text-align:center;font-weight:700">'+(swap>0?'<span style="background:rgba(99,102,241,.15);border-radius:4px;padding:1px 6px">'+swap+'</span>':'<span style="color:var(--text3)">0</span>')+'</td>'
        +'<td style="text-align:center;font-weight:700;color:'+(overAbsent>0?'var(--danger)':'var(--text3)')+';font-size:11px;position:sticky;left:280px;z-index:1;background:var(--bg2);width:36px;padding:3px 1px;text-align:center">'+overAbsent+'</td>'
        +(overAbsent>0?'<td style="text-align:center;font-weight:700;color:var(--danger);font-size:12px;position:sticky;left:316px;z-index:1;background:var(--bg2);box-shadow:3px 0 6px rgba(0,0,0,.12);width:52px;padding:3px 2px;text-align:center">-$'+deduction.toFixed(0)+'</td>':'<td style="text-align:center;color:var(--success);font-size:11px;position:sticky;left:316px;z-index:1;background:var(--bg2);box-shadow:3px 0 6px rgba(0,0,0,.12);width:52px;padding:3px 2px;text-align:center">—</td>')
        +cells
        +'<td style="text-align:center"><button class="btn btn-outline btn-sm" style="font-size:10px;padding:3px 8px" onclick="applyAbsenceDeduction('+emp.id+',\''+emp.name+'\','+absent+','+overAbsent+','+deduction+',\''+currentMonth+'\')">💸 កាត់</button></td>'
        +'</tr>';
    }).join('');

    const totals = summaries.reduce((t,s)=>({ p:t.p+s.present, l:t.l+s.late, a:t.a+s.absent, sw:t.sw+s.swap, d:t.d+s.deduction }),{p:0,l:0,a:0,sw:0,d:0});

    // Store data globally for print/export buttons
    window._monthlyAttData = { summaries, allDays, currentMonth, emps, totals, maxAbsent, rules, _attMap: attMap };

    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>📊 តារាងវត្តមានប្រចាំខែ</h2></div>'
      +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +'<input class="filter-input" type="month" value="'+currentMonth+'" onchange="renderMonthlyAttendance(this.value)" />'
      +'<button class="btn btn-primary" onclick="applyAllAbsenceDeductions(\''+currentMonth+'\')">💸 កាត់ប្រាក់ទាំងអស់</button>'
      +'<button class="btn btn-outline" onclick="renderAttendance(\''+currentMonth+'-01\')" style="border-color:var(--success);color:var(--success)">📅 ថ្ងៃទៅថ្ងៃ</button>'
      +'<button class="btn btn-outline" onclick="printMonthlyAttendance()" style="border-color:var(--primary);color:var(--primary)">🖨️ បោះពុម្ព PDF</button>'
      +'<button class="btn btn-outline" onclick="exportMonthlyAttendanceExcel()" style="border-color:var(--info);color:var(--info)">📊 Export Excel</button>'
      +'</div></div>'
      +'<div class="att-summary">'
      +'<div class="att-box"><div class="att-num" style="color:var(--success)">'+totals.p+'</div><div class="att-lbl">✅ វត្តមាន</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--warning)">'+totals.l+'</div><div class="att-lbl">⏰ យឺត</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--danger)">'+totals.a+'</div><div class="att-lbl">❌ អវត្តមាន</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--primary)">'+totals.sw+'</div><div class="att-lbl">🔄 ជំនួស</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--danger)">'+emps.filter((_,i)=>summaries[i].overAbsent>0).length+'</div><div class="att-lbl">⚠️ លើសថ្ងៃ</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--danger)">$'+totals.d.toFixed(0)+'</div><div class="att-lbl">💸 សរុបកាត់</div></div>'
      +'</div>'
      +'<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">'
      +'<span style="font-size:12px;color:var(--text3)">⚙️ ច្បាប់:</span>'
      +'<span style="font-size:12px">ថ្ងៃអវត្តមានអនុញ្ញាត: <b style="color:var(--primary)">'+maxAbsent+' ថ្ងៃ/ខែ</b></span>'
      +'<span style="font-size:12px">ម៉ោងចូល: <b style="color:var(--warning)">'+(rules.work_start_time||'08:00')+'</b> <span style="color:var(--text3)">(grace '+(rules.late_grace_minutes||15)+' នាទី)</span></span>'
      +'<span style="font-size:12px">រូបមន្ត: <b style="color:var(--danger)">ប្រាក់ខែ ÷ ថ្ងៃធ្វើការ × ថ្ងៃលើស</b></span>'
      +'<button class="btn btn-outline btn-sm" style="font-size:11px" onclick="openAbsenceRulesModal()">✏️ កែច្បាប់</button>'
      +'</div>'
      +'<div class="card" style="padding:0"><div style="overflow-x:scroll;will-change:scroll-position"><table style="min-width:max-content;border-collapse:collapse;table-layout:fixed">'
      +'<colgroup>'
      +'<col style="width:160px"/>'
      +'<col style="width:30px"/>'
      +'<col style="width:30px"/>'
      +'<col style="width:30px"/>'
      +'<col style="width:30px"/>'
      +'<col style="width:36px"/>'
      +'<col style="width:52px"/>'
      +allDays.map(()=>'<col/>').join('')
      +'<col style="width:70px"/>'
      +'</colgroup>'
      +'<thead>'
      +'<tr style="position:sticky;top:0;z-index:4;background:var(--bg2);height:28px">'
      +'<th style="width:160px;text-align:left;position:sticky;left:0;z-index:5;background:var(--bg2);box-shadow:2px 0 5px rgba(0,0,0,.2);padding:6px 8px" rowspan="2">បុគ្គលិក</th>'
      +'<th style="width:30px;text-align:center;color:var(--success);position:sticky;left:160px;z-index:5;background:var(--bg2);padding:3px 0;font-size:13px" rowspan="2" title="វត្តមាន">✅</th>'
      +'<th style="width:30px;text-align:center;color:var(--warning);position:sticky;left:190px;z-index:5;background:var(--bg2);padding:3px 0;font-size:13px" rowspan="2" title="យឺត">⏰</th>'
      +'<th style="width:30px;text-align:center;color:var(--danger);position:sticky;left:220px;z-index:5;background:var(--bg2);padding:3px 0;font-size:13px" rowspan="2" title="អវត្តមាន">❌</th>'
      +'<th style="width:30px;text-align:center;color:var(--primary);position:sticky;left:250px;z-index:5;background:var(--bg2);padding:3px 0;font-size:13px" rowspan="2" title="ប្ដូរថ្ងៃ">🔄</th>'
      +'<th style="width:36px;text-align:center;font-size:10px;position:sticky;left:280px;z-index:5;background:var(--bg2);padding:3px 1px" rowspan="2" title="លើសថ្ងៃ">លើស</th>'
      +'<th style="width:52px;text-align:center;font-size:10px;position:sticky;left:316px;z-index:5;background:var(--bg2);box-shadow:3px 0 6px rgba(0,0,0,.2);padding:3px 2px" rowspan="2" title="កាត់ប្រាក់">កាត់</th>'
      +dayThs
      +'<th style="min-width:70px;text-align:center;padding:3px 4px" rowspan="2">សកម្ម</th>'
      +'</tr>'
      +'<tr style="position:sticky;top:28px;z-index:4;background:var(--bg2);height:18px">'
      +wdThs
      +'</tr>'
      +'</thead>'
      +'<tbody>'+dayRows+'</tbody>'
      +'</table></div></div>';
  } catch(e) { showError(e.message); }
}


// ── Monthly Attendance Print PDF ──
function printMonthlyAttendance() {
  const d = window._monthlyAttData;
  if (!d) { showToast('សូមចាំ... ទំព័រមិនទាន់ Load ទេ', 'error'); return; }
  const { summaries, allDays, currentMonth, totals, maxAbsent, rules } = d;
  const cfg = getCompanyConfig();
  const monthLabel = currentMonth;
  const wdNames = ['អា','ច','អ','ព','ព្រ','សុ','ស'];

  const thDays = allDays.map(({d, wd}) => {
    const isWeekend = wd === 0 || wd === 6;
    const bg = isWeekend ? 'background:#f3f4f6;color:#9ca3af;' : '';
    return `<th style="min-width:22px;padding:2px 1px;font-size:9px;text-align:center;${bg}">${d}</th>`;
  }).join('');
  const thWds = allDays.map(({wd}) => {
    const isWeekend = wd === 0 || wd === 6;
    return `<th style="min-width:22px;padding:1px;font-size:8px;text-align:center;font-weight:400;color:${isWeekend?'#ef4444':'#6b7280'}">${wdNames[wd]}</th>`;
  }).join('');

  const bodyRows = summaries.map(({emp, present, late, absent, swap, overAbsent, deduction}, idx) => {
    const cells = allDays.map(({dd, wd}) => {
      const a = (window._monthlyAttData.emps && window._monthlyAttData._attMap) ? (window._monthlyAttData._attMap[emp.id]||{})[dd] : null;
      const isWeekend = wd === 0 || wd === 6;
      const bg = isWeekend ? 'background:#f9fafb;' : '';
      if (!a) {
        if (isWeekend) return `<td style="text-align:center;font-size:9px;color:#d1d5db;${bg}">—</td>`;
        return `<td style="text-align:center;font-size:9px;color:#ef4444;${bg}">—</td>`;
      }
      if (a.status==='present') return `<td style="text-align:center;font-size:10px;color:#16a34a;${bg}">✔</td>`;
      if (a.status==='late')    return `<td style="text-align:center;font-size:10px;color:#f59e0b;${bg}">⏰</td>`;
      if (a.status==='holiday') return `<td style="text-align:center;font-size:9px;color:#9333ea;${bg}">🎉</td>`;
      return `<td style="text-align:center;font-size:10px;color:#ef4444;${bg}">✗</td>`;
    }).join('');
    const rowBg = idx % 2 === 0 ? '' : 'background:#f9fafb;';
    return `<tr style="${rowBg}">
      <td style="padding:4px 6px;font-size:11px;font-weight:600;white-space:nowrap">${idx+1}. ${emp.name}</td>
      <td style="text-align:center;font-weight:700;color:#16a34a;font-size:11px">${present}</td>
      <td style="text-align:center;font-weight:700;color:#f59e0b;font-size:11px">${late}</td>
      <td style="text-align:center;font-weight:700;color:#ef4444;font-size:11px">${absent}</td>
      <td style="text-align:center;font-weight:700;color:#6366f1;font-size:11px">${swap||0}</td>

      ${cells}
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Monthly Attendance ${monthLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Hanuman',Arial,sans-serif;font-size:11px;color:#111;padding:8px;background:#fff}
    @media print{@page{size:A4 landscape;margin:6mm}body{padding:0}}
    .header{text-align:center;margin-bottom:10px}
    .company{font-size:16px;font-weight:700;color:#1e3a5f}
    .title{font-size:13px;font-weight:700;color:#374151;margin-top:2px}
    .subtitle{font-size:10px;color:#6b7280;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#1e3a5f;color:white;padding:4px 2px;border:1px solid #d1d5db}
    td{border:1px solid #e5e7eb;padding:3px 2px}
    .summary-row{background:#f0f4ff!important;font-weight:700}
    .summary-box{display:inline-block;margin:4px 8px;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700}
    .sig{margin-top:30px;display:flex;justify-content:space-between;padding:0 40px}
    .sig-col{text-align:center;min-width:150px}
    .sig-line{border-top:1px solid #374151;margin-top:40px;padding-top:4px;font-size:10px}
    .no-print{display:none}
    @media screen{.no-print{display:block;text-align:center;margin-bottom:10px}}
    .btn-print{background:#1e3a5f;color:white;border:none;padding:8px 24px;border-radius:6px;cursor:pointer;font-size:13px;margin:4px}
  </style>
  </head><body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
    <button class="btn-print" style="background:#6b7280" onclick="window.close()">✕ បិទ</button>
  </div>
  <div class="header">
    <div class="company">${cfg.company_name||'HR Pro System'}</div>
    <div class="title">📊 តារាងវត្តមានប្រចាំខែ — ${monthLabel}</div>
    <div class="subtitle">បោះពុម្ពថ្ងៃទី: ${new Date().toLocaleDateString('km-KH')} | ថ្ងៃអវត្តមានអនុញ្ញាត: ${maxAbsent} ថ្ងៃ/ខែ</div>
  </div>
  <div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap">
    <span class="summary-box" style="background:#dcfce7;color:#16a34a">✅ វត្តមាន: ${totals.p}</span>
    <span class="summary-box" style="background:#fef9c3;color:#92400e">⏰ យឺត: ${totals.l}</span>
    <span class="summary-box" style="background:#fee2e2;color:#ef4444">❌ អវត្តមាន: ${totals.a}</span>
    <span class="summary-box" style="background:#ede9fe;color:#6366f1">🔄 ជំនួស: ${totals.sw}</span>
    <span class="summary-box" style="background:#fee2e2;color:#ef4444">💸 សរុបកាត់: $${totals.d.toFixed(0)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="min-width:130px;text-align:left;padding:4px 6px" rowspan="2">បុគ្គលិក</th>
        <th style="min-width:30px;color:#86efac" rowspan="2" title="វត្តមាន">✅</th>
        <th style="min-width:30px;color:#fde68a" rowspan="2" title="យឺត">⏰</th>
        <th style="min-width:30px;color:#fca5a5" rowspan="2" title="អវត្តមាន">❌</th>
        <th style="min-width:30px;color:#c4b5fd" rowspan="2" title="ជំនួស">🔄</th>
        
        ${thDays}
      </tr>
      <tr>${thWds}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr class="summary-row">
        <td style="padding:4px 6px;font-size:11px">សរុប</td>
        <td style="text-align:center;color:#16a34a">${totals.p}</td>
        <td style="text-align:center;color:#f59e0b">${totals.l}</td>
        <td style="text-align:center;color:#ef4444">${totals.a}</td>
        <td style="text-align:center;color:#6366f1">${totals.sw}</td>
        
        ${allDays.map(()=>'<td></td>').join('')}
      </tr>
    </tfoot>
  </table>
  <div class="sig">
    <div class="sig-col"><div class="sig-line">ហត្ថលេខាអ្នករៀបចំ</div></div>
    <div class="sig-col"><div class="sig-line">ហត្ថលេខា HR</div></div>
    <div class="sig-col"><div class="sig-line">ហត្ថលេខាអ្នកគ្រប់គ្រង</div></div>
  </div>
  </body></html>`;
  printHTML(html);
}

// ── Monthly Attendance Export Excel ──
async function exportMonthlyAttendanceExcel() {
  const d = window._monthlyAttData;
  if (!d) { showToast('សូមចាំ... ទំព័រមិនទាន់ Load ទេ', 'error'); return; }
  const { summaries, allDays, currentMonth, totals, maxAbsent, rules } = d;
  const cfg = getCompanyConfig();
  const wdNames = ['អា','ច','អ','ព','ព្រ','សុ','ស'];
  showToast('កំពុង Export Excel...', 'info');

  // Re-fetch swapData to rebuild offDateMap (same as renderMonthlyAttendance)
  let offDateMap = {};
  let swapMap = {};
  try {
    const swapDataRaw = await api('GET','/dayswap').catch(()=>({records:[]}));
    (swapDataRaw.records||[]).forEach(s => {
      if (s.status !== 'approved') return;
      if (s.swap_date && s.swap_date.startsWith(currentMonth)) {
        if (!swapMap[s.employee_id]) swapMap[s.employee_id] = {};
        const dd = s.swap_date.slice(-2);
        swapMap[s.employee_id][dd] = s;
      }
      if (s.off_date && s.off_date.startsWith(currentMonth)) {
        if (!offDateMap[s.employee_id]) offDateMap[s.employee_id] = {};
        const dd = s.off_date.slice(-2);
        offDateMap[s.employee_id][dd] = s;
      }
    });
  } catch(_) {}

  try {
    // ── Sheet 1: Matrix (ដូច PDF) ────────────────────────────────
    // Headers: ឈ្មោះ | ✅ | ⏰ | ❌ | 🔄 | លើស | កាត់ | 1 | 2 | ... | 31
    const dayNums   = allDays.map(({d}) => d);
    const dayLabels = allDays.map(({d, wd}) => d + '(' + wdNames[wd] + ')');

    const matrixHeaders = ['#', 'ឈ្មោះបុគ្គលិក', 'នាយកដ្ឋាន', '✅ វត្តមាន', '⏰ យឺត', '❌ អវត្តមាន', '🔄 ជំនួស', 'លើសថ្ងៃ', 'កាត់ ($)', ...dayLabels];

    // Sub-header row: weekday names aligned to day columns
    const subHeaderRow = ['', '', '', '', '', '', '', '', '', ...allDays.map(({wd}) => wdNames[wd])];

    const matrixRows = [subHeaderRow];

    summaries.forEach(({emp, present, late, absent, swap, overAbsent, deduction}, i) => {
      const attMap = d._attMap || {};
      const empOffDays = typeof parseOffDays === 'function' ? parseOffDays(emp) : [0]; // default: Sunday off

      const dayCells = allDays.map(({dd, wd}) => {
        const swapRec   = (swapMap[emp.id]||{})[dd];
        const compSwap  = (offDateMap[emp.id]||{})[dd];
        const a         = (attMap[emp.id]||{})[dd];
        const isEmpOff  = empOffDays.indexOf(wd) !== -1;

        // Holiday
        if (a && a.status === 'holiday') return '🎉';
        // Employee OFF day
        if (isEmpOff) {
          if (swapRec) return '🔄';   // came to work on off day
          return 'OFF';
        }
        // Compensation OFF day (off_date)
        if (compSwap) return 'OFF+';
        // No record = absent
        if (!a) return '—';
        if (a.status === 'present') return '✔';
        if (a.status === 'late')    return '⏰';
        if (a.status === 'absent')  return '✗';
        return '✗';
      });

      matrixRows.push([
        i + 1,
        emp.name,
        emp.department || '',
        present,
        late,
        absent,
        swap || 0,
        overAbsent,
        overAbsent > 0 ? -deduction : 0,
        ...dayCells
      ]);
    });

    // Total row
    matrixRows.push(['', '', '']);
    matrixRows.push([
      '', 'សរុប (Total)', '',
      totals.p, totals.l, totals.a, totals.sw, '',
      totals.d > 0 ? -totals.d : 0,
      ...allDays.map(() => '')
    ]);

    // ── Sheet 2: Detail Summary ───────────────────────────────────
    const summaryHeaders = ['#', 'ឈ្មោះបុគ្គលិក', 'នាយកដ្ឋាន', '✅ វត្តមាន', '⏰ យឺត', '❌ អវត្តមាន', '🔄 ជំនួស', 'ថ្ងៃធ្វើការ', 'ថ្ងៃលើស', 'អត្រាថ្ងៃ ($)', 'កាត់ ($)'];
    const summaryRows = summaries.map(({emp, present, late, absent, swap, overAbsent, deduction, dailyRate, workingDaysCount}, i) => [
      i + 1,
      emp.name,
      emp.department || '',
      present,
      late,
      absent,
      swap || 0,
      workingDaysCount || '',
      overAbsent,
      dailyRate ? +dailyRate.toFixed(2) : 0,
      overAbsent > 0 ? -deduction : 0
    ]);
    summaryRows.push(['', '', '']);
    summaryRows.push(['', 'សរុប (Total)', '', totals.p, totals.l, totals.a, totals.sw, '', '', '', totals.d > 0 ? -totals.d : 0]);

    const blob = buildXLSX([
      { name: 'វត្តមាន Matrix ' + currentMonth, headers: matrixHeaders, rows: matrixRows },
      { name: 'Summary ' + currentMonth,        headers: summaryHeaders, rows: summaryRows },
    ]);
    downloadBlob(blob, (cfg.company_name||'HR') + '_Monthly_Attendance_' + currentMonth + '.xlsx');
    showToast('Download Excel ✅', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// Open rules modal for absence deduction settings
function openAbsenceRulesModal() {
  const rules = getSalaryRules();
  const maxAbsent = rules.max_absent_days !== undefined ? rules.max_absent_days : 2;
  $('modal-title').textContent = '⚙️ ច្បាប់កាត់ប្រាក់អវត្តមាន';
  $('modal-body').innerHTML =
    '<div style="margin-bottom:14px;padding:12px;background:var(--bg3);border-radius:10px;font-size:13px;color:var(--text3)">'
    +'💡 ប្រាក់នឹងត្រូវកាត់ ពេលបុគ្គលិកអវត្តមានលើសថ្ងៃអនុញ្ញាត<br/>'
    +'<b>រូបមន្ត:</b> ប្រាក់ខែ ÷ ថ្ងៃធ្វើការក្នុងខែ × ថ្ងៃអវត្តមានលើស'
    +'</div>'
    +'<div class="form-grid">'
    +'<div class="form-group"><label class="form-label">ថ្ងៃអវត្តមានអនុញ្ញាតក្នុង ១ ខែ</label>'
    +'<input class="form-control" id="rule-max-absent" type="number" min="0" value="'+maxAbsent+'" /></div>'
    +'</div>'
    +'<div id="rule-preview" style="padding:12px;background:var(--bg3);border-radius:8px;margin-bottom:14px;font-size:13px;text-align:center">'
    +'ឧទាហរណ៍: ប្រាក់ខែ $1000 · ថ្ងៃធ្វើការ 26 · អវត្តមាន 5 ថ្ងៃ → លើស <b>'+(Math.max(0,5-maxAbsent))+'</b> ថ្ងៃ → កាត់ <b style="color:var(--danger)">$'+((Math.max(0,5-maxAbsent)*(1000/26)).toFixed(2))+'</b>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" onclick="saveAbsenceRules()">💾 រក្សាទុក</button>'
    +'</div>';
  // Live preview
  const el = document.getElementById('rule-max-absent');
  if(el) el.addEventListener('input',()=>{
    const mx = parseInt(document.getElementById('rule-max-absent')?.value)||0;
    const ov = Math.max(0, 5-mx);
    const prev = document.getElementById('rule-preview');
    if(prev) prev.innerHTML='ឧទាហរណ៍: ប្រាក់ខែ $1000 · ថ្ងៃធ្វើការ 26 · អវត្តមាន 5 ថ្ងៃ → លើស <b>'+ov+'</b> ថ្ងៃ → កាត់ <b style="color:var(--danger)">$'+((ov*(1000/26)).toFixed(2))+'</b>';
  });
  openModal();
}

function saveAbsenceRules() {
  const rules = getSalaryRules();
  rules.max_absent_days = parseInt(document.getElementById('rule-max-absent')?.value)||0;
  saveSalaryRules(rules);
  showToast('រក្សាទុកច្បាប់បានជោគជ័យ!','success');
  closeModal();
  // Refresh monthly view
  const inp = document.querySelector('input[type="month"]');
  if(inp) renderMonthlyAttendance(inp.value);
}

// Apply deduction to one employee's salary
async function applyAbsenceDeduction(empId, empName, absentDays, overAbsent, deduction, month) {
  if (overAbsent <= 0) { showToast(empName+': គ្មានលើសថ្ងៃ — មិនចាំបាច់កាត់','info'); return; }
  if (!confirm('កាត់ $'+deduction.toFixed(2)+' ចំពោះ '+empName+' (អវត្តមាន '+absentDays+' ថ្ងៃ, លើស '+overAbsent+' ថ្ងៃ)?')) return;
  try {
    // Get or create salary record for this month
    const salData = await api('GET','/salary?month='+month);
    let rec = (salData.records||[]).find(r=>r.employee_id===empId);
    if (!rec) {
      // Find employee salary
      const emp = (state.employees||[]).find(e=>e.id===empId);
      const base = emp ? (emp.salary||0) : 0;
      await api('POST','/salary',{ employee_id:empId, month, base_salary:base, bonus:0, deduction:deduction, net_salary:base-deduction });
      showToast('បន្ថែម + កាត់ $'+deduction.toFixed(2)+' ចំពោះ '+empName+'!','success');
    } else {
      const newDeduct = (rec.deduction||0) + deduction;
      const newNet = (rec.base_salary||0) + (rec.bonus||0) - newDeduct;
      await api('PUT','/salary/'+rec.id,{ ...rec, deduction:newDeduct, net_salary:newNet, notes:(rec.notes?rec.notes+' | ':'')+'អវត្តមាន '+absentDays+' ថ្ងៃ (-$'+deduction.toFixed(2)+')' });
      showToast('កាត់ $'+deduction.toFixed(2)+' ចំពោះ '+empName+' បានជោគជ័យ!','success');
    }
    // Refresh
    const inp = document.querySelector('input[type="month"]');
    renderMonthlyAttendance(inp ? inp.value : month);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// Apply deductions to ALL employees that exceeded absent days
async function applyAllAbsenceDeductions(month) {
  const rules = getSalaryRules();
  const maxAbsent = rules.max_absent_days !== undefined ? rules.max_absent_days : 2;
  const [y,m] = month.split('-').map(Number);
  const daysInMonth = new Date(y,m,0).getDate();
  showLoading();
  try {
    const [empData] = await Promise.all([api('GET','/employees?limit=500')]);
    const emps = empData.employees || [];
    let allRecords = [];
    try { const r1 = await api('GET','/attendance?month='+month+'&limit=9999'); allRecords = r1.records||[]; } catch(_){}
    if (!allRecords.length) {
      const promises = [];
      for(let d=1;d<=daysInMonth;d++){ const dd=String(d).padStart(2,'0'); promises.push(api('GET','/attendance?date='+month+'-'+dd).catch(()=>({records:[]}))); }
      const results = await Promise.all(promises);
      results.forEach(r=>{allRecords=allRecords.concat(r.records||[]);});
    }
    const attMap = {};
    allRecords.forEach(a=>{ if(!attMap[a.employee_id])attMap[a.employee_id]={}; attMap[a.employee_id][(a.date||'').slice(-2)]=a; });
    // Build all days of month
    const allMonthDaysArr = [];
    for(let d=1;d<=daysInMonth;d++){ const dt=new Date(y,m-1,d); allMonthDaysArr.push({dd:String(d).padStart(2,'0'),wd:dt.getDay()}); }
    const toDeduct = emps.map(emp=>{
      // Per-employee off days (default: Sunday=0)
      const empOff = parseOffDays(emp);
      const empDays = allMonthDaysArr.filter(x=>empOff.indexOf(x.wd)===-1);
      const workingDaysCount = empDays.length;
      const rec=attMap[emp.id]||{}; let absent=0;
      empDays.forEach(x=>{ const a=rec[x.dd]; if(!a||a.status==='absent') absent++; });
      const over=Math.max(0,absent-maxAbsent);
      const dailyRate = workingDaysCount > 0 ? (emp.salary||0) / workingDaysCount : 0;
      const deduction = parseFloat((over * dailyRate).toFixed(2));
      return { emp, absent, over, deduction };
    }).filter(x=>x.over>0);
    if (!toDeduct.length) { showToast('គ្មានបុគ្គលិកណាលើសថ្ងៃ!','success'); renderMonthlyAttendance(month); return; }
    if (!confirm('កាត់ប្រាក់ '+toDeduct.length+' នាក់?\n'+toDeduct.map(x=>x.emp.name+' -$'+x.deduction.toFixed(2)+' (លើស '+x.over+' ថ្ងៃ)').join('\n'))) { renderMonthlyAttendance(month); return; }
    const salData = await api('GET','/salary?month='+month);
    let applied=0;
    for(const {emp,absent,over,deduction} of toDeduct) {
      try {
        let rec=(salData.records||[]).find(r=>r.employee_id===emp.id);
        if(!rec){ await api('POST','/salary',{employee_id:emp.id,month,base_salary:emp.salary||0,bonus:0,deduction,net_salary:(emp.salary||0)-deduction,notes:'អវត្តមាន '+absent+' ថ្ងៃ, លើស '+over+' ថ្ងៃ (-$'+deduction.toFixed(2)+')'}); }
        else { const nd=(rec.deduction||0)+deduction; const nn=(rec.base_salary||0)+(rec.bonus||0)-nd; await api('PUT','/salary/'+rec.id,{...rec,deduction:nd,net_salary:nn,notes:(rec.notes?rec.notes+' | ':'')+'អវត្តមាន '+absent+' ថ្ងៃ (-$'+deduction.toFixed(2)+')'}); }
        applied++;
      } catch(_){}
    }
    showToast('កាត់ប្រាក់ '+applied+' នាក់ បានជោគជ័យ!','success');
    renderMonthlyAttendance(month);
  } catch(e) { showError(e.message); }
}

// Quick checkout button
async function quickCheckOut(empId, date) {
  const now = new Date();
  const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  try {
    await api('POST','/attendance',{ employee_id:empId, date, check_out:time, status:'present' });
    showToast('ចុះម៉ោងចេញ '+time+' បានជោគជ័យ!','success');
    renderAttendance(date);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// QR Scanner modal (uses camera)
async function openQRScanModal(date) {
  // Always load fresh employee list before opening scanner
  try {
    const d = await api('GET', '/employees?limit=500');
    state.employees = d.employees || [];
  } catch(_) {}

  $('modal-title').textContent = '📷 ស្កេន QR — វត្តមាន';
  $('modal-body').innerHTML =
    // Camera box
    '<div style="position:relative;width:100%;max-width:300px;margin:0 auto 14px;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:1">'
    +'<video id="qr-video" style="width:100%;height:100%;object-fit:cover" autoplay playsinline muted></video>'
    // corner guides
    +'<div style="position:absolute;inset:0;pointer-events:none">'
    +'<div style="position:absolute;top:16px;left:16px;width:40px;height:40px;border-top:3px solid var(--primary);border-left:3px solid var(--primary);border-radius:4px 0 0 0"></div>'
    +'<div style="position:absolute;top:16px;right:16px;width:40px;height:40px;border-top:3px solid var(--primary);border-right:3px solid var(--primary);border-radius:0 4px 0 0"></div>'
    +'<div style="position:absolute;bottom:16px;left:16px;width:40px;height:40px;border-bottom:3px solid var(--primary);border-left:3px solid var(--primary);border-radius:0 0 0 4px"></div>'
    +'<div style="position:absolute;bottom:16px;right:16px;width:40px;height:40px;border-bottom:3px solid var(--primary);border-right:3px solid var(--primary);border-radius:0 0 4px 0"></div>'
    +'<div id="qr-scan-line" style="position:absolute;left:16px;right:16px;height:2px;background:var(--primary);top:50%;animation:qrScanLine 2s ease-in-out infinite;box-shadow:0 0 8px var(--primary)"></div>'
    +'</div>'
    +'<div id="qr-scan-status" style="position:absolute;bottom:0;left:0;right:0;text-align:center;color:white;font-size:11px;background:rgba(0,0,0,.6);padding:5px">📷 កំពុងស្កេន...</div>'
    +'</div>'
    // Type selector: Check-in or Check-out
    +'<div style="display:flex;gap:6px;margin-bottom:12px;background:var(--bg3);padding:4px;border-radius:8px">'
    +'<button id="scan-type-in" class="btn btn-success btn-sm" style="flex:1;border:none" onclick="setScanType(\'in\')">🟢 ចូល</button>'
    +'<button id="scan-type-out" class="btn btn-outline btn-sm" style="flex:1;border:none" onclick="setScanType(\'out\')">🔴 ចេញ</button>'
    +'</div>'
    // Manual input
    +'<div style="background:var(--bg3);border-radius:10px;padding:12px;margin-bottom:10px">'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:8px;text-align:center">ឬវាយ ID / ឈ្មោះ / custom ID</div>'
    +'<div style="display:flex;gap:6px">'
    +'<input class="form-control" id="qr-manual-id" placeholder="e.g. EMP-001, 4, សាន..." style="flex:1" '
    +'onkeydown="if(event.key===\'Enter\')processQRScan(this.value,\''+date+'\')" />'
    +'<button class="btn btn-primary" onclick="processQRScan($(\'qr-manual-id\').value,\''+date+'\')">'
    +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg></button>'
    +'</div>'
    +'</div>'
    // Results log
    +'<div id="qr-result-log" style="max-height:150px;overflow-y:auto;border-radius:8px"></div>'
    +'<div class="form-actions" style="margin-top:10px">'
    +'<button class="btn btn-outline btn-sm" onclick="stopQRScanner();closeModal()">🚪 បិទ</button>'
    +'<span id="qr-count" style="font-size:12px;color:var(--text3);margin-left:8px">0 នាក់</span>'
    +'</div>'
    // Scan line animation
    +'<style>@keyframes qrScanLine{0%,100%{top:20%}50%{top:80%}}</style>';

  // State
  window._scanType = 'in';
  window._scanCount = 0;
  openModal();
  startQRScanner(date);
}

function setScanType(type) {
  window._scanType = type;
  const btnIn  = document.getElementById('scan-type-in');
  const btnOut = document.getElementById('scan-type-out');
  if (!btnIn || !btnOut) return;
  if (type === 'in') {
    btnIn.className  = 'btn btn-success btn-sm';  btnIn.style.border  = 'none';
    btnOut.className = 'btn btn-outline btn-sm';   btnOut.style.border = 'none';
  } else {
    btnIn.className  = 'btn btn-outline btn-sm';   btnIn.style.border  = 'none';
    btnOut.className = 'btn btn-danger btn-sm';    btnOut.style.border = 'none';
  }
}

let qrScanStream = null;
let qrScanActive = false;

// ── jsQR loader ──
var _jsQR = null;
function loadJsQR() {
  if (_jsQR || window.jsQR) { _jsQR = _jsQR || window.jsQR; return Promise.resolve(_jsQR); }
  return new Promise(res => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    s.onload = () => { _jsQR = window.jsQR; res(_jsQR); };
    s.onerror = () => res(null);
    document.head.appendChild(s);
  });
}

async function startQRScanner(date) {
  qrScanActive = true;
  const statusEl = () => document.getElementById('qr-scan-status');

  // Load jsQR in background
  loadJsQR();

  // Request camera
  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280, min: 320 },
        height: { ideal: 720,  min: 240 },
      }
    };
    qrScanStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(err) {
    let msg = '❌ Camera error';
    if (err.name === 'NotAllowedError')  msg = '❌ សូម Allow Camera → Reload';
    if (err.name === 'NotFoundError')    msg = '❌ Camera រកមិនឃើញ';
    if (err.name === 'NotReadableError') msg = '❌ Camera កំពុងប្រើដោយ App ផ្សេង';
    const s = statusEl(); if (s) { s.textContent = msg; s.style.background = 'rgba(239,71,111,.8)'; }
    console.error('[QR Camera]', err.name, err.message);
    return;
  }

  const video = document.getElementById('qr-video');
  if (!video) { stopQRScanner(); return; }

  // Attach stream
  video.srcObject = qrScanStream;
  video.setAttribute('playsinline', true);
  video.setAttribute('muted', true);
  video.muted = true;

  // Play and wait for data
  try { await video.play(); } catch(e) { console.warn('video.play():', e); }

  const s = statusEl();
  if (s) s.textContent = '📷 Camera ត្រៀមរួច — ស្កេន QR...';

  // Start decode loop
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d', { willReadFrequently: true });
  let   lastVal = '';
  let   frameCount = 0;

  function decodeFrame() {
    if (!qrScanActive || !qrScanStream) return;

    const vid = document.getElementById('qr-video');
    if (!vid) { stopQRScanner(); return; }

    frameCount++;
    const ready = vid.readyState >= 2; // HAVE_CURRENT_DATA or better
    const hasSize = vid.videoWidth > 0 && vid.videoHeight > 0;

    if (ready && hasSize) {
      canvas.width  = vid.videoWidth;
      canvas.height = vid.videoHeight;
      ctx.drawImage(vid, 0, 0);

      // Try jsQR first
      const jsqr = _jsQR || window.jsQR;
      if (jsqr) {
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result  = jsqr(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'attemptBoth'
          });
          if (result && result.data && result.data !== lastVal) {
            lastVal = result.data;
            onQRDetected(result.data, date);
            setTimeout(() => { lastVal = ''; }, 2500);
          }
        } catch(e) {}
      }

      // Also try BarcodeDetector (async, Chrome/Edge)
      if ('BarcodeDetector' in window && frameCount % 5 === 0) {
        new BarcodeDetector({ formats: ['qr_code'] })
          .detect(canvas).then(codes => {
            if (codes.length && codes[0].rawValue !== lastVal) {
              lastVal = codes[0].rawValue;
              onQRDetected(lastVal, date);
              setTimeout(() => { lastVal = ''; }, 2500);
            }
          }).catch(() => {});
      }
    } else if (frameCount % 30 === 0) {
      // Debug every ~1s
      console.log('[QR] frame='+frameCount+' readyState='+vid.readyState+' size='+vid.videoWidth+'x'+vid.videoHeight);
    }

    requestAnimationFrame(decodeFrame);
  }

  // Small delay to let video stabilize on Android
  setTimeout(() => { requestAnimationFrame(decodeFrame); }, 300);
}

function onQRDetected(val, date) {
  const s = document.getElementById('qr-scan-status');
  if (s) { s.textContent = '🔍 អានបាន: ' + val; s.style.background = 'rgba(59,130,246,.8)'; }
  setTimeout(() => {
    const sx = document.getElementById('qr-scan-status');
    if (sx) { sx.textContent = '📷 ស្កេន...'; sx.style.background = 'rgba(0,0,0,.6)'; }
  }, 1500);
  processQRScan(val, date);
}

function stopQRScanner() {
  qrScanActive = false;
  if (qrScanStream) {
    qrScanStream.getTracks().forEach(t => t.stop());
    qrScanStream = null;
  }
}

let qrLastScan = ''; // keep for backward compat


// ── Smart employee lookup ──
function findEmployeeByQR(raw) {
  if (!raw) return null;
  const s       = raw.trim();
  // Strip leading # and normalize EMP_001 / EMP-001 / EMP001 → just digits
  const sClean  = s.replace(/^#+/, '');
  // Extract digits only (handles "EMP_001" → "001" → 1, "EMP-013" → "013" → 13)
  const sDigits = sClean.replace(/\D/g, '');
  const sNum    = parseInt(sDigits) || 0;
  const emps    = state.employees;

  if (!emps || emps.length === 0) return null;
  console.log('[QR] scan="'+s+'" clean="'+sClean+'" digits="'+sDigits+'" num='+sNum+' emps='+emps.length);

  for (const e of emps) {
    const cid    = (e.custom_id || '').trim().replace(/^#+/, '');
    const cidDig = cid.replace(/\D/g, '');
    const cidNum = parseInt(cidDig) || 0;
    const autoPad4 = String(e.id).padStart(4, '0');
    const autoPad3 = String(e.id).padStart(3, '0');

    // Match 1: exact raw match (case-insensitive)
    if (cid && cid.toLowerCase() === sClean.toLowerCase()) {
      console.log('[QR] exact cid:', e.name); return e;
    }
    // Match 2: numeric of custom_id == numeric of QR (e.g. "001"=="1", "EMP_001"=="1")
    if (cidNum > 0 && sNum > 0 && cidNum === sNum) {
      console.log('[QR] num cid:', e.name); return e;
    }
    // Match 3: QR digits == padded db id "0004" or "004"
    if (sNum > 0 && (sDigits === autoPad4 || sDigits === autoPad3)) {
      console.log('[QR] padded id:', e.name); return e;
    }
    // Match 4: plain number == db id
    if (sNum > 0 && e.id === sNum) {
      console.log('[QR] db id:', e.name); return e;
    }
    // Match 5: QR contains "EMP" + number matching db id (e.g. "EMP_013", "EMP-013", "EMP013")
    if (sClean.toUpperCase().startsWith('EMP') && sNum > 0 && e.id === sNum) {
      console.log('[QR] EMP format id:', e.name); return e;
    }
  }

  // Match 6: partial name (fallback)
  if (sClean.length >= 2 && !/^\d+$/.test(sClean)) {
    const lower = sClean.toLowerCase();
    const nm = emps.find(e => e.name && e.name.toLowerCase().includes(lower));
    if (nm) { console.log('[QR] name:', nm.name); return nm; }
  }

  console.log('[QR] NO MATCH "'+s+'" digits='+sNum+' | IDs:',
    emps.map(e=>(e.custom_id?'cid='+e.custom_id:'')+'id='+e.id).join(' | '));
  return null;
}

async function processQRScan(raw, date) {
  if (!raw || !raw.trim()) { showToast('សូមបញ្ចូល ID!', 'error'); return; }

  // ── Ensure employees loaded (always refresh for QR scan accuracy) ──
  if (!state.employees || state.employees.length === 0) {
    try {
      const d = await api('GET', '/employees?limit=500');
      state.employees = d.employees || [];
    } catch(e) { showToast('Load employees failed: '+e.message, 'error'); return; }
  }

  const emp = findEmployeeByQR(raw);
  if (!emp) {
    // Try reloading employees once more in case of stale data
    try {
      const d = await api('GET', '/employees?limit=500');
      state.employees = d.employees || [];
    } catch(_) {}
    const emp2 = findEmployeeByQR(raw);
    if (!emp2) {
      showToast('មិនស្គាល់ QR: "' + raw + '" — សូមផ្ទៀងផ្ទាត់ ID បុគ្គលិក', 'error');
      const s = document.getElementById('qr-scan-status');
      if (s) { s.textContent = '❌ QR មិនស្គាល់: ' + raw; s.style.background = 'rgba(239,71,111,.7)'; }
      setTimeout(() => {
        const sx = document.getElementById('qr-scan-status');
        if (sx) { sx.textContent = '📷 កំពុងស្កេន...'; sx.style.background = 'rgba(0,0,0,.6)'; }
      }, 2000);
      return;
    }
    // Found on retry
    return processQRScan_continue(emp2, raw, date);
  }
  return processQRScan_continue(emp, raw, date);
}

async function processQRScan_continue(emp, raw, date) {
  const now   = new Date();
  const time  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const type  = window._scanType || 'in';
  const _rules = getSalaryRules();
  const _startParts = (_rules.work_start_time || '08:00').split(':').map(Number);
  const _graceMin = _rules.late_grace_minutes !== undefined ? _rules.late_grace_minutes : 15;
  const _limitMin = _startParts[0] * 60 + _startParts[1] + _graceMin;
  const _nowMin = now.getHours() * 60 + now.getMinutes();
  const isLate = type === 'in' && (_nowMin > _limitMin);
  const status = type === 'in' ? (isLate ? 'late' : 'present') : 'present';

  const payload = { employee_id: emp.id, date };
  if (type === 'in')  { payload.check_in  = time; payload.status = status; }
  else                { payload.check_out = time; }

  try {
    await api('POST', '/attendance', payload);
    window._scanCount = (window._scanCount || 0) + 1;

    // Update count label
    const cnt = document.getElementById('qr-count');
    if (cnt) cnt.textContent = window._scanCount + ' នាក់';

    // Update status bar — success
    const sv = document.getElementById('qr-scan-status');
    const icon = type === 'in' ? '✅' : '🚪';
    const label = type === 'in' ? 'ចូល ' : 'ចេញ ';
    const bg = type === 'in' ? 'rgba(6,214,160,.8)' : 'rgba(255,107,53,.8)';
    if (sv) { sv.textContent = icon + ' ' + emp.name + ' — ' + label + time; sv.style.background = bg; }

    // ── AUTO STOP + CLOSE after success ──────────────────
    setTimeout(() => {
      stopQRScanner();
      // Show brief success overlay then close
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(6,214,160,.15);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;pointer-events:none';
      overlay.innerHTML =
        '<div style="background:var(--bg2);border:2px solid var(--success);border-radius:20px;padding:28px 40px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.5)">'
        +'<div style="font-size:48px;margin-bottom:10px">'+(type==='in'?'✅':'🚪')+'</div>'
        +'<div style="font-size:18px;font-weight:800;color:var(--text)">'+emp.name+'</div>'
        +'<div style="font-size:13px;color:var(--success);font-weight:700;margin-top:4px">'+(type==='in'?'ចូល ':'ចេញ ')+time+(isLate?' ⏰ យឺត':'')+'</div>'
        +'<div style="font-size:11px;color:var(--text3);margin-top:8px">'+(emp.custom_id||emp.department_name||'')+'</div>'
        +'</div>';
      document.body.appendChild(overlay);
      setTimeout(() => {
        overlay.remove();
        closeModal();
        renderAttendance(date);
      }, 1400);
    }, 300);

    // Log entry
    const log = document.getElementById('qr-result-log');
    if (log) {
      const photo = getEmpPhoto(emp.id);
      const av = photo
        ? '<img src="'+photo+'" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0"/>'
        : '<div style="width:28px;height:28px;border-radius:50%;background:'+getColor(emp.name)+';display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;flex-shrink:0">'+emp.name[0]+'</div>';
      const borderColor = type === 'in' ? 'rgba(6,214,160,.3)' : 'rgba(255,107,53,.3)';
      const textColor   = type === 'in' ? 'var(--success)' : 'var(--primary)';
      log.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:8px;margin-bottom:5px;border-left:3px solid '+borderColor+'">'
        + av
        + '<div style="min-width:0"><div style="font-weight:700;font-size:12px">'+emp.name+'</div>'
        + '<div style="font-size:10px;color:var(--text3)">'+(emp.custom_id||'EMP'+String(emp.id).padStart(3,'0'))+' · '+emp.department_name+'</div></div>'
        + '<div style="margin-left:auto;text-align:right;flex-shrink:0">'
        + '<div style="font-size:11px;font-weight:700;color:'+textColor+'">'+(type==='in'?'▶ ':'◀ ')+time+'</div>'
        + '<div style="font-size:9px;color:var(--text3)">'+(type==='in'?(isLate?'⏰ យឺត':'✅ ទាន់'):'🚪 ចេញ')+'</div>'
        + '</div></div>'
        + log.innerHTML;
    }

    // Clear manual input
    const inp = document.getElementById('qr-manual-id');
    if (inp) inp.value = '';

  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}



// ===== BULK ABSENCE MODAL =====
// ===== BULK ABSENCE / LEAVE MODAL =====
// ===== BULK ABSENCE / LEAVE MODAL (per-employee date) =====
function openBulkAbsenceModal(dateVal) {
  var d = dateVal || new Date().toISOString().split('T')[0];
  var emps = state.employees || [];
  if (!emps.length) { showToast('មិនទាន់មានបុគ្គលិក!', 'error'); return; }

  // Build row per employee: checkbox + avatar + name + individual date picker
  var empRows = emps.map(function(e) {
    var photo = getEmpPhoto(e.id);
    var av = photo
      ? '<img src="' + photo + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0"/>'
      : '<div style="width:32px;height:32px;border-radius:50%;background:' + getColor(e.name) + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0">' + (e.name||'?')[0] + '</div>';

    return '<div class="ba-row" id="ba-row-' + e.id + '" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;border:1.5px solid var(--border);margin-bottom:6px;transition:all .15s">'
      + '<input type="checkbox" class="ba-chk" data-id="' + e.id + '" style="width:16px;height:16px;cursor:pointer;flex-shrink:0"'
      + ' onchange="'
      + 'var row=document.getElementById(\'ba-row-' + e.id + '\');'
      + 'var dp=document.getElementById(\'ba-date-' + e.id + '\');'
      + 'row.style.borderColor=this.checked?\'var(--primary)\':\'var(--border)\';'
      + 'row.style.background=this.checked?\'var(--bg2)\':\'\';'
      + 'dp.disabled=!this.checked;dp.style.opacity=this.checked?\'1\':\'0.4\';'
      + '"/>'
      + av
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + e.name + '</div>'
      + '<div style="font-size:11px;color:var(--text3)">' + (e.position||'&nbsp;') + '</div>'
      + '</div>'
      + '<input type="date" id="ba-date-' + e.id + '" value="' + d + '" disabled'
      + ' style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);opacity:0.4;width:130px;flex-shrink:0"'
      + '/>'
      + '</div>';
  }).join('');

  $('modal-title').textContent = '\uD83D\uDCCB កត់អវត្តមាន / ឈប់ (ម្នាក់ៗ)';
  $('modal-body').innerHTML =
    // Type selector + global date setter
    '<div class="form-grid" style="margin-bottom:10px">'
    + '<div class="form-group"><label class="form-label">ប្រភេទ *</label>'
    + '<select class="form-control" id="ba-status">'
    + '<option value="absent">❌ អវត្តមាន (ខ្វះច្បាប់)</option>'
    + '<option value="leave">🌴 ឈប់សម្រាក (មានច្បាប់)</option>'
    + '<option value="sick">🤒 ឈប់ព្យាបាល</option>'
    + '<option value="holiday">🎉 ថ្ងៃឈប់សម្រាក</option>'
    + '</select></div>'
    + '<div class="form-group"><label class="form-label">កំណត់ចំណាំ</label>'
    + '<input class="form-control" id="ba-note" type="text" placeholder="ហេតុផល (ជាជម្រើស)"/>'
    + '</div></div>'

    // Quick date setter bar
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px;background:var(--bg2);border-radius:8px;flex-wrap:wrap">'
    + '<span style="font-size:12px;color:var(--text3);flex-shrink:0">📅 កំណត់ថ្ងៃសម្រាប់ដែលបានជ្រើស:</span>'
    + '<input type="date" id="ba-global-date" value="' + d + '" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)"/>'
    + '<button onclick="'
    + 'var gd=document.getElementById(\'ba-global-date\').value;'
    + 'document.querySelectorAll(\'.ba-chk:checked\').forEach(function(c){'
    + 'var dp=document.getElementById(\'ba-date-\'+c.dataset.id);'
    + 'if(dp)dp.value=gd;'
    + '});'
    + '" style="font-size:12px;padding:4px 10px;border:1px solid var(--primary);border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;flex-shrink:0">✔ អនុវត្ត</button>'
    + '<button onclick="'
    + 'var cbs=document.querySelectorAll(\'.ba-chk\');'
    + 'var allChecked=[...cbs].every(function(c){return c.checked;});'
    + 'cbs.forEach(function(c){c.checked=!allChecked;c.dispatchEvent(new Event(\'change\'));});'
    + '" style="font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;margin-left:auto;flex-shrink:0">☑ ជ្រើសទាំងអស់</button>'
    + '</div>'

    // Employee list
    + '<div style="max-height:320px;overflow-y:auto;padding-right:2px">'
    + empRows
    + '</div>'

    // Actions
    + '<div class="form-actions" style="margin-top:10px">'
    + '<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    + '<button class="btn btn-danger" id="save-ba-btn" onclick="saveBulkAbsence()">💾 រក្សាទុក</button>'
    + '</div>';

  openModal();
}

async function saveBulkAbsence() {
  var btn = $('save-ba-btn');
  var statusVal = $('ba-status').value;
  var note = ($('ba-note') && $('ba-note').value) || '';
  var checked = Array.from(document.querySelectorAll('.ba-chk:checked'));

  if (!checked.length) { showToast('សូមជ្រើសបុគ្គលិកយ៉ាងហោចណាស់ ១ នាក់!', 'error'); return; }

  // Validate each has a date
  var missing = checked.filter(function(c) {
    var dp = document.getElementById('ba-date-' + c.dataset.id);
    return !dp || !dp.value;
  });
  if (missing.length) { showToast('សូមជ្រើសថ្ងៃខែសម្រាប់បុគ្គលិកដែលបានជ្រើស!', 'error'); return; }

  btn.disabled = true; btn.textContent = 'កំពុងរក្សា...';

  var notePrefix = statusVal === 'leave' ? '\uD83C\uDF34 ឈប់ (ច្បាប់)'
    : statusVal === 'sick'    ? '\uD83E\uDD12 ឈប់ព្យាបាល'
    : statusVal === 'holiday' ? '\uD83C\uDF89 ថ្ងៃឈប់'
    : '\u274C អវត្តមាន';
  var fullNote = note ? (notePrefix + ': ' + note) : notePrefix;

  var success = 0, failed = 0;
  // Group by date for display after
  var lastDate = '';
  for (var i = 0; i < checked.length; i++) {
    var empId = parseInt(checked[i].dataset.id);
    var dp = document.getElementById('ba-date-' + checked[i].dataset.id);
    var empDate = dp ? dp.value : '';
    lastDate = empDate;
    try {
      await api('POST', '/attendance', {
        employee_id: empId,
        date: empDate,
        check_in: null,
        check_out: null,
        status: 'absent',
        notes: fullNote,
      });
      success++;
    } catch(e) {
      failed++;
    }
  }

  btn.disabled = false; btn.textContent = '\uD83D\uDCBE រក្សាទុក';
  closeModal();
  if (success > 0) showToast('\u2705 បានកត់អវត្តមាន ' + success + ' នាក់ (' + notePrefix + ')', 'success');
  if (failed > 0) showToast('\u26A0\uFE0F មិនបានកត់ ' + failed + ' នាក់', 'error');
  // Refresh to last date used, or today
  renderAttendance(lastDate || new Date().toISOString().split('T')[0]);
}


function openAttModal(dateVal) {
  $('modal-title').textContent = 'កត់ចូលវត្តមាន';
  const d = dateVal || new Date().toISOString().split('T')[0];
  $('modal-body').innerHTML =
    '<div class="form-grid">'
    +'<div class="form-group"><label class="form-label">បុគ្គលិក *</label><select class="form-control" id="a-emp">'+state.employees.map(e=>'<option value="'+e.id+'">'+e.name+'</option>').join('')+'</select></div>'
    +'<div class="form-group"><label class="form-label">ថ្ងៃខែ</label><input class="form-control" id="a-date" type="date" value="'+d+'" /></div>'
    +'<div class="form-group"><label class="form-label">ម៉ោងចូល</label><input class="form-control" id="a-in" type="time" value="'+((getSalaryRules&&getSalaryRules().work_start_time)||'08:00')+'" /></div>'
    +'<div class="form-group"><label class="form-label">ម៉ោងចេញ</label><input class="form-control" id="a-out" type="time" value="'+((getSalaryRules&&getSalaryRules().work_end_time)||'17:00')+'" /></div>'
    +'<div class="form-group"><label class="form-label">ស្ថានភាព</label><select class="form-control" id="a-status"><option value="present">✅ វត្តមាន</option><option value="late">⏰ យឺត</option><option value="absent">❌ អវត្តមាន</option></select></div>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" id="save-att-btn" onclick="saveAttendance()">រក្សាទុក</button>'
    +'</div>';
  openModal();
}

async function saveAttendance() {
  const btn = $('save-att-btn');
  btn.disabled=true; btn.textContent='កំពុងរក្សា...';
  const date = $('a-date').value;
  try {
    await api('POST','/attendance',{ employee_id:parseInt($('a-emp').value), date, check_in:$('a-in').value, check_out:$('a-out').value, status:$('a-status').value });
    showToast('កត់វត្តមានបានជោគជ័យ!','success');
    closeModal(); renderAttendance(date);
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); btn.disabled=false; btn.textContent='រក្សាទុក'; }
}

// ===== SALARY =====
function showQRPopup(el, empId) {
  const qr = photoCache['qr_' + empId] || '';
  if (!qr) return;
  const emp = (state.employees||[]).find(e=>e.id==empId)||{};
  $('modal-title').textContent = '🏦 QR ធនាគារ — ' + (emp.name||'');
  $('modal-body').innerHTML =
    '<div style="text-align:center;padding:10px">'
    +'<img src="'+qr+'" style="max-width:260px;width:100%;border-radius:12px;border:2px solid var(--border)" />'
    +(emp.bank ? '<div style="margin-top:12px;font-weight:700;font-size:15px">'+emp.bank+'</div>' : '')
    +(emp.bank_account ? '<div style="font-family:var(--mono);color:var(--text3);font-size:13px;margin-top:4px">'+emp.bank_account+'</div>' : '')
    +(emp.bank_holder ? '<div style="font-size:12px;color:var(--text3)">'+emp.bank_holder+'</div>' : '')
    +'</div>'
    +'<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បិទ</button></div>';
  openModal();
}

async function renderSalary(month='') {
  showLoading();
  const currentMonth = month || new Date().toISOString().slice(0,7);
  try {
    const data = await api('GET', '/salary?month=' + currentMonth);
    // Preload employees for QR/bank lookup
    if (!state.employees || state.employees.length === 0) {
      try { const ed = await api('GET','/employees?limit=500'); state.employees = ed.employees||[]; } catch(_){}
    }
    const rows = data.records.length===0
      ? '<tr><td colspan="9"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានកំណត់ត្រាបៀវត្សសម្រាប់ខែនេះ</p></div></td></tr>'
      : data.records.map(r => {
          const photo  = getEmpPhoto(r.employee_id);
          const qrData = photoCache['qr_' + r.employee_id] || '';
          const emp    = (state.employees||[]).find(e=>e.id===r.employee_id) || {};
          const bank   = emp.bank && emp.bank!=='—' ? emp.bank : '';
          const bankAcc= emp.bank_account || '';

          const av = photo
            ? '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+';overflow:hidden;padding:0"><img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
            : '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+'">'+(r.employee_name||'?')[0]+'</div>';

          // QR cell: show QR image if available, else bank name+account
          const qrCell = qrData
            ? '<td style="text-align:center">'
              +'<div onclick="showQRPopup(this,\''+r.employee_id+'\')" style="cursor:pointer;display:inline-block">'
              +'<img src="'+qrData+'" style="width:44px;height:44px;object-fit:contain;border-radius:6px;border:1px solid var(--border)" />'
              +'</div>'
              +(bank?'<div style="font-size:9px;color:var(--text3);margin-top:2px">'+bank+'</div>':'')
              +'</td>'
            : '<td style="text-align:center">'
              +(bank
                ? '<div style="font-size:11px;font-weight:600;color:var(--text2)">'+bank+'</div>'
                  +(bankAcc?'<div style="font-size:10px;color:var(--text3);font-family:var(--mono)">'+bankAcc+'</div>':'')
                : '<span style="color:var(--text3);font-size:11px">—</span>')
              +'</td>';

          return '<tr>'
            +'<td><div class="employee-cell">'+av+'<div class="emp-name">'+r.employee_name+'</div></div></td>'
            +'<td>'+(r.department||'—')+'</td>'
            +'<td style="font-family:var(--mono)">$'+r.base_salary+'</td>'
            +'<td style="font-family:var(--mono);color:var(--success)">+$'+r.bonus+'</td>'
            +'<td style="font-family:var(--mono);color:var(--danger)">-$'+r.deduction+'</td>'
            +'<td style="font-family:var(--mono);font-weight:700;color:var(--text)">$'+r.net_salary+'</td>'
            +qrCell
            +'<td>'+(r.status==='paid'?'<span class="badge badge-green">✅ បានបង់</span>':'<span class="badge badge-yellow">⏳ រង់ចាំ</span>')+'</td>'
            +'<td><div class="action-btns">'
            +(r.status!=='paid' ? '<button class="btn btn-success btn-sm" onclick="paySalary('+r.id+',\''+currentMonth+'\')">💰 បង់</button>' : '<span style="color:var(--text3);font-size:11px">✓ Done</span>')
            +'<button class="btn btn-outline btn-sm" onclick="openEditSalaryModal('+r.id+',\''+currentMonth+'\')">✏️</button>'
            +'<button class="btn btn-danger btn-sm" onclick="deleteSalary('+r.id+',\''+currentMonth+'\')">🗑️</button>'
            +'</div></td>'
            +'</tr>';
        }).join('');

    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>គ្រប់គ្រងបៀវត្ស</h2></div>'
      +'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      +'<input class="filter-input" type="month" value="'+currentMonth+'" onchange="renderSalary(this.value)" />'
      +'<button class="btn btn-success" onclick="payAll(\''+currentMonth+'\')">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> បង់ទាំងអស់</button>'
      +'<button class="btn btn-primary" onclick="openSalaryModal(\''+currentMonth+'\')">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> បន្ថែម</button>'
      +'<button class="btn btn-outline" onclick="printSalaryPage()">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> PDF</button>'
      +'</div></div>'
      +'<div class="salary-summary">'
      +'<div class="salary-box"><div class="lbl">💵 Net សរុប</div><div class="val">$'+(data.summary.total_net||0).toLocaleString()+'</div></div>'
      +'<div class="salary-box"><div class="lbl">💰 មូលដ្ឋាន</div><div class="val" style="color:var(--warning)">$'+(data.summary.total_base||0).toLocaleString()+'</div></div>'
      +'<div class="salary-box"><div class="lbl">✅ បង់ / សរុប</div><div class="val" style="color:var(--info)">'+(data.summary.paid||0)+' / '+data.records.length+'</div></div>'
      +'</div>'
      +'<div class="card"><div class="table-container"><table>'
      +'<thead><tr><th>បុគ្គលិក</th><th>នាយកដ្ឋាន</th><th>មូលដ្ឋាន</th><th>រង្វាន់</th><th>កាត់</th><th>សុទ្ធ</th><th style="text-align:center">QR ធនាគារ</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'</table></div></div>';
  } catch(e) { showError(e.message); }
}

async function openEditSalaryModal(id, month) {
  try {
    const data = await api('GET', '/salary?month=' + month);
    const r = (data.records||[]).find(x => x.id === id);
    if (!r) { showToast('រកកំណត់ត្រាមិនឃើញ!','error'); return; }
    $('modal-title').textContent = 'កែប្រែបៀវត្ស — ' + r.employee_name;
    $('modal-body').innerHTML =
      '<div class="form-grid">'
      +'<div class="form-group"><label class="form-label">មូលដ្ឋាន (USD)</label><input class="form-control" id="es-base" type="number" value="'+r.base_salary+'" /></div>'
      +'<div class="form-group"><label class="form-label">រង្វាន់ (USD)</label><input class="form-control" id="es-bonus" type="number" value="'+r.bonus+'" /></div>'
      +'<div class="form-group"><label class="form-label">កាត់ (USD)</label><input class="form-control" id="es-deduct" type="number" value="'+r.deduction+'" /></div>'
      +'<div class="form-group"><label class="form-label">ចំណាំ</label><input class="form-control" id="es-note" value="'+(r.notes||'')+'" /></div>'
      +'</div>'
      +'<div id="es-preview" style="margin:12px 0;padding:12px;background:var(--bg3);border-radius:8px;font-family:var(--mono);text-align:center;font-size:14px;font-weight:700;color:var(--success)">Net: $'+r.net_salary+'</div>'
      +'<div class="form-actions">'
      +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
      +'<button class="btn btn-primary" onclick="saveEditSalary('+id+',\''+month+'\')">💾 រក្សាទុក</button>'
      +'</div>';
    // Live preview
    ['es-base','es-bonus','es-deduct'].forEach(fid => {
      const el = $(fid);
      if (el) el.addEventListener('input', () => {
        const net = (parseFloat($('es-base')?.value)||0) + (parseFloat($('es-bonus')?.value)||0) - (parseFloat($('es-deduct')?.value)||0);
        const prev = $('es-preview');
        if (prev) prev.textContent = 'Net: $' + net.toFixed(2);
      });
    });
    openModal();
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function saveEditSalary(id, month) {
  const base = parseFloat($('es-base')?.value)||0;
  const bonus = parseFloat($('es-bonus')?.value)||0;
  const deduction = parseFloat($('es-deduct')?.value)||0;
  const net = base + bonus - deduction;
  try {
    await api('PUT', '/salary/'+id, { base_salary:base, bonus, deduction, net_salary:net, notes:$('es-note')?.value });
    showToast('កែប្រែបៀវត្សបានជោគជ័យ!','success');
    closeModal(); renderSalary(month);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function deleteSalary(id, month) {
  if (!confirm('លុបកំណត់ត្រានេះ?')) return;
  try {
    await api('DELETE', '/salary/'+id);
    showToast('លុបបានជោគជ័យ!','success'); renderSalary(month);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}



async function openSalaryModal(month) {
  if (!state.employees.length) { try { const d=await api('GET','/employees'); state.employees=d.employees; } catch(_){} }
  const rules = getSalaryRules();
  $('modal-title').textContent = 'បន្ថែមកំណត់ត្រាបៀវត្ស';
  $('modal-body').innerHTML =
    // Tabs
    '<div style="display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:8px;margin-bottom:16px">'
    +'<button id="sal-tab-one" class="btn btn-primary btn-sm" style="flex:1;border:none" onclick="switchSalTab(\'one\')">👤 តែម្នាក់</button>'
    +'<button id="sal-tab-all" class="btn btn-outline btn-sm" style="flex:1;border:none" onclick="switchSalTab(\'all\')">👥 ទាំងអស់ Auto</button>'
    +'</div>'
    // Single employee tab
    +'<div id="sal-panel-one">'
    +'<div class="form-grid">'
    +'<div class="form-group full-width"><label class="form-label">បុគ្គលិក *</label>'
    +'<select class="form-control" id="s-emp" onchange="autoFillSalary(this.value)">'+state.employees.map(e=>'<option value="'+e.id+'" data-salary="'+(e.salary||0)+'">'+e.name+'</option>').join('')+'</select></div>'
    +'<div class="form-group"><label class="form-label">មូលដ្ឋាន (USD) *</label><input class="form-control" id="s-base" type="number" placeholder="1000" oninput="calcSalNet()" /></div>'
    +'<div class="form-group"><label class="form-label">រង្វាន់ (USD)</label><input class="form-control" id="s-bonus" type="number" placeholder="0" value="0" oninput="calcSalNet()" /></div>'
    +'<div class="form-group"><label class="form-label">កាត់ (USD)</label><input class="form-control" id="s-deduct" type="number" placeholder="0" value="0" oninput="calcSalNet()" /></div>'
    +'<div class="form-group full-width">'
    +'<div id="sal-net-preview" style="padding:10px;background:var(--bg3);border-radius:8px;text-align:center;font-weight:700;font-family:var(--mono);color:var(--success)">Net: $—</div>'
    +'</div>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" id="save-sal-btn" onclick="saveSalary(\''+month+'\')">💾 រក្សាទុក</button>'
    +'</div>'
    +'</div>'
    // All employees tab
    +'<div id="sal-panel-all" style="display:none">'
    +'<div style="margin-bottom:12px;padding:12px;background:var(--bg3);border-radius:8px">'
    +'<div style="font-size:12px;font-weight:700;margin-bottom:10px">⚙️ ការកំណត់ Default</div>'
    +'<div class="form-grid">'
    +'<div class="form-group"><label class="form-label">រង្វាន់ Default ($)</label><input class="form-control" id="bulk-bonus" type="number" value="0" /></div>'
    +'<div class="form-group"><label class="form-label">កាត់ Default ($)</label><input class="form-control" id="bulk-deduct" type="number" value="0" /></div>'
    +'</div>'
    +'<div style="font-size:11px;color:var(--text3)">💡 មូលដ្ឋានយកពី salary profile បុគ្គលិកម្នាក់ៗ</div>'
    +'</div>'
    +'<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">'
    +state.employees.map(e=>'<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border)">'
      +'<input type="checkbox" id="bulk-emp-'+e.id+'" value="'+e.id+'" data-salary="'+(e.salary||0)+'" checked style="accent-color:var(--primary);width:16px;height:16px"/>'
      +'<div style="flex:1">'
      +'<div style="font-weight:600;font-size:13px">'+e.name+'</div>'
      +'<div style="font-size:11px;color:var(--text3)">'+(e.position||'—')+' · <span style="color:var(--success);font-family:var(--mono)">$'+(e.salary||0)+'</span></div>'
      +'</div>'
      +'<input type="number" id="bulk-base-'+e.id+'" value="'+(e.salary||0)+'" style="width:80px;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);text-align:right"/>'
      +'</div>'
    ).join('')
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">'
    +'<button class="btn btn-outline btn-sm" onclick="document.querySelectorAll(\'[id^=bulk-emp-]\').forEach(c=>c.checked=true)">✅ ជ្រើសទាំងអស់</button>'
    +'<button class="btn btn-outline btn-sm" onclick="document.querySelectorAll(\'[id^=bulk-emp-]\').forEach(c=>c.checked=false)">⬜ លុបជ្រើស</button>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" id="save-bulk-btn" onclick="saveBulkSalary(\''+month+'\')">'
    +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>'
    +' បន្ថែមទាំងអស់</button>'
    +'</div>'
    +'</div>';

  // Auto-fill first employee
  const first = state.employees[0];
  if (first) {
    const baseEl = document.getElementById('s-base');
    if (baseEl) { baseEl.value = first.salary || ''; calcSalNet(); }
  }
  openModal();
}

function switchSalTab(tab) {
  const one = document.getElementById('sal-panel-one');
  const all = document.getElementById('sal-panel-all');
  const btnOne = document.getElementById('sal-tab-one');
  const btnAll = document.getElementById('sal-tab-all');
  if (!one||!all) return;
  if (tab === 'one') {
    one.style.display=''; all.style.display='none';
    btnOne.className='btn btn-primary btn-sm'; btnOne.style.border='none';
    btnAll.className='btn btn-outline btn-sm'; btnAll.style.border='none';
  } else {
    one.style.display='none'; all.style.display='';
    btnOne.className='btn btn-outline btn-sm'; btnOne.style.border='none';
    btnAll.className='btn btn-primary btn-sm'; btnAll.style.border='none';
  }
}

function autoFillSalary(empId) {
  const sel = document.getElementById('s-emp');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const sal = opt ? (parseFloat(opt.dataset.salary)||0) : 0;
  const baseEl = document.getElementById('s-base');
  if (baseEl) { baseEl.value = sal || ''; calcSalNet(); }
}

function calcSalNet() {
  const base   = parseFloat(document.getElementById('s-base')?.value)||0;
  const bonus  = parseFloat(document.getElementById('s-bonus')?.value)||0;
  const deduct = parseFloat(document.getElementById('s-deduct')?.value)||0;
  const net = base + bonus - deduct;
  const p = document.getElementById('sal-net-preview');
  if (p) p.textContent = 'Net: $' + net.toFixed(2);
}

async function saveBulkSalary(month) {
  const btn = document.getElementById('save-bulk-btn');
  if (btn) { btn.disabled=true; btn.textContent='⏳ កំពុងបន្ថែម...'; }
  const bonus  = parseFloat(document.getElementById('bulk-bonus')?.value)||0;
  const deduct = parseFloat(document.getElementById('bulk-deduct')?.value)||0;
  const checkboxes = document.querySelectorAll('[id^="bulk-emp-"]:checked');
  if (!checkboxes.length) { showToast('សូមជ្រើសបុគ្គលិកយ៉ាងតិច ១ នាក់!','error'); if(btn){btn.disabled=false;btn.textContent='បន្ថែមទាំងអស់';} return; }

  let success=0, skip=0;
  for (const cb of checkboxes) {
    const empId = parseInt(cb.value);
    const baseEl = document.getElementById('bulk-base-'+empId);
    const base = parseFloat(baseEl?.value)||0;
    const net = base + bonus - deduct;
    try {
      await api('POST','/salary',{ employee_id:empId, month, base_salary:base, bonus, deduction:deduct, net_salary:net });
      success++;
    } catch(_) { skip++; } // already exists → skip
  }
  showToast('បន្ថែម '+success+' នាក់ ✅'+(skip?' · រំលង '+skip+' (មានរួចហើយ)':''),'success');
  closeModal(); renderSalary(month);
}



async function saveSalary(month) {
  const btn=$('save-sal-btn'); btn.disabled=true; btn.textContent='កំពុងរក្សា...';
  try {
    await api('POST','/salary',{ employee_id:parseInt($('s-emp').value), month, base_salary:parseFloat($('s-base').value)||0, bonus:parseFloat($('s-bonus').value)||0, deduction:parseFloat($('s-deduct').value)||0 });
    showToast('បន្ថែមបៀវត្សបានជោគជ័យ!','success'); closeModal(); renderSalary(month);
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); btn.disabled=false; btn.textContent='រក្សាទុក'; }
}

async function paySalary(id, month) {
  try { await api('PUT',`/salary/${id}/pay`); showToast('បង់ប្រាក់បានជោគជ័យ!','success'); renderSalary(month); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

async function payAll(month) {
  if (!confirm('បង់ប្រាក់ទាំងអស់?')) return;
  try {
    const data = await api('GET',`/salary?month=${month}`);
    const pending = data.records.filter(r=>r.status!=='paid');
    if (!pending.length) { showToast('មិនទាន់មានរង់ចាំ!','warning'); return; }
    await Promise.all(pending.map(r=>api('PUT',`/salary/${r.id}/pay`)));
    showToast(`បង់ប្រាក់ ${pending.length} នាក់ បានជោគជ័យ!`,'success'); renderSalary(month);
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ===== REPORTS =====
async function renderReports() {
  showLoading();
  try {
    const month = thisMonth();
    let salData = { records:[], summary:{} };
    let empData = { employees:[] };
    try {
      [salData, empData] = await Promise.all([
        api('GET', '/salary?month='+month),
        api('GET', '/employees?limit=200'),
      ]);
    } catch(_){}

    const rules = getSalaryRules();
    const sym = rules.currency_symbol || '$';

    // Build preview rows HTML
    let previewRows = '';
    if (salData.records.length === 0) {
      previewRows = '<tr><td colspan="11"><div class="empty-state" style="padding:24px"><p>មិនទាន់មានទិន្នន័យប្រាក់ខែ ' + month + '</p></div></td></tr>';
    } else {
      salData.records.forEach((r,i) => {
        const nssf = ((r.base_salary||0)*(rules.nssf_employee||0)/100).toFixed(2);
        const taxable = Math.max(0,(r.base_salary||0)-(rules.income_tax_threshold||0));
        const tax = (taxable*(rules.tax_rate||0)/100).toFixed(2);
        const statusBadge = r.status==='paid'
          ? '<span class="badge badge-green">✅</span>'
          : '<span class="badge badge-yellow">⏳</span>';
        previewRows += '<tr>'
          + '<td style="font-family:var(--mono);color:var(--text3)">' + (i+1) + '</td>'
          + '<td><div class="employee-cell">'
          + '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+';width:26px;height:26px;font-size:10px">' + (r.employee_name||'?')[0] + '</div>'
          + '<span style="font-weight:500">' + (r.employee_name||'') + '</span></div></td>'
          + '<td>' + (r.department||'—') + '</td>'
          + '<td style="font-family:var(--mono)">' + sym + (r.base_salary||0) + '</td>'
          + '<td style="font-family:var(--mono);color:var(--primary)">' + sym + (r.overtime_pay||0) + '</td>'
          + '<td style="font-family:var(--mono);color:var(--success)">' + sym + (r.bonus||0) + '</td>'
          + '<td style="font-family:var(--mono);color:var(--danger)">-' + sym + (r.deduction||0) + '</td>'
          + '<td style="font-family:var(--mono);color:var(--danger)">-' + sym + nssf + '</td>'
          + '<td style="font-family:var(--mono);color:var(--danger)">-' + sym + tax + '</td>'
          + '<td style="font-family:var(--mono);font-weight:700;color:var(--text)">' + sym + (r.net_salary||0) + '</td>'
          + '<td>' + statusBadge + '</td>'
          + '</tr>';
      });
    }

    contentArea().innerHTML =
      '<div class="page-header">'
      + '<div><h2>របាយការណ៍</h2><p>Export ទិន្នន័យប្រាក់ខែជា Excel</p></div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:24px">'
      + '<div class="card-header">'
      + '<div style="display:flex;align-items:center;gap:10px">'
      + '<div style="width:36px;height:36px;background:rgba(6,214,160,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px">📊</div>'
      + '<div><div class="card-title">របាយការណ៍ Payroll — Excel</div>'
      + '<div style="font-size:12px;color:var(--text3)">Export ទិន្នន័យប្រាក់ខែជា .xlsx</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:10px;align-items:center">'
      + '<input class="filter-input" type="month" id="rpt-month" value="' + month + '" />'
      + '<button class="btn btn-success" onclick="exportPayrollExcel()">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      + ' Excel</button>'
      + '<button class="btn btn-primary" onclick="printPayroll()">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
      + ' PDF / បោះពុម្ព</button>'
      + '</div></div>'
      + '<div class="card-body" style="padding:0">'
      + '<div style="padding:16px 20px 8px;display:flex;gap:20px;flex-wrap:wrap">'
      + '<div style="font-size:13px"><span style="color:var(--text3)">ខែ: </span><span style="font-weight:700;font-family:var(--mono)">' + month + '</span></div>'
      + '<div style="font-size:13px"><span style="color:var(--text3)">បុគ្គលិក: </span><span style="font-weight:700;color:var(--primary)">' + salData.records.length + '</span></div>'
      + '<div style="font-size:13px"><span style="color:var(--text3)">Net សរុប: </span><span style="font-weight:700;color:var(--success);font-family:var(--mono)">' + sym + (salData.summary.total_net||0).toLocaleString() + '</span></div>'
      + '<div style="font-size:13px"><span style="color:var(--text3)">បង់រួច: </span><span style="font-weight:700;color:var(--info)">' + (salData.summary.paid||0) + '/' + salData.records.length + '</span></div>'
      + '</div>'
      + '<div class="table-container" style="max-height:340px;overflow-y:auto">'
      + '<table>'
      + '<thead><tr><th>លេខ</th><th>ឈ្មោះ</th><th>នាយកដ្ឋាន</th><th>មូលដ្ឋាន</th><th>OT</th><th>រង្វាន់</th><th>កាត់</th><th>NSSF</th><th>Tax</th><th>Net</th><th>ស្ថានភាព</th></tr></thead>'
      + '<tbody>' + previewRows + '</tbody>'
      + '</table></div></div></div>';

    window._payrollRecords = salData.records;
    window._allEmployees = empData.employees || [];

  } catch(e) { showError(e.message); }
}

// ============================================================
// EXCEL EXPORT ENGINE (pure JS — no library needed)
// ============================================================

// Build a proper XLSX file using XML/ZIP structure
function buildXLSX(sheets) {
  // sheets = [{ name, headers, rows }]
  // Returns a Blob
  const escXml = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // Shared strings
  const strs = [];
  const strIdx = {};
  function si(v) {
    const k = String(v??'');
    if (strIdx[k]===undefined) { strIdx[k]=strs.length; strs.push(k); }
    return strIdx[k];
  }

  // Pre-register all strings
  sheets.forEach(sh=>{
    sh.headers.forEach(h=>si(h));
    sh.rows.forEach(row=>row.forEach(cell=>{ if(typeof cell==='string')si(cell); }));
  });

  const col = n => { let s=''; while(n>=0){s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;} return s; };

  function sheetXML(sh) {
    const colCount = sh.headers.length;
    const rows = [sh.headers, ...sh.rows];
    const xmlRows = rows.map((row,ri)=>{
      const cells = row.map((cell,ci)=>{
        const ref = col(ci)+(ri+1);
        const rAttr = ' r="'+ref+'"';
        if(ri===0) return '<c'+rAttr+' s="1" t="s"><v>'+si(cell)+'</v></c>';
        if(typeof cell==='number'||(!isNaN(cell)&&cell!=='')) return '<c'+rAttr+'><v>'+cell+'</v></c>';
        return '<c'+rAttr+' t="s"><v>'+si(String(cell??''))+'</v></c>';
      }).join('');
      return '<row r="'+(ri+1)+'">'+cells+'</row>';
    }).join('');
    const dims = 'A1:'+col(colCount-1)+rows.length;
    return '<?xml version="1.0" encoding="UTF-8"?>'
      +'\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      +'\n<dimension ref="'+dims+'"/>'
      +'\n<sheetData>'+xmlRows+'</sheetData>'
      +'\n</worksheet>';
  }

  const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

  const sharedStringsXML = XML_DECL
    + '\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' count="' + strs.length + '" uniqueCount="' + strs.length + '">'
    + '\n' + strs.map(s=>'<si><t xml:space="preserve">' + escXml(s) + '</t></si>').join('\n')
    + '\n</sst>';

  const stylesXML = XML_DECL
    + '\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '\n<fonts><font><sz val="11"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/></font></fonts>'
    + '\n<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '\n<fill><patternFill patternType="solid"><fgColor rgb="FFFF6B35"/></patternFill></fill></fills>'
    + '\n<borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '\n<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '\n<cellXfs>'
    + '\n<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '\n<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
    + '\n</cellXfs>'
    + '\n</styleSheet>';

  const wbXML = XML_DECL
    + '\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + '\n  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '\n<sheets>' + sheets.map((sh,i)=>'<sheet name="' + escXml(sh.name) + '" sheetId="' + (i+1) + '" r:id="rId' + (i+1) + '"/>').join('') + '</sheets>'
    + '\n</workbook>';

  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

  const wbRels = XML_DECL
    + '\n<Relationships xmlns="' + NS_PKG + '">'
    + '\n' + sheets.map((sh,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+NS_REL+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('\n')
    + '\n<Relationship Id="rId'+(sheets.length+1)+'" Type="'+NS_REL+'/sharedStrings" Target="sharedStrings.xml"/>'
    + '\n<Relationship Id="rId'+(sheets.length+2)+'" Type="'+NS_REL+'/styles" Target="styles.xml"/>'
    + '\n</Relationships>';

  const coreRels = XML_DECL
    + '\n<Relationships xmlns="' + NS_PKG + '">'
    + '\n<Relationship Id="rId1" Type="'+NS_REL+'/officeDocument" Target="xl/workbook.xml"/>'
    + '\n</Relationships>';

  const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const NS_SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

  const contentTypes = XML_DECL
    + '\n<Types xmlns="' + NS_CT + '">'
    + '\n<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '\n<Default Extension="xml" ContentType="application/xml"/>'
    + '\n<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '\n' + sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('\n')
    + '\n<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    + '\n<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '\n</Types>';

  // Build ZIP using simple concatenation (mini zip writer)
  function toUint8(str) {
    const e = new TextEncoder(); return e.encode(str);
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const t = [];
    for(let i=0;i<256;i++){let n=i;for(let j=0;j<8;j++)n=n&1?(0xEDB88320^(n>>>1)):(n>>>1);t[i]=n;}
    for(let i=0;i<buf.length;i++)c=t[(c^buf[i])&0xFF]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0;
  }
  function le16(n){const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n,true);return b;}
  function le32(n){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b;}
  function concat(...arrs){const t=arrs.reduce((s,a)=>s+a.length,0);const r=new Uint8Array(t);let o=0;for(const a of arrs){r.set(a,o);o+=a.length;}return r;}

  const files = {
    '[Content_Types].xml': toUint8(contentTypes),
    '_rels/.rels': toUint8(coreRels),
    'xl/workbook.xml': toUint8(wbXML),
    'xl/_rels/workbook.xml.rels': toUint8(wbRels),
    'xl/sharedStrings.xml': toUint8(sharedStringsXML),
    'xl/styles.xml': toUint8(stylesXML),
  };
  sheets.forEach((sh,i)=>{ files['xl/worksheets/sheet'+(i+1)+'.xml'] = toUint8(sheetXML(sh)); });

  const localHeaders = [];
  const centralDirs = [];
  let offset = 0;
  const now = new Date();
  const dosDate = ((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  const dosTime = (now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);

  for(const [name,data] of Object.entries(files)) {
    const nameBytes = toUint8(name);
    const crc = crc32(data);
    const lh = concat(
      new Uint8Array([0x50,0x4B,0x03,0x04]),
      le16(20),le16(0),le16(0),
      le16(dosTime),le16(dosDate),
      le32(crc),le32(data.length),le32(data.length),
      le16(nameBytes.length),le16(0),
      nameBytes, data
    );
    const cd = concat(
      new Uint8Array([0x50,0x4B,0x01,0x02]),
      le16(20),le16(20),le16(0),le16(0),
      le16(dosTime),le16(dosDate),
      le32(crc),le32(data.length),le32(data.length),
      le16(nameBytes.length),le16(0),le16(0),le16(0),le16(0),
      le32(0),le32(offset),
      nameBytes
    );
    localHeaders.push(lh);
    centralDirs.push(cd);
    offset += lh.length;
  }

  const cdSize = centralDirs.reduce((s,d)=>s+d.length,0);
  const eocd = concat(
    new Uint8Array([0x50,0x4B,0x05,0x06]),
    le16(0),le16(0),
    le16(centralDirs.length),le16(centralDirs.length),
    le32(cdSize),le32(offset),le16(0)
  );

  const zip = concat(...localHeaders,...centralDirs,eocd);
  return new Blob([zip],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function exportPayrollExcel() {
  const month = $('rpt-month')?.value || thisMonth();
  showToast('កំពុង Export Excel...','info');
  try {
    const data = await api('GET',`/salary?month=${month}`);
    const records = data.records || [];
    const rules = getSalaryRules();
    const cfg = getCompanyConfig();
    const sym = rules.currency_symbol || '$';
    const companyName = cfg.company_name || 'HR Pro';

    const headers = ['#','ឈ្មោះ','នាយកដ្ឋាន','ប្រាក់មូលដ្ឋាន','OT','រង្វាន់','ប្រាក់កាត់','NSSF','Tax','Net Salary','ខែ','ស្ថានភាព'];
    const rows = records.map((r,i)=>{
      const nssf = +((r.base_salary||0)*(rules.nssf_employee||0)/100).toFixed(2);
      const taxable = Math.max(0,(r.base_salary||0)-(rules.income_tax_threshold||0));
      const tax = +(taxable*(rules.tax_rate||0)/100).toFixed(2);
      return [
        i+1, r.employee_name||'', r.department||'',
        r.base_salary||0, r.overtime_pay||0, r.bonus||0,
        r.deduction||0, nssf, tax, r.net_salary||0,
        r.month||month, r.status==='paid'?'បានបង់':'រង់ចាំ',
      ];
    });

    // Summary row
    const totBase = records.reduce((s,r)=>s+(r.base_salary||0),0);
    const totNet  = records.reduce((s,r)=>s+(r.net_salary||0),0);
    rows.push(['','','','','','','','','','','','']);
    rows.push(['','','ចំណែប','','','','','','','','','']);
    rows.push(['','','ប្រាក់មូលដ្ឋានសរុប',totBase,'','','','','Net សរុប',totNet,'','']);

    const blob = buildXLSX([
      { name:`Payroll ${month}`, headers, rows },
    ]);
    downloadBlob(blob, `${companyName}_Payroll_${month}.xlsx`);
    showToast('Download Excel បានជោគជ័យ! ✅','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function exportEmployeeExcel() {
  showToast('កំពុង Export...','info');
  try {
    const d = await api('GET','/employees?limit=500');
    const emps = d.employees||[];
    const cfg = getCompanyConfig();
    const headers = ['#','ឈ្មោះ','ភេទ','តំណែង','នាយកដ្ឋាន','ទូរស័ព្ទ','អ៊ីម៉ែល','ប្រាក់ខែ','ថ្ងៃចូល','ស្ថានភាព'];
    const rows = emps.map((e,i)=>[i+1,e.name,e.gender==='male'?'ប្រុស':'ស្រី',e.position,e.department_name||e.department||'',e.phone||'',e.email||'',e.salary||0,e.hire_date||'',e.status==='active'?'ធ្វើការ':e.status==='on_leave'?'ច្បាប់':'ផ្អាក']);
    downloadBlob(buildXLSX([{name:'Employees',headers,rows}]),`${cfg.company_name||'HR'}_Employees_${today()}.xlsx`);
    showToast('Download Employee Excel ✅','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function exportAttendanceExcel() {
  showToast('កំពុង Export...','info');
  try {
    const d = await api('GET',`/attendance?month=${thisMonth()}`);
    const recs = d.records||[];
    const cfg = getCompanyConfig();
    const headers = ['#','ឈ្មោះ','នាយកដ្ឋាន','ថ្ងៃ','ម៉ោងចូល','ម៉ោងចេញ','ស្ថានភាព'];
    const rows = recs.map((r,i)=>[i+1,r.employee_name||'',r.department||'',r.date||'',r.check_in||'',r.check_out||'',r.status==='present'?'វត្តមាន':r.status==='late'?'យឺត':'អវត្តមាន']);
    downloadBlob(buildXLSX([{name:'Attendance',headers,rows}]),`${cfg.company_name||'HR'}_Attendance_${thisMonth()}.xlsx`);
    showToast('Download Attendance Excel ✅','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function exportDeptExcel() {
  showToast('កំពុង Export...','info');
  try {
    const d = await api('GET','/departments');
    const depts = Array.isArray(d)?d:(d.records||[]);
    const cfg = getCompanyConfig();
    const headers = ['#','ឈ្មោះ','អ្នកគ្រប់គ្រង','ចំនួនបុគ្គលិក'];
    const rows = depts.map((d,i)=>[i+1,d.name||'',d.manager||'',d.head_count||0]);
    downloadBlob(buildXLSX([{name:'Departments',headers,rows}]),`${cfg.company_name||'HR'}_Departments_${today()}.xlsx`);
    showToast('Download Dept Excel ✅','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function exportFinanceSummaryExcel() {
  showToast('កំពុង Export...','info');
  try {
    const cfg = getCompanyConfig();
    const [loans,expenses,allowances] = await Promise.all([
      api('GET','/loans'), api('GET','/expenses'), api('GET','/allowances'),
    ]);
    const loanRows = (loans.records||[]).map((r,i)=>[i+1,r.employee_name||'',r.amount||0,r.paid_amount||0,(r.amount||0)-(r.paid_amount||0),r.status==='paid'?'សងរួច':'កំពុងសង']);
    const expRows  = (expenses.records||[]).map((r,i)=>[i+1,r.employee_name||'',r.category||'',r.amount||0,r.request_date||'',r.status==='approved'?'អនុម័ត':r.status==='rejected'?'បដិសេធ':'រង់ចាំ']);
    const allowRows= (allowances.records||[]).map((r,i)=>[i+1,r.employee_name||'',r.type||'',r.amount||0,r.month||'']);
    downloadBlob(buildXLSX([
      {name:'Loans',headers:['#','ឈ្មោះ','ចំនួន','សង','នៅសល់','ស្ថានភាព'],rows:loanRows},
      {name:'Expense Requests',headers:['#','ឈ្មោះ','ប្រភេទ','ចំនួន','ថ្ងៃ','ស្ថានភាព'],rows:expRows},
      {name:'Allowances',headers:['#','ឈ្មោះ','ប្រភេទ','ចំនួន','ខែ'],rows:allowRows},
    ]),`${cfg.company_name||'HR'}_Finance_${today()}.xlsx`);
    showToast('Download Finance Excel ✅','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ===== HELPER: load employees into state =====
async function ensureEmployees() {
  if (!state.employees.length) {
    try { const d = await api('GET','/employees?limit=200'); state.employees = d.employees||[]; } catch(_){}
  }
}

// ============================================================
// 1. ថែមម៉ោង (OVERTIME)
// ============================================================
async function renderOvertime() {
  showLoading();
  let currentMonth = (window._otMonth || new Date().toISOString().slice(0,7));
  try {
    const [empData, otData] = await Promise.all([
      api('GET','/employees?limit=500'),
      api('GET','/overtime')
    ]);
    const emps = empData.employees || [];
    const records = otData.records || [];

    // Filter to current month
    const monthRecords = records.filter(r => (r.date||'').startsWith(currentMonth));

    // Build map: empId -> { dd -> [records] }
    const otMap = {};
    monthRecords.forEach(r => {
      const empId = r.employee_id;
      const dd = (r.date||'').slice(-2).replace(/^0/,''); // '01' -> '1'
      if (!otMap[empId]) otMap[empId] = {};
      if (!otMap[empId][dd]) otMap[empId][dd] = [];
      otMap[empId][dd].push(r);
    });

    // Days in month
    const [y, m] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const allDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m-1, d);
      allDays.push({ d, dd: String(d).padStart(2,'0'), wd: dt.getDay() });
    }
    const wdNames = ['អា','ច','អ','ព','ព្រ','សុ','ស'];

    // Totals
    const totalHrs = monthRecords.reduce((s,r)=>s+(r.hours||0),0);
    const totalPay = monthRecords.reduce((s,r)=>s+(r.pay||0),0);

    // Build header rows
    const dayThs = allDays.map(({d, wd}) => {
      const isToday = (new Date().toISOString().slice(0,7)===currentMonth && new Date().getDate()===d);
      const isWeekend = (wd===0||wd===6);
      const bg = isToday ? 'background:var(--primary);color:white;' : isWeekend ? 'background:var(--bg2);color:var(--text3);' : '';
      return '<th style="padding:2px 1px;font-size:11px;font-weight:600;text-align:center;min-width:26px;'+bg+'">' + d + '</th>';
    }).join('');

    const wdThs = allDays.map(({wd}) => {
      const isWeekend = (wd===0||wd===6);
      return '<th style="padding:1px 0;font-size:9px;text-align:center;font-weight:400;'+(isWeekend?'color:var(--danger);':'color:var(--text3);')+'">'+wdNames[wd]+'</th>';
    }).join('');

    // Per-employee rows — only show employees with OT this month, or all
    const empRows = emps.map(emp => {
      const empOT = otMap[emp.id] || {};
      const empTotal = Object.values(empOT).flat().reduce((s,r)=>s+(r.hours||0),0);
      const empPay   = Object.values(empOT).flat().reduce((s,r)=>s+(r.pay||0),0);
      if (empTotal === 0) return ''; // hide employees with no OT this month

      const cells = allDays.map(({d, wd}) => {
        const dayRecs = empOT[String(d)] || [];
        const isWeekend = (wd===0||wd===6);
        const bgWknd = isWeekend ? 'background:var(--bg2);' : '';
        if (!dayRecs.length) {
          return '<td style="text-align:center;font-size:10px;color:var(--text3);padding:2px 0;'+bgWknd+'">—</td>';
        }
        const hrs = dayRecs.reduce((s,r)=>s+(r.hours||0),0);
        const allApproved = dayRecs.every(r=>r.status==='approved');
        const anyRejected = dayRecs.some(r=>r.status==='rejected');
        const color = anyRejected ? 'var(--danger)' : allApproved ? 'var(--success)' : 'var(--warning)';
        const title = dayRecs.map(r=>(r.reason||'')+(r.hours?'('+r.hours+'h)':'')).join(' | ');
        return '<td style="text-align:center;padding:2px 1px;'+bgWknd+'" title="'+title+'">'
          +'<span style="font-size:11px;font-weight:700;color:'+color+'">'+hrs+'h</span>'
          +'</td>';
      }).join('');

      const photo = getEmpPhoto(emp.id);
      const av = photo
        ? '<img src="'+photo+'" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0"/>'
        : '<div style="width:22px;height:22px;border-radius:50%;background:'+getColor(emp.name)+';display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:700;flex-shrink:0">'+emp.name[0]+'</div>';

      return '<tr>'
        +'<td style="padding:5px 8px;white-space:nowrap;position:sticky;left:0;z-index:1;background:var(--bg1);box-shadow:2px 0 5px rgba(0,0,0,.12)">'
        +'<div style="display:flex;align-items:center;gap:6px">'+av+'<span style="font-size:12px;font-weight:600">'+emp.name+'</span></div></td>'
        +'<td style="text-align:center;font-weight:700;color:var(--primary);font-size:13px;position:sticky;left:160px;z-index:1;background:var(--bg1);padding:3px 4px;white-space:nowrap">'+empTotal+'h</td>'
        +'<td style="text-align:center;font-weight:700;color:var(--success);font-size:12px;position:sticky;left:196px;z-index:1;background:var(--bg1);box-shadow:3px 0 6px rgba(0,0,0,.1);padding:3px 4px;white-space:nowrap">$'+empPay.toFixed(0)+'</td>'
        +cells
        +'<td style="text-align:center;padding:3px 6px">'
        +'<button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 7px" onclick="renderOTDetailList('+emp.id+',\''+emp.name+'\',\''+currentMonth+'\')">📋</button>'
        +'</td>'
        +'</tr>';
    }).filter(Boolean).join('');

    const emptyMsg = empRows.length === 0
      ? '<tr><td colspan="'+(5+allDays.length)+'"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានថែមម៉ោងខែ '+currentMonth+'</p></div></td></tr>'
      : '';

    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>⏰ ថែមម៉ោង</h2><p>OT '+currentMonth+' — '+monthRecords.length+' កំណត់ត្រា</p></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      +'<input class="filter-input" type="month" value="'+currentMonth+'" onchange="window._otMonth=this.value;renderOvertime()" />'
      +'<button class="btn btn-outline" onclick="renderOTListView(\''+currentMonth+'\')">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> បញ្ជី</button>'
      +'<button class="btn btn-outline" onclick="printOTReport(\''+currentMonth+'\')">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> PDF</button>'
      +'<button class="btn btn-outline" onclick="exportOTExcel(\''+currentMonth+'\')" style="border-color:var(--success);color:var(--success)">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Excel</button>'
      +'<button class="btn btn-primary" onclick="openOvertimeModal()">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> បន្ថែម</button>'
      +'</div></div>'
      +'<div class="att-summary" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">'
      +'<div class="att-box"><div class="att-num" style="color:var(--primary)">'+totalHrs.toFixed(1)+'h</div><div class="att-lbl">⏰ ម៉ោងសរុប</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--success)">$'+totalPay.toFixed(0)+'</div><div class="att-lbl">💵 ប្រាក់ OT សរុប</div></div>'
      +'<div class="att-box"><div class="att-num" style="color:var(--info)">'+monthRecords.length+'</div><div class="att-lbl">📋 ចំនួនករណី</div></div>'
      +'</div>'
      +'<div class="card" style="padding:0">'
      +'<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">'
      +'<table style="min-width:max-content;border-collapse:collapse;table-layout:fixed">'
      +'<colgroup>'
      +'<col style="width:160px"/>'
      +'<col style="width:36px"/>'
      +'<col style="width:48px"/>'
      +allDays.map(()=>'<col style="min-width:26px"/>').join('')
      +'<col style="width:40px"/>'
      +'</colgroup>'
      +'<thead>'
      +'<tr style="position:sticky;top:0;z-index:4;background:var(--bg2);height:28px">'
      +'<th style="text-align:left;position:sticky;left:0;z-index:5;background:var(--bg2);box-shadow:2px 0 5px rgba(0,0,0,.2);padding:6px 8px" rowspan="2">បុគ្គលិក</th>'
      +'<th style="text-align:center;color:var(--primary);position:sticky;left:160px;z-index:5;background:var(--bg2);padding:3px 0;font-size:11px" rowspan="2" title="ម៉ោងសរុប">⏱️h</th>'
      +'<th style="text-align:center;color:var(--success);position:sticky;left:196px;z-index:5;background:var(--bg2);box-shadow:3px 0 5px rgba(0,0,0,.15);padding:3px 0;font-size:11px" rowspan="2" title="ប្រាក់">💵</th>'
      +dayThs
      +'<th style="text-align:center;background:var(--bg2);padding:3px 0;font-size:10px" rowspan="2">...</th>'
      +'</tr>'
      +'<tr style="position:sticky;top:28px;z-index:4;background:var(--bg2)">'+wdThs+'</tr>'
      +'</thead>'
      +'<tbody>'+(empRows||emptyMsg)+'</tbody>'
      +'</table></div></div>';
  } catch(e) { showError(e.message); }
}

// ── OT PDF Print (Calendar/Matrix view) ──────────────────────────
async function printOTReport(month) {
  showToast('កំពុង Generate PDF...','info');
  try {
    const cfg = getCompanyConfig();
    const [empData, otData] = await Promise.all([
      api('GET','/employees?limit=500'),
      api('GET','/overtime')
    ]);
    const emps = empData.employees || [];
    const records = (otData.records||[]).filter(r=>(r.date||'').startsWith(month));

    const otMap = {};
    records.forEach(r => {
      if (!otMap[r.employee_id]) otMap[r.employee_id] = {};
      const dd = (r.date||'').slice(-2).replace(/^0/,'');
      if (!otMap[r.employee_id][dd]) otMap[r.employee_id][dd] = [];
      otMap[r.employee_id][dd].push(r);
    });

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const allDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const wd = new Date(y, m-1, d).getDay();
      allDays.push({ d, wd });
    }
    const wdNames = ['អា','ច','អ','ព','ព្រ','សុ','ស'];

    const totalHrs = records.reduce((s,r)=>s+(r.hours||0),0);
    const totalPay = records.reduce((s,r)=>s+(r.pay||0),0);
    const monthName = new Date(y, m-1, 1).toLocaleDateString('km-KH',{year:'numeric',month:'long'});

    const empRowsHtml = emps.map(emp => {
      const empOT = otMap[emp.id] || {};
      const empTotal = Object.values(empOT).flat().reduce((s,r)=>s+(r.hours||0),0);
      const empPay   = Object.values(empOT).flat().reduce((s,r)=>s+(r.pay||0),0);
      if (empTotal === 0) return '';
      const cells = allDays.map(({d, wd}) => {
        const dayRecs = empOT[String(d)] || [];
        const isWeekend = (wd===0||wd===6);
        const bg = isWeekend ? 'background:#f5f5f5;' : '';
        if (!dayRecs.length) return '<td style="text-align:center;font-size:9px;color:#bbb;'+bg+'">—</td>';
        const hrs = dayRecs.reduce((s,r)=>s+(r.hours||0),0);
        const allApproved = dayRecs.every(r=>r.status==='approved');
        const anyRejected = dayRecs.some(r=>r.status==='rejected');
        const color = anyRejected ? '#e53e3e' : allApproved ? '#38a169' : '#d97706';
        return '<td style="text-align:center;'+bg+'"><span style="font-size:10px;font-weight:700;color:'+color+'">'+hrs+'h</span></td>';
      }).join('');
      return '<tr>'
        +'<td style="padding:4px 6px;white-space:nowrap;font-weight:600;font-size:11px">'+emp.name+'</td>'
        +'<td style="text-align:center;font-weight:700;color:#2b6cb0;font-size:12px">'+empTotal+'h</td>'
        +'<td style="text-align:center;font-weight:700;color:#276749;font-size:11px">$'+empPay.toFixed(2)+'</td>'
        +cells
        +'</tr>';
    }).filter(Boolean).join('');

    const dayThsHtml = allDays.map(({d,wd})=>{
      const isWknd = (wd===0||wd===6);
      return '<th style="padding:2px 1px;font-size:10px;font-weight:700;text-align:center;min-width:22px;'+(isWknd?'background:#dbeafe;color:#1e40af;':'')+'">'+d+'</th>';
    }).join('');
    const wdThsHtml = allDays.map(({wd})=>{
      const isWknd=(wd===0||wd===6);
      return '<th style="padding:1px 0;font-size:8px;text-align:center;font-weight:400;'+(isWknd?'color:#e53e3e;':'color:#888;')+'">'+wdNames[wd]+'</th>';
    }).join('');

    const logoHtml = cfg.logo_url
      ? '<img src="'+cfg.logo_url+'" style="width:52px;height:52px;object-fit:contain;border-radius:10px;border:2px solid #e2e8f0">'
      : '<div style="width:52px;height:52px;background:linear-gradient(135deg,#1a3a8f,#2563eb);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:18px">HR</div>';

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@300;400;600;700;800&display=swap" rel="stylesheet">'
      +'<title>OT Report '+month+'</title>'
      +'<style>'
      +'*{box-sizing:border-box;margin:0;padding:0;font-family:"Noto Sans Khmer",sans-serif}'
      +'body{padding:14px;color:#1a202c;background:white;font-size:11px}'
      +'.hdr{display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-bottom:12px;border-bottom:3px solid #1a3a8f}'
      +'.hdr-info{flex:1}'
      +'.co-name{font-size:18px;font-weight:800;color:#1a3a8f;letter-spacing:.5px}'
      +'.rpt-title{font-size:13px;font-weight:700;color:#2d3748;margin-top:2px}'
      +'.rpt-sub{font-size:10px;color:#718096;margin-top:1px}'
      +'.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}'
      +'.stat-box{background:linear-gradient(135deg,#ebf4ff,#dbeafe);border:1px solid #bee3f8;border-radius:10px;padding:10px 14px;text-align:center}'
      +'.stat-num{font-size:18px;font-weight:800;color:#1a3a8f}'
      +'.stat-lbl{font-size:9px;color:#4a5568;margin-top:2px;font-weight:600}'
      +'table{width:100%;border-collapse:collapse;font-size:10px}'
      +'th{background:#1a3a8f;color:white;padding:5px 4px;text-align:left;font-weight:700}'
      +'thead tr:first-child th{border-bottom:1px solid rgba(255,255,255,.2)}'
      +'td{padding:4px 5px;border-bottom:1px solid #e2e8f0;vertical-align:middle}'
      +'tr:nth-child(even) td{background:#f7fafc}'
      +'tr:last-child td{font-weight:700;background:#ebf4ff!important;border-top:2px solid #1a3a8f}'
      +'.legend{display:flex;gap:14px;margin-top:10px;font-size:9px;color:#4a5568}'
      +'.leg-item{display:flex;align-items:center;gap:4px}'
      +'.dot{width:10px;height:10px;border-radius:50%;display:inline-block}'
      +'.footer{margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}'
      +'.sign{border-top:1px dashed #a0aec0;padding-top:6px;text-align:center;font-size:9px;color:#718096}'
      +'@media print{@page{size:A4 landscape;margin:8mm}body{padding:0}}'
      +'</style></head><body>'
      +'<div class="hdr">'+logoHtml
      +'<div class="hdr-info">'
      +'<div class="co-name">'+(cfg.company_name||'HR Pro')+'</div>'
      +'<div class="rpt-title">📊 របាយការណ៍ថែមម៉ោង — OT Report</div>'
      +'<div class="rpt-sub">ខែ: '+monthName+' &nbsp;|&nbsp; បោះពុម្ព: '+new Date().toLocaleDateString('km-KH',{year:'numeric',month:'long',day:'numeric'})+'</div>'
      +'</div></div>'
      +'<div class="stats">'
      +'<div class="stat-box"><div class="stat-num">'+totalHrs.toFixed(1)+'h</div><div class="stat-lbl">⏰ ម៉ោង OT សរុប</div></div>'
      +'<div class="stat-box"><div class="stat-num">$'+totalPay.toFixed(2)+'</div><div class="stat-lbl">💵 ប្រាក់ OT សរុប</div></div>'
      +'<div class="stat-box"><div class="stat-num">'+records.length+'</div><div class="stat-lbl">📋 ចំនួនករណី</div></div>'
      +'</div>'
      +'<table><colgroup><col style="width:130px"/><col style="width:38px"/><col style="width:52px"/>'
      +allDays.map(()=>'<col style="min-width:22px"/>').join('')+'</colgroup>'
      +'<thead>'
      +'<tr><th rowspan="2" style="text-align:left;padding:5px 8px">បុគ្គលិក</th>'
      +'<th rowspan="2" style="text-align:center;font-size:10px">ម៉ោង</th>'
      +'<th rowspan="2" style="text-align:center;font-size:10px">ប្រាក់</th>'
      +dayThsHtml+'</tr>'
      +'<tr>'+wdThsHtml+'</tr>'
      +'</thead>'
      +'<tbody>'+empRowsHtml
      +'<tr><td style="padding:5px 8px;font-weight:700">សរុប (Total)</td>'
      +'<td style="text-align:center;font-weight:800;color:#1a3a8f">'+totalHrs.toFixed(1)+'h</td>'
      +'<td style="text-align:center;font-weight:800;color:#276749">$'+totalPay.toFixed(2)+'</td>'
      +allDays.map(()=>'<td></td>').join('')+'</tr>'
      +'</tbody></table>'
      +'<div class="legend">'
      +'<div class="leg-item"><span class="dot" style="background:#38a169"></span> អនុម័ត (Approved)</div>'
      +'<div class="leg-item"><span class="dot" style="background:#d97706"></span> រង់ចាំ (Pending)</div>'
      +'<div class="leg-item"><span class="dot" style="background:#e53e3e"></span> បដិសេធ (Rejected)</div>'
      +'</div>'
      +'<div class="footer">'
      +'<div class="sign"><div style="height:30px"></div>ហត្ថលេខាអ្នកគ្រប់គ្រង HR</div>'
      +'<div class="sign"><div style="height:30px"></div>ហត្ថលេខាអ្នកអនុម័ត</div>'
      +'<div class="sign"><div style="height:30px"></div>ហត្ថលេខានាយក</div>'
      +'</div>'
      +'</body></html>';
    printHTML(html);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ── OT PDF Print (List view) ─────────────────────────────────────
async function printOTListReport(month) {
  showToast('កំពុង Generate PDF...','info');
  try {
    const cfg = getCompanyConfig();
    const data = await api('GET','/overtime');
    const records = (data.records||[]).filter(r=>(r.date||'').startsWith(month));
    const totalHrs = records.reduce((s,r)=>s+(r.hours||0),0);
    const totalPay = records.reduce((s,r)=>s+(r.pay||0),0);
    const monthName = new Date(...month.split('-').map((v,i)=>i===1?+v-1:+v)).toLocaleDateString('km-KH',{year:'numeric',month:'long'});

    const statusBadge = s => s==='approved'
      ? '<span style="background:#c6f6d5;color:#276749;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700">✅ អនុម័ត</span>'
      : s==='rejected'
      ? '<span style="background:#fed7d7;color:#c53030;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700">❌ បដិសេធ</span>'
      : '<span style="background:#fefcbf;color:#744210;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700">⏳ រង់ចាំ</span>';

    const rowsHtml = records.map((r,i)=>'<tr>'
      +'<td style="text-align:center;color:#718096">'+(i+1)+'</td>'
      +'<td style="font-weight:600">'+r.employee_name+'</td>'
      +'<td style="font-family:monospace">'+r.date+'</td>'
      +'<td style="text-align:center;font-weight:700;color:#2b6cb0">'+r.hours+'h</td>'
      +'<td style="text-align:center;font-family:monospace">$'+r.rate+'/h</td>'
      +'<td style="text-align:center;font-weight:700;color:#276749">$'+Number(r.pay).toFixed(2)+'</td>'
      +'<td style="color:#4a5568;font-size:10px">'+(r.reason||'—')+'</td>'
      +'<td>'+statusBadge(r.status)+'</td>'
      +'</tr>').join('');

    const logoHtml = cfg.logo_url
      ? '<img src="'+cfg.logo_url+'" style="width:52px;height:52px;object-fit:contain;border-radius:10px;border:2px solid #e2e8f0">'
      : '<div style="width:52px;height:52px;background:linear-gradient(135deg,#1a3a8f,#2563eb);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:18px">HR</div>';

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@300;400;600;700;800&display=swap" rel="stylesheet">'
      +'<title>OT List '+month+'</title>'
      +'<style>'
      +'*{box-sizing:border-box;margin:0;padding:0;font-family:"Noto Sans Khmer",sans-serif}'
      +'body{padding:14px;color:#1a202c;background:white;font-size:11px}'
      +'.hdr{display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-bottom:12px;border-bottom:3px solid #1a3a8f}'
      +'.co-name{font-size:18px;font-weight:800;color:#1a3a8f}'
      +'.rpt-title{font-size:13px;font-weight:700;color:#2d3748;margin-top:2px}'
      +'.rpt-sub{font-size:10px;color:#718096;margin-top:1px}'
      +'.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}'
      +'.stat-box{background:linear-gradient(135deg,#ebf4ff,#dbeafe);border:1px solid #bee3f8;border-radius:10px;padding:10px 14px;text-align:center}'
      +'.stat-num{font-size:18px;font-weight:800;color:#1a3a8f}'
      +'.stat-lbl{font-size:9px;color:#4a5568;margin-top:2px;font-weight:600}'
      +'table{width:100%;border-collapse:collapse;font-size:11px}'
      +'th{background:#1a3a8f;color:white;padding:7px 8px;text-align:left;font-weight:700}'
      +'td{padding:5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:middle}'
      +'tr:nth-child(even) td{background:#f7fafc}'
      +'.tot-row td{font-weight:800;background:#ebf4ff!important;border-top:2px solid #1a3a8f}'
      +'.footer{margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}'
      +'.sign{border-top:1px dashed #a0aec0;padding-top:6px;text-align:center;font-size:9px;color:#718096}'
      +'@media print{@page{size:A4;margin:8mm}body{padding:0}}'
      +'</style></head><body>'
      +'<div class="hdr">'+logoHtml
      +'<div>'
      +'<div class="co-name">'+(cfg.company_name||'HR Pro')+'</div>'
      +'<div class="rpt-title">📋 បញ្ជីថែមម៉ោង — OT List Report</div>'
      +'<div class="rpt-sub">ខែ: '+monthName+' &nbsp;|&nbsp; បោះពុម្ព: '+new Date().toLocaleDateString('km-KH',{year:'numeric',month:'long',day:'numeric'})+'</div>'
      +'</div></div>'
      +'<div class="stats">'
      +'<div class="stat-box"><div class="stat-num">'+totalHrs.toFixed(1)+'h</div><div class="stat-lbl">⏰ ម៉ោង OT សរុប</div></div>'
      +'<div class="stat-box"><div class="stat-num">$'+totalPay.toFixed(2)+'</div><div class="stat-lbl">💵 ប្រាក់ OT សរុប</div></div>'
      +'<div class="stat-box"><div class="stat-num">'+records.length+'</div><div class="stat-lbl">📋 ចំនួនករណី</div></div>'
      +'</div>'
      +'<table><thead><tr>'
      +'<th style="width:30px;text-align:center">#</th>'
      +'<th>ឈ្មោះបុគ្គលិក</th>'
      +'<th>កាលបរិច្ឆេទ</th>'
      +'<th style="text-align:center">ម៉ោង</th>'
      +'<th style="text-align:center">អត្រា</th>'
      +'<th style="text-align:center">ប្រាក់ OT</th>'
      +'<th>មូលហេតុ</th>'
      +'<th>ស្ថានភាព</th>'
      +'</tr></thead>'
      +'<tbody>'+rowsHtml+'</tbody>'
      +'<tfoot><tr class="tot-row">'
      +'<td colspan="3" style="text-align:right;padding:6px 8px">សរុប (Total):</td>'
      +'<td style="text-align:center;color:#1a3a8f">'+totalHrs.toFixed(1)+'h</td>'
      +'<td></td>'
      +'<td style="text-align:center;color:#276749">$'+totalPay.toFixed(2)+'</td>'
      +'<td colspan="2"></td>'
      +'</tr></tfoot>'
      +'</table>'
      +'<div class="footer">'
      +'<div class="sign"><div style="height:30px"></div>ហត្ថលេខាអ្នកគ្រប់គ្រង HR</div>'
      +'<div class="sign"><div style="height:30px"></div>ហត្ថលេខាអ្នកអនុម័ត</div>'
      +'<div class="sign"><div style="height:30px"></div>ហត្ថលេខានាយក</div>'
      +'</div>'
      +'</body></html>';
    printHTML(html);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ── OT Excel Export ──────────────────────────────────────────────
async function exportOTExcel(month) {
  showToast('កំពុង Export Excel...','info');
  try {
    const cfg = getCompanyConfig();
    const [empData, otData] = await Promise.all([
      api('GET','/employees?limit=500'),
      api('GET','/overtime')
    ]);
    const emps = empData.employees||[];
    const records = (otData.records||[]).filter(r=>(r.date||'').startsWith(month));

    // Build OT map: empId -> { day -> [records] }  (same logic as PDF)
    const otMap = {};
    records.forEach(r => {
      if (!otMap[r.employee_id]) otMap[r.employee_id] = {};
      const dd = (r.date||'').slice(-2).replace(/^0/,'');
      if (!otMap[r.employee_id][dd]) otMap[r.employee_id][dd] = [];
      otMap[r.employee_id][dd].push(r);
    });

    // Days in month  (same logic as PDF)
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const allDays = [];
    const wdNames = ['អា','ច','អ','ព','ព្រ','សុ','ស'];
    for (let d = 1; d <= daysInMonth; d++) {
      const wd = new Date(y, m-1, d).getDay();
      allDays.push({ d, wd });
    }

    const totH = records.reduce((s,r)=>s+(r.hours||0),0);
    const totP = records.reduce((s,r)=>s+(r.pay||0),0);
    const companyName = cfg.company_name||'HR Pro';

    // ── Sheet 1: Matrix (Calendar) — same layout as PDF ──────────
    // Header row 1: ឈ្មោះ | ម៉ោង | ប្រាក់ | 1 | 2 | 3 ... 31
    // Header row 2: (blank) | (blank) | (blank) | អា | ច | ...
    const matrixDayHeaders = allDays.map(({d}) => d);          // numbers
    const matrixWdHeaders  = allDays.map(({wd}) => wdNames[wd]); // day names

    // Row 1 = day numbers  (used as column headers in buildXLSX)
    const matrixHeaders = ['ឈ្មោះបុគ្គលិក','ម៉ោងសរុប','ប្រាក់ OT ($)', ...matrixDayHeaders];

    // Build one row per employee (only those with OT, same as PDF)
    const matrixRows = [];
    // Day-of-week sub-header row
    matrixRows.push(['', '', '', ...matrixWdHeaders]);

    emps.forEach(emp => {
      const empOT = otMap[emp.id] || {};
      const empTotal = Object.values(empOT).flat().reduce((s,r)=>s+(r.hours||0),0);
      const empPay   = Object.values(empOT).flat().reduce((s,r)=>s+(r.pay||0),0);
      if (empTotal === 0) return; // hide emp with no OT (same as PDF)

      const dayCells = allDays.map(({d}) => {
        const dayRecs = empOT[String(d)] || [];
        if (!dayRecs.length) return '';
        const hrs = dayRecs.reduce((s,r)=>s+(r.hours||0),0);
        return hrs+'h';
      });

      matrixRows.push([emp.name, +empTotal.toFixed(1), +empPay.toFixed(2), ...dayCells]);
    });

    // Total row
    matrixRows.push(['']);
    matrixRows.push(['សរុប (Total)', +totH.toFixed(1), +totP.toFixed(2), ...allDays.map(()=>'')]);

    // ── Sheet 2: Detail list — same columns as PDF list view ─────
    const detailHeaders = ['#','ឈ្មោះបុគ្គលិក','កាលបរិច្ឆេទ','ម៉ោង','អត្រា ($/h)','ប្រាក់ OT ($)','មូលហេតុ','ស្ថានភាព'];
    const detailRows = records.map((r,i)=>[
      i+1,
      r.employee_name||'',
      r.date||'',
      r.hours||0,
      r.rate||0,
      +(+r.pay||0).toFixed(2),
      r.reason||'',
      r.status==='approved'?'អនុម័ត':r.status==='rejected'?'បដិសេធ':'រង់ចាំ'
    ]);
    detailRows.push(['','','','','','','','']);
    detailRows.push(['','សរុប (Total)','',+totH.toFixed(1),'',+totP.toFixed(2),'','']);

    const blob = buildXLSX([
      { name: 'OT Matrix '+month,  headers: matrixHeaders,  rows: matrixRows  },
      { name: 'OT Detail '+month,  headers: detailHeaders,  rows: detailRows  },
    ]);
    downloadBlob(blob, companyName+'_OT_Report_'+month+'.xlsx');
    showToast('Download OT Excel បានជោគជ័យ! ✅','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}


// Show detail list of OT records for one employee in a month
async function renderOTDetailList(empId, empName, month) {
  const data = await api('GET','/overtime');
  const recs = (data.records||[]).filter(r=>r.employee_id===empId && (r.date||'').startsWith(month));
  $('modal-title').textContent = '📋 OT — '+empName+' ('+month+')';
  const rows = recs.length===0
    ? '<p style="color:var(--text3);text-align:center;padding:20px">គ្មានទិន្នន័យ</p>'
    : '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      +'<thead><tr style="background:var(--bg3)"><th style="padding:6px;text-align:left">ថ្ងៃខែ</th><th style="text-align:center">ម៉ោង</th><th style="text-align:right">ប្រាក់</th><th style="text-align:center">ស្ថានភាព</th><th></th></tr></thead>'
      +'<tbody>'+recs.map(r=>'<tr style="border-bottom:1px solid var(--border)">'
        +'<td style="padding:5px 6px;font-family:var(--mono);font-size:11px">'+r.date+'<br><span style="color:var(--text3);font-size:10px">'+(r.reason||'')+'</span></td>'
        +'<td style="text-align:center;font-weight:700;color:var(--primary)">'+r.hours+'h</td>'
        +'<td style="text-align:right;font-weight:700;color:var(--success)">$'+r.pay+'</td>'
        +'<td style="text-align:center">'+(r.status==='approved'?'<span class="badge badge-green">✅</span>':r.status==='rejected'?'<span class="badge badge-red">❌</span>':'<span class="badge badge-yellow">⏳</span>')+'</td>'
        +'<td style="text-align:center"><button class="btn btn-outline btn-sm" onclick="openEditOvertimeModal('+r.id+')">✏️</button>'
        +'<button class="btn btn-danger btn-sm" onclick="deleteRecord(\'overtime\','+r.id+',renderOvertime)">🗑️</button></td>'
        +'</tr>').join('')+'</tbody>'
      +'</table>';
  $('modal-body').innerHTML = '<div style="max-height:70vh;overflow-y:auto">'+rows+'</div>'
    +'<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បិទ</button></div>';
  openModal();
}

// List view (original table style)
async function renderOTListView(month) {
  showLoading();
  try {
    const data = await api('GET','/overtime');
    const records = (data.records||[]).filter(r=>(r.date||'').startsWith(month));
    const totalHrs = records.reduce((s,r)=>s+(r.hours||0),0);
    const totalPay = records.reduce((s,r)=>s+(r.pay||0),0);
    const rows = records.length===0
      ? '<tr><td colspan="8"><div class="empty-state" style="padding:30px"><p>គ្មានទិន្នន័យ</p></div></td></tr>'
      : records.map(r=>{
          const photo = getEmpPhoto(r.employee_id);
          const av = photo
            ? '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+';overflow:hidden;padding:0"><img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
            : '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+';">'+(r.employee_name||'?')[0]+'</div>';
          return '<tr>'
            +'<td><div class="employee-cell">'+av+'<div class="emp-name">'+r.employee_name+'</div></div></td>'
            +'<td style="font-family:var(--mono);font-size:12px">'+r.date+'</td>'
            +'<td><span style="font-weight:700;color:var(--primary)">'+r.hours+'h</span></td>'
            +'<td style="font-family:var(--mono)">$'+r.rate+'/h</td>'
            +'<td style="font-family:var(--mono);color:var(--success);font-weight:600">$'+r.pay+'</td>'
            +'<td style="color:var(--text3);font-size:12px">'+(r.reason||'—')+'</td>'
            +'<td>'+(r.status==='approved'?'<span class="badge badge-green">✅ អនុម័ត</span>':r.status==='rejected'?'<span class="badge badge-red">❌ បដិសេធ</span>':'<span class="badge badge-yellow">⏳ រង់ចាំ</span>')+'</td>'
            +'<td><div class="action-btns">'
            +(r.status==='pending'?'<button class="btn btn-success btn-sm" onclick="approveOvertime('+r.id+')">✅</button><button class="btn btn-danger btn-sm" onclick="rejectOvertime('+r.id+')">❌</button>':'')
            +'<button class="btn btn-outline btn-sm" onclick="openEditOvertimeModal('+r.id+')">✏️</button>'
            +'<button class="btn btn-danger btn-sm" onclick="deleteRecord(\'overtime\','+r.id+',renderOvertime)">🗑️</button>'
            +'</div></td></tr>';
        }).join('');
    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>ថែមម៉ោង — បញ្ជី</h2><p>'+records.length+' កំណត់ត្រា</p></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<button class="btn btn-outline" onclick="window._otMonth=\''+month+'\';renderOvertime()">📊 តារាងខែ</button>'
      +'<button class="btn btn-outline" onclick="printOTListReport(\''+month+'\')" ><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:3px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>PDF</button>'
      +'<button class="btn btn-outline" onclick="exportOTExcel(\''+month+'\')" style="border-color:var(--success);color:var(--success)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:3px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Excel</button>'
      +'<button class="btn btn-primary" onclick="openOvertimeModal()">+ បន្ថែម</button>'
      +'</div></div>'
      +'<div class="card"><div class="table-container"><table>'
      +'<thead><tr><th>បុគ្គលិក</th><th>កាលបរិច្ឆេទ</th><th>ម៉ោង</th><th>អត្រា</th><th>ប្រាក់</th><th>មូលហេតុ</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'</table></div></div>';
  } catch(e) { showError(e.message); }
}


async function openEditOvertimeModal(id) {
  try {
    const data = await api('GET','/overtime');
    const r = (data.records||[]).find(x=>x.id===id);
    if (!r) { showToast('រកកំណត់ត្រាមិនឃើញ!','error'); return; }
    $('modal-title').textContent = 'កែប្រែ OT — '+r.employee_name;
    $('modal-body').innerHTML =
      '<div class="form-grid">'
      +'<div class="form-group"><label class="form-label">កាលបរិច្ឆេទ</label><input class="form-control" id="ote-date" type="date" value="'+(r.date||today())+'" /></div>'
      +'<div class="form-group"><label class="form-label">ចំនួនម៉ោង *</label><input class="form-control" id="ote-hours" type="number" value="'+r.hours+'" min="0.5" step="0.5" oninput="calcOTPay()" /></div>'
      +'<div class="form-group"><label class="form-label">អត្រា/ម៉ោង *</label><input class="form-control" id="ote-rate" type="number" value="'+r.rate+'" oninput="calcOTPay()" /></div>'
      +'<div class="form-group"><label class="form-label">ស្ថានភាព</label><select class="form-control" id="ote-status"><option value="pending"'+(r.status==='pending'?' selected':'')+'>⏳ រង់ចាំ</option><option value="approved"'+(r.status==='approved'?' selected':'')+'>✅ អនុម័ត</option><option value="rejected"'+(r.status==='rejected'?' selected':'')+'>❌ បដិសេធ</option></select></div>'
      +'<div class="form-group full-width"><label class="form-label">មូលហេតុ</label><input class="form-control" id="ote-reason" value="'+(r.reason||'')+'" /></div>'
      +'</div>'
      +'<div id="ote-preview" style="margin:10px 0;padding:10px;background:var(--bg3);border-radius:8px;text-align:center;font-weight:700;color:var(--success);font-family:var(--mono)">ប្រាក់ OT: $'+r.pay+'</div>'
      +'<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
      +'<button class="btn btn-primary" onclick="saveEditOvertime('+id+')">💾 រក្សាទុក</button></div>';
    openModal();
  } catch(e) { showToast('Error: '+e.message,'error'); }
}
function calcOTPay() {
  const h=parseFloat($('ote-hours')?.value)||0, r=parseFloat($('ote-rate')?.value)||0;
  const p=$('ote-preview'); if(p) p.textContent='ប្រាក់ OT: $'+(h*r).toFixed(2);
}
async function saveEditOvertime(id) {
  const hours=parseFloat($('ote-hours')?.value)||0, rate=parseFloat($('ote-rate')?.value)||0;
  if(!hours||!rate){showToast('សូមបំពេញ!','error');return;}
  try {
    await api('PUT','/overtime/'+id,{date:$('ote-date')?.value,hours,rate,pay:hours*rate,reason:$('ote-reason')?.value,status:$('ote-status')?.value});
    showToast('កែប្រែ OT បានជោគជ័យ!','success'); closeModal(); renderOvertime();
  } catch(e){showToast('Error: '+e.message,'error');}
}



async function openOvertimeModal() {
  await ensureEmployees();
  $('modal-title').textContent = 'កត់ត្រាថែមម៉ោង';
  $('modal-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group full-width"><label class="form-label">បុគ្គលិក *</label>
        <select class="form-control" id="ot-emp">${state.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">កាលបរិច្ឆេទ *</label><input class="form-control" id="ot-date" type="date" value="${today()}" /></div>
      <div class="form-group"><label class="form-label">វេន OT</label>
        <select class="form-control" id="ot-shift" onchange="applyOTShiftPreset()">
          <option value="day">☀️ ថ្ងៃ (Day)</option>
          <option value="evening">🌆 ល្ងាច (Evening)</option>
          <option value="night">🌙 យប់ (Night)</option>
          <option value="custom">✏️ កំណត់ខ្លួនឯង</option>
        </select>
      </div>
      <div class="form-group"></div>
      <div class="form-group"><label class="form-label">ម៉ោងចាប់ផ្តើម</label><input class="form-control" id="ot-start" type="time" value="17:00" oninput="calcOTHoursFromTime()" /></div>
      <div class="form-group"><label class="form-label">ម៉ោងបញ្ចប់</label><input class="form-control" id="ot-end" type="time" value="19:00" oninput="calcOTHoursFromTime()" /></div>
      <div class="form-group"><label class="form-label">ចំនួនម៉ោង *</label><input class="form-control" id="ot-hours" type="number" placeholder="2" min="0.5" step="0.5" value="2" oninput="updateOTPayPreview()" /></div>
      <div class="form-group"><label class="form-label">អត្រា/ម៉ោង (USD) *</label><input class="form-control" id="ot-rate" type="number" placeholder="5" value="${getSalaryRules().default_ot_hourly_rate||''}" oninput="updateOTPayPreview()" /></div>
      <div class="form-group full-width"><label class="form-label">មូលហេតុ</label><input class="form-control" id="ot-reason" placeholder="មូលហេតុថែមម៉ោង..." /></div>
    </div>
    <div id="ot-pay-preview" style="margin:10px 0;padding:10px;background:var(--bg3);border-radius:8px;text-align:center;font-weight:700;color:var(--success);font-family:var(--mono)">ប្រាក់ OT: $0.00</div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>
      <button class="btn btn-primary" onclick="saveOvertime()">រក្សាទុក</button>
    </div>`;
  updateOTPayPreview();
  openModal();
}

function applyOTShiftPreset() {
  const shift = $('ot-shift')?.value;
  const startEl = $('ot-start'), endEl = $('ot-end');
  if (!startEl || !endEl) return;
  if (shift === 'day')     { startEl.value = '08:00'; endEl.value = '12:00'; }
  else if (shift === 'evening') { startEl.value = '17:00'; endEl.value = '20:00'; }
  else if (shift === 'night')   { startEl.value = '20:00'; endEl.value = '23:00'; }
  // custom: leave as-is
  calcOTHoursFromTime();
}

function calcOTHoursFromTime() {
  const s = $('ot-start')?.value, e = $('ot-end')?.value;
  if (!s || !e) return;
  const [sh,sm] = s.split(':').map(Number), [eh,em] = e.split(':').map(Number);
  let diff = (eh*60+em) - (sh*60+sm);
  if (diff <= 0) diff += 24*60; // overnight
  const hrs = Math.round((diff/60)*2)/2; // round to 0.5
  const hoursEl = $('ot-hours');
  if (hoursEl) { hoursEl.value = hrs > 0 ? hrs : ''; }
  updateOTPayPreview();
}

function updateOTPayPreview() {
  const h = parseFloat($('ot-hours')?.value)||0;
  const r = parseFloat($('ot-rate')?.value)||0;
  const p = $('ot-pay-preview');
  if (p) p.textContent = 'ប្រាក់ OT: $' + (h*r).toFixed(2);
}

async function saveOvertime() {
  const hours = parseFloat($('ot-hours').value)||0;
  const rate = parseFloat($('ot-rate').value)||0;
  if (!hours||!rate) { showToast('សូមបំពេញម៉ោង និងអត្រា!','error'); return; }
  const shiftMap = { day:'☀️ ថ្ងៃ', evening:'🌆 ល្ងាច', night:'🌙 យប់', custom:'✏️ Custom' };
  const shiftVal = $('ot-shift')?.value || 'custom';
  const shiftLabel = shiftMap[shiftVal] || '';
  const startT = $('ot-start')?.value || '';
  const endT = $('ot-end')?.value || '';
  const timeRange = startT && endT ? ` (${startT}–${endT})` : '';
  const baseReason = $('ot-reason').value;
  const fullReason = [shiftLabel + timeRange, baseReason].filter(Boolean).join(' | ');
  try {
    await api('POST','/overtime',{ employee_id:parseInt($('ot-emp').value), date:$('ot-date').value, hours, rate, pay:hours*rate, reason:fullReason, status:'pending' });
    showToast('កត់ត្រាថែមម៉ោងបានជោគជ័យ!','success'); closeModal(); renderOvertime();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

async function approveOvertime(id) {
  try { await api('PUT',`/overtime/${id}`,{status:'approved'}); showToast('អនុម័តបានជោគជ័យ!','success'); renderOvertime(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}
async function rejectOvertime(id) {
  try { await api('PUT',`/overtime/${id}`,{status:'rejected'}); showToast('បដិសេធ!','warning'); renderOvertime(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ============================================================
// 2. ប្រាក់ឧបត្ថម្ភ (ALLOWANCE)
// ============================================================
async function renderAllowance() {
  showLoading();
  try {
    const data = await api('GET','/allowances');
    const records = data.records || [];
    const total = records.reduce((s,r)=>s+(r.amount||0),0);
    const types = [...new Set(records.map(r=>r.type))];
    contentArea().innerHTML = `
      <div class="page-header">
        <div><h2>ប្រាក់ឧបត្ថម្ភ</h2><p>គ្រប់ប្រភេទ Allowance</p></div>
        <button class="btn btn-primary" onclick="openAllowanceModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          បន្ថែម
        </button>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        ${['ចំណូលធ្វើដំណើរ','ចំណីអាហារ','លំនៅដ្ឋាន','ទូរស័ព្ទ'].map(t=>{
          const sum = records.filter(r=>r.type===t).reduce((s,r)=>s+(r.amount||0),0);
          return `<div class="stat-card" style="flex-direction:column;align-items:flex-start;gap:6px">
            <div class="stat-label">${t}</div>
            <div style="font-size:20px;font-weight:700;font-family:var(--mono);color:var(--warning)">$${sum.toFixed(0)}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="card"><div class="table-container"><table>
        <thead><tr><th>បុគ្គលិក</th><th>ប្រភេទ</th><th>ចំនួន (USD)</th><th>ខែ</th><th>ចំណាំ</th><th>សកម្មភាព</th></tr></thead>
        <tbody>${records.length===0
          ? `<tr><td colspan="6"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានប្រាក់ឧបត្ថម្ភ</p></div></td></tr>`
          : records.map(r=>`<tr>
            <td><div class="employee-cell"><div class="emp-avatar" style="background:${getColor(r.employee_name)}">${(r.employee_name||'?')[0]}</div><div class="emp-name">${r.employee_name}</div></div></td>
            <td><span class="badge badge-blue">${r.type}</span></td>
            <td style="font-family:var(--mono);font-weight:700;color:var(--success)">$${r.amount}</td>
            <td style="font-family:var(--mono)">${r.month}</td>
            <td style="color:var(--text3)">${r.note||'—'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteRecord('allowances',${r.id},renderAllowance)">🗑️</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div></div>`;
  } catch(e) { showError(e.message); }
}

async function openAllowanceModal() {
  await ensureEmployees();
  $('modal-title').textContent = 'បន្ថែមប្រាក់ឧបត្ថម្ភ';
  $('modal-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group full-width"><label class="form-label">បុគ្គលិក *</label>
        <select class="form-control" id="al-emp">${state.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">ប្រភេទ *</label>
        <select class="form-control" id="al-type">
          <option>ចំណូលធ្វើដំណើរ</option><option>ចំណីអាហារ</option>
          <option>លំនៅដ្ឋាន</option><option>ទូរស័ព្ទ</option><option>ផ្សេងៗ</option>
        </select></div>
      <div class="form-group"><label class="form-label">ចំនួន (USD) *</label><input class="form-control" id="al-amount" type="number" placeholder="50" /></div>
      <div class="form-group"><label class="form-label">ខែ</label><input class="form-control" id="al-month" type="month" value="${thisMonth()}" /></div>
      <div class="form-group full-width"><label class="form-label">ចំណាំ</label><input class="form-control" id="al-note" placeholder="ចំណាំ..." /></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>
      <button class="btn btn-primary" onclick="saveAllowance()">រក្សាទុក</button>
    </div>`;
  openModal();
}

async function saveAllowance() {
  const amount = parseFloat($('al-amount').value)||0;
  if (!amount) { showToast('សូមបំពេញចំនួន!','error'); return; }
  try {
    await api('POST','/allowances',{ employee_id:parseInt($('al-emp').value), type:$('al-type').value, amount, month:$('al-month').value, note:$('al-note').value });
    showToast('បន្ថែមប្រាក់ឧបត្ថម្ភបានជោគជ័យ!','success'); closeModal(); renderAllowance();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ============================================================
// 3. ប្រាក់ខ្ចីបុគ្គលិក (LOANS)
// ============================================================
async function renderLoans() {
  showLoading();
  try {
    const data = await api('GET','/loans');
    const records = data.records || [];
    const totalLoan = records.reduce((s,r)=>s+(r.amount||0),0);
    const totalPaid = records.reduce((s,r)=>s+(r.paid_amount||0),0);
    const totalLeft = totalLoan - totalPaid;
    contentArea().innerHTML = `
      <div class="page-header">
        <div><h2>ប្រាក់ខ្ចីបុគ្គលិក</h2><p>គ្រប់គ្រងការខ្ចីប្រាក់</p></div>
        <button class="btn btn-primary" onclick="openLoanModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ផ្តល់ប្រាក់ខ្ចី
        </button>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div><div class="stat-label">ប្រាក់ខ្ចីសរុប</div><div class="stat-value">$${totalLoan.toFixed(0)}</div></div></div>
        <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div><div class="stat-label">បានសងសរុប</div><div class="stat-value" style="color:var(--success)">$${totalPaid.toFixed(0)}</div></div></div>
        <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div><div class="stat-label">💰 នៅសល់ត្រូវសង</div><div class="stat-value" style="color:var(--danger)">$${totalLeft.toFixed(0)}</div></div></div>
        <div class="stat-card"><div class="stat-icon yellow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
          <div><div class="stat-label">ចំនួនករណី</div><div class="stat-value" style="color:var(--info)">${records.length}</div></div></div>
      </div>
      <div class="card"><div class="table-container"><table>
        <thead><tr><th>បុគ្គលិក</th><th>ចំនួន</th><th>ដំណាក់/ខែ</th><th>បានសង</th><th>នៅសល់</th><th>ថ្ងៃខ្ចី</th><th>ផុតកំណត់</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>
        <tbody>${records.length===0
          ? '<tr><td colspan="9"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានការខ្ចីប្រាក់</p></div></td></tr>'
          : records.map(r=>{
            const left = (r.amount||0)-(r.paid_amount||0);
            const status = left<=0?'paid':r.status;
            const installAmt = r.installment_amount ? '$'+r.installment_amount+'/ខែ' : '—';
            const installMonths = r.installment_months ? '×'+r.installment_months+'ខែ' : '';
            const photo = getEmpPhoto(r.employee_id);
            const av = photo
              ? '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+';overflow:hidden;padding:0"><img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
              : '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+'">'+(r.employee_name||'?')[0]+'</div>';
            return '<tr>'
              +'<td><div class="employee-cell">'+av+'<div class="emp-name">'+r.employee_name+'</div></div></td>'
              +'<td style="font-family:var(--mono);font-weight:700">$'+r.amount+'</td>'
              +'<td><span style="font-size:11px;color:var(--primary);font-weight:700">'+installAmt+'</span><span style="font-size:10px;color:var(--text3)"> '+installMonths+'</span></td>'
              +'<td style="font-family:var(--mono);color:var(--success)">$'+(r.paid_amount||0)+'</td>'
              +'<td style="font-family:var(--mono);color:'+(left>0?'var(--danger)':'var(--success)')+';font-weight:700">$'+left.toFixed(0)+'</td>'
              +'<td style="font-family:var(--mono);font-size:11px">'+(r.loan_date||'—')+'</td>'
              +'<td style="font-family:var(--mono);font-size:11px">'+(r.due_date||'—')+'</td>'
              +'<td>'+(status==='paid'?'<span class="badge badge-green">✅ សងរួច</span>':'<span class="badge badge-yellow">⏳ កំពុងសង</span>')+'</td>'
              +'<td><div class="action-btns">'
              +(left>0?'<button class="btn btn-success btn-sm" onclick="openRepayModal('+r.id+',\''+r.employee_name+'\','+left+','+(r.installment_amount||0)+')">💰 សង/កាត់</button>':'')
              +'<button class="btn btn-danger btn-sm" onclick="deleteRecord(\'loans\','+r.id+',renderLoans)">🗑️</button>'
              +'</div></td>'
              +'</tr>';
          }).join('')}
        </tbody>
      </table></div></div>`;
  } catch(e) { showError(e.message); }
}

async function openLoanModal() {
  await ensureEmployees();
  $('modal-title').textContent = 'ផ្តល់ប្រាក់ខ្ចី';
  $('modal-body').innerHTML =
    '<div class="form-grid">'
    +'<div class="form-group full-width"><label class="form-label">បុគ្គលិក *</label>'
    +'<select class="form-control" id="ln-emp">'+state.employees.map(e=>'<option value="'+e.id+'">'+e.name+'</option>').join('')+'</select></div>'
    +'<div class="form-group"><label class="form-label">ចំនួនខ្ចី (USD) *</label><input class="form-control" id="ln-amount" type="number" placeholder="500" oninput="calcLoanInstall()" /></div>'
    +'<div class="form-group"><label class="form-label">ថ្ងៃខ្ចី</label><input class="form-control" id="ln-date" type="date" value="'+today()+'" /></div>'
    +'<div class="form-group"><label class="form-label">ចំនួនដំណាក់កាល (ខែ)</label><input class="form-control" id="ln-months" type="number" placeholder="6" value="6" min="1" max="60" oninput="calcLoanInstall()" /></div>'
    +'<div class="form-group"><label class="form-label">ថ្ងៃផុតកំណត់</label><input class="form-control" id="ln-due" type="date" /></div>'
    +'<div class="form-group full-width">'
    +'<div id="ln-install-preview" style="padding:12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-size:13px;color:var(--text3)">បំពេញចំនួន និងដំណាក់កាលដើម្បីមើល...</div>'
    +'</div>'
    +'<div class="form-group full-width"><label class="form-label">ចំណាំ</label><input class="form-control" id="ln-note" placeholder="មូលហេតុខ្ចីប្រាក់..." /></div>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" onclick="saveLoan()">រក្សាទុក</button>'
    +'</div>';
  openModal();
}

function calcLoanInstall() {
  const amount = parseFloat(document.getElementById('ln-amount')?.value)||0;
  const months = parseInt(document.getElementById('ln-months')?.value)||1;
  const prev = document.getElementById('ln-install-preview');
  if (!prev) return;
  if (!amount) { prev.textContent = 'បំពេញចំនួន...'; return; }
  const perMonth = (amount / months).toFixed(2);
  prev.innerHTML = '<span style="color:var(--primary);font-weight:700">💡 កាត់ប្រាក់ខែ: $'+perMonth+'/ខែ × '+months+' ខែ</span>'
    + ' <span style="color:var(--text3);font-size:11px">(សរុប $'+amount.toFixed(2)+')</span>';
  // Auto-set due date
  const dueEl = document.getElementById('ln-due');
  if (dueEl) {
    const due = new Date();
    due.setMonth(due.getMonth() + months);
    dueEl.value = due.toISOString().split('T')[0];
  }
}



async function saveLoan() {
  const amount = parseFloat($('ln-amount')?.value)||0;
  const months = parseInt($('ln-months')?.value)||1;
  if (!amount) { showToast('សូមបំពេញចំនួន!','error'); return; }
  const perMonth = parseFloat((amount/months).toFixed(2));
  try {
    await api('POST','/loans',{
      employee_id: parseInt($('ln-emp').value),
      amount, loan_date: $('ln-date').value, due_date: $('ln-due').value,
      note: $('ln-note').value, paid_amount: 0, status: 'active',
      installment_months: months, installment_amount: perMonth,
    });
    showToast('ផ្តល់ប្រាក់ខ្ចី $'+amount+' — $'+perMonth+'/ខែ × '+months+' ខែ!','success');
    closeModal(); renderLoans();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

async function openRepayModal(id, name, left, installAmt) {
  $('modal-title').textContent = 'ការសង/កាត់ប្រាក់ — ' + name;
  const suggested = installAmt > 0 ? Math.min(installAmt, left) : left;
  const todayVal = new Date().toISOString().split('T')[0];
  let pmts = [];
  try {
    const allLoans = await api('GET', '/loans');
    const loanRec = (allLoans.records||[]).find(r=>r.id===id);
    pmts = loanRec?.payments || [];
  } catch(e){}

  let histHTML = '';
  if (pmts && pmts.length > 0) {
    const rows = pmts.map((p,i) =>
      '<tr>'
      +'<td style="padding:4px 8px;font-size:11px;color:var(--text3)">'+(i+1)+'</td>'
      +'<td style="padding:4px 8px;font-size:11px;font-family:var(--mono)">'+p.date+'</td>'
      +'<td style="padding:4px 8px;font-weight:700;color:var(--success);font-family:var(--mono)">-$'+parseFloat(p.amount||0).toFixed(2)+'</td>'
      +'<td style="padding:4px 8px;font-weight:700;color:var(--danger);font-family:var(--mono)">$'+parseFloat(p.remaining||0).toFixed(2)+'</td>'
      +'<td style="padding:4px 8px;font-size:10px;color:var(--text3)">'+(p.note||'—')+'</td>'
      +'</tr>'
    ).join('');
    histHTML = '<div style="margin-bottom:14px">'
      +'<div style="font-size:12px;color:var(--text3);margin-bottom:6px;font-weight:600">📋 ប្រវត្តិការសង/កាត់</div>'
      +'<div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">'
      +'<table style="width:100%;font-size:11px;border-collapse:collapse">'
      +'<thead><tr style="background:var(--bg2)">'
      +'<th style="padding:5px 8px;text-align:left">#</th>'
      +'<th style="padding:5px 8px;text-align:left">កាលបរិច្ឆេទ</th>'
      +'<th style="padding:5px 8px;text-align:left">បានកាត់</th>'
      +'<th style="padding:5px 8px;text-align:left">នៅសល់</th>'
      +'<th style="padding:5px 8px;text-align:left">ចំណាំ</th>'
      +'</tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'</table></div></div>';
  }

  $('modal-body').innerHTML =
    '<div style="margin-bottom:14px;padding:12px;background:var(--bg3);border-radius:10px;display:flex;gap:20px;flex-wrap:wrap;align-items:center">'
    +'<div><div style="font-size:11px;color:var(--text3)">នៅសល់ត្រូវសង</div>'
    +'<div style="font-size:22px;font-weight:800;font-family:var(--mono);color:var(--danger)">$'+left.toFixed(2)+'</div></div>'
    +(installAmt>0?'<div><div style="font-size:11px;color:var(--text3)">ត្រូវតាម fix/ខែ</div><div style="font-size:14px;font-weight:700;color:var(--primary)">$'+installAmt+'/ខែ</div></div>':'')
    +'</div>'
    + histHTML
    +'<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px">'
    +'<div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:12px">✏️ កាត់/សង តាមសាច់ប្រាក់ (ដោយដៃ)</div>'
    +'<div class="form-grid">'
    +'<div class="form-group"><label class="form-label">ចំនួនកាត់ (USD) *</label>'
    +'<input class="form-control" id="rp-amount" type="number" value="'+suggested.toFixed(2)+'" max="'+left.toFixed(2)+'" step="0.01" placeholder="0.00" oninput="calcRepayRemain('+left+')" /></div>'
    +'<div class="form-group"><label class="form-label">កាលបរិច្ឆេទ</label>'
    +'<input class="form-control" id="rp-date" type="date" value="'+todayVal+'" /></div>'
    +'<div class="form-group full-width"><label class="form-label">ចំណាំ (ស្រេចចិត្ត)</label>'
    +'<input class="form-control" id="rp-note" placeholder="ខែ១ / លុយខៀវ / ហ.ស..." /></div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">'
    +(installAmt>0?'<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'rp-amount\').value=\''+Math.min(installAmt,left).toFixed(2)+'\';calcRepayRemain('+left+')">💡 ដំណាក់ $'+installAmt+'</button>':'')
    +'<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'rp-amount\').value=\''+left.toFixed(2)+'\';calcRepayRemain('+left+')">🔚 សងទាំងអស់ $'+left.toFixed(2)+'</button>'
    +'</div>'
    +'<div id="rp-preview" style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:8px;font-size:12px;display:none">'
    +'<span style="color:var(--text3)">នៅសល់ក្រោយកាត់: </span>'
    +'<span id="rp-remain-val" style="font-weight:800;font-family:var(--mono);color:var(--warning)"></span>'
    +'</div>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-success" onclick="saveRepay('+id+','+left+')">💸 បញ្ចូលការកាត់</button>'
    +'</div>';
  openModal();
  setTimeout(() => calcRepayRemain(left), 50);
}

function calcRepayRemain(left) {
  const amt = parseFloat(document.getElementById('rp-amount')?.value)||0;
  const preview = document.getElementById('rp-preview');
  const val = document.getElementById('rp-remain-val');
  if (!preview || !val) return;
  if (amt <= 0) { preview.style.display='none'; return; }
  const remain = Math.max(0, left - amt);
  val.textContent = '$' + remain.toFixed(2);
  val.style.color = remain <= 0 ? 'var(--success)' : 'var(--warning)';
  if (remain <= 0) val.textContent += ' ✅ សងរួច!';
  preview.style.display = 'block';
}

async function saveRepay(id, left) {
  const amount = parseFloat($('rp-amount')?.value)||0;
  if (!amount || amount > left + 0.01) { showToast('ចំនួនមិនត្រឹមត្រូវ!','error'); return; }
  const date = $('rp-date')?.value || new Date().toISOString().split('T')[0];
  const note = $('rp-note')?.value || '';
  try {
    await api('PUT', `/loans/${id}/repay`, { amount, date, note });
    const remain = Math.max(0, left - amount);
    showToast('💸 បានកាត់ $'+amount.toFixed(2)+' — នៅសល់: $'+remain.toFixed(2)+'!','success');
    closeModal(); renderLoans();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ============================================================
// 4. ស្នើរប្រាក់ចំណាយ (EXPENSE REQUESTS)
// ============================================================
async function renderExpenses() {
  showLoading();
  try {
    const [expData, genData] = await Promise.all([
      api('GET','/expenses'),
      api('GET','/general-expenses'),
    ]);
    const records = expData.records || [];
    const genRecords = genData.records || [];
    const pending = records.filter(r=>r.status==='pending').length;
    const approved = records.filter(r=>r.status==='approved').length;
    // Income = approved expense requests total
    const totalIncome = records.filter(r=>r.status==='approved').reduce((s,r)=>s+(r.amount||0),0);
    // Deduct = paid general expenses total
    const totalDeduct = genRecords.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.amount||0),0);
    const netBalance = totalIncome - totalDeduct;

    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>ស្នើរប្រាក់ចំណាយ</h2><p>Expense Requests — ចំណូល vs ចំណាយ</p></div>'
      +'<button class="btn btn-primary" onclick="openExpenseModal()">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ស្នើរថ្មី</button>'
      +'</div>'

      // Balance summary banner
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">'
      +'<div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>'
      +'<div><div class="stat-label">💚 ចំណូលអនុម័ត</div><div class="stat-value" style="color:var(--success)">$'+totalIncome.toLocaleString()+'</div></div></div>'
      +'<div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg></div>'
      +'<div><div class="stat-label">❤️ ចំណាយទូទៅ (paid)</div><div class="stat-value" style="color:var(--danger)">$'+totalDeduct.toLocaleString()+'</div></div></div>'
      +'<div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>'
      +'<div><div class="stat-label">⚖️ តុល្យភាព Net</div>'
      +'<div class="stat-value" style="color:'+(netBalance>=0?'var(--success)':'var(--danger)')+'">$'+netBalance.toLocaleString()+'</div></div></div>'
      +'</div>'

      +'<div class="filter-bar">'
      +'<span class="badge badge-yellow" style="padding:6px 12px">⏳ រង់ចាំ: '+pending+'</span>'
      +'<span class="badge badge-green" style="padding:6px 12px">✅ អនុម័ត: '+approved+'</span>'
      +'<span class="badge badge-red" style="padding:6px 12px">❌ បដិសេធ: '+records.filter(r=>r.status==='rejected').length+'</span>'
      +'</div>'

      +'<div class="card"><div class="table-container"><table>'
      +'<thead><tr><th>បុគ្គលិក</th><th>ប្រភេទ</th><th>ចំណូល ($)</th><th>កាលបរិច្ឆេទ</th><th>ការពិពណ៌នា</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>'
      +'<tbody>'+( records.length===0
        ? '<tr><td colspan="7"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានការស្នើ</p></div></td></tr>'
        : records.map(r=>{
            const photo = getEmpPhoto(r.employee_id);
            const av = photo
              ? '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+';overflow:hidden;padding:0"><img src="'+photo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
              : '<div class="emp-avatar" style="background:'+getColor(r.employee_name)+'">'+(r.employee_name||'?')[0]+'</div>';
            return '<tr>'
              +'<td><div class="employee-cell">'+av+'<div class="emp-name">'+r.employee_name+'</div></div></td>'
              +'<td><span class="badge badge-blue">'+r.category+'</span></td>'
              +'<td style="font-family:var(--mono);font-weight:700;color:var(--success)">+$'+r.amount+'</td>'
              +'<td style="font-family:var(--mono)">'+r.request_date+'</td>'
              +'<td style="color:var(--text3)">'+(r.description||'—')+'</td>'
              +'<td>'+(r.status==='approved'?'<span class="badge badge-green">✅ អនុម័ត</span>':r.status==='rejected'?'<span class="badge badge-red">❌ បដិសេធ</span>':'<span class="badge badge-yellow">⏳ រង់ចាំ</span>')+'</td>'
              +'<td><div class="action-btns">'
              +(r.status==='pending'?'<button class="btn btn-success btn-sm" onclick="updateExpense('+r.id+',\'approved\')">✅</button><button class="btn btn-danger btn-sm" onclick="updateExpense('+r.id+',\'rejected\')">❌</button>':'')
              +'<button class="btn btn-danger btn-sm" onclick="deleteRecord(\'expenses\','+r.id+',renderExpenses)">🗑️</button>'
              +'</div></td></tr>';
          }).join('')
      )+'</tbody>'
      +'</table></div></div>';
  } catch(e) { showError(e.message); }
}

async function openExpenseModal() {
  await ensureEmployees();
  // Load general expense categories dynamically
  let genCats = ['ថ្លៃជួល','អគ្គិសនី/ទឹក','ការិយាល័យ','ទីផ្សារ','ការថែទាំ','ធ្វើដំណើរ','ចំណីអាហារ','ការបណ្តុះបណ្តាល','ផ្សេងៗ'];
  try {
    const genData = await api('GET','/general-expenses');
    const existingCats = [...new Set((genData.records||[]).map(r=>r.category).filter(Boolean))];
    if (existingCats.length) genCats = [...new Set([...existingCats, ...genCats])];
  } catch(_){}

  $('modal-title').textContent = 'ស្នើរប្រាក់ចំណាយ';
  $('modal-body').innerHTML =
    '<div class="form-grid">'
    +'<div class="form-group full-width"><label class="form-label">បុគ្គលិក *</label>'
    +'<select class="form-control" id="ex-emp">'+state.employees.map(e=>'<option value="'+e.id+'">'+e.name+'</option>').join('')+'</select></div>'
    +'<div class="form-group"><label class="form-label">ប្រភេទ * <span style="font-size:10px;color:var(--text3)">(ចំណាយទូទៅ)</span></label>'
    +'<select class="form-control" id="ex-cat">'+genCats.map(c=>'<option>'+c+'</option>').join('')+'</select></div>'
    +'<div class="form-group"><label class="form-label">ចំនួន (USD) *</label><input class="form-control" id="ex-amount" type="number" placeholder="100" /></div>'
    +'<div class="form-group"><label class="form-label">កាលបរិច្ឆេទ</label><input class="form-control" id="ex-date" type="date" value="'+today()+'" /></div>'
    +'<div class="form-group full-width"><label class="form-label">ការពិពណ៌នា</label><textarea class="form-control" id="ex-desc" rows="2" placeholder="ពិពណ៌នា..."></textarea></div>'
    +'</div>'
    +'<div class="form-actions">'
    +'<button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" onclick="saveExpense()">ស្នើរ</button>'
    +'</div>';
  openModal();
}

async function saveExpense() {
  const amount = parseFloat($('ex-amount').value)||0;
  if (!amount) { showToast('សូមបំពេញចំនួន!','error'); return; }
  try {
    await api('POST','/expenses',{ employee_id:parseInt($('ex-emp').value), category:$('ex-cat').value, amount, request_date:$('ex-date').value, description:$('ex-desc').value, status:'pending' });
    showToast('ស្នើរចំណាយបានជោគជ័យ!','success'); closeModal(); renderExpenses();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

async function updateExpense(id, status) {
  try { await api('PUT',`/expenses/${id}`,{status}); showToast(status==='approved'?'អនុម័តហើយ!':'បដិសេធហើយ!',status==='approved'?'success':'warning'); renderExpenses(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ============================================================
// 5. ការចំណាយទូទៅ (GENERAL EXPENSES)
// ============================================================
async function renderGeneralExpense() {
  showLoading();
  try {
    const data = await api('GET','/general-expenses');
    const records = data.records || [];
    const total = records.reduce((s,r)=>s+(r.amount||0),0);
    const paid = records.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.amount||0),0);
    const byCategory = {};
    records.forEach(r=>{ byCategory[r.category]=(byCategory[r.category]||0)+(r.amount||0); });

    const rows = records.length===0
      ? '<tr><td colspan="8"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានការចំណាយ</p></div></td></tr>'
      : records.map(r=>'<tr>'
          +'<td style="font-weight:600">'+r.title+'</td>'
          +'<td><span class="badge badge-blue">'+r.category+'</span></td>'
          +'<td style="font-family:var(--mono);font-weight:700;color:var(--danger)">$'+r.amount+'</td>'
          +'<td style="font-family:var(--mono);font-size:12px">'+r.expense_date+'</td>'
          +'<td style="color:var(--text3);font-size:12px">'+(r.responsible||'—')+'</td>'
          +'<td>'+(r.status==='paid'?'<span class="badge badge-green">✅ បានបង់</span>':'<span class="badge badge-yellow">⏳ រង់ចាំ</span>')+'</td>'
          +'<td><div class="action-btns">'
          +(r.status!=='paid'?'<button class="btn btn-success btn-sm" onclick="payGenExp('+r.id+')">💰</button>':'')
          +'<button class="btn btn-outline btn-sm" onclick="openEditGenExpModal('+r.id+')">✏️</button>'
          +'<button class="btn btn-danger btn-sm" onclick="deleteRecord(\'general-expenses\','+r.id+',renderGeneralExpense)">🗑️</button>'
          +'</div></td>'
          +'</tr>').join('');

    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>ការចំណាយទូទៅ</h2><p>General Expenses · $'+total.toFixed(0)+' សរុប</p></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<button class="btn btn-outline" onclick="printGenExpWithBalance()">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> PDF + Balance</button>'
      +'<button class="btn btn-primary" onclick="openGenExpModal()">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> បន្ថែម</button>'
      +'</div></div>'
      +'<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:20px">'
      +'<div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>'
      +'<div><div class="stat-label">ចំណាយសរុប</div><div class="stat-value">$'+total.toFixed(0)+'</div></div></div>'
      +'<div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>'
      +'<div><div class="stat-label">បានបង់</div><div class="stat-value" style="color:var(--success)">$'+paid.toFixed(0)+'</div></div></div>'
      +Object.entries(byCategory).slice(0,2).map(([cat,sum])=>
        '<div class="stat-card"><div class="stat-icon yellow"></div>'
        +'<div><div class="stat-label">'+cat+'</div><div class="stat-value" style="color:var(--warning);font-size:18px">$'+sum.toFixed(0)+'</div></div></div>'
      ).join('')
      +'</div>'
      +'<div class="card"><div class="table-container" id="ge-table-wrap"><table>'
      +'<thead><tr><th>ចំណងជើង</th><th>ប្រភេទ</th><th>ចំនួន</th><th>កាលបរិច្ឆេទ</th><th>អ្នកទទួលខុសត្រូវ</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'</table></div></div>';
  } catch(e) { showError(e.message); }
}

async function openGenExpModal(editData) {
  const GEN_CATS = ['ថ្លៃជួល','អគ្គិសនី/ទឹក','ការិយាល័យ','ទីផ្សារ','ការថែទាំ','ការដឹកជញ្ជូន','ចំណីអាហារ','ការបណ្តុះបណ្តាល','ប្រាក់ខែ','ផ្សេងៗ'];
  const d = editData || {};
  $('modal-title').textContent = d.id ? 'កែប្រែការចំណាយ' : 'បន្ថែមការចំណាយទូទៅ';
  $('modal-body').innerHTML =
    '<div class="form-grid">'
    +'<div class="form-group full-width"><label class="form-label">ចំណងជើង *</label><input class="form-control" id="ge-title" placeholder="ចំណងជើង..." value="'+(d.title||'')+'" /></div>'
    +'<div class="form-group"><label class="form-label">ប្រភេទ *</label>'
    +'<div style="display:flex;gap:6px">'
    +'<select class="form-control" id="ge-cat" style="flex:1">'+GEN_CATS.map(c=>'<option'+(d.category===c?' selected':'')+'>'+c+'</option>').join('')+'</select>'
    +'<input class="form-control" id="ge-cat-custom" placeholder="ផ្សេង..." style="width:100px" value="'+(GEN_CATS.includes(d.category)?'':(d.category||''))+'" title="ប្រភេទផ្ទាល់ខ្លួន"/>'
    +'</div>'
    +'<div style="font-size:10px;color:var(--text3);margin-top:3px">ឬ វាយប្រភេទថ្មី ក្នុង input ខាងស្តាំ</div></div>'
    +'<div class="form-group"><label class="form-label">ចំនួន (USD) *</label><input class="form-control" id="ge-amount" type="number" placeholder="200" value="'+(d.amount||'')+'" /></div>'
    +'<div class="form-group"><label class="form-label">កាលបរិច្ឆេទ</label><input class="form-control" id="ge-date" type="date" value="'+(d.expense_date||today())+'" /></div>'
    +'<div class="form-group"><label class="form-label">អ្នកទទួលខុសត្រូវ</label><input class="form-control" id="ge-resp" placeholder="ឈ្មោះ..." value="'+(d.responsible||'')+'" /></div>'
    +'<div class="form-group"><label class="form-label">ស្ថានភាព</label>'
    +'<select class="form-control" id="ge-status"><option value="pending"'+(d.status!=='paid'?' selected':'')+'>⏳ រង់ចាំ</option><option value="paid"'+(d.status==='paid'?' selected':'')+'>✅ បានបង់</option></select></div>'
    +'<div class="form-group full-width"><label class="form-label">ចំណាំ</label><textarea class="form-control" id="ge-note" rows="2" placeholder="ចំណាំ...">'+(d.note||'')+'</textarea></div>'
    +'</div>'
    +'<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    +'<button class="btn btn-primary" onclick="saveGenExp('+(d.id||'')+')">💾 រក្សាទុក</button></div>';
  openModal();
}

async function openEditGenExpModal(id) {
  try {
    const data = await api('GET','/general-expenses');
    const r = (data.records||[]).find(x=>x.id===id);
    if (r) openGenExpModal(r);
  } catch(e){ showToast('Error','error'); }
}

async function saveGenExp(editId) {
  const amount = parseFloat($('ge-amount').value)||0;
  const title = $('ge-title').value.trim();
  const customCat = $('ge-cat-custom')?.value.trim();
  const category = customCat || $('ge-cat').value;
  if (!amount||!title) { showToast('សូមបំពេញចំណងជើង និងចំនួន!','error'); return; }
  const payload = { title, category, amount, expense_date:$('ge-date').value, responsible:$('ge-resp').value, status:$('ge-status').value, note:$('ge-note').value };
  try {
    if (editId) {
      await api('PUT','/general-expenses/'+editId, payload);
      showToast('កែប្រែបានជោគជ័យ!','success');
    } else {
      await api('POST','/general-expenses', payload);
      showToast('បន្ថែមចំណាយបានជោគជ័យ!','success');
    }
    closeModal(); renderGeneralExpense();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}



async function payGenExp(id) {
  try { await api('PUT',`/general-expenses/${id}`,{status:'paid'}); showToast('សម្គាល់ថាបានបង់!','success'); renderGeneralExpense(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ============================================================
// 6. កាតសម្គាល់ខ្លួន (ID CARD)
// ============================================================
// ============================================================
// 6. កាតសម្គាល់ខ្លួន — 3 Styles: Premium | Glass | Minimal
// ============================================================
var CARD_STYLES = CARD_STYLES || ['royal','midnight','nature','rose','classic','ocean','sunset','corporate',
  'diamond','ruby','emerald','aurora','carbon','titanium','sakura','galaxy'];

// Guard: valid styles list
var _validStyles = ['royal','midnight','nature','rose','classic','ocean','sunset','corporate',
  'diamond','ruby','emerald','aurora','carbon','titanium','sakura','galaxy'];
var _storedStyle = localStorage.getItem('hr_card_style');
if (!_validStyles.includes(_storedStyle)) {
  localStorage.setItem('hr_card_style','royal');
  _storedStyle = 'royal';
}
var currentCardStyle = currentCardStyle || _storedStyle || 'royal';
var currentCardMode  = localStorage.getItem('hr_card_mode') || 'landscape'; // 'landscape' | 'portrait'

const CARD_STYLE_META = {
  // ── Landscape (ផ្តេក) ──
  royal:     { label:'👑 Royal',      desc:'Blue gradient official',      mode:'landscape' },
  midnight:  { label:'🌌 Midnight',   desc:'Dark luxury gold',            mode:'landscape' },
  nature:    { label:'🌿 Nature',     desc:'Green fresh modern',          mode:'landscape' },
  rose:      { label:'🌸 Rose',       desc:'Pink elegant soft',           mode:'landscape' },
  classic:   { label:'🏛️ Classic',   desc:'Black white minimal',         mode:'landscape' },
  ocean:     { label:'🌊 Ocean',      desc:'Deep blue teal wave',         mode:'landscape' },
  sunset:    { label:'🌅 Sunset',     desc:'Purple pink orange',          mode:'landscape' },
  corporate: { label:'💼 Corporate',  desc:'Gray professional',           mode:'landscape' },
  diamond:   { label:'💎 Diamond',    desc:'Crystal blue premium',        mode:'landscape' },
  ruby:      { label:'🔴 Ruby',       desc:'Deep red luxury',             mode:'landscape' },
  emerald:   { label:'💚 Emerald',    desc:'Rich green jewel',            mode:'landscape' },
  aurora:    { label:'🌈 Aurora',     desc:'Northern lights glow',        mode:'landscape' },
  carbon:    { label:'⚫ Carbon',     desc:'Carbon fiber dark',           mode:'landscape' },
  titanium:  { label:'🔘 Titanium',   desc:'Silver metallic pro',         mode:'landscape' },
  sakura:    { label:'🌺 Sakura',     desc:'Cherry blossom soft',         mode:'landscape' },
  galaxy:    { label:'🌠 Galaxy',     desc:'Space dark stars',            mode:'landscape' },
  // ── Portrait (បញ្ឈ) ──
  portrait_royal:    { label:'👑 Royal',     desc:'Blue official — បញ្ឈ',   mode:'portrait' },
  portrait_midnight: { label:'🌌 Midnight',  desc:'Dark gold — បញ្ឈ',        mode:'portrait' },
  portrait_nature:   { label:'🌿 Nature',    desc:'Green fresh — បញ្ឈ',      mode:'portrait' },
  portrait_rose:     { label:'🌸 Rose',      desc:'Pink elegant — បញ្ឈ',     mode:'portrait' },
  portrait_classic:  { label:'🏛️ Classic',  desc:'Minimal clean — បញ្ឈ',    mode:'portrait' },
  portrait_ocean:    { label:'🌊 Ocean',     desc:'Deep blue — បញ្ឈ',        mode:'portrait' },
};

async function renderIdCard() {
  showLoading();
  try {
    const data = await api('GET','/employees?limit=200');
    const emps = data.employees || [];
    state.employees = emps;
    const cfg = getCompanyConfig();

    // Filter styles by current mode
    const modeStyles = Object.entries(CARD_STYLE_META).filter(([,m])=>m.mode===currentCardMode);
    if (!modeStyles.find(([s])=>s===currentCardStyle)) {
      currentCardStyle = modeStyles[0]?.[0] || 'royal';
    }
    const styleBtns = modeStyles.map(([s,m]) =>
      '<button onclick="setCardStyle(\''+s+'\')" id="style-btn-'+s+'"'
      +' class="btn btn-sm '+(currentCardStyle===s?'btn-primary':'btn-outline')+'" style="border:none;min-width:80px">'
      + m.label+'</button>'
    ).join('');

    contentArea().innerHTML =
      '<div class="page-header">'
      +'<div><h2>កាតសម្គាល់ខ្លួន</h2><p id="card-subtitle">'+( CARD_STYLE_META[currentCardStyle]?.desc||'ID Card')+' · ចុចកាតដើម្បីត្រឡប់</p></div>'
      +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +'<input class="filter-input" placeholder="ស្វែងរក..." id="id-search" oninput="filterIdCards(this.value)" />'

      // Mode toggle
      +'<div style="display:flex;gap:2px;background:var(--bg3);padding:3px;border-radius:8px;border:1px solid var(--border)">'
      +'<button id="mode-btn-landscape" onclick="setCardMode(\'landscape\')" class="btn btn-sm '+(currentCardMode==='landscape'?'btn-primary':'btn-outline')+'" style="border:none;gap:5px">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><rect x="2" y="6" width="20" height="12" rx="2"/></svg> ផ្តេក</button>'
      +'<button id="mode-btn-portrait" onclick="setCardMode(\'portrait\')" class="btn btn-sm '+(currentCardMode==='portrait'?'btn-primary':'btn-outline')+'" style="border:none;gap:5px">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><rect x="6" y="2" width="12" height="20" rx="2"/></svg> បញ្ឈ</button>'
      +'</div>'

      // Style buttons
      +'<div style="display:flex;gap:3px;background:var(--bg3);padding:3px;border-radius:8px;border:1px solid var(--border);flex-wrap:wrap;max-width:600px" id="style-btn-wrap">'
      +styleBtns+'</div>'

      // Print buttons
      +'<button class="btn btn-primary" onclick="printIdCards()">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
      +' 🖨️ Print</button>'
      +'</div></div>'

      +'<div class="id-card-grid'+(currentCardMode==='portrait'?' portrait-mode':'')+' " id="id-card-grid">'
      +(emps.length===0
        ? '<div class="empty-state" style="grid-column:1/-1;padding:60px"><p>មិនទាន់មានបុគ្គលិក</p></div>'
        : emps.map(e=>idCardHTML(e,currentCardStyle,cfg)).join(''))
      +'</div>';
    // Render QR codes after DOM
    setTimeout(() => loadQRLib(renderAllQRCodes), 100);
  } catch(e) { showError(e.message); }
}

function setCardMode(mode) {
  currentCardMode = mode;
  localStorage.setItem('hr_card_mode', mode);
  // Switch to first style of this mode
  const first = Object.entries(CARD_STYLE_META).find(([,m])=>m.mode===mode);
  if (first) currentCardStyle = first[0];
  const cfg = getCompanyConfig();
  renderIdCard();
}

function setCardStyle(style) {
  currentCardStyle = style;
  localStorage.setItem('hr_card_style', style);
  Object.keys(CARD_STYLE_META).forEach(s => {
    const btn = document.getElementById('style-btn-'+s);
    if (btn) { btn.className='btn btn-sm '+(s===style?'btn-primary':'btn-outline'); btn.style.border='none'; }
  });
  // Update subtitle
  const sub = document.querySelector('.page-header p');
  if (sub) sub.textContent = (CARD_STYLE_META[style]?.desc||style)+' · ចុចកាតដើម្បីត្រឡប់';
  const cfg = getCompanyConfig();
  const grid = document.getElementById('id-card-grid');
  if (grid) grid.innerHTML = state.employees.map(e=>idCardHTML(e,style,cfg)).join('');
  setTimeout(() => loadQRLib(renderAllQRCodes), 100);
}

// Miniature QR pattern
// ── Larger QR with ID text encoded (21x21 modules)
// ── Real QR Code generator — encodes actual text ──────────────────────
// Implements QR Version 1-3 (numeric/alphanumeric/byte mode)
// Real QR using qrcodejs (local, no network needed)
function makeQRSvg(text, size, darkColor, lightColor) {
  text = String(text || '1');
  size = size || 100;
  const id = 'qr_tmp_' + Math.random().toString(36).slice(2);
  // Return a placeholder div that generates QR after DOM insert
  return '<div id="'+id+'" style="width:'+size+'px;height:'+size+'px;display:flex;align-items:center;justify-content:center" data-qrtext="'+encodeURIComponent(text)+'" data-qrsize="'+size+'"></div>';
}

function renderAllQRCodes() {
  // Landscape cards: [data-qrtext]
  document.querySelectorAll('[data-qrtext]').forEach(el => {
    if (el.dataset.rendered) return;
    el.dataset.rendered = '1';
    const text = decodeURIComponent(el.dataset.qrtext);
    const size = parseInt(el.dataset.qrsize) || 100;
    if (window.QRCode) {
      el.innerHTML = '';
      new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    }
  });
  // Portrait cards: .qr-placeholder [data-id]
  document.querySelectorAll('.qr-placeholder').forEach(el => {
    if (el.dataset.rendered) return;
    el.dataset.rendered = '1';
    const text = el.dataset.id || '';
    const size = parseInt(el.dataset.size) || 74;
    if (window.QRCode && text) {
      el.innerHTML = '';
      el.style.width  = size+'px';
      el.style.height = size+'px';
      new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    }
  });
}

// Load qrcodejs once
function loadQRLib(cb) {
  if (window.QRCode) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = cb;
  document.head.appendChild(s);
}

// Legacy SVG QR (backup, not called)
function makeQRSvg_legacy(text, size, darkColor, lightColor) {
  darkColor  = darkColor  || '#000';
  lightColor = lightColor || '#fff';
  text = String(text || '1');

  // --- Galois Field GF(256) for Reed-Solomon ---
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function(){let x=1;for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;x=x<128?x<<1:(x<<1)^285;}for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];})();
  function gfMul(a,b){return(a===0||b===0)?0:GF_EXP[GF_LOG[a]+GF_LOG[b]];}
  function gfPoly(deg){let p=[1];for(let i=0;i<deg;i++){const t=[1,GF_EXP[i]];const r=new Uint8Array(p.length+1);for(let a=0;a<p.length;a++)for(let b=0;b<t.length;b++)r[a+b]^=gfMul(p[a],t[b]);p=Array.from(r);}return p;}
  function rsEncode(data,ecLen){const gen=gfPoly(ecLen);const buf=Array.from(data).concat(new Array(ecLen).fill(0));for(let i=0;i<data.length;i++){const c=buf[i];if(c)for(let j=0;j<gen.length;j++)buf[i+j]^=gfMul(gen[j],c);}return buf.slice(data.length);}

  // --- Byte mode encoding ---
  const bytes = [];
  for(let i=0;i<text.length;i++){
    const code = text.charCodeAt(i);
    if(code<128){bytes.push(code);}
    else{const e=encodeURIComponent(text[i]).match(/%([0-9A-F]{2})/gi)||[];e.forEach(h=>bytes.push(parseInt(h.slice(1),16)));}
  }
  const L=bytes.length;

  // Choose version: 1=17bytes, 2=32bytes, 3=53bytes (EC level M)
  let version=1, ecCnt=10;
  if(L>17){version=2;ecCnt=16;}
  if(L>32){version=3;ecCnt=26;}

  // Build bit stream
  const bits=[];
  const addBits=(v,n)=>{for(let i=n-1;i>=0;i--)bits.push((v>>i)&1);};
  addBits(0b0100,4); // byte mode
  addBits(L, version<3?8:16);
  bytes.forEach(b=>addBits(b,8));
  // Terminator
  for(let i=0;i<4&&bits.length%8!==0;i++)bits.push(0);
  while(bits.length%8!==0)bits.push(0);
  // Pad
  const padBytes=[0xEC,0x11];
  const dcLen=[19,34,55][version-1];
  let pi=0;while(bits.length<dcLen*8)addBits(padBytes[pi++%2],8);

  // Data codewords
  const dc=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];dc.push(v);}

  // Reed-Solomon
  const ec=rsEncode(dc,ecCnt);
  const allCw=[...dc,...ec];

  // Build QR matrix
  const N=17+version*4;
  const M=Array.from({length:N},()=>new Array(N).fill(-1));
  const R=Array.from({length:N},()=>new Array(N).fill(false)); // reserved

  // Finder + separator
  function setFinder(row,col){
    for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){
      if(row+r<0||row+r>=N||col+c<0||col+c>=N)continue;
      M[row+r][col+c]=(r>=0&&r<7&&c>=0&&c<7&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4)))?1:0;
      R[row+r][col+c]=true;
    }
  }
  setFinder(0,0);setFinder(0,N-7);setFinder(N-7,0);

  // Timing
  for(let i=8;i<N-8;i++){M[6][i]=i%2===0?1:0;M[i][6]=i%2===0?1:0;R[6][i]=R[i][6]=true;}

  // Alignment (version 2+)
  if(version>=2){const ap=version===2?[6,18]:[6,22];for(let r of ap)for(let c of ap){if(R[r][c])continue;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){M[r+dr][c+dc]=(dr===-2||dr===2||dc===-2||dc===2)?1:(dr===0&&dc===0?1:0);R[r+dr][c+dc]=true;}}}

  // Dark module
  M[4*version+9][8]=1;R[4*version+9][8]=true;

  // Format info placeholder
  const fmtPos=[[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[N-1,8],[N-2,8],[N-3,8],[N-4,8],[N-5,8],[N-6,8],[N-7,8],[8,N-8],[8,N-7],[8,N-6],[8,N-5],[8,N-4],[8,N-3],[8,N-2],[8,N-1]];
  fmtPos.forEach(([r,c])=>{if(r<N&&c<N){M[r][c]=0;R[r][c]=true;}});

  // Place data bits (mask 0: (r+c)%2==0)
  const dataBits=[];allCw.forEach(b=>{for(let i=7;i>=0;i--)dataBits.push((b>>i)&1);});
  let bi=0;
  for(let col=N-1;col>=1;col-=2){if(col===6)col--;for(let row=0;row<N;row++){const r2=((Math.floor((N-1-col)/2))%2===0)?row:N-1-row;for(let dc2=0;dc2<2;dc2++){const c2=col-dc2;if(!R[r2][c2]&&bi<dataBits.length){const b=dataBits[bi++];M[r2][c2]=(r2+c2)%2===0?b^1:b;}}}}

  // Format bits (ECC level M=01, mask 0=000): 101010000010010
  const fmt=[1,0,1,0,1,0,0,0,0,0,1,0,0,1,0];
  [[8,0,0],[8,1,1],[8,2,2],[8,3,3],[8,4,4],[8,5,5],[8,7,6],[8,8,7],[7,8,8],[5,8,9],[4,8,10],[3,8,11],[2,8,12],[1,8,13],[0,8,14]].forEach(([r,c,i])=>{if(i<15){M[r][c]=fmt[i];}});
  [[N-1,8,0],[N-2,8,1],[N-3,8,2],[N-4,8,3],[N-5,8,4],[N-6,8,5],[N-7,8,6],[8,N-8,7],[8,N-7,8],[8,N-6,9],[8,N-5,10],[8,N-4,11],[8,N-3,12],[8,N-2,13],[8,N-1,14]].forEach(([r,c,i])=>{if(i<15&&r<N&&c<N){M[r][c]=fmt[i];}});

  // Render SVG
  const cell=size/N;
  let svg='<svg viewBox="0 0 '+size+' '+size+'" xmlns="http://www.w3.org/2000/svg" style="display:block;shape-rendering:crispEdges">';
  svg+='<rect width="'+size+'" height="'+size+'" fill="'+lightColor+'"/>';
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
    if(M[r][c]===1)svg+='<rect x="'+(c*cell).toFixed(2)+'" y="'+(r*cell).toFixed(2)+'" width="'+(cell+.05).toFixed(2)+'" height="'+(cell+.05).toFixed(2)+'" fill="'+darkColor+'"/>';
  }
  svg+='</svg>';
  return svg;
}

function miniQR(id) { return makeQRSvg(String(id), 30, '#000', '#fff'); }


function idCardHTML(e, style, cfg) {
  style = style || currentCardStyle;
  cfg = cfg || getCompanyConfig();

  // Route portrait styles to portrait card renderer
  if (style && style.startsWith('portrait_')) {
    return idCardPortraitHTML(e, style, cfg);
  }

  const dept = e.department_name || e.department || '—';
  const company = cfg.company_name || 'HR Pro';
  const hireDate = e.hire_date || '—';
  const initial = (e.name||'?')[0];
  const ac = getColor(e.name);

  // ① ID from custom_id field ("លេខ ID" in employee form)
  const rawCustom = (e.custom_id || '').trim().replace(/^#+/, '');
  const empId    = rawCustom ? rawCustom : 'EMP'+String(e.id).padStart(3,'0');
  // QR encodes: custom_id if set, else plain db id (not zero-padded) — consistent with findEmployeeByQR
  const empIdRaw = rawCustom || String(e.id);

  const photo    = getEmpPhoto(e.id);
  const storedQR = photoCache['qr_' + e.id] || '';

  // Avatar helper
  function avatar(size, border, borderColor, radius, shadow) {
    borderColor = borderColor || 'rgba(255,255,255,.5)';
    radius = radius || '50%'; shadow = shadow || '';
    return '<div style="width:'+size+'px;height:'+size+'px;border-radius:'+radius
      +';background:'+ac+';display:flex;align-items:center;justify-content:center'
      +';border:'+border+' solid '+borderColor+';flex-shrink:0;overflow:hidden;box-shadow:'+shadow+'">'
      +(photo?'<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover"/>':'<span style="font-size:'+(size*.38)+'px;font-weight:800;color:white">'+initial+'</span>')
      +'</div>';
  }

  // ② QR 3cm×3cm = 113px at 96dpi — encodes empIdRaw string
  const qrSize  = 113;
  const qrInner = qrSize - 6;

  // makeQRSvg seeds from empIdRaw so "0009" → unique QR for that ID
  const qrBlock     = '<div style="width:'+qrSize+'px;height:'+qrSize+'px;background:white;border-radius:10px;overflow:hidden;padding:4px">'+makeQRSvg(empIdRaw, qrInner, '#111827','#fff')+'</div>';
  const qrBlockDark = '<div style="width:'+qrSize+'px;height:'+qrSize+'px;background:white;border-radius:10px;overflow:hidden;padding:4px">'+makeQRSvg(empIdRaw, qrInner,'#0f172a','#f8fafc')+'</div>';

  // ③ QR label block — shows empId text under QR
  function qrLabel(qr, idColor) {
    idColor = idColor || '#1d4ed8';
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">'
      + qr
      + '<div style="font-family:monospace;font-size:10px;font-weight:800;color:'+idColor
      + ';letter-spacing:.5px;text-align:center;line-height:1">'+empId+'</div>'
      +'</div>';
  }

  // Info rows helper
  function rows(pairs, keyColor, valColor, borderColor, fontSize) {
    fontSize = fontSize || '9.5px';
    return pairs.map(([k,v])=>
      '<div style="display:flex;gap:4px;padding:2.5px 0;border-bottom:1px solid '+borderColor+'">'
      +'<span style="color:'+keyColor+';font-weight:600;min-width:58px;font-size:'+fontSize+'">'+k+'</span>'
      +'<span style="color:'+valColor+';font-weight:700;font-size:'+fontSize+'">'+v+'</span>'
      +'</div>'
    ).join('');
  }

  // ③ Bank info
  const bankStr = [e.bank, e.bank_account, e.bank_holder].filter(x=>x&&x!=='—'&&x!=='').join(' · ') || '—';

  // Back info rows (always show bank if available)
  const infoData = [
    ['ឈ្មោះ',    e.name||'—'],
    ['ID',        empId],
    ['តំណែង',    e.position||'—'],
    ['នាយកដ្ឋាន', dept],
    ['ទូរស័ព្ទ',  e.phone||'—'],
  ];
  // bank row removed

  const wrap = (front, back) =>
    '<div class="id-card-wrapper" style="display:inline-flex;flex-direction:column;align-items:center;gap:4px">'
    +'<div class="id-card id-flip-card" data-name="'+e.name+'" data-dept="'+dept
    +'" onclick="this.classList.toggle(\'flipped\')" style="cursor:pointer">'
    +'<div class="id-flip-inner">'
    +'<div class="id-flip-front">'+front+'</div>'
    +'<div class="id-flip-back">'+back+'</div>'
    +'</div></div>'
    +'<button class="btn-print-one" onclick="event.stopPropagation();printSingleCard(this)" data-empid="'+e.id+'" data-empname="'+e.name+'" data-mode="landscape" title="🖨️ Print កាតនេះ">'
    +'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" style=\"width:11px;height:11px\"><polyline points=\"6 9 6 2 18 2 18 9\"/><path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"/><rect x=\"6\" y=\"14\" width=\"12\" height=\"8\"/></svg>'
    +' Print</button>'
    +'</div>';

  // Logo
  const logoImg = cfg.logo_url
    ? '<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain" />'
    : '<span style="font-size:11px;font-weight:800;color:white">'+company+'</span>';

  // ── ROYAL ─────────────────────────────────────────────────
  if (style === 'royal') {
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#0f2c6e 0%,#1d4ed8 55%,#0ea5e9 100%);position:relative">'
      +'<div style="position:absolute;top:-40px;right:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.07)"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px">'+dept.toUpperCase()+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(72,'3px','rgba(255,255,255,.5)','50%','0 4px 16px rgba(0,0,0,.4)')
      +'<div><div style="color:rgba(255,255,255,.65);font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">'+( e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:8px">'
      +'<div style="background:rgba(255,255,255,.15);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.55);font-size:7px;font-weight:700">EMP ID</div><div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(255,255,255,.15);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.55);font-size:7px;font-weight:700">ចូលធ្វើ</div><div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:rgba(255,255,255,.4)">OFFICIAL ID</div>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:16px">'+Array.from({length:22},(_,i)=>'<div style="width:2px;height:'+Math.round(4+Math.sin(i*.9+e.id)*7)+'px;background:rgba(255,255,255,.3);border-radius:1px"></div>').join('')+'</div>'
      +'<div style="font-size:7px;color:rgba(255,255,255,.4)">'+company+'</div></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,#0f2c6e,#1d4ed8);padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.75);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel(qrBlock,'#1d4ed8')
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#94a3b8','#1e293b','#f0f4ff')+'</div></div>'
      +'<div style="background:#f8faff;border-top:1px solid #e2eaff;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#94a3b8;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#94a3b8;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── MIDNIGHT ──────────────────────────────────────────────
  if (style === 'midnight') {
    const gold = '#d4af37';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(145deg,#0a0e1a,#141824,#0d1220);border:1px solid rgba(212,175,55,.25);position:relative">'
      +'<div style="height:4px;background:linear-gradient(90deg,'+gold+',#f0d060,'+gold+')"></div>'
      +'<div style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:16px;object-fit:contain">':'<span style="color:'+gold+';font-size:11px;font-weight:800">'+company+'</span>')
      +'<div style="border:1px solid rgba(212,175,55,.4);color:'+gold+';font-size:8px;font-weight:700;padding:2px 8px;border-radius:3px">'+dept+'</div></div>'
      +'<div style="display:flex;gap:12px;align-items:center;padding:4px 14px 8px">'
      +avatar(68,'2.5px','rgba(212,175,55,.5)','50%','0 0 20px rgba(212,175,55,.2)')
      +'<div><div style="color:'+gold+';font-size:9px;font-weight:600;letter-spacing:.5px">'+( e.position||'—')+'</div>'
      +'<div style="color:#f8f8f0;font-size:16px;font-weight:800;margin:2px 0">'+e.name+'</div>'
      +'<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:4px;padding:2px 10px;display:inline-block;font-family:monospace;color:'+gold+';font-size:11px;font-weight:800">'+empId+'</div></div>'
      +'<div style="margin-left:auto;flex-shrink:0;width:28px;height:18px;background:linear-gradient(135deg,'+gold+',#f5e070);border-radius:3px;opacity:.7"></div></div>'
      +'<div style="padding:4px 14px 8px;display:flex;gap:1.5px;align-items:flex-end">'+Array.from({length:28},(_,i)=>'<div style="width:2px;height:'+Math.round(4+Math.sin(i*1.2+e.id)*7)+'px;background:rgba(212,175,55,.25);border-radius:1px"></div>').join('')+'</div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(145deg,#0a0e1a,#141824);border:1px solid rgba(212,175,55,.2);display:flex;flex-direction:column">'
      +'<div style="height:4px;background:linear-gradient(90deg,'+gold+',#f0d060,'+gold+')"></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel('<div style="padding:3px;background:white;border-radius:4px;border:1px solid rgba(212,175,55,.3)">'+qrBlockDark+'</div>', gold)
      +'<div style="flex:1;min-width:0">'+rows(infoData,gold+'99','rgba(255,255,255,.85)','rgba(212,175,55,.1)')+'</div></div>'
      +'<div style="padding:4px 14px;text-align:center;font-size:8px;color:rgba(212,175,55,.4)">'+company+' · '+hireDate+'</div></div>';
    return wrap(front, back);
  }

  // ── NATURE ────────────────────────────────────────────────
  if (style === 'nature') {
    const g1='#064e3b',g2='#059669',g3='#34d399';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,'+g1+' 0%,'+g2+' 60%,'+g3+' 100%);position:relative">'
      +'<div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.08)"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px">🌿 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(255,255,255,.6)','50%','0 4px 16px rgba(0,0,0,.3)')
      +'<div><div style="color:rgba(255,255,255,.7);font-size:8px;font-weight:600;letter-spacing:.5px">'+( e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:8px">'
      +'<div style="background:rgba(255,255,255,.18);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.6);font-size:7px;font-weight:700">EMP ID</div><div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(255,255,255,.18);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.6);font-size:7px;font-weight:700">ចូលធ្វើ</div><div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between"><span style="font-size:7px;color:rgba(255,255,255,.4)">HR ID CARD</span>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:14px">'+Array.from({length:22},(_,i)=>'<div style="width:2px;height:'+Math.round(4+Math.sin(i*.9+e.id)*6)+'px;background:rgba(255,255,255,.3);border-radius:1px"></div>').join('')+'</div>'
      +'<span style="font-size:7px;color:rgba(255,255,255,.4)">'+company+'</span></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,'+g1+','+g2+');padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.75);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel(qrBlock,g2)
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#94a3b8','#1e293b','#f0fdf4')+'</div></div>'
      +'<div style="background:#f0fdf4;border-top:1px solid #d1fae5;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#94a3b8;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#94a3b8;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── ROSE ──────────────────────────────────────────────────
  if (style === 'rose') {
    const p1='#831843',p2='#db2777',p3='#f9a8d4';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,'+p1+','+p2+' 60%,'+p3+');position:relative">'
      +'<div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.1)"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px">'+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(255,255,255,.6)','50%','0 4px 16px rgba(0,0,0,.3)')
      +'<div><div style="color:rgba(255,255,255,.7);font-size:8px;font-weight:600;letter-spacing:.5px">'+( e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:8px">'
      +'<div style="background:rgba(255,255,255,.2);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.65);font-size:7px;font-weight:700">EMP ID</div><div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(255,255,255,.2);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.65);font-size:7px;font-weight:700">ចូលធ្វើ</div><div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between"><span style="font-size:7px;color:rgba(255,255,255,.4)">HR ID CARD</span>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:14px">'+Array.from({length:22},(_,i)=>'<div style="width:2px;height:'+Math.round(4+Math.sin(i*.9+e.id)*6)+'px;background:rgba(255,255,255,.3);border-radius:1px"></div>').join('')+'</div>'
      +'<span style="font-size:7px;color:rgba(255,255,255,.4)">'+company+'</span></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,'+p1+','+p2+');padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.75);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel(qrBlock,p2)
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#94a3b8','#1e293b','#fdf2f8')+'</div></div>'
      +'<div style="background:#fdf2f8;border-top:1px solid #fce7f3;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#94a3b8;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#94a3b8;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── CLASSIC ───────────────────────────────────────────────
  if (style === 'classic') {
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:#111827;position:relative">'
      +'<div style="position:absolute;top:0;left:0;right:0;height:4px;background:'+ac+'"></div>'
      +'<div style="padding:12px 14px 6px;display:flex;justify-content:space-between;align-items:flex-start">'
      +'<div>'+(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:16px;object-fit:contain;margin-bottom:2px"><br>':'')
      +'<div style="color:#9ca3af;font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase">'+company+'</div></div>'
      +'<div style="text-align:right"><div style="color:#6b7280;font-size:7px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Employee Card</div>'
      +'<div style="color:'+ac+';font-size:10px;font-weight:800;font-family:monospace">'+empId+'</div></div></div>'
      +'<div style="display:flex;align-items:center;gap:14px;padding:4px 14px 8px">'
      +avatar(68,'2px',ac+'88','12px','0 4px 16px rgba(0,0,0,.5)')
      +'<div><div style="color:#9ca3af;font-size:8px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:2px">'+( e.position||'—')+'</div>'
      +'<div style="color:#f9fafb;font-size:17px;font-weight:800;line-height:1.1;margin-bottom:4px">'+e.name+'</div>'
      +'<div style="color:'+ac+';font-size:9px;font-weight:700">'+dept+'</div></div></div>'
      +'<div style="margin:0 14px;border-top:1px solid #374151;padding-top:6px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:8px;color:#4b5563;font-family:monospace">'+hireDate+'</div>'
      +'<div style="display:flex;gap:1px;align-items:flex-end;height:14px">'+Array.from({length:24},(_,i)=>'<div style="width:1.5px;height:'+Math.round(4+Math.sin(i+e.id)*6)+'px;background:'+ac+'44;border-radius:1px"></div>').join('')+'</div>'
      +'<div style="font-size:7px;color:#4b5563;letter-spacing:1px;text-transform:uppercase">ID Card</div></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:#f9fafb;border:1px solid #e5e7eb;display:flex;flex-direction:column">'
      +'<div style="background:#111827;padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:'+ac+';font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase">'+dept+'</div>'
      +'<div style="color:#6b7280;font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel('<div style="background:#111827;padding:3px;border-radius:4px">'+makeQRSvg(empIdRaw,qrInner,'#f9fafb','#111827')+'</div>','#374151')
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#9ca3af','#111827','#e5e7eb')+'</div></div>'
      +'<div style="background:#f3f4f6;border-top:1px solid #e5e7eb;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#9ca3af;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#9ca3af;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── OCEAN — Deep blue teal ────────────────────────────────
  if (style === 'ocean') {
    const o1='#0c4a6e',o2='#0284c7',o3='#38bdf8';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(160deg,'+o1+' 0%,'+o2+' 50%,'+o3+' 100%);position:relative">'
      +'<svg style="position:absolute;bottom:0;left:0;right:0;opacity:.15" viewBox="0 0 200 40" preserveAspectRatio="none"><path d="M0 20 Q50 0 100 20 Q150 40 200 20 L200 40 L0 40Z" fill="white"/></svg>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px">🌊 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(255,255,255,.6)','50%','0 4px 20px rgba(0,0,0,.4)')
      +'<div><div style="color:rgba(255,255,255,.7);font-size:8px;font-weight:600;letter-spacing:.5px">'+( e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:8px">'
      +'<div style="background:rgba(255,255,255,.18);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.6);font-size:7px;font-weight:700">EMP ID</div><div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(255,255,255,.18);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.6);font-size:7px;font-weight:700">ចូលធ្វើ</div><div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between"><span style="font-size:7px;color:rgba(255,255,255,.4)">OCEAN ID</span>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:14px">'+Array.from({length:22},(_,i)=>'<div style="width:2px;height:'+Math.round(3+Math.sin(i*.7+e.id)*7)+'px;background:rgba(255,255,255,.3);border-radius:1px"></div>').join('')+'</div>'
      +'<span style="font-size:7px;color:rgba(255,255,255,.4)">'+company+'</span></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,'+o1+','+o2+');padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.75);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel(qrBlock,o2)
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#94a3b8','#1e293b','#e0f2fe')+'</div></div>'
      +'<div style="background:#e0f2fe;border-top:1px solid #bae6fd;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#94a3b8;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#94a3b8;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── SUNSET — Orange purple gradient ──────────────────────
  if (style === 'sunset') {
    const s1='#7c3aed',s2='#db2777',s3='#f97316';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,'+s1+' 0%,'+s2+' 50%,'+s3+' 100%);position:relative">'
      +'<div style="position:absolute;top:-30px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.1)"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px">🌅 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(255,255,255,.6)','50%','0 4px 16px rgba(0,0,0,.35)')
      +'<div><div style="color:rgba(255,255,255,.7);font-size:8px;font-weight:600;letter-spacing:.5px">'+( e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:8px">'
      +'<div style="background:rgba(255,255,255,.2);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.65);font-size:7px;font-weight:700">EMP ID</div><div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(255,255,255,.2);border-radius:6px;padding:3px 10px;text-align:center"><div style="color:rgba(255,255,255,.65);font-size:7px;font-weight:700">ចូលធ្វើ</div><div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between"><span style="font-size:7px;color:rgba(255,255,255,.4)">SUNSET ID</span>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:14px">'+Array.from({length:22},(_,i)=>'<div style="width:2px;height:'+Math.round(4+Math.sin(i*.9+e.id)*6)+'px;background:rgba(255,255,255,.3);border-radius:1px"></div>').join('')+'</div>'
      +'<span style="font-size:7px;color:rgba(255,255,255,.4)">'+company+'</span></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,'+s1+','+s2+');padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.75);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel(qrBlock,s2)
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#94a3b8','#1e293b','#faf5ff')+'</div></div>'
      +'<div style="background:#faf5ff;border-top:1px solid #e9d5ff;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#94a3b8;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#94a3b8;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── CORPORATE — Gray professional ────────────────────────
  const corp='#374151';
  const front =
    '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(145deg,#1f2937,#374151);position:relative">'
    +'<div style="height:3px;background:'+ac+'"></div>'
    +'<div style="position:absolute;top:3px;right:0;bottom:0;width:3px;background:'+ac+'44"></div>'
    +'<div style="padding:8px 14px 6px;display:flex;justify-content:space-between;align-items:center">'
    +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain">':'<span style="color:white;font-size:11px;font-weight:800">'+company+'</span>')
    +'<div style="border:1px solid '+ac+'66;color:'+ac+';font-size:8px;font-weight:700;padding:2px 8px;border-radius:3px;background:'+ac+'11">'+dept+'</div></div>'
    +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
    +avatar(68,'2px',ac,'12px','0 4px 12px rgba(0,0,0,.4)')
    +'<div><div style="color:#9ca3af;font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">'+( e.position||'—')+'</div>'
    +'<div style="color:white;font-size:16px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
    +'<div style="background:'+ac+'22;border:1px solid '+ac+'44;border-radius:4px;padding:2px 10px;display:inline-block;font-family:monospace;color:'+ac+';font-size:11px;font-weight:800">'+empId+'</div></div></div>'
    +'<div style="margin:0 14px;border-top:1px solid #4b5563;padding-top:5px;display:flex;justify-content:space-between">'
    +'<div style="font-size:8px;color:#6b7280;font-family:monospace">'+hireDate+'</div>'
    +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:14px">'+Array.from({length:26},(_,i)=>'<div style="width:2px;height:'+Math.round(4+Math.sin(i*1.1+e.id)*6)+'px;background:'+ac+'44;border-radius:1px"></div>').join('')+'</div>'
    +'<div style="font-size:7px;color:#6b7280">CORP ID</div></div></div>';
  const back =
    '<div style="height:100%;border-radius:14px;overflow:hidden;background:#f9fafb;border:1px solid #e5e7eb;display:flex;flex-direction:column">'
    +'<div style="background:linear-gradient(90deg,#1f2937,'+corp+');padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
    +'<div style="color:'+ac+';font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase">'+dept+'</div>'
    +'<div style="color:#9ca3af;font-size:8px;letter-spacing:1px">CORPORATE CARD</div></div>'
    +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      + qrLabel('<div style="background:#1f2937;padding:3px;border-radius:4px">'+makeQRSvg(empIdRaw,qrInner,'white','#1f2937')+'</div>',ac)
    +'<div style="flex:1;min-width:0">'+rows(infoData,'#9ca3af','#111827','#e5e7eb')+'</div></div>'
    +'<div style="background:#f3f4f6;border-top:1px solid #e5e7eb;padding:4px 14px;display:flex;justify-content:space-between">'
    +'<div style="font-size:8px;color:#9ca3af;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
    +'<div style="font-size:8px;color:#9ca3af;font-family:monospace">'+hireDate+'</div></div></div>';
  return wrap(front, back);

  // ── DIAMOND — Crystal blue holographic ────────────────────
  function premiumBack(headerBg, headerBorderBottom, bodyBg, rowBorder, qrBg, idColor, footerBg, footerBorder) {
    return '<div style="height:100%;border-radius:14px;overflow:hidden;background:'+bodyBg+';display:flex;flex-direction:column;border:1px solid '+footerBorder+'">'
      +'<div style="background:'+headerBg+';padding:8px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid '+headerBorderBottom+'">'
      +'<div style="font-size:11px;font-weight:800;color:white">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      +'<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:3px">'
      +'<div style="padding:3px;background:white;border-radius:4px;border:1px solid '+footerBorder+'">'+makeQRSvg(empIdRaw,qrInner,qrBg,'#fff')+'</div>'
      +'<div style="font-family:monospace;font-size:9px;font-weight:800;color:'+idColor+';letter-spacing:.5px">'+empId+'</div></div>'
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#94a3b8','#1e293b',rowBorder)+'</div></div>'
      +'<div style="background:'+footerBg+';border-top:1px solid '+footerBorder+';padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#94a3b8;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#94a3b8;font-family:monospace">'+hireDate+'</div></div></div>';
  }
}

// ── Premium styles injected via idCardHTML switch ──────────────────────
(function injectPremiumStyles() {
  const _orig = window.idCardHTML || idCardHTML;
})();

// Override idCardHTML to add premium styles
var _idCardHTML_base = idCardHTML;
idCardHTML = function(e, style, cfg) {
  // Handle premium styles
  style = style || currentCardStyle;
  cfg   = cfg   || getCompanyConfig();

  // Return to base if not a premium style
  const premiumStyles = ['diamond','ruby','emerald','aurora','carbon','titanium','sakura','galaxy'];
  if (!premiumStyles.includes(style)) return _idCardHTML_base(e, style, cfg);

  const dept     = e.department_name || e.department || '—';
  const company  = cfg.company_name || 'HR Pro';
  const hireDate = e.hire_date || '—';
  const initial  = (e.name||'?')[0];
  const ac       = getColor(e.name);
  const photo    = getEmpPhoto(e.id);
  const storedQR = photoCache['qr_' + e.id] || '';

  const rawCustom = (e.custom_id||'').trim().replace(/^#+/,'');
  const empId    = rawCustom ? rawCustom : 'EMP'+String(e.id).padStart(3,'0');
  const empIdRaw = rawCustom || String(e.id); // no padStart — must match findEmployeeByQR logic
  const qrSize   = 113;
  const qrInner  = qrSize - 6;

  function avatar(size, border, borderColor, radius, shadow) {
    borderColor = borderColor||'rgba(255,255,255,.5)'; radius=radius||'50%'; shadow=shadow||'';
    return '<div style="width:'+size+'px;height:'+size+'px;border-radius:'+radius
      +';background:'+ac+';display:flex;align-items:center;justify-content:center'
      +';border:'+border+' solid '+borderColor+';flex-shrink:0;overflow:hidden;box-shadow:'+shadow+'">'
      +(photo?'<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover"/>':'<span style="font-size:'+(size*.38)+'px;font-weight:800;color:white">'+initial+'</span>')
      +'</div>';
  }

  function qrLabel(qr, idColor) {
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">'
      +qr+'<div style="font-family:monospace;font-size:9.5px;font-weight:800;color:'+(idColor||'#1d4ed8')+';letter-spacing:.5px;text-align:center">'+empId+'</div></div>';
  }

  function qrAuto(darkC, lightC) {
    return '<div style="width:'+qrSize+'px;height:'+qrSize+'px;background:'+(lightC||'white')+';border-radius:10px;overflow:hidden;padding:4px">'+makeQRSvg(empIdRaw,qrInner,darkC||'#111827',lightC||'#fff')+'</div>';
  }

  function rows(pairs, keyC, valC, borderC) {
    return pairs.map(([k,v])=>
      '<div style="display:flex;gap:4px;padding:2.5px 0;border-bottom:1px solid '+(borderC||'#f0f4ff')+'">'
      +'<span style="color:'+(keyC||'#94a3b8')+';font-weight:600;min-width:58px;font-size:9px">'+k+'</span>'
      +'<span style="color:'+(valC||'#1e293b')+';font-weight:700;font-size:9px">'+v+'</span>'
      +'</div>'
    ).join('');
  }

  const infoData=[['ឈ្មោះ',e.name||'—'],['ID',empId],['តំណែង',e.position||'—'],['នាយកដ្ឋាន',dept],['ទូរស័ព្ទ',e.phone||'—']];
  if(e.bank&&e.bank!=='—'&&e.bank!=='') infoData.push(['🏦',([e.bank,e.bank_account].filter(Boolean).join(' · '))||'—']);

  function logoImg(filter) {
    return cfg.logo_url
      ? '<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain" />'
      : '<span style="font-size:11px;font-weight:800;color:white">'+company+'</span>';
  }

  function wrap(front, back) {
    return '<div class="id-card id-flip-card" data-name="'+e.name+'" data-dept="'+dept
      +'" onclick="this.classList.toggle(\'flipped\')" style="cursor:pointer">'
      +'<div class="id-flip-inner"><div class="id-flip-front">'+front+'</div><div class="id-flip-back">'+back+'</div></div></div>';
  }

  function bars(n, col) {
    return Array.from({length:n},(_,i)=>'<div style="width:2px;height:'+Math.round(4+Math.sin(i+e.id)*7)+'px;background:'+col+';border-radius:1px"></div>').join('');
  }

  function premBack(gradBg, rowBorderC, qrDarkC, qrLightC, idColor, footBg, footBorderC) {
    return '<div style="height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:'+gradBg+';padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      +qrLabel(qrAuto(qrDarkC,qrLightC),idColor)
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#94a3b8','#1e293b',rowBorderC)+'</div></div>'
      +'<div style="background:'+footBg+';border-top:1px solid '+footBorderC+';padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#94a3b8;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#94a3b8;font-family:monospace">'+hireDate+'</div></div></div>';
  }

  // ── DIAMOND ───────────────────────────────────────────────
  if (style==='diamond') {
    const d1='#0c1445',d2='#1e40af',d3='#60a5fa',d4='#bfdbfe';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,'+d1+' 0%,'+d2+' 50%,#1d4ed8 100%);position:relative">'
      // Holographic shimmer strips
      +'<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent,transparent 8px,rgba(255,255,255,.03) 8px,rgba(255,255,255,.03) 16px);pointer-events:none"></div>'
      +'<div style="position:absolute;top:12px;right:14px;width:60px;height:60px;border:1px solid rgba(191,219,254,.3);border-radius:50%;opacity:.4"></div>'
      +'<div style="position:absolute;top:20px;right:22px;width:44px;height:44px;border:1px solid rgba(191,219,254,.4);border-radius:50%;opacity:.3"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg()
      +'<div style="font-size:8px;font-weight:700;color:'+d4+';border:1px solid rgba(191,219,254,.4);padding:2px 8px;border-radius:20px;letter-spacing:1px">💎 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(191,219,254,.6)','50%','0 0 20px rgba(96,165,250,.5),0 0 40px rgba(96,165,250,.2)')
      +'<div><div style="color:'+d3+';font-size:8px;font-weight:600;letter-spacing:.5px">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:6px">'
      +'<div style="background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+d3+';font-size:7px;font-weight:700">EMP ID</div>'
      +'<div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+d3+';font-size:7px;font-weight:700">ចូលធ្វើ</div>'
      +'<div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:rgba(191,219,254,.4)">DIAMOND SERIES</div>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:16px">'+bars(22,'rgba(96,165,250,.3)')+'</div>'
      +'<div style="font-size:7px;color:rgba(191,219,254,.4)">'+company+'</div></div></div>';
    return wrap(front, premBack('linear-gradient(90deg,'+d1+','+d2+')','#dbeafe',d1,'#f0f9ff',d2,'#eff6ff','#bfdbfe'));
  }

  // ── RUBY ──────────────────────────────────────────────────
  if (style==='ruby') {
    const r1='#4c0519',r2='#be123c',r3='#fb7185',r4='#fecdd3';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,'+r1+' 0%,'+r2+' 55%,#e11d48 100%);position:relative">'
      +'<div style="position:absolute;inset:0;background:repeating-linear-gradient(-45deg,transparent,transparent 10px,rgba(255,255,255,.02) 10px,rgba(255,255,255,.02) 20px);pointer-events:none"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg()
      +'<div style="font-size:8px;font-weight:700;color:'+r4+';background:rgba(251,113,133,.15);border:1px solid rgba(251,113,133,.3);padding:2px 8px;border-radius:20px">🔴 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(251,113,133,.6)','50%','0 0 20px rgba(190,18,60,.6),0 0 40px rgba(190,18,60,.2)')
      +'<div><div style="color:'+r3+';font-size:8px;font-weight:600;letter-spacing:.5px">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:6px">'
      +'<div style="background:rgba(251,113,133,.15);border:1px solid rgba(251,113,133,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+r3+';font-size:7px;font-weight:700">EMP ID</div>'
      +'<div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(251,113,133,.15);border:1px solid rgba(251,113,133,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+r3+';font-size:7px;font-weight:700">ចូលធ្វើ</div>'
      +'<div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:rgba(254,205,211,.4)">RUBY SERIES</div>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:16px">'+bars(22,'rgba(251,113,133,.35)')+'</div>'
      +'<div style="font-size:7px;color:rgba(254,205,211,.4)">'+company+'</div></div></div>';
    return wrap(front, premBack('linear-gradient(90deg,'+r1+','+r2+')','#fce7f3',r1,'#fff1f2',r2,'#fff1f2','#fecdd3'));
  }

  // ── EMERALD ───────────────────────────────────────────────
  if (style==='emerald') {
    const e1='#064e3b',e2='#047857',e3='#34d399',e4='#a7f3d0';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,'+e1+' 0%,'+e2+' 55%,#059669 100%);position:relative">'
      +'<div style="position:absolute;top:-30px;right:-20px;width:130px;height:130px;border-radius:50%;background:rgba(52,211,153,.08)"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg()
      +'<div style="font-size:8px;font-weight:700;color:'+e4+';background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);padding:2px 8px;border-radius:20px">💚 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(52,211,153,.6)','50%','0 0 20px rgba(4,120,87,.6)')
      +'<div><div style="color:'+e3+';font-size:8px;font-weight:600;letter-spacing:.5px">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:6px">'
      +'<div style="background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+e3+';font-size:7px;font-weight:700">EMP ID</div>'
      +'<div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+e3+';font-size:7px;font-weight:700">ចូលធ្វើ</div>'
      +'<div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:rgba(167,243,208,.4)">EMERALD SERIES</div>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:16px">'+bars(22,'rgba(52,211,153,.3)')+'</div>'
      +'<div style="font-size:7px;color:rgba(167,243,208,.4)">'+company+'</div></div></div>';
    return wrap(front, premBack('linear-gradient(90deg,'+e1+','+e2+')','#d1fae5',e1,'#ecfdf5',e2,'#ecfdf5','#a7f3d0'));
  }

  // ── AURORA — Northern lights ───────────────────────────────
  if (style==='aurora') {
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#0d1117 0%,#1a1a2e 40%,#16213e 100%);position:relative">'
      +'<div style="position:absolute;top:0;left:0;right:0;height:60%;background:linear-gradient(180deg,rgba(0,255,136,.08) 0%,rgba(0,200,255,.06) 40%,rgba(120,40,255,.04) 80%,transparent 100%);pointer-events:none"></div>'
      +'<div style="position:absolute;top:5px;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#00ff88,#00c8ff,#7828ff,transparent);opacity:.6;filter:blur(2px)"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg()
      +'<div style="font-size:8px;font-weight:700;background:linear-gradient(90deg,#00ff88,#00c8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;border:1px solid rgba(0,200,255,.3);border-radius:20px;padding:2px 8px;-webkit-text-fill-color:unset;color:#00c8ff">🌈 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'2px','rgba(0,200,255,.5)','50%','0 0 20px rgba(0,200,255,.3),0 0 40px rgba(0,255,136,.15)')
      +'<div><div style="background:linear-gradient(90deg,#00ff88,#00c8ff);-webkit-background-clip:text;background-clip:text;color:#00c8ff;font-size:8px;font-weight:600;letter-spacing:.5px">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:6px">'
      +'<div style="background:rgba(0,200,255,.1);border:1px solid rgba(0,200,255,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:#00c8ff;font-size:7px;font-weight:700">EMP ID</div>'
      +'<div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(0,255,136,.1);border:1px solid rgba(0,255,136,.3);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:#00ff88;font-size:7px;font-weight:700">ចូលធ្វើ</div>'
      +'<div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:rgba(0,200,255,.4)">AURORA SERIES</div>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:16px">'+bars(22,'rgba(0,200,255,.3)')+'</div>'
      +'<div style="font-size:7px;color:rgba(0,200,255,.4)">'+company+'</div></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:#0d1117;border:1px solid rgba(0,200,255,.2);display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,#0d1117,#1a1a2e);padding:8px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,200,255,.15)">'
      +'<div style="color:#00c8ff;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(0,200,255,.6);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      +qrLabel(qrAuto('#00c8ff','#0d1117'),'#00ff88')
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#00c8ff66','rgba(255,255,255,.85)','rgba(0,200,255,.1)')+'</div></div>'
      +'<div style="padding:4px 14px;text-align:center;font-size:8px;color:rgba(0,200,255,.3)">'+company+' · '+hireDate+'</div></div>';
    return wrap(front, back);
  }

  // ── CARBON ────────────────────────────────────────────────
  if (style==='carbon') {
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:#0a0a0a;position:relative">'
      +'<div style="position:absolute;inset:0;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.015) 0,rgba(255,255,255,.015) 1px,transparent 0,transparent 50%);background-size:4px 4px;pointer-events:none"></div>'
      +'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,'+ac+','+ac+'88,'+ac+')"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px 6px">'+logoImg()
      +'<div style="font-size:8px;font-weight:700;color:'+ac+';border:1px solid '+ac+'44;padding:2px 8px;border-radius:3px;letter-spacing:1px;background:'+ac+'11">'+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(68,'2px',ac,'12px','0 4px 20px rgba(0,0,0,.8)')
      +'<div><div style="color:#888;font-size:8px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">'+(e.position||'—')+'</div>'
      +'<div style="color:#f5f5f5;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="background:'+ac+'22;border:1px solid '+ac+'55;border-radius:4px;padding:3px 10px;display:inline-block;font-family:monospace;color:'+ac+';font-size:12px;font-weight:800">'+empId+'</div></div></div>'
      +'<div style="margin:0 14px;border-top:1px solid #1f1f1f;padding:5px 0;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:8px;color:#333;font-family:monospace">'+hireDate+'</div>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:14px">'+bars(26,ac+'44')+'</div>'
      +'<div style="font-size:7px;color:#333;letter-spacing:1px;text-transform:uppercase">CARBON</div></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:#f8f8f8;border:1px solid #e5e5e5;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,#0a0a0a,#1a1a1a);padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:'+ac+';font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase">'+dept+'</div>'
      +'<div style="color:#444;font-size:8px;letter-spacing:1px">CARBON SERIES</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      +'<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px">'
      +'<div style="background:#0a0a0a;padding:3px;border-radius:4px">'+makeQRSvg(empIdRaw,qrInner,'#f8f8f8','#0a0a0a')+'</div>'
      +'<div style="font-family:monospace;font-size:9.5px;font-weight:800;color:'+ac+';letter-spacing:.5px">'+empId+'</div></div>'
      +'<div style="flex:1;min-width:0">'+rows(infoData,'#9ca3af','#111','#e5e5e5')+'</div></div>'
      +'<div style="background:#f0f0f0;border-top:1px solid #e5e5e5;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#9ca3af;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#9ca3af;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── TITANIUM ──────────────────────────────────────────────
  if (style==='titanium') {
    const t1='#374151',t2='#6b7280',t3='#e5e7eb';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(145deg,#1f2937 0%,#374151 40%,#4b5563 70%,#374151 100%);position:relative">'
      +'<div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(255,255,255,.02) 60px,rgba(255,255,255,.02) 61px);pointer-events:none"></div>'
      +'<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#e5e7eb,#9ca3af,#e5e7eb,transparent)"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg()
      +'<div style="font-size:8px;font-weight:700;color:#e5e7eb;border:1px solid rgba(229,231,235,.3);padding:2px 8px;border-radius:3px;letter-spacing:1px;background:rgba(255,255,255,.05)">'+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'2px','rgba(229,231,235,.5)','12px','0 4px 16px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)')
      +'<div><div style="color:#9ca3af;font-size:8px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">'+(e.position||'—')+'</div>'
      +'<div style="color:#f9fafb;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:6px">'
      +'<div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:#9ca3af;font-size:7px;font-weight:700">EMP ID</div>'
      +'<div style="color:#f9fafb;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:#9ca3af;font-size:7px;font-weight:700">ចូលធ្វើ</div>'
      +'<div style="color:#f9fafb;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:rgba(229,231,235,.3)">TITANIUM SERIES</div>'
      +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:14px">'+bars(26,'rgba(229,231,235,.2)')+'</div>'
      +'<div style="font-size:7px;color:rgba(229,231,235,.3)">'+company+'</div></div></div>';
    return wrap(front, premBack('linear-gradient(90deg,#1f2937,#374151)','#e5e7eb','#1f2937','#f9fafb','#374151','#f3f4f6','#e5e7eb'));
  }

  // ── SAKURA ────────────────────────────────────────────────
  if (style==='sakura') {
    const sk1='#500724',sk2='#9f1239',sk3='#fda4af',sk4='#fce7f3';
    const front =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#fff1f2 0%,#ffe4e6 40%,#fce7f3 100%);position:relative;border:1px solid #fecdd3">'
      // Petal decorations
      +'<div style="position:absolute;top:5px;right:10px;font-size:22px;opacity:.15;transform:rotate(15deg)">🌸</div>'
      +'<div style="position:absolute;bottom:8px;left:8px;font-size:16px;opacity:.12;transform:rotate(-20deg)">🌸</div>'
      +'<div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,'+sk1+','+sk2+','+sk3+','+sk2+','+sk1+')"></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain">':'<span style="color:'+sk2+';font-size:11px;font-weight:800">'+company+'</span>')
      +'<div style="font-size:8px;font-weight:700;color:'+sk2+';background:'+sk4+';border:1px solid #fecdd3;padding:2px 8px;border-radius:20px">🌸 '+dept+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
      +avatar(70,'3px','rgba(159,18,57,.3)','50%','0 4px 16px rgba(159,18,57,.15)')
      +'<div><div style="color:'+sk2+';font-size:8px;font-weight:600;letter-spacing:.5px">'+(e.position||'—')+'</div>'
      +'<div style="color:#1e293b;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
      +'<div style="display:flex;gap:6px">'
      +'<div style="background:'+sk4+';border:1px solid #fecdd3;border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+sk2+';font-size:7px;font-weight:700">EMP ID</div>'
      +'<div style="color:'+sk1+';font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:'+sk4+';border:1px solid #fecdd3;border-radius:6px;padding:3px 10px;text-align:center">'
      +'<div style="color:'+sk2+';font-size:7px;font-weight:700">ចូលធ្វើ</div>'
      +'<div style="color:'+sk1+';font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div></div></div>'
      +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:'+sk3+'">SAKURA SERIES</div>'
      +'<div style="display:flex;gap:2px;align-items:flex-end;height:14px">'+bars(18,sk3)+'</div>'
      +'<div style="font-size:7px;color:'+sk3+'">'+company+'</div></div></div>';
    const back =
      '<div style="height:100%;border-radius:14px;overflow:hidden;background:white;border:1px solid #fecdd3;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,'+sk1+','+sk2+');padding:8px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:8px;letter-spacing:1px">🌸 EMPLOYEE CARD</div></div>'
      +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
      +qrLabel(qrAuto(sk1,'#fff1f2'),sk2)
      +'<div style="flex:1;min-width:0">'+rows(infoData,sk3,sk1,'#fce7f3')+'</div></div>'
      +'<div style="background:#fff1f2;border-top:1px solid #fecdd3;padding:4px 14px;display:flex;justify-content:space-between">'
      +'<div style="font-size:8px;color:#fda4af;font-style:italic">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'<div style="font-size:8px;color:#fda4af;font-family:monospace">'+hireDate+'</div></div></div>';
    return wrap(front, back);
  }

  // ── GALAXY ────────────────────────────────────────────────
  const g1='#0f0c29',g2='#302b63',g3='#24243e';
  const stars = Array.from({length:30},(_,i)=>
    '<circle cx="'+(((i*97)%100))+'" cy="'+(((i*61)%100))+'" r="'+(i%3===0?.8:.4)+'" fill="white" opacity="'+(0.3+((i%5)*.1))+'"/>'
  ).join('');
  const front =
    '<div style="height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,'+g1+' 0%,'+g2+' 50%,'+g3+' 100%);position:relative">'
    +'<svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 100 100" preserveAspectRatio="none">'+stars+'</svg>'
    +'<div style="position:absolute;top:10px;right:20px;width:80px;height:80px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.15) 0%,transparent 70%)"></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px">'+logoImg()
    +'<div style="font-size:8px;font-weight:700;color:#c4b5fd;border:1px solid rgba(196,181,253,.3);padding:2px 8px;border-radius:20px;background:rgba(139,92,246,.1)">🌠 '+dept+'</div></div>'
    +'<div style="display:flex;align-items:center;gap:12px;padding:4px 14px 8px">'
    +avatar(70,'2px','rgba(196,181,253,.5)','50%','0 0 20px rgba(139,92,246,.4),0 0 40px rgba(139,92,246,.15)')
    +'<div><div style="color:#a78bfa;font-size:8px;font-weight:600;letter-spacing:.5px">'+(e.position||'—')+'</div>'
    +'<div style="color:#f9fafb;font-size:17px;font-weight:800;line-height:1.1;margin:2px 0">'+e.name+'</div>'
    +'<div style="display:flex;gap:6px">'
    +'<div style="background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);border-radius:6px;padding:3px 10px;text-align:center">'
    +'<div style="color:#a78bfa;font-size:7px;font-weight:700">EMP ID</div>'
    +'<div style="color:white;font-size:12px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
    +'<div style="background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);border-radius:6px;padding:3px 10px;text-align:center">'
    +'<div style="color:#a78bfa;font-size:7px;font-weight:700">ចូលធ្វើ</div>'
    +'<div style="color:white;font-size:10px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
    +'</div></div></div>'
    +'<div style="padding:4px 14px;display:flex;justify-content:space-between;align-items:center">'
    +'<div style="font-size:7px;color:rgba(196,181,253,.3)">GALAXY SERIES</div>'
    +'<div style="display:flex;gap:1.5px;align-items:flex-end;height:16px">'+bars(22,'rgba(139,92,246,.35)')+'</div>'
    +'<div style="font-size:7px;color:rgba(196,181,253,.3)">'+company+'</div></div></div>';
  const back =
    '<div style="height:100%;border-radius:14px;overflow:hidden;background:'+g1+';border:1px solid rgba(139,92,246,.2);display:flex;flex-direction:column">'
    +'<div style="background:linear-gradient(90deg,'+g1+','+g2+');padding:8px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(139,92,246,.2)">'
    +'<div style="color:#a78bfa;font-size:11px;font-weight:800">'+(e.position||'—')+'</div>'
    +'<div style="color:rgba(196,181,253,.6);font-size:8px;letter-spacing:1px">EMPLOYEE CARD</div></div>'
    +'<div style="display:flex;gap:10px;padding:8px 14px;flex:1">'
    +qrLabel(qrAuto('#a78bfa',g1),'#c4b5fd')
    +'<div style="flex:1;min-width:0">'+rows(infoData,'#a78bfa66','rgba(255,255,255,.85)','rgba(139,92,246,.12)')+'</div></div>'
    +'<div style="padding:4px 14px;text-align:center;font-size:8px;color:rgba(139,92,246,.3)">'+company+' · '+hireDate+'</div></div>';
  return wrap(front, back);
};

function filterIdCards(val) {
  document.querySelectorAll('.id-card').forEach(card => {
    const n=card.dataset.name||'', d=card.dataset.dept||'';
    const show = !val||n.includes(val)||d.includes(val);
    // Hide the wrapper (which includes btn-print-one) if present, else hide card
    const wrapper = card.closest('.id-card-wrapper');
    (wrapper||card).style.display = show ? '' : 'none';
  });
}

// ── Portrait Card Renderer (54mm × 86mm) ────────────────────
function idCardPortraitHTML(e, style, cfg) {
  cfg = cfg || getCompanyConfig();
  const dept    = e.department_name || e.department || '—';
  const company = cfg.company_name || 'HR Pro';
  const hireDate= e.hire_date || '—';
  const initial = (e.name||'?')[0];
  const ac      = getColor(e.name);
  const rawCustom = (e.custom_id||'').trim().replace(/^#+/,'');
  const empId     = rawCustom ? rawCustom : 'EMP'+String(e.id).padStart(3,'0');
  const empIdRaw  = rawCustom || String(e.id);
  const photo     = getEmpPhoto(e.id);

  function av(size, borderColor, shadow) {
    return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+ac
      +';display:flex;align-items:center;justify-content:center;border:3px solid '+(borderColor||'rgba(255,255,255,.5)')
      +';overflow:hidden;box-shadow:'+(shadow||'0 4px 14px rgba(0,0,0,.3)')+';flex-shrink:0">'
      +(photo?'<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover"/>'
        :'<span style="font-size:'+(size*.38)+'px;font-weight:800;color:white">'+initial+'</span>')
      +'</div>';
  }

  const qrSize  = 80;
  const qrBlock = '<div style="width:'+qrSize+'px;height:'+qrSize+'px;background:white;border-radius:8px;overflow:hidden;padding:4px;flex-shrink:0">'
    + makeQRSvg(empIdRaw, qrSize-8, '#111827', '#ffffff') + '</div>';
  const qrSmall = '<div style="width:36px;height:36px;background:white;border-radius:5px;overflow:hidden;padding:2px;flex-shrink:0">'
    + makeQRSvg(empIdRaw, 32, '#111827', '#ffffff') + '</div>';

  const logoEl = cfg.logo_url
    ? '<img src="'+cfg.logo_url+'" style="height:20px;object-fit:contain" />'
    : '<span style="font-size:10px;font-weight:800;color:white">'+company+'</span>';

  // Portrait card wrapper — 204px wide × 323px tall (54mm×86mm at 96dpi)
  function wrapP(front, back) {
    return '<div class="id-card-wrapper" style="display:inline-flex;flex-direction:column;align-items:center;gap:4px">'
      +'<div class="id-card id-flip-card id-portrait-card" data-name="'+e.name+'" data-dept="'+dept
      +'" onclick="this.classList.toggle(\'flipped\')" style="cursor:pointer;width:204px;height:323px">'
      +'<div class="id-flip-inner">'
      +'<div class="id-flip-front" style="width:204px;height:323px">'+front+'</div>'
      +'<div class="id-flip-back"  style="width:204px;height:323px">'+back+'</div>'
      +'</div></div>'
      +'<button class="btn-print-one" onclick="event.stopPropagation();printSingleCard(this)" data-empid="'+e.id+'" data-empname="'+e.name+'" data-mode="portrait" title="🖨️ Print កាតនេះ">'
      +'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" style=\"width:11px;height:11px\"><polyline points=\"6 9 6 2 18 2 18 9\"/><path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"/><rect x=\"6\" y=\"14\" width=\"12\" height=\"8\"/></svg>'
      +' Print</button>'
      +'</div>';
  }

  // ── Portrait Royal ─────────────────────────────────────────
  if (style === 'portrait_royal') {
    const front =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(175deg,#0f2c6e 0%,#1d4ed8 60%,#0ea5e9 100%);display:flex;flex-direction:column;position:relative">'
      +'<div style="position:absolute;top:-30px;right:-30px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.06)"></div>'
      // Header
      +'<div style="padding:12px 14px 8px;display:flex;justify-content:space-between;align-items:center">'+logoEl
      +'<div style="background:rgba(255,255,255,.18);color:white;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px">'+dept+'</div></div>'
      // Avatar center
      +'<div style="display:flex;justify-content:center;padding:8px 0">'+av(90,'rgba(255,255,255,.6)','0 6px 20px rgba(0,0,0,.5)')+'</div>'
      // Name
      +'<div style="text-align:center;padding:8px 12px 4px">'
      +'<div style="color:rgba(255,255,255,.65);font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:16px;font-weight:800;margin:4px 0;line-height:1.2">'+e.name+'</div>'
      +'</div>'
      // ID + hire
      +'<div style="display:flex;gap:8px;justify-content:center;padding:0 12px 10px">'
      +'<div style="background:rgba(255,255,255,.15);border-radius:8px;padding:4px 12px;text-align:center"><div style="color:rgba(255,255,255,.55);font-size:7px;font-weight:700">EMP ID</div><div style="color:white;font-size:13px;font-weight:800;font-family:monospace">'+empId+'</div></div>'
      +'<div style="background:rgba(255,255,255,.15);border-radius:8px;padding:4px 12px;text-align:center"><div style="color:rgba(255,255,255,.55);font-size:7px;font-weight:700">ចូលធ្វើ</div><div style="color:white;font-size:11px;font-weight:700;font-family:monospace">'+hireDate+'</div></div>'
      +'</div>'
      // Bottom bar with QR
      +'<div style="margin-top:auto;padding:6px 10px;background:rgba(0,0,0,.2);display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:7px;color:rgba(255,255,255,.4)">OFFICIAL ID</div>'
      +qrSmall
      +'<div style="font-size:7px;color:rgba(255,255,255,.4)">'+company+'</div></div>'
      +'</div>';
    const back =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,#0f2c6e,#1d4ed8);padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:12px;font-weight:800">'+e.name+'</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:8px">EMPLOYEE</div></div>'
      +'<div style="display:flex;flex-direction:column;align-items:center;padding:14px;gap:10px;flex:1">'
      +qrBlock
      +'<div style="font-family:monospace;font-size:12px;font-weight:800;color:#1d4ed8">'+empId+'</div>'
      +'</div>'
      +'<div style="padding:0 14px 10px">'
      +[['ឈ្មោះ',e.name||'—'],['តំណែង',e.position||'—'],['នាយកដ្ឋាន',dept],['ទូរស័ព្ទ',e.phone||'—']].map(([k,v])=>
        '<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid #e2eaff">'
        +'<span style="color:#94a3b8;font-weight:600;min-width:60px;font-size:9px">'+k+'</span>'
        +'<span style="color:#1e293b;font-weight:700;font-size:9px">'+v+'</span></div>'
      ).join('')
      +'</div>'
      +'<div style="background:#f8faff;border-top:1px solid #e2eaff;padding:5px 14px;text-align:center;font-size:8px;color:#94a3b8">'+( cfg.lost_card_text||'ករណីបាត់ — If found, please return')+'</div>'
      +'</div>';
    return wrapP(front, back);
  }

  // ── Portrait Midnight ──────────────────────────────────────
  if (style === 'portrait_midnight') {
    const gold = '#d4af37';
    const front =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(175deg,#0a0e1a,#141824,#0d1220);border:1px solid rgba(212,175,55,.2);display:flex;flex-direction:column;position:relative">'
      +'<div style="height:3px;background:linear-gradient(90deg,'+gold+',#f0d060,'+gold+')"></div>'
      +'<div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:16px;object-fit:contain">':'<span style="color:'+gold+';font-size:10px;font-weight:800">'+company+'</span>')
      +'<div style="border:1px solid rgba(212,175,55,.4);color:'+gold+';font-size:8px;padding:2px 8px;border-radius:3px">'+dept+'</div></div>'
      +'<div style="display:flex;justify-content:center;padding:6px 0">'+av(88,'rgba(212,175,55,.5)','0 0 24px rgba(212,175,55,.25)')+'</div>'
      +'<div style="text-align:center;padding:8px 12px 4px">'
      +'<div style="color:'+gold+';font-size:9px;font-weight:600;letter-spacing:.5px">'+(e.position||'—')+'</div>'
      +'<div style="color:#f8f8f0;font-size:16px;font-weight:800;margin:4px 0">'+e.name+'</div>'
      +'</div>'
      +'<div style="display:flex;justify-content:center;padding:0 12px 10px">'
      +'<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:6px;padding:4px 16px;text-align:center">'
      +'<div style="color:rgba(212,175,55,.6);font-size:7px">EMP ID</div>'
      +'<div style="color:'+gold+';font-size:14px;font-weight:800;font-family:monospace">'+empId+'</div></div></div>'
      +'<div style="margin-top:auto;padding:6px 10px;background:rgba(0,0,0,.2);display:flex;justify-content:space-between;align-items:center"><div style="font-size:7px;color:rgba(212,175,55,.4)">OFFICIAL ID</div>'+qrSmall+'<div style="font-size:7px;color:rgba(212,175,55,.4)">'+company+'</div></div>'
      +'</div>';
    const back =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:#0d1220;border:1px solid rgba(212,175,55,.2);display:flex;flex-direction:column">'
      +'<div style="height:3px;background:linear-gradient(90deg,'+gold+',#f0d060,'+gold+')"></div>'
      +'<div style="padding:10px 14px"><div style="color:'+gold+';font-size:13px;font-weight:800">'+e.name+'</div></div>'
      +'<div style="display:flex;flex-direction:column;align-items:center;padding:10px;gap:8px;flex:1">'
      +'<div style="background:rgba(212,175,55,.05);border:1px solid rgba(212,175,55,.2);border-radius:10px;padding:8px">'+qrBlock+'</div>'
      +'<div style="color:'+gold+';font-family:monospace;font-size:12px;font-weight:800">'+empId+'</div>'
      +'</div>'
      +'<div style="padding:0 14px 12px">'
      +[['ឈ្មោះ',e.name||'—'],['តំណែង',e.position||'—'],[' នាយកដ្ឋាន',dept],['ទូរស័ព្ទ',e.phone||'—']].map(([k,v])=>
        '<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid rgba(212,175,55,.1)">'
        +'<span style="color:rgba(212,175,55,.5);font-weight:600;min-width:60px;font-size:9px">'+k+'</span>'
        +'<span style="color:#f8f8f0;font-weight:700;font-size:9px">'+v+'</span></div>'
      ).join('')+'</div>'
      +'<div style="padding:5px 14px;text-align:center;font-size:8px;color:rgba(212,175,55,.3)">'+company+'</div>'
      +'</div>';
    return wrapP(front, back);
  }

  // ── Portrait Nature ────────────────────────────────────────
  if (style === 'portrait_nature') {
    const front =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(175deg,#064e3b,#059669,#34d399);display:flex;flex-direction:column;position:relative">'
      +'<div style="position:absolute;bottom:-20px;left:-20px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.06)"></div>'
      +'<div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain">':'<span style="color:white;font-size:10px;font-weight:800">'+company+'</span>')
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px">'+dept+'</div></div>'
      +'<div style="display:flex;justify-content:center;padding:6px 0">'+av(88,'rgba(255,255,255,.6)','0 6px 20px rgba(0,0,0,.4)')+'</div>'
      +'<div style="text-align:center;padding:8px 12px 4px">'
      +'<div style="color:rgba(255,255,255,.7);font-size:9px;font-weight:600">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:16px;font-weight:800;margin:4px 0">'+e.name+'</div>'
      +'</div>'
      +'<div style="display:flex;justify-content:center;padding:0 12px 10px">'
      +'<div style="background:rgba(255,255,255,.15);border-radius:8px;padding:4px 14px;text-align:center">'
      +'<div style="color:rgba(255,255,255,.6);font-size:7px">EMP ID</div>'
      +'<div style="color:white;font-size:14px;font-weight:800;font-family:monospace">'+empId+'</div></div></div>'
      +'<div style="margin-top:auto;padding:6px 14px;background:rgba(0,0,0,.15);display:flex;justify-content:space-between;font-size:7px;color:rgba(255,255,255,.4)">'
      +'<span>OFFICIAL ID</span><span>'+company+'</span></div>'
      +'</div>';
    const back =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,#064e3b,#059669);padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:12px;font-weight:800">'+e.name+'</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:8px">NATURE</div></div>'
      +'<div style="display:flex;flex-direction:column;align-items:center;padding:12px;gap:8px;flex:1">'
      +qrBlock
      +'<div style="font-family:monospace;font-size:12px;font-weight:800;color:#059669">'+empId+'</div>'
      +'</div>'
      +'<div style="padding:0 14px 10px">'
      +[['ឈ្មោះ',e.name||'—'],['តំណែង',e.position||'—'],['នាយកដ្ឋាន',dept],['ទូរស័ព្ទ',e.phone||'—']].map(([k,v])=>
        '<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid #e8faf3">'
        +'<span style="color:#6ee7b7;font-weight:600;min-width:60px;font-size:9px">'+k+'</span>'
        +'<span style="color:#1e293b;font-weight:700;font-size:9px">'+v+'</span></div>'
      ).join('')+'</div>'
      +'<div style="background:#f0fdf4;border-top:1px solid #d1fae5;padding:5px 14px;text-align:center;font-size:8px;color:#6ee7b7">'+company+'</div>'
      +'</div>';
    return wrapP(front, back);
  }

  // ── Portrait Rose ──────────────────────────────────────────
  if (style === 'portrait_rose') {
    const front =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(175deg,#831843,#db2777,#f9a8d4);display:flex;flex-direction:column">'
      +'<div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain">':'<span style="color:white;font-size:10px;font-weight:800">'+company+'</span>')
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;padding:2px 8px;border-radius:20px">'+dept+'</div></div>'
      +'<div style="display:flex;justify-content:center;padding:6px 0">'+av(88,'rgba(255,255,255,.6)','0 6px 20px rgba(0,0,0,.35)')+'</div>'
      +'<div style="text-align:center;padding:8px 12px 4px">'
      +'<div style="color:rgba(255,255,255,.75);font-size:9px;font-weight:600">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:16px;font-weight:800;margin:4px 0">'+e.name+'</div>'
      +'</div>'
      +'<div style="display:flex;justify-content:center;padding:0 12px 10px">'
      +'<div style="background:rgba(255,255,255,.15);border-radius:8px;padding:4px 14px;text-align:center">'
      +'<div style="color:rgba(255,255,255,.6);font-size:7px">EMP ID</div>'
      +'<div style="color:white;font-size:14px;font-weight:800;font-family:monospace">'+empId+'</div></div></div>'
      +'<div style="margin-top:auto;padding:6px 14px;background:rgba(0,0,0,.15);display:flex;justify-content:space-between;font-size:7px;color:rgba(255,255,255,.4)">'
      +'<span>OFFICIAL ID</span><span>'+company+'</span></div></div>';
    const back =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,#831843,#db2777);padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:12px;font-weight:800">'+e.name+'</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:8px">ROSE</div></div>'
      +'<div style="display:flex;flex-direction:column;align-items:center;padding:12px;gap:8px;flex:1">'+qrBlock
      +'<div style="font-family:monospace;font-size:12px;font-weight:800;color:#db2777">'+empId+'</div></div>'
      +'<div style="padding:0 14px 10px">'
      +[['ឈ្មោះ',e.name||'—'],['តំណែង',e.position||'—'],['នាយកដ្ឋាន',dept],['ទូរស័ព្ទ',e.phone||'—']].map(([k,v])=>
        '<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid #fce7f3">'
        +'<span style="color:#f9a8d4;font-weight:600;min-width:60px;font-size:9px">'+k+'</span>'
        +'<span style="color:#1e293b;font-weight:700;font-size:9px">'+v+'</span></div>'
      ).join('')+'</div>'
      +'<div style="background:#fff1f2;border-top:1px solid #fce7f3;padding:5px 14px;text-align:center;font-size:8px;color:#f9a8d4">'+company+'</div></div>';
    return wrapP(front, back);
  }

  // ── Portrait Classic ───────────────────────────────────────
  if (style === 'portrait_classic') {
    const front =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:white;border:2px solid #1e293b;display:flex;flex-direction:column">'
      +'<div style="background:#1e293b;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain">':'<span style="color:white;font-size:10px;font-weight:800">'+company+'</span>')
      +'<div style="color:rgba(255,255,255,.7);font-size:8px;border:1px solid rgba(255,255,255,.3);padding:2px 8px;border-radius:3px">'+dept+'</div></div>'
      +'<div style="display:flex;justify-content:center;padding:14px 0 8px">'+av(88,'#1e293b','0 4px 12px rgba(0,0,0,.2)')+'</div>'
      +'<div style="text-align:center;padding:0 12px 8px;flex:1">'
      +'<div style="color:#64748b;font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">'+(e.position||'—')+'</div>'
      +'<div style="color:#1e293b;font-size:16px;font-weight:800;margin:4px 0;border-bottom:2px solid #e2e8f0;padding-bottom:8px">'+e.name+'</div>'
      +'<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 14px;display:inline-block;margin-top:6px">'
      +'<div style="color:#94a3b8;font-size:7px">EMP ID</div>'
      +'<div style="color:#1e293b;font-size:14px;font-weight:800;font-family:monospace">'+empId+'</div></div></div>'
      +'<div style="background:#f8fafc;border-top:2px solid #e2e8f0;padding:5px 14px;display:flex;justify-content:space-between;font-size:7px;color:#94a3b8">'
      +'<span>OFFICIAL ID</span><span>'+hireDate+'</span></div></div>';
    const back =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:white;border:2px solid #1e293b;display:flex;flex-direction:column">'
      +'<div style="background:#1e293b;padding:10px 14px"><div style="color:white;font-size:12px;font-weight:800">'+e.name+'</div></div>'
      +'<div style="display:flex;flex-direction:column;align-items:center;padding:12px;gap:8px;flex:1">'
      +'<div style="border:2px solid #e2e8f0;border-radius:10px;padding:6px">'+qrBlock+'</div>'
      +'<div style="font-family:monospace;font-size:12px;font-weight:800;color:#1e293b">'+empId+'</div>'
      +'</div>'
      +'<div style="padding:0 14px 10px">'
      +[['ឈ្មោះ',e.name||'—'],['តំណែង',e.position||'—'],['នាយកដ្ឋាន',dept],['ទូរស័ព្ទ',e.phone||'—']].map(([k,v])=>
        '<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid #f1f5f9">'
        +'<span style="color:#94a3b8;font-weight:600;min-width:60px;font-size:9px">'+k+'</span>'
        +'<span style="color:#1e293b;font-weight:700;font-size:9px">'+v+'</span></div>'
      ).join('')+'</div>'
      +'<div style="background:#f8fafc;border-top:2px solid #e2e8f0;padding:5px 14px;text-align:center;font-size:8px;color:#94a3b8">'+company+'</div></div>';
    return wrapP(front, back);
  }

  // ── Portrait Ocean ─────────────────────────────────────────
  if (style === 'portrait_ocean') {
    const front =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:linear-gradient(175deg,#0c4a6e,#0369a1,#0ea5e9,#22d3ee);display:flex;flex-direction:column">'
      +'<div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="height:18px;object-fit:contain">':'<span style="color:white;font-size:10px;font-weight:800">'+company+'</span>')
      +'<div style="background:rgba(255,255,255,.2);color:white;font-size:8px;padding:2px 8px;border-radius:20px">'+dept+'</div></div>'
      +'<div style="display:flex;justify-content:center;padding:6px 0">'+av(88,'rgba(255,255,255,.6)','0 6px 20px rgba(0,0,0,.4)')+'</div>'
      +'<div style="text-align:center;padding:8px 12px 4px">'
      +'<div style="color:rgba(255,255,255,.7);font-size:9px;font-weight:600">'+(e.position||'—')+'</div>'
      +'<div style="color:white;font-size:16px;font-weight:800;margin:4px 0">'+e.name+'</div></div>'
      +'<div style="display:flex;justify-content:center;padding:0 12px 10px">'
      +'<div style="background:rgba(255,255,255,.15);border-radius:8px;padding:4px 14px;text-align:center">'
      +'<div style="color:rgba(255,255,255,.6);font-size:7px">EMP ID</div>'
      +'<div style="color:white;font-size:14px;font-weight:800;font-family:monospace">'+empId+'</div></div></div>'
      +'<div style="margin-top:auto;padding:6px 14px;background:rgba(0,0,0,.15);display:flex;justify-content:space-between;font-size:7px;color:rgba(255,255,255,.4)">'
      +'<span>OFFICIAL ID</span><span>'+company+'</span></div></div>';
    const back =
      '<div style="width:100%;height:100%;border-radius:14px;overflow:hidden;background:white;display:flex;flex-direction:column">'
      +'<div style="background:linear-gradient(90deg,#0c4a6e,#0369a1);padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:white;font-size:12px;font-weight:800">'+e.name+'</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:8px">OCEAN</div></div>'
      +'<div style="display:flex;flex-direction:column;align-items:center;padding:12px;gap:8px;flex:1">'+qrBlock
      +'<div style="font-family:monospace;font-size:12px;font-weight:800;color:#0369a1">'+empId+'</div></div>'
      +'<div style="padding:0 14px 10px">'
      +[['ឈ្មោះ',e.name||'—'],['តំណែង',e.position||'—'],['នាយកដ្ឋាន',dept],['ទូរស័ព្ទ',e.phone||'—']].map(([k,v])=>
        '<div style="display:flex;gap:6px;padding:3px 0;border-bottom:1px solid #e0f2fe">'
        +'<span style="color:#7dd3fc;font-weight:600;min-width:60px;font-size:9px">'+k+'</span>'
        +'<span style="color:#1e293b;font-weight:700;font-size:9px">'+v+'</span></div>'
      ).join('')+'</div>'
      +'<div style="background:#f0f9ff;border-top:1px solid #e0f2fe;padding:5px 14px;text-align:center;font-size:8px;color:#7dd3fc">'+company+'</div></div>';
    return wrapP(front, back);
  }

  // Fallback
  return idCardHTML(e, 'royal', cfg);
}






// ============================================================
// 7. ច្បាប់ឈប់សម្រាក (LEAVE)
// ============================================================
async function renderLeave() {
  showLoading();
  try {
    const data = await api('GET','/leave');
    const records = data.records || [];
    const pending = records.filter(r=>r.status==='pending').length;
    const approved = records.filter(r=>r.status==='approved').length;
    const totalDays = records.filter(r=>r.status==='approved').reduce((s,r)=>s+(r.days||0),0);
    contentArea().innerHTML = `
      <div class="page-header">
        <div><h2>ច្បាប់ឈប់សម្រាក</h2><p>គ្រប់គ្រងការឈប់សម្រាក</p></div>
        <button class="btn btn-primary" onclick="openLeaveModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ស្នើរច្បាប់
        </button>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
        <div class="stat-card"><div class="stat-icon yellow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div><div class="stat-label">ស្នើរសរុប</div><div class="stat-value">${records.length}</div></div></div>
        <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
          <div><div class="stat-label">រង់ចាំ</div><div class="stat-value" style="color:var(--warning)">${pending}</div></div></div>
        <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div><div class="stat-label">អនុម័ត</div><div class="stat-value" style="color:var(--success)">${approved}</div></div></div>
        <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
          <div><div class="stat-label">ថ្ងៃច្បាប់សរុប</div><div class="stat-value" style="color:var(--info)">${totalDays}</div></div></div>
      </div>
      <div class="card"><div class="table-container"><table>
        <thead><tr><th>បុគ្គលិក</th><th>ប្រភេទ</th><th>ថ្ងៃចាប់ផ្តើម</th><th>ថ្ងៃបញ្ចប់</th><th>ថ្ងៃ</th><th>មូលហេតុ</th><th>ស្ថានភាព</th><th>សកម្មភាព</th></tr></thead>
        <tbody>${records.length===0
          ? `<tr><td colspan="8"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានការស្នើរ</p></div></td></tr>`
          : records.map(r=>`<tr>
            <td><div class="employee-cell"><div class="emp-avatar" style="background:${getColor(r.employee_name)}">${(r.employee_name||'?')[0]}</div><div class="emp-name">${r.employee_name}</div></div></td>
            <td><span class="badge badge-blue">${r.leave_type}</span></td>
            <td style="font-family:var(--mono)">${r.start_date}</td>
            <td style="font-family:var(--mono)">${r.end_date}</td>
            <td><span style="font-weight:700;color:var(--primary)">${r.days}ថ្ងៃ</span></td>
            <td style="color:var(--text3)">${r.reason||'—'}</td>
            <td>${r.status==='approved'?'<span class="badge badge-green">✅ អនុម័ត</span>':r.status==='rejected'?'<span class="badge badge-red">❌ បដិសេធ</span>':'<span class="badge badge-yellow">⏳ រង់ចាំ</span>'}</td>
            <td><div class="action-btns">
              ${r.status==='pending'?`
                <button class="btn btn-success btn-sm" onclick="updateLeave(${r.id},'approved')">✅</button>
                <button class="btn btn-danger btn-sm" onclick="updateLeave(${r.id},'rejected')">❌</button>`:''}
              <button class="btn btn-danger btn-sm" onclick="deleteRecord('leave',${r.id},renderLeave)">🗑️</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table></div></div>`;
  } catch(e) { showError(e.message); }
}

async function openLeaveModal() {
  await ensureEmployees();
  $('modal-title').textContent = 'ស្នើរច្បាប់ឈប់សម្រាក';
  $('modal-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group full-width"><label class="form-label">បុគ្គលិក *</label>
        <select class="form-control" id="lv-emp">${state.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">ប្រភេទ *</label>
        <select class="form-control" id="lv-type" onchange="calcLeaveDays()">
          <option>ច្បាប់ប្រចាំឆ្នាំ</option><option>ច្បាប់ជំងឺ</option>
          <option>ច្បាប់សម្ភព</option><option>ច្បាប់អាពាហ៍ពិពាហ៍</option>
          <option>ច្បាប់ស្ដីអំពីការស្លាប់</option><option>ច្បាប់គ្មានប្រាក់</option>
        </select></div>
      <div class="form-group"><label class="form-label">ថ្ងៃចាប់ផ្តើម *</label><input class="form-control" id="lv-start" type="date" value="${today()}" onchange="calcLeaveDays()" /></div>
      <div class="form-group"><label class="form-label">ថ្ងៃបញ្ចប់ *</label><input class="form-control" id="lv-end" type="date" value="${today()}" onchange="calcLeaveDays()" /></div>
      <div class="form-group full-width">
        <label class="form-label">ចំនួនថ្ងៃ</label>
        <div id="lv-days-display" style="padding:10px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);font-family:var(--mono);color:var(--primary);font-weight:700">1 ថ្ងៃ</div>
      </div>
      <div class="form-group full-width"><label class="form-label">មូលហេតុ</label><textarea class="form-control" id="lv-reason" rows="3" placeholder="មូលហេតុ..."></textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>
      <button class="btn btn-primary" onclick="saveLeave()">ស្នើរ</button>
    </div>`;
  openModal();
}

function calcLeaveDays() {
  const s = new Date($('lv-start')?.value);
  const e = new Date($('lv-end')?.value);
  if (!isNaN(s)&&!isNaN(e)&&e>=s) {
    const days = Math.round((e-s)/(1000*60*60*24))+1;
    $('lv-days-display').textContent = `${days} ថ្ងៃ`;
  }
}

async function saveLeave() {
  const s = new Date($('lv-start').value), e = new Date($('lv-end').value);
  if (isNaN(s)||isNaN(e)||e<s) { showToast('ថ្ងៃមិនត្រឹមត្រូវ!','error'); return; }
  const days = Math.round((e-s)/(1000*60*60*24))+1;
  try {
    await api('POST','/leave',{ employee_id:parseInt($('lv-emp').value), leave_type:$('lv-type').value, start_date:$('lv-start').value, end_date:$('lv-end').value, days, reason:$('lv-reason').value, status:'pending' });
    showToast('ស្នើរច្បាប់បានជោគជ័យ!','success'); closeModal(); renderLeave();
  } catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

async function updateLeave(id, status) {
  try { await api('PUT',`/leave/${id}`,{status}); showToast(status==='approved'?'អនុម័តហើយ!':'បដិសេធហើយ!',status==='approved'?'success':'warning'); renderLeave(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ===== SHARED DELETE =====
async function deleteRecord(endpoint, id, rerender) {
  if (!confirm('លុបកំណត់ត្រានេះ?')) return;
  try { await api('DELETE',`/${endpoint}/${id}`); showToast('លុបបានជោគជ័យ!','success'); rerender(); }
  catch(e) { showToast('បញ្ហា: '+e.message,'error'); }
}

// ===== DATE HELPERS =====
function today() { return new Date().toISOString().split('T')[0]; }
function thisMonth() { return new Date().toISOString().slice(0,7); }

// ============================================================
// SETTINGS HELPERS — localStorage config
// ============================================================
const CFG_KEY = 'hr_company_config';
const SAL_KEY = 'hr_salary_rules';

let _cfgCache = null;
function getCompanyConfig() {
  if (_cfgCache) return _cfgCache;
  try {
    _cfgCache = JSON.parse(localStorage.getItem(CFG_KEY)) || {};
    return _cfgCache;
  } catch { return {}; }
}
async function loadCompanyConfig() {
  if (isDemoMode()) {
    try { _cfgCache = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { _cfgCache = {}; }
    applyCompanyBranding();
    return;
  }
  try {
    const data = await api('GET', '/config');
    if (data && !data.error) {
      // Restore logo from localStorage (not stored in API)
      let localLogo = '';
      try {
        const local = JSON.parse(localStorage.getItem(CFG_KEY)) || {};
        localLogo = local.logo_url || '';
      } catch(_) {}
      _cfgCache = data;
      if (localLogo) _cfgCache.logo_url = localLogo;
      // Persist merged config back to localStorage
      localStorage.setItem(CFG_KEY, JSON.stringify(_cfgCache));
    } else {
      _cfgCache = JSON.parse(localStorage.getItem(CFG_KEY)) || {};
    }
  } catch(_) { _cfgCache = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
  applyCompanyBranding();
}
function getSalaryRules() {
  const def = {
    ot_rate_multiplier: 1.5,
    tax_rate: 5,
    nssf_employee: 2,
    nssf_employer: 2.6,
    income_tax_threshold: 1500,
    meal_allowance: 30,
    transport_allowance: 30,
    payroll_day: 25,
    payroll_auto: false,
    currency: 'USD',
    currency_symbol: '$',
    default_ot_hourly_rate: 5,
    work_start_time: '08:00',
    work_end_time: '17:00',
    late_grace_minutes: 15,
  };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SAL_KEY)) }; } catch { return def; }
}
// ── General Expense print with Income/Expense/Balance ──
async function printGenExpWithBalance() {
  const cfg = getCompanyConfig();
  try {
    const [expData, genData] = await Promise.all([api('GET','/expenses'), api('GET','/general-expenses')]);
    const income = (expData.records||[]).filter(r=>r.status==='approved').reduce((s,r)=>s+(r.amount||0),0);
    const expenses = (genData.records||[]);
    const totalExp = expenses.reduce((s,r)=>s+(r.amount||0),0);
    const balance = income - totalExp;

    const tableRows = expenses.map((r,i)=>
      '<tr style="background:'+(i%2===0?'white':'#f8faff')+'">'
      +'<td style="text-align:center;color:#666">'+(i+1)+'</td>'
      +'<td style="font-weight:600">'+r.title+'</td>'
      +'<td><span style="background:#dbeafe;color:#1d4ed8;padding:2px 6px;border-radius:4px;font-size:9px">'+r.category+'</span></td>'
      +'<td style="font-weight:700;color:#ef4444">$'+r.amount+'</td>'
      +'<td style="font-size:10px">'+r.expense_date+'</td>'
      +'<td style="font-size:10px;color:#64748b">'+(r.responsible||'—')+'</td>'
      +'<td>'+(r.status==='paid'?'✅ បានបង់':'⏳ រង់ចាំ')+'</td>'
      +'</tr>'
    ).join('');

    printHTML('<!DOCTYPE html><html><head><meta charset="UTF-8">'
      +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700&display=swap" rel="stylesheet">'
      +'<title>ការចំណាយទូទៅ</title>'
      +'<style>*{box-sizing:border-box;margin:0;padding:0;font-family:"Noto Sans Khmer",sans-serif}'
      +'body{padding:12px;color:#1a1f2e;background:white;font-size:10px}'
      +'.hdr{display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #1a3a8f}'
      +'.co{font-size:14px;font-weight:800;color:#1a3a8f}.rpt{font-size:11px;font-weight:700}.sub{font-size:9px;color:#666}'
      // Compact inline balance bar
      +'.balance-bar{display:flex;gap:8px;margin-bottom:10px;padding:8px 10px;background:#f8faff;border:1px solid #e2eaff;border-radius:6px;align-items:center}'
      +'.bal-item{display:flex;align-items:center;gap:6px}'
      +'.bal-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}'
      +'.bal-lbl{font-size:8px;color:#64748b;font-weight:600;white-space:nowrap}'
      +'.bal-val{font-size:12px;font-weight:800;white-space:nowrap}'
      +'.bal-sep{color:#e2e8f0;font-size:14px}'
      +'table{width:100%;border-collapse:collapse;font-size:9px}'
      +'th{background:#1a3a8f;color:white;padding:5px 4px;text-align:left;font-size:9px}'
      +'td{padding:4px 4px;border-bottom:1px solid #e5e7eb}'
      +'tr:nth-child(even){background:#f8faff}'
      +'.footer{margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}'
      +'.sign{border-top:1px dashed #999;padding-top:3px;text-align:center;font-size:8px;color:#666}'
      +'@media print{@page{size:A4;margin:8mm}body{padding:0}}'
      +'</style></head><body>'
      +'<div class="hdr">'
      +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="width:36px;height:36px;object-fit:contain;border-radius:6px">':'<div style="width:36px;height:36px;background:#1a3a8f;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:14px">HR</div>')
      +'<div><div class="co">'+(cfg.company_name||'HR Pro')+'</div><div class="rpt">ការចំណាយទូទៅ — General Expenses</div><div class="sub">'+new Date().toLocaleDateString('km-KH')+'</div></div>'
      +'</div>'
      // Compact inline balance bar instead of large cards
      +'<div class="balance-bar">'
      +'<div class="bal-item"><div class="bal-dot" style="background:#16a34a"></div><div><div class="bal-lbl">💚 ចំណូល (ស្នើរអនុម័ត)</div><div class="bal-val" style="color:#16a34a">$'+income.toFixed(2)+'</div></div></div>'
      +'<div class="bal-sep">│</div>'
      +'<div class="bal-item"><div class="bal-dot" style="background:#dc2626"></div><div><div class="bal-lbl">❤️ ចំណាយទូទៅ</div><div class="bal-val" style="color:#dc2626">$'+totalExp.toFixed(2)+'</div></div></div>'
      +'<div class="bal-sep">│</div>'
      +'<div class="bal-item"><div class="bal-dot" style="background:'+(balance>=0?'#1d4ed8':'#ea580c')+'"></div><div><div class="bal-lbl">⚖️ នៅសល់</div><div class="bal-val" style="color:'+(balance>=0?'#1d4ed8':'#ea580c')+'">'+(balance>=0?'+':'')+' $'+balance.toFixed(2)+'</div></div></div>'
      +'</div>'
      +'<table><thead><tr><th style="width:28px">លេខ</th><th>ចំណងជើង</th><th>ប្រភេទ</th><th>ចំនួន</th><th>កាលបរិច្ឆេទ</th><th>ទទួលខុសត្រូវ</th><th>ស្ថានភាព</th></tr></thead>'
      +'<tbody>'+tableRows+'</tbody>'
      +'<tfoot><tr style="background:#f0f4ff;border-top:2px solid #1a3a8f">'
      +'<td colspan="3" style="text-align:right;font-weight:700;padding:8px 5px">សរុបចំណាយ:</td>'
      +'<td style="font-weight:800;color:#ef4444;padding:8px 5px">$'+totalExp.toFixed(2)+'</td>'
      +'<td colspan="3"></td>'
      +'</tr></tfoot>'
      +'</table>'
      +'<div class="footer"><div class="sign">ហត្ថលេខាអ្នកត្រួតពិនិត្យ</div><div class="sign">ហត្ថលេខាអ្នកអនុម័ត</div><div class="sign">ហត្ថលេខានាយក</div></div>'
      +'</body></html>');

  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ── Generic print for any table on screen ──
function printTableData(title) {
  const cfg = getCompanyConfig();
  const table = document.querySelector('#content-area table');
  if (!table) { showToast('មិនទាន់មានទិន្នន័យ!','error'); return; }
  const titleMap = { 'overtime':'ថែមម៉ោង — OT Report','general-expenses':'ការចំណាយទូទៅ — General Expenses','loans':'ប្រាក់ខ្ចី — Loan Report','leave':'ច្បាប់ — Leave Report' };
  const reportTitle = titleMap[title]||'Report';
  const clone = table.cloneNode(true);
  clone.querySelectorAll('img,.action-btns').forEach(el=>el.remove());
  clone.querySelectorAll('.emp-avatar').forEach(el=>{
    const span=document.createElement('span');
    span.textContent=el.textContent.trim();
    el.replaceWith(span);
  });
  const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700&display=swap" rel="stylesheet">'
    +'<title>'+reportTitle+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;font-family:"Noto Sans Khmer",sans-serif}'
    +'body{padding:16px;color:#1a1f2e;background:white}'
    +'.hdr{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1a3a8f}'
    +'.co{font-size:15px;font-weight:800;color:#1a3a8f}.rpt{font-size:12px;font-weight:700}.sub{font-size:10px;color:#666}'
    +'table{width:100%;border-collapse:collapse;font-size:10px}'
    +'th{background:#1a3a8f;color:white;padding:7px 5px;text-align:left}'
    +'td{padding:6px 5px;border-bottom:1px solid #e5e7eb}'
    +'tr:nth-child(even){background:#f8faff}'
    +'.footer{margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}'
    +'.sign{border-top:1px dashed #999;padding-top:4px;text-align:center;font-size:9px;color:#666}'
    +'@media print{@page{size:A4 landscape;margin:8mm}body{padding:0}}'
    +'</style></head><body>'
    +'<div class="hdr">'
    +(cfg.logo_url?'<img src="'+cfg.logo_url+'" style="width:40px;height:40px;object-fit:contain;border-radius:8px">':'<div style="width:40px;height:40px;background:#1a3a8f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800">HR</div>')
    +'<div><div class="co">'+(cfg.company_name||'HR Pro')+'</div><div class="rpt">'+reportTitle+'</div><div class="sub">'+new Date().toLocaleDateString('km-KH')+'</div></div>'
    +'</div>'
    +clone.outerHTML
    +'<div class="footer"><div class="sign">ហត្ថលេខាអ្នកត្រួតពិនិត្យ</div><div class="sign">ហត្ថលេខាអ្នកអនុម័ត</div><div class="sign">ហត្ថលេខានាយក</div></div>'
    +'</body></html>';
  printHTML(htmlContent);
}

// ── 8: Attendance edit ──
async function openEditAttModal(attId, empName) {
  try {
    // Try direct ID lookup
    let r = null;
    try {
      const d = await api('GET', '/attendance?id='+attId);
      r = d.record;
    } catch(_) {}

    if (!r) {
      // Fallback: search today's records
      const today_date = new Date().toISOString().split('T')[0];
      const data = await api('GET', '/attendance?date='+today_date);
      r = (data.records||[]).find(x=>x.id===attId);
    }
    if (!r) { showToast('រកកំណត់ត្រាមិនឃើញ! (ID:'+attId+')','error'); return; }

    $('modal-title').textContent = 'កែប្រែវត្តមាន — '+empName;
    $('modal-body').innerHTML =
      '<div class="form-grid">'
      +'<div class="form-group"><label class="form-label">ថ្ងៃខែ</label><input class="form-control" id="ate-date" type="date" value="'+(r.date||'')+'"/></div>'
      +'<div class="form-group"><label class="form-label">ម៉ោងចូល</label><input class="form-control" id="ate-in" type="time" value="'+(r.check_in||'08:00')+'"/></div>'
      +'<div class="form-group"><label class="form-label">ម៉ោងចេញ</label><input class="form-control" id="ate-out" type="time" value="'+(r.check_out||'17:00')+'"/></div>'
      +'<div class="form-group"><label class="form-label">ស្ថានភាព</label>'
      +'<select class="form-control" id="ate-status">'
      +'<option value="present"'+(r.status==='present'?' selected':'')+'>✅ វត្តមាន</option>'
      +'<option value="late"'+(r.status==='late'?' selected':'')+'>⏰ យឺត</option>'
      +'<option value="absent"'+(r.status==='absent'?' selected':'')+'>❌ អវត្តមាន</option>'
      +'</select></div>'
      +'</div>'
      +'<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
      +'<button class="btn btn-primary" onclick="saveEditAtt('+attId+',\''+r.date+'\')">💾 រក្សាទុក</button></div>';
    openModal();
  } catch(e){showToast('Error: '+e.message,'error');}
}

async function saveEditAtt(id, date) {
  try {
    await api('PUT','/attendance/'+id,{ date:$('ate-date')?.value||date, check_in:$('ate-in')?.value, check_out:$('ate-out')?.value, status:$('ate-status')?.value });
    showToast('កែប្រែវត្តមានបានជោគជ័យ!','success');
    closeModal(); renderAttendance($('ate-date')?.value||date);
  } catch(e){showToast('Error: '+e.message,'error');}
}

function saveCompanyConfig(cfg) {
  _cfgCache = null;
  _cfgCache = cfg;
  // Save full config (including logo) to localStorage
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  applyCompanyBranding();
  // Send to API WITHOUT logo_url (base64 too large — logo stays in localStorage only)
  if (!isDemoMode()) {
    const apiCfg = Object.assign({}, cfg);
    delete apiCfg.logo_url;
    api('POST', '/config', apiCfg).catch(() => {});
  }
}
function saveSalaryRules(rules) { localStorage.setItem(SAL_KEY, JSON.stringify(rules)); }

function applyCompanyBranding() {
  const cfg = getCompanyConfig();
  // Company name
  const nameEl = $('brand-company-name');
  if (nameEl) nameEl.textContent = cfg.company_name || 'HR Pro';
  document.title = (cfg.company_name || 'HR Pro') + ' - ប្រព័ន្ធ HR';
  // Logo
  const wrap = $('brand-logo-wrap');
  if (wrap && cfg.logo_url) {
    wrap.innerHTML = `<img src="${cfg.logo_url}" style="width:40px;height:40px;object-fit:contain;border-radius:10px" onerror="this.parentNode.innerHTML='<svg viewBox=\\'0 0 40 40\\' fill=\\'none\\'><rect width=\\'40\\' height=\\'40\\' rx=\\'10\\' fill=\\'#FF6B35\\'/><path d=\\'M20 10C17.2 10 15 12.2 15 15C15 17.8 17.2 20 20 20C22.8 20 25 17.8 25 15C25 12.2 22.8 10 20 10Z\\' fill=\\'white\\'/><path d=\\'M10 30C10 25.6 14.5 22 20 22C25.5 22 30 25.6 30 30H10Z\\' fill=\\'white\\' opacity=\\'0.8\\'/></svg>'" />`;
  }
  // Accent color
  if (cfg.accent_color) {
    document.documentElement.style.setProperty('--primary', cfg.accent_color);
    document.documentElement.style.setProperty('--primary-light', cfg.accent_color + 'cc');
  }
  // Sidebar user info
  const uname = $('sidebar-user-name');
  const urole = $('sidebar-user-role');
  const uavatar = $('sidebar-user-avatar');
  if (uname && cfg.admin_name) uname.textContent = cfg.admin_name;
  if (urole && cfg.admin_role) urole.textContent = cfg.admin_role;
  if (uavatar && cfg.admin_name) uavatar.textContent = cfg.admin_name[0] || 'A';
}

// ============================================================
// DAY SWAP — ប្តូរថ្ងៃឈប់សម្រាក
// ============================================================
async function renderDaySwap() {
  showLoading();
  try {
    const [swapData, empData] = await Promise.all([
      api('GET', '/dayswap'),
      api('GET', '/employees?limit=500'),
    ]);
    const records = swapData.records || [];
    const emps = empData.employees || [];
    const pending  = records.filter(r => r.status === 'pending').length;
    const approved = records.filter(r => r.status === 'approved').length;
    const wdNames  = ['អាទិត្យ','ច័ន្ទ','អង្គារ','ពុធ','ព្រហស្បតិ៍','សុក្រ','សៅរ៍'];

    contentArea().innerHTML = `
      <div class="page-header">
        <div><h2>🔄 ប្តូរថ្ងៃឈប់សម្រាក</h2><p>គ្រប់គ្រងការស្នើប្តូរថ្ងៃ OFF</p></div>
        ${canEdit() ? `<button class="btn btn-primary" onclick="openDaySwapModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ស្នើប្តូរថ្ងៃ
        </button>` : ''}
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
        <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
          <div><div class="stat-label">ស្នើរសរុប</div><div class="stat-value">${records.length}</div></div></div>
        <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div><div class="stat-label">រង់ចាំ</div><div class="stat-value" style="color:var(--warning)">${pending}</div></div></div>
        <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div><div class="stat-label">អនុម័ត</div><div class="stat-value" style="color:var(--success)">${approved}</div></div></div>
      </div>
      <div class="card"><div class="table-container"><table>
        <thead><tr>
          <th>បុគ្គលិក</th>
          <th>ថ្ងៃ OFF ដែលធ្វើការ</th>
          <th>ធ្វើការជំនួស</th>
          <th>កាលបរិច្ឆេទ</th>
          <th>មូលហេតុ</th>
          <th>ស្ថានភាព</th>
          <th>សកម្មភាព</th>
        </tr></thead>
        <tbody>${records.length === 0
          ? `<tr><td colspan="7"><div class="empty-state" style="padding:30px"><p>មិនទាន់មានការស្នើ</p></div></td></tr>`
          : records.map(r => {
              const workDay  = wdNames[r.work_day]  || r.work_day;
              const offDay   = wdNames[r.off_day]   || r.off_day;
              return `<tr>
                <td><div class="employee-cell">
                  <div class="emp-avatar" style="background:${getColor(r.employee_name)}">${(r.employee_name||'?')[0]}</div>
                  <div class="emp-name">${r.employee_name||'—'}</div>
                </div></td>
                <td>
                  <span style="background:rgba(239,71,111,.12);color:var(--danger);padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">OFF → ${workDay}</span>
                  ${r.swap_date ? `<div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:3px;padding-left:2px">📅 ${r.swap_date}</div>` : ''}
                </td>
                <td>
                  <span style="background:rgba(6,214,160,.12);color:var(--success);padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">✔ ${offDay}</span>
                  ${r.off_date
                    ? `<div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:3px;padding-left:2px">📅 ${r.off_date}</div>`
                    : `<div style="font-size:10px;color:var(--warning);margin-top:3px;padding-left:2px">⚠️ មិនមានថ្ងៃទី</div>`}
                </td>
                <td style="font-family:var(--mono);font-size:12px">${r.swap_date||'—'}</td>
                <td style="color:var(--text3);font-size:12px">${r.reason||'—'}</td>
                <td>${r.status==='approved'
                  ? '<span class="badge badge-green">✅ អនុម័ត</span>'
                  : r.status==='rejected'
                  ? '<span class="badge badge-red">❌ បដិសេធ</span>'
                  : '<span class="badge badge-yellow">⏳ រង់ចាំ</span>'}</td>
                <td><div class="action-btns">
                  ${r.status==='pending' && canEdit() ? `
                    <button class="btn btn-success btn-sm" onclick="updateDaySwap(${r.id},'approved')">✅</button>
                    <button class="btn btn-danger btn-sm" onclick="updateDaySwap(${r.id},'rejected')">❌</button>` : ''}
                  ${canEdit() ? `<button class="btn btn-outline btn-sm" onclick="openDaySwapModal(${r.id})" style="border-color:var(--info);color:var(--info)">✏️</button>` : ''}
                  ${canEdit() ? `<button class="btn btn-danger btn-sm" onclick="deleteRecord('dayswap',${r.id},renderDaySwap)">🗑️</button>` : ''}
                </div></td>
              </tr>`;
            }).join('')}
        </tbody>
      </table></div></div>`;
  } catch(e) { showError(e.message); }
}

async function openDaySwapModal(id = null) {
  try {
    const empData = await api('GET', '/employees?limit=500');
    const emps = empData.employees || [];
    const wdNames = ['អាទិត្យ','ច័ន្ទ','អង្គារ','ពុធ','ព្រហស្បតិ៍','សុក្រ','សៅរ៍'];
    let rec = null;
    if (id) { try { rec = await api('GET', '/dayswap/' + id); } catch(_) {} }

    // Build emp map for quick lookup of off_days
    const empMap = {};
    emps.forEach(e => { empMap[e.id] = e; });
    window._dsEmps = empMap;
    window._dsWdNames = wdNames;

    const empOptions = emps.map(e => {
      const offDays = parseOffDays(e);
      return `<option value="${e.id}" data-offdays="${JSON.stringify(offDays)}" ${rec?.employee_id===e.id?'selected':''}>${e.name}</option>`;
    }).join('');

    // Determine initial employee & their off days
    const initEmp = rec ? emps.find(e=>e.id===rec.employee_id) : emps[0];
    const initOffDays = initEmp ? parseOffDays(initEmp) : [0];
    const initWorkDay = rec?.work_day ?? (initOffDays.length ? initOffDays[0] : 0);
    const initOffDay  = rec?.off_day  ?? -1;
    const initWorkDate = rec?.swap_date || '';
    const initOffDate  = rec?.off_date  || '';

    $('modal-title').textContent = id ? 'កែការស្នើប្តូរថ្ងៃ' : '🔄 ស្នើប្តូរថ្ងៃឈប់សម្រាក';
    $('modal-body').innerHTML = `
      <div style="background:var(--bg3);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--text3)">
        💡 <b>ឧទាហរណ៍:</b> OFF ថ្ងៃអាទិត្យ → ចូលធ្វើការថ្ងៃអាទិត្យ ហើយ OFF ថ្ងៃច័ន្ទ ជំនួស
      </div>
      <div class="form-grid">
        <div class="form-group full-width">
          <label class="form-label">បុគ្គលិក *</label>
          <select class="form-control" id="ds-emp" onchange="dsAutoFillOffDay(this)">${empOptions}</select>
        </div>

        <!-- ===== ថ្ងៃ OFF ដែលត្រូវធ្វើការ ===== -->
        <div class="form-group full-width">
          <label class="form-label" style="color:var(--danger);font-weight:700">📅 ថ្ងៃ OFF ដែលត្រូវធ្វើការ *</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="form-control" id="ds-work-day" style="flex:0 0 140px" onchange="dsFilterWorkDate()">
              <option value="" disabled ${initWorkDay===-1?'selected':''}>-- ថ្ងៃ --</option>
              ${wdNames.map((n,i)=>`<option value="${i}" ${initWorkDay===i?'selected':''}>${n}</option>`).join('')}
            </select>
            <input class="form-control" type="date" id="ds-work-date" style="flex:1" value="${initWorkDate}" onchange="dsOnWorkDateChange(this.value)"/>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px" id="ds-work-hint">Auto ពី Day Off របស់បុគ្គលិក — ជ្រើសថ្ងៃទីជាក់លាក់</div>
        </div>

        <!-- ===== ថ្ងៃធ្វើការ ដែលត្រូវ OFF ===== -->
        <div class="form-group full-width">
          <label class="form-label" style="color:var(--success);font-weight:700">✅ ថ្ងៃធ្វើការ ដែលត្រូវ OFF ជំនួស * <span style="color:var(--danger);font-size:10px">(ចាំបាច់)</span></label>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="form-control" id="ds-off-day" style="flex:0 0 140px" onchange="dsFilterOffDate()">
              <option value="" disabled ${initOffDay===-1?'selected':''}>-- ថ្ងៃ --</option>
              ${wdNames.map((n,i)=>`<option value="${i}" ${initOffDay===i?'selected':''}>${n}</option>`).join('')}
            </select>
            <input class="form-control" type="date" id="ds-off-date" style="flex:1" value="${initOffDate}" onchange="dsOnOffDateChange(this.value)"/>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px" id="ds-off-hint">ជ្រើសថ្ងៃធ្វើការ ដែលត្រូវឈប់ជំនួស</div>
        </div>

        <div class="form-group full-width">
          <label class="form-label">មូលហេតុ</label>
          <input class="form-control" id="ds-reason" placeholder="មូលហេតុ..." value="${rec?.reason||''}"/>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>
        <button class="btn btn-primary" onclick="saveDaySwap(${id||'null'})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>
          រក្សាទុក
        </button>
      </div>`;
    openModal();
    // Trigger hint update after render
    dsFilterWorkDate();
    dsFilterOffDate();
  } catch(e) { showToast('បញ្ហា: ' + e.message, 'error'); }
}

async function saveDaySwap(id = null) {
  const empId      = parseInt($('ds-emp')?.value);
  const workDayVal = $('ds-work-day')?.value;
  const offDayVal  = $('ds-off-day')?.value;
  const workDay    = workDayVal !== '' ? parseInt(workDayVal) : NaN;
  const offDay     = offDayVal  !== '' ? parseInt(offDayVal)  : NaN;
  const workDate   = $('ds-work-date')?.value;   // ថ្ងៃ OFF ដែលមកធ្វើការ
  const offDate    = $('ds-off-date')?.value;    // ថ្ងៃធ្វើការ ដែល OFF ជំនួស
  const reason     = $('ds-reason')?.value.trim();

  if (!empId || isNaN(workDay) || isNaN(offDay) || !workDate) {
    showToast('សូមបំពេញព័ត៌មានឱ្យបរិបូរណ៍!', 'error'); return;
  }
  if (!offDate) {
    showToast('សូមបញ្ចូលថ្ងៃទី OFF ជំនួស (ធ្វើការជំនួស)!', 'error'); return;
  }
  if (workDay === offDay) {
    showToast('ថ្ងៃ OFF និងថ្ងៃ OFF ជំនួស មិនអាចដូចគ្នា!', 'error'); return;
  }
  // Validate work date matches selected weekday
  if (workDate) {
    const wd = new Date(workDate + 'T00:00:00').getDay();
    if (wd !== workDay) {
      const wdNames = ['អាទិត្យ','ច័ន្ទ','អង្គារ','ពុធ','ព្រហស្បតិ៍','សុក្រ','សៅរ៍'];
      showToast(`ថ្ងៃទី ${workDate} មិនមែនជាថ្ងៃ${wdNames[workDay]}!`, 'error'); return;
    }
  }
  // Validate off_date matches selected off_day
  if (offDate) {
    const wdNames = ['អាទិត្យ','ច័ន្ទ','អង្គារ','ពុធ','ព្រហស្បតិ៍','សុក្រ','សៅរ៍'];
    const od = new Date(offDate + 'T00:00:00').getDay();
    if (od !== offDay) {
      showToast(`ថ្ងៃទី ${offDate} មិនមែនជាថ្ងៃ${wdNames[offDay]}!`, 'error'); return;
    }
  }

  const body = { employee_id: empId, work_day: workDay, off_day: offDay,
                 swap_date: workDate, off_date: offDate || null, reason, status: 'pending' };
  try {
    if (id) {
      await api('PUT', '/dayswap/' + id, body);
      showToast('កែប្រែបានជោគជ័យ!', 'success');
    } else {
      await api('POST', '/dayswap', body);
      showToast('ស្នើប្តូរថ្ងៃបានជោគជ័យ!', 'success');
    }
    closeModal();
    renderDaySwap();
  } catch(e) { showToast('បញ្ហា: ' + e.message, 'error'); }
}

// ===== DAY SWAP HELPERS =====

// When employee changes → auto-fill work_day from their off_days
function dsAutoFillOffDay(sel) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  try {
    const offDays = JSON.parse(opt.getAttribute('data-offdays') || '[]');
    const workDaySel = $('ds-work-day');
    if (workDaySel && offDays.length) {
      workDaySel.value = String(offDays[0]);
      dsFilterWorkDate();
    }
  } catch(_) {}
}

// When work_day select changes → update date hint & clear date if mismatch
function dsFilterWorkDate() {
  const wdSel = $('ds-work-day');
  const dateEl = $('ds-work-date');
  const hint = $('ds-work-hint');
  if (!wdSel || !dateEl) return;
  const wd = parseInt(wdSel.value);
  if (isNaN(wd)) return;
  const wdNames = ['អាទិត្យ','ច័ន្ទ','អង្គារ','ពុធ','ព្រហស្បតិ៍','សុក្រ','សៅរ៍'];
  // If current date doesn't match weekday, clear it
  if (dateEl.value) {
    const curWd = new Date(dateEl.value + 'T00:00:00').getDay();
    if (curWd !== wd) dateEl.value = '';
  }
  // Suggest nearest upcoming date of this weekday
  if (!dateEl.value) {
    const suggested = dsNextWeekday(wd);
    dateEl.value = suggested;
  }
  if (hint) hint.textContent = `ជ្រើសថ្ងៃ${wdNames[wd]}ជាក់លាក់ ដែលបុគ្គលិកចូលធ្វើការ`;
}

// When off_day select changes → update date hint & suggest date
function dsFilterOffDate() {
  const wdSel = $('ds-off-day');
  const dateEl = $('ds-off-date');
  const hint = $('ds-off-hint');
  if (!wdSel || !dateEl) return;
  const wd = parseInt(wdSel.value);
  if (isNaN(wd)) return;
  const wdNames = ['អាទិត្យ','ច័ន្ទ','អង្គារ','ពុធ','ព្រហស្បតិ៍','សុក្រ','សៅរ៍'];
  if (dateEl.value) {
    const curWd = new Date(dateEl.value + 'T00:00:00').getDay();
    if (curWd !== wd) dateEl.value = '';
  }
  if (!dateEl.value) {
    dateEl.value = dsNextWeekday(wd);
  }
  if (hint) hint.textContent = `ជ្រើសថ្ងៃ${wdNames[wd]}ជាក់លាក់ ដែលត្រូវ OFF ជំនួស`;
}

// When work date picked → auto-set work_day select to match
function dsOnWorkDateChange(val) {
  if (!val) return;
  const wd = new Date(val + 'T00:00:00').getDay();
  const sel = $('ds-work-day');
  if (sel) { sel.value = String(wd); dsFilterWorkDate(); }
}

// When off date picked → auto-set off_day select to match
function dsOnOffDateChange(val) {
  if (!val) return;
  const wd = new Date(val + 'T00:00:00').getDay();
  const sel = $('ds-off-day');
  if (sel) { sel.value = String(wd); dsFilterOffDate(); }
}

// Get nearest upcoming date for a given weekday (0=Sun..6=Sat)
function dsNextWeekday(wd) {
  const now = new Date();
  let d = new Date(now);
  const cur = d.getDay();
  let diff = (wd - cur + 7) % 7;
  if (diff === 0) diff = 7; // push to next week if same day
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}

async function updateDaySwap(id, status) {
  try {
    await api('PUT', '/dayswap/' + id, { status });
    showToast(status === 'approved' ? '✅ អនុម័តរួចរាល់!' : '❌ បដិសេធរួចរាល់!', 'success');
    renderDaySwap();
  } catch(e) { showToast('បញ្ហា: ' + e.message, 'error'); }
}

// ============================================================
// SETTINGS PAGE RENDER
// ============================================================
function renderSettings() {
  const cfg = getCompanyConfig();
  const rules = getSalaryRules();
  const apiBase = getApiBase();
  const demoMd = isDemoMode();
  const ACCENT_COLORS = ['#FF6B35','#3A86FF','#06D6A0','#8338EC','#FFB703','#EF476F','#118AB2','#FB5607'];

  contentArea().innerHTML = `
  <div class="settings-layout">

    <!-- Tab navigation -->
    <div class="settings-tabs">
      <a href="#" class="settings-tab active" onclick="switchSettingsTab('company',this);return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        ក្រុមហ៊ុន
      </a>
      <a href="#" class="settings-tab" onclick="switchSettingsTab('salary_rules',this);return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        បៀវត្ស
      </a>
      <a href="#" class="settings-tab" onclick="switchSettingsTab('api',this);return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
        API / Database
      </a>
      <a href="#" class="settings-tab" onclick="switchSettingsTab('accounts',this);return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        គណនី
      </a>
      <a href="#" class="settings-tab" onclick="switchSettingsTab('appearance',this);return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>
        រូបរាង
      </a>
      <a href="#" class="settings-tab" onclick="switchSettingsTab('permissions',this);return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        សិទ្ធ
      </a>
      <a href="#" class="settings-tab" onclick="switchSettingsTab('data_mgmt',this);return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        Data
      </a>
    </div>

    <!-- Panels -->
    <div id="settings-content">

      <!-- === COMPANY PANEL === -->
      <div class="settings-panel active" id="panel-company">

        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(255,107,53,.15);font-size:18px">🏢</div>
            <div>
              <div class="settings-section-title">ព័ត៌មានក្រុមហ៊ុន</div>
              <div class="settings-section-desc">ឈ្មោះ, logo, និងព័ត៌មានទំនាក់ទំនង</div>
            </div>
          </div>
          <div class="settings-section-body">

            <!-- Logo upload -->
            <div class="form-group" style="margin-bottom:20px">
              <label class="form-label">Logo ក្រុមហ៊ុន</label>
              <div class="logo-upload-area" onclick="$('logo-file-input').click()">
                <div class="logo-preview" id="logo-preview-box">
                  ${cfg.logo_url
                    ? `<img src="${cfg.logo_url}" onerror="this.style.display='none'" />`
                    : `<span style="font-size:22px">🏢</span>`}
                </div>
                <div class="logo-upload-text">
                  <div class="lbl">ចុចដើម្បីបើក Logo</div>
                  <div class="sub">PNG, JPG, SVG — អតិបរមា 2MB</div>
                  ${cfg.logo_url ? `<button class="btn btn-danger btn-sm" style="margin-top:8px" onclick="event.stopPropagation();removeLogo()">🗑️ លុប Logo</button>` : ''}
                </div>
              </div>
              <input type="file" id="logo-file-input" accept="image/*" style="display:none" onchange="handleLogoUpload(this)" />
            </div>

            <div class="form-grid">
              <div class="form-group full-width">
                <label class="form-label">ឈ្មោះក្រុមហ៊ុន *</label>
                <input class="form-control" id="cfg-company-name" placeholder="ABC Company Ltd." value="${cfg.company_name||''}" />
              </div>
              <div class="form-group">
                <label class="form-label">ឈ្មោះអ្នកគ្រប់គ្រង</label>
                <input class="form-control" id="cfg-admin-name" placeholder="Admin" value="${cfg.admin_name||''}" />
              </div>
              <div class="form-group">
                <label class="form-label">តំណែងអ្នកគ្រប់គ្រង</label>
                <input class="form-control" id="cfg-admin-role" placeholder="អ្នកគ្រប់គ្រង" value="${cfg.admin_role||''}" />
              </div>
              <div class="form-group">
                <label class="form-label">អ៊ីម៉ែលក្រុមហ៊ុន</label>
                <input class="form-control" id="cfg-email" type="email" placeholder="info@company.com" value="${cfg.company_email||''}" />
              </div>
              <div class="form-group">
                <label class="form-label">លេខទូរស័ព្ទ</label>
                <input class="form-control" id="cfg-phone" placeholder="023-xxx-xxx" value="${cfg.company_phone||''}" />
              </div>
              <div class="form-group full-width">
                <label class="form-label">អាសយដ្ឋាន</label>
                <input class="form-control" id="cfg-address" placeholder="ភ្នំពេញ, កម្ពុជា" value="${cfg.company_address||''}" />
              </div>
              <div class="form-group full-width">
                <label class="form-label">ចក្ខុវិស័យ / Slogan</label>
                <input class="form-control" id="cfg-slogan" placeholder="ចក្ខុវិស័យ..." value="${cfg.slogan||''}" />
              </div>
              <div class="form-group full-width">
                <label class="form-label">🪪 អត្ថបទការ​ត​បាត់ (ID Card Footer)</label>
                <input class="form-control" id="cfg-lost-card" placeholder="ករណីបាត់ — If found, please return" value="${cfg.lost_card_text||'ករណីបាត់ — If found, please return'}" />
                <div style="font-size:11px;color:var(--text3);margin-top:4px">នឹងបង្ហាញនៅខាងក្រោម ID Card រាល់ style</div>
              </div>
            </div>

            <div class="form-actions" style="padding-top:16px;margin-top:4px">
              <button class="btn btn-primary" onclick="saveCompanySettings()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="20 6 9 17 4 12"/></svg>
                រក្សាទុក
              </button>
            </div>
          </div>
        </div>

      </div><!-- /panel-company -->

      <!-- === SALARY RULES PANEL === -->
      <div class="settings-panel" id="panel-salary_rules">

        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(6,214,160,.15);font-size:18px">💰</div>
            <div>
              <div class="settings-section-title">ការកំណត់បើកប្រាក់បៀវត្ស</div>
              <div class="settings-section-desc">ពន្ធ, NSSF, OT, ថ្ងៃបើក</div>
            </div>
          </div>
          <div class="settings-section-body">

            <!-- Payroll schedule -->
            <div style="margin-bottom:24px">
              <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">📅 កំណត់ការណ៍បើកប្រាក់</div>
              <div class="salary-rules-grid">
                <div class="salary-rule-card">
                  <div class="rule-label">ថ្ងៃបើកប្រាក់ប្រចាំខែ</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-payday" value="${rules.payroll_day}" min="1" max="31" />
                    <span class="rule-unit">ថ្ងៃ/ខែ</span>
                  </div>
                </div>
                <div class="salary-rule-card">
                  <div class="rule-label">រូបិយប័ណ្ណ</div>
                  <div class="rule-input-wrap">
                    <select class="form-control" id="sr-currency" style="font-family:var(--mono);font-weight:700">
                      <option value="USD" ${rules.currency==='USD'?'selected':''}>USD ($)</option>
                      <option value="KHR" ${rules.currency==='KHR'?'selected':''}>KHR (៛)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tax & deductions -->
            <div style="margin-bottom:24px">
              <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">🏦 ពន្ធ & កាត់ (Deductions)</div>
              <div class="salary-rules-grid">
                <div class="salary-rule-card">
                  <div class="rule-label">អាករលើប្រាក់ចំណូល (Tax)</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-tax" value="${rules.tax_rate}" min="0" max="100" step="0.5" />
                    <span class="rule-unit">%</span>
                  </div>
                </div>
                <div class="salary-rule-card">
                  <div class="rule-label">ដំបូលប្រាក់ខែសម្រាប់ Tax</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-tax-threshold" value="${rules.income_tax_threshold}" min="0" />
                    <span class="rule-unit">USD/ខែ</span>
                  </div>
                </div>
                <div class="salary-rule-card">
                  <div class="rule-label">NSSF — បុគ្គលិក</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-nssf-emp" value="${rules.nssf_employee}" min="0" step="0.1" />
                    <span class="rule-unit">%</span>
                  </div>
                </div>
                <div class="salary-rule-card">
                  <div class="rule-label">NSSF — និយោជក</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-nssf-er" value="${rules.nssf_employer}" min="0" step="0.1" />
                    <span class="rule-unit">%</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Absence Deduction Rules -->
            <div style="margin-bottom:24px">
              <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">❌ ច្បាប់កាត់ប្រាក់អវត្តមាន</div>
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text3)">
                💡 ប្រើក្នុងផ្ទាំង "តារាងប្រចាំខែ" ដើម្បីកាត់ប្រាក់ដោយស្វ័យប្រវត្តិ ពេលអវត្តមានលើសថ្ងៃ
              </div>
              <div class="salary-rules-grid">
                <div class="salary-rule-card" style="border-color:var(--danger);background:rgba(239,71,111,.04)">
                  <div class="rule-label">ថ្ងៃអវត្តមានអនុញ្ញាត/ខែ</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-max-absent" value="${rules.max_absent_days !== undefined ? rules.max_absent_days : 2}" min="0" max="31" />
                    <span class="rule-unit">ថ្ងៃ</span>
                  </div>
                </div>
                <div class="salary-rule-card" style="border-color:var(--danger);background:rgba(239,71,111,.04)">
                  <div class="rule-label">រូបមន្តកាត់ប្រាក់អវត្តមាន</div>
                  <div style="font-size:11px;color:var(--text3);padding:6px 0;line-height:1.6">
                    ប្រាក់ខែ ÷ ថ្ងៃធ្វើការ × ថ្ងៃលើស<br/>
                    <span style="color:var(--danger);font-weight:600">ស្វ័យប្រវត្តិតាមបុគ្គលិកម្នាក់ៗ</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Work Schedule -->
            <div style="margin-bottom:24px">
              <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">🕐 កំណត់ម៉ោងធ្វើការ</div>
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text3)">
                💡 ម៉ោងចូលត្រូវបានប្រើដើម្បីកំណត់ថា បុគ្គលិកចូលយឺតឬអត់ នៅពេល Scan QR ឬ Check-in
              </div>
              <div class="salary-rules-grid">
                <div class="salary-rule-card" style="border-color:var(--primary);background:rgba(99,102,241,.04)">
                  <div class="rule-label">⏰ ម៉ោងចូលធ្វើការ</div>
                  <div class="rule-input-wrap">
                    <input type="time" id="sr-work-start" value="${rules.work_start_time || '08:00'}" style="font-family:var(--mono);font-weight:700;font-size:14px" oninput="updateLatePreview()" />
                  </div>
                  <div style="font-size:10px;color:var(--text3);margin-top:4px">ម៉ោងដែលត្រូវចូលធ្វើការ</div>
                </div>
                <div class="salary-rule-card" style="border-color:var(--success);background:rgba(16,185,129,.04)">
                  <div class="rule-label">🏁 ម៉ោងចេញធ្វើការ</div>
                  <div class="rule-input-wrap">
                    <input type="time" id="sr-work-end" value="${rules.work_end_time || '17:00'}" style="font-family:var(--mono);font-weight:700;font-size:14px" />
                  </div>
                  <div style="font-size:10px;color:var(--text3);margin-top:4px">ម៉ោងដែលត្រូវចេញធ្វើការ</div>
                </div>
                <div class="salary-rule-card" style="border-color:var(--warning);background:rgba(255,190,11,.04)">
                  <div class="rule-label">⏳ ផ្តល់ grace period (នាទី)</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-late-grace" value="${rules.late_grace_minutes !== undefined ? rules.late_grace_minutes : 15}" min="0" max="60" oninput="updateLatePreview()" />
                    <span class="rule-unit">នាទី</span>
                  </div>
                  <div style="font-size:10px;color:var(--text3);margin-top:4px">ចូលយឺតក្រោយ: <span id="late-preview" style="color:var(--warning);font-weight:700">${(()=>{const p=(rules.work_start_time||'08:00').split(':').map(Number);const g=rules.late_grace_minutes!==undefined?rules.late_grace_minutes:15;const t=p[0]*60+p[1]+g;return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');})()} </span></div>
                </div>
              </div>
            </div>

            <!-- OT & Allowances -->
            <div style="margin-bottom:24px">
              <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">⏰ ថែមម៉ោង & ឧបត្ថម្ភ Default</div>
              <div class="salary-rules-grid">
                <div class="salary-rule-card">
                  <div class="rule-label">OT Rate Multiplier</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-ot-rate" value="${rules.ot_rate_multiplier}" min="1" max="5" step="0.1" />
                    <span class="rule-unit">x ប្រាក់ខែ/ម៉ោង</span>
                  </div>
                </div>
                <div class="salary-rule-card" style="border-color:var(--success);background:rgba(16,185,129,.04)">
                  <div class="rule-label">💵 អត្រា OT/ម៉ោង Default</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-ot-hourly" value="${rules.default_ot_hourly_rate || 5}" min="0" step="0.5" />
                    <span class="rule-unit">USD/ម៉ោង</span>
                  </div>
                  <div style="font-size:10px;color:var(--text3);margin-top:4px">តម្លៃ​លំ​នាំ​ដើម​ក្នុង​ form ថែម​ម៉ោង</div>
                </div>
                <div class="salary-rule-card">
                  <div class="rule-label">ឧបត្ថម្ភចំណីអាហារ Default</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-meal" value="${rules.meal_allowance}" min="0" />
                    <span class="rule-unit">USD/ខែ</span>
                  </div>
                </div>
                <div class="salary-rule-card">
                  <div class="rule-label">ឧបត្ថម្ភធ្វើដំណើរ Default</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-transport" value="${rules.transport_allowance}" min="0" />
                    <span class="rule-unit">USD/ខែ</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Auto payroll toggle -->
            <div class="settings-row" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:0">
              <div class="settings-row-info">
                <div class="settings-row-label">🤖 Auto Payroll</div>
                <div class="settings-row-desc">គណនា និងបង្កើតកំណត់ត្រាប្រាក់ខែដោយស្វ័យប្រវត្តិ</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="sr-auto" ${rules.payroll_auto?'checked':''} onchange="toggleAutoPayrollUI(this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <!-- Auto Payroll config panel — show only when ON -->
            <div id="auto-payroll-panel" style="display:${rules.payroll_auto?'block':'none'};margin-top:12px;padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm)">
              <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px">⚙️ Auto Payroll Configuration</div>
              <div class="salary-rules-grid">
                <div class="salary-rule-card">
                  <div class="rule-label">ថ្ងៃបើកប្រាក់ខែ (Day of Month)</div>
                  <div class="rule-input-wrap">
                    <input type="number" id="sr-payday-auto" value="${rules.payroll_day||25}" min="1" max="31" />
                    <span class="rule-unit">ថ្ងៃ</span>
                  </div>
                  <div style="font-size:10px;color:var(--text3);margin-top:4px">ប្រព័ន្ធនឹងបង្កើត payroll ដោយស្វ័យប្រវត្តិនៅថ្ងៃនេះ</div>
                </div>
                <div class="salary-rule-card">
                  <div class="rule-label">ស្ថានភាព Auto Payroll</div>
                  <div style="margin-top:8px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                      <div class="status-dot online"></div>
                      <span style="font-size:12px;color:var(--success);font-weight:600">បើកដំណើរការ</span>
                    </div>
                    <div style="font-size:11px;color:var(--text3)">ថ្ងៃបើក: ថ្ងៃទី ${rules.payroll_day||25} រៀងរាល់ខែ</div>
                    <div style="font-size:11px;color:var(--text3)">ខែបន្ទាប់: ${(()=>{ const d=new Date(); d.setDate(rules.payroll_day||25); if(d<=new Date()) d.setMonth(d.getMonth()+1); return d.toLocaleDateString('km-KH',{month:'long',day:'numeric',year:'numeric'}); })()}</div>
                  </div>
                </div>
              </div>
              <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-success btn-sm" onclick="runAutoPayrollNow()">
                  ▶ បើកប្រាក់ខែខែនេះឥឡូវ
                </button>
                <button class="btn btn-outline btn-sm" onclick="checkAutoPayrollStatus()">
                  📋 ពិនិត្យស្ថានភាព
                </button>
              </div>
              <div id="auto-payroll-result" style="margin-top:10px;font-size:12px"></div>
            </div>

            <!-- Salary formula preview -->
            <div style="margin-top:20px;padding:16px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border)">
              <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-weight:600">📐 រូបមន្តប្រាក់ខែ Net</div>
              <div style="font-family:var(--mono);font-size:13px;color:var(--text2);line-height:2">
                <span style="color:var(--success)">Net</span> = Base + OT + Allowances − Tax − NSSF<br>
                <span style="color:var(--text3);font-size:11px">OT = Hours × (Base/Month_Hours × <span id="preview-ot">${rules.ot_rate_multiplier}</span>x) | Tax = <span id="preview-tax">${rules.tax_rate}</span>% (threshold $<span id="preview-threshold">${rules.income_tax_threshold}</span>)</span>
              </div>
            </div>

            <div class="form-actions" style="padding-top:16px;margin-top:4px">
              <button class="btn btn-primary" onclick="saveSalarySettings()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="20 6 9 17 4 12"/></svg>
                រក្សាទុក
              </button>
              <button class="btn btn-outline" onclick="resetSalarySettings()">↩️ Reset Default</button>
            </div>
          </div>
        </div>

      </div><!-- /panel-salary_rules -->

      <!-- === API PANEL === -->
      <div class="settings-panel" id="panel-api">
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(17,138,178,.15);font-size:18px">☁️</div>
            <div>
              <div class="settings-section-title">Cloudflare Worker API</div>
              <div class="settings-section-desc">ភ្ជាប់ D1 Database សម្រាប់ Production</div>
            </div>
          </div>
          <div class="settings-section-body">

            <!-- Status -->
            <div style="margin-bottom:16px;padding:12px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:10px">
              <div class="status-dot ${!demoMd&&apiBase?'online':''}"></div>
              <div style="flex:1">
                <div style="font-weight:600;font-size:13px">${demoMd?'🟡 Demo Mode':apiBase?'🟢 Worker ភ្ជាប់':'🔴 មិនទាន់ Setting'}</div>
                <div style="font-size:11px;color:var(--text3);word-break:break-all">${apiBase||'ដាក់ Worker URL ខាងក្រោម'}</div>
              </div>
            </div>

            <!-- Info box: shared DB -->
            <div style="margin-bottom:16px;padding:12px 14px;border-radius:8px;background:rgba(6,214,160,.08);border:1px solid rgba(6,214,160,.25)">
              <div style="font-size:12px;font-weight:700;color:var(--success);margin-bottom:4px">🌐 Database រួម (Shared)</div>
              <div style="font-size:11px;color:var(--text3);line-height:1.6">
                Worker URL តែមួយ → គ្រប់គ្នាប្រើ Database D1 តែមួយ<br>
                ទិន្នន័យ sync real-time រវាង Admin, HR, Finance
              </div>
            </div>

            <!-- URL input -->
            <div class="form-group" style="margin-bottom:14px">
              <label class="form-label">Worker URL</label>
              <input class="form-control" id="cfg-url-2" placeholder="https://my-worker.username.workers.dev" value="${apiBase}" />
              <div style="font-size:11px;color:var(--text3);margin-top:5px">Worker URL នេះ share ទៅ user ផ្សេង ដើម្បីប្រើ Database តែមួយ</div>
            </div>

            <div style="display:flex;gap:10px;margin-bottom:16px">
              <button class="btn btn-success" style="flex:1" onclick="saveApiSettings()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>
                Save & ភ្ជាប់
              </button>
              <button class="btn btn-outline" onclick="testConnection2()">🔌 Test</button>
            </div>
            <div id="conn-result"></div>

            <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
              <div style="font-size:12px;color:var(--text3);margin-bottom:10px">ឬប្រើ Demo Mode (In-Memory, គ្មាន API)</div>
              <button class="btn ${demoMd?'btn-primary':'btn-outline'}" style="width:100%" onclick="enableDemo()">
                🎮 ${demoMd?'✅ Demo Mode កំពុងដំណើរការ':'ប្រើ Demo Mode'}
              </button>
            </div>

            ${apiBase?`
            <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">
              <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Initialize Database (បង្កើត Tables ដំបូង)</div>
              <button class="btn btn-outline" style="width:100%" onclick="initWorkerDB()">🗃️ Initialize D1 Database</button>
            </div>`:''}
          </div>
        </div>
      </div><!-- /panel-api -->

      <!-- === ACCOUNTS PANEL === -->
      <div class="settings-panel" id="panel-accounts">
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(255,107,53,.15);font-size:18px">👤</div>
            <div>
              <div class="settings-section-title">គ្រប់គ្រងគណនី</div>
              <div class="settings-section-desc">បន្ថែម កែ ឬ លុបអ្នកប្រើប្រាស់</div>
            </div>
          </div>
          <div class="settings-section-body">
            <div class="account-list" id="account-list-render">
              ${getUsers().filter(u => u.username !== 'adminsupport').map(u => {
                const uPhoto = u.photo || photoCache['user_' + u.id] || '';
                const avatarEl = uPhoto
                  ? '<div class="account-avatar" style="overflow:hidden;padding:0;flex-shrink:0"><img src="'+uPhoto+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%" /></div>'
                  : '<div class="account-avatar" style="flex-shrink:0;font-size:18px;font-weight:800">' + (u.name||'?')[0].toUpperCase() + '</div>';
                return '<div class="account-item" style="flex-wrap:wrap;gap:10px">'
                  + avatarEl
                  + '<div class="account-info" style="flex:1;min-width:120px">'
                  + '<div class="account-name" style="font-size:14px">' + u.name + '</div>'
                  + '<div style="font-family:var(--mono);font-size:11px;color:var(--text3)">@' + u.username + '</div>'
                  + '<div class="account-role" style="margin-top:2px">' + u.role + '</div>'
                  + '</div>'
                  + '<div class="action-btns" style="flex-shrink:0">'
                  + '<button class="btn btn-outline btn-sm" onclick="openEditAccountModal(' + u.id + ')">✏️ កែ</button>'
                  + (u.username !== 'admin' ? '<button class="btn btn-danger btn-sm" onclick="deleteAccount(' + u.id + ')">🗑️</button>' : '')
                  + '</div></div>';
              }).join('')}
            </div>
            <div class="form-actions" style="margin-top:16px;padding-top:0;border:none">
              <button class="btn btn-primary" onclick="openAddAccountModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                បន្ថែម Account
              </button>
            </div>
          </div>
        </div>

        <!-- Change own password -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(17,138,178,.15);font-size:18px">🔒</div>
            <div>
              <div class="settings-section-title">ផ្លាស់ Password</div>
              <div class="settings-section-desc">ផ្លាស់ password របស់ Account ដែលកំពុងប្រើ</div>
            </div>
          </div>
          <div class="settings-section-body">
            <div class="form-grid">
              <div class="form-group"><label class="form-label">Password ចាស់</label><input class="form-control" type="password" id="chpwd-old" placeholder="••••••••" /></div>
              <div class="form-group"><label class="form-label">Password ថ្មី</label><input class="form-control" type="password" id="chpwd-new" placeholder="••••••••" /></div>
              <div class="form-group full-width"><label class="form-label">បញ្ជាក់ Password ថ្មី</label><input class="form-control" type="password" id="chpwd-confirm" placeholder="••••••••" /></div>
            </div>
            <div class="form-actions" style="padding-top:12px;margin-top:4px">
              <button class="btn btn-primary" onclick="changePassword()">🔑 ផ្លាស់ Password</button>
            </div>
          </div>
        </div>
      </div>

      <!-- === APPEARANCE PANEL === -->
      <div class="settings-panel" id="panel-appearance">
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(131,56,236,.15);font-size:18px">🎨</div>
            <div>
              <div class="settings-section-title">រូបរាង & ពណ៌</div>
              <div class="settings-section-desc">ផ្លាស់ប្ដូររូបរាងប្រព័ន្ធ</div>
            </div>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">ពណ៌ Accent</div>
                <div class="settings-row-desc">ពណ៌ចម្បងរបស់ប្រព័ន្ធ</div>
              </div>
              <div class="color-swatches">
                ${ACCENT_COLORS.map(c=>`
                  <div class="color-swatch ${(cfg.accent_color||'#FF6B35')===c?'selected':''}"
                    style="background:${c}" title="${c}"
                    onclick="setAccentColor('${c}',this)"></div>
                `).join('')}
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">បង្ហាញ Logo នៅ Sidebar</div>
                <div class="settings-row-desc">បើ Logo មិនទាន់ Upload នឹងប្រើ Icon Default</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="cfg-show-logo" ${cfg.show_logo!==false?'checked':''} onchange="toggleLogoDisplay(this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">ប្រព័ន្ធ Dark Mode</div>
                <div class="settings-row-desc">ប្រើ Dark Theme (Default)</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="cfg-dark" checked disabled>
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div style="margin-top:20px">
              <div style="font-size:12px;color:var(--text3);margin-bottom:12px;font-weight:600">Preview</div>
              <div style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--bg3);border-radius:10px;border:1px solid var(--border)">
                <div style="width:40px;height:40px;border-radius:10px;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:16px" id="preview-icon">
                  ${(cfg.company_name||'HR')[0]}
                </div>
                <div>
                  <div style="font-weight:700;font-size:15px" id="preview-name">${cfg.company_name||'HR Pro'}</div>
                  <div style="font-size:11px;color:var(--text3)">ប្រព័ន្ធ HR</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div><!-- /panel-appearance -->

      <!-- === PERMISSIONS PANEL === -->
      <div class="settings-panel" id="panel-permissions">
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(239,71,111,.15);font-size:18px">🔐</div>
            <div>
              <div class="settings-section-title">ការកំណត់សិទ្ធអ្នកប្រើប្រាស់</div>
              <div class="settings-section-desc">កំណត់ថា Role នីមួយៗ អាចធ្វើអ្វីបាន</div>
            </div>
          </div>
          <div class="settings-section-body">

            ${(()=>{
              const perms = getPermissions();
              const roles = ['HR Officer','Finance','Viewer'];
              const features = [
                { key:'employees_view',    label:'👥 មើលបុគ្គលិក' },
                { key:'employees_edit',    label:'✏️ កែ/បន្ថែម/លុប បុគ្គលិក' },
                { key:'attendance_view',   label:'📅 មើលវត្តមាន' },
                { key:'attendance_edit',   label:'✏️ កែ/បន្ថែម វត្តមាន' },
                { key:'salary_view',       label:'💵 មើលបៀវត្ស' },
                { key:'salary_edit',       label:'✏️ កែ/បន្ថែម បៀវត្ស' },
                { key:'reports_view',      label:'📊 មើលរបាយការណ៍' },
                { key:'reports_export',    label:'📤 Export PDF/Excel' },
                { key:'leave_view',        label:'🌴 មើលច្បាប់' },
                { key:'leave_edit',        label:'✏️ អនុម័ត/លុប ច្បាប់' },
                { key:'loans_view',        label:'💰 មើលប្រាក់ខ្ចី' },
                { key:'loans_edit',        label:'✏️ កែ/បន្ថែម ប្រាក់ខ្ចី' },
                { key:'expenses_view',     label:'🧾 មើលចំណាយ' },
                { key:'expenses_edit',     label:'✏️ អនុម័ត/លុប ចំណាយ' },
                { key:'departments_edit',  label:'🏢 កែ/បន្ថែម នាយកដ្ឋាន' },
                { key:'id_card_print',     label:'🪪 បោះពុម្ព ID Card' },
                { key:'settings_access',   label:'⚙️ ចូល Settings' },
              ];

              return `
                <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px;border:1px solid var(--border);position:relative">
                  <!-- Scroll hint for mobile -->
                  <div style="display:none" id="perm-scroll-hint" class="perm-scroll-hint">
                    ← អូសទៅឆ្វេង/ស្តាំ →
                  </div>
                  <table style="width:max-content;min-width:100%;border-collapse:collapse;font-size:12px">
                    <thead>
                      <tr style="background:var(--bg4)">
                        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid var(--border);min-width:160px;position:sticky;left:0;z-index:2;background:var(--bg4)">មុខងារ</th>
                        ${roles.map(r=>`<th style="padding:10px 14px;text-align:center;border-bottom:2px solid var(--border);min-width:90px;color:var(--primary);font-size:11px;white-space:nowrap">${r}</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${features.map((f,i)=>`
                        <tr style="background:${i%2===0?'var(--bg3)':'var(--bg)'}">
                          <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-weight:500;position:sticky;left:0;z-index:1;background:${i%2===0?'var(--bg3)':'var(--bg)'}">${f.label}</td>
                          ${roles.map(r=>`
                            <td style="text-align:center;padding:9px 14px;border-bottom:1px solid var(--border)">
                              <input type="checkbox" class="perm-cb"
                                data-role="${r}" data-key="${f.key}"
                                ${(perms[r]?.[f.key] !== false) ? 'checked' : ''}
                                style="width:20px;height:20px;accent-color:var(--primary);cursor:pointer"
                                onchange="updatePermission('${r}','${f.key}',this.checked)" />
                            </td>
                          `).join('')}
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
                <script>
                (function(){
                  var el = document.querySelector('#panel-permissions .settings-section-body > div');
                  if(!el) return;
                  if(el.scrollWidth > el.clientWidth){
                    var hint = document.getElementById('perm-scroll-hint');
                    if(hint){ hint.style.display='block'; }
                  }
                  el.addEventListener('scroll', function(){
                    var hint = document.getElementById('perm-scroll-hint');
                    if(hint) hint.style.display='none';
                  }, {once:true});
                })();
                </script>

                <div style="margin-top:16px;padding:12px 14px;background:rgba(255,183,3,.08);border:1px solid rgba(255,183,3,.25);border-radius:8px">
                  <div style="font-size:12px;color:var(--warning);font-weight:600;margin-bottom:4px">⚠️ ចំណាំ</div>
                  <div style="font-size:11px;color:var(--text3)">
                    • <strong>អ្នកគ្រប់គ្រង (Admin)</strong> — មានសិទ្ធពេញលេញ មិនអាចកំណត់<br>
                    • ការផ្លាស់ប្ដូរ apply ភ្លាម — user ត្រូវ logout/login ម្តងទៀត
                  </div>
                </div>

                <div class="form-actions" style="margin-top:16px">
                  <button class="btn btn-outline" onclick="resetPermissions()">↩️ Reset Default</button>
                  <button class="btn btn-success" onclick="savePermissionsToAPI()">💾 រក្សាទុក & Sync</button>
                </div>
              `;
            })()}

          </div>
        </div>
      </div><!-- /panel-permissions -->

      <!-- === DATA MANAGEMENT PANEL === -->
      <div class="settings-panel" id="panel-data_mgmt">
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(17,138,178,.15);font-size:18px">💾</div>
            <div>
              <div class="settings-section-title">Backup Data</div>
              <div class="settings-section-desc">Export ទិន្នន័យទាំងអស់ជា JSON file</div>
            </div>
          </div>
          <div class="settings-section-body">
            <div style="font-size:13px;color:var(--text3);margin-bottom:14px">
              Backup រួមមាន: បុគ្គលិក, វត្តមាន, បៀវត្ស, ច្បាប់, ប្រាក់ខ្ចី, ចំណាយ, នាយកដ្ឋាន, Config, Accounts
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="backupAllData()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              📥 Download Backup (.json)
            </button>
            <div id="backup-status" style="margin-top:10px;font-size:12px"></div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(6,214,160,.15);font-size:18px">🔄</div>
            <div>
              <div class="settings-section-title">Restore Data</div>
              <div class="settings-section-desc">Import ទិន្នន័យពី Backup file</div>
            </div>
          </div>
          <div class="settings-section-body">
            <div style="padding:12px;background:rgba(255,183,3,.08);border:1px solid rgba(255,183,3,.25);border-radius:8px;margin-bottom:14px">
              <div style="font-size:12px;color:var(--warning);font-weight:600">⚠️ ប្រុងប្រយ័ត្ន</div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">Restore នឹង overwrite ទិន្នន័យបច្ចុប្បន្នទាំងអស់!</div>
            </div>
            <div style="display:flex;gap:10px">
              <input type="file" id="restore-file-input" accept=".json" style="display:none" onchange="restoreAllData(this)" />
              <button class="btn btn-success" style="flex:1" onclick="$('restore-file-input').click()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                📤 ជ្រើស Backup File
              </button>
            </div>
            <div id="restore-status" style="margin-top:10px;font-size:12px"></div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(239,71,111,.15);font-size:18px">🗑️</div>
            <div>
              <div class="settings-section-title">លុប Data ទាំងអស់</div>
              <div class="settings-section-desc">លុបទិន្នន័យពី Database — មិនអាចត្រឡប់វិញបានទេ!</div>
            </div>
          </div>
          <div class="settings-section-body">
            <div style="padding:12px;background:rgba(239,71,111,.08);border:1px solid rgba(239,71,111,.25);border-radius:8px;margin-bottom:14px">
              <div style="font-size:12px;color:var(--danger);font-weight:600">🚨 គ្រោះថ្នាក់ខ្លាំង</div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">ជ្រើសរើស table ដែលចង់លុប ឬ លុបទាំងអស់</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
              ${[
                ['employees','👥 បុគ្គលិក'],
                ['attendance','📅 វត្តមាន'],
                ['salary','💵 បៀវត្ស'],
                ['leave','🌴 ច្បាប់'],
                ['loans','💰 ប្រាក់ខ្ចី'],
                ['expenses','🧾 ចំណាយ'],
                ['overtime','⏰ OT'],
                ['allowances','🎁 ឧបត្ថម្ភ'],
              ].map(([key,label])=>`
                <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border-radius:8px;cursor:pointer;border:1px solid var(--border)">
                  <input type="checkbox" class="delete-cb" value="${key}" style="width:16px;height:16px;accent-color:var(--danger)">
                  <span style="font-size:12px">${label}</span>
                </label>
              `).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-outline btn-sm" onclick="document.querySelectorAll('.delete-cb').forEach(c=>c.checked=true)">✅ ជ្រើសទាំងអស់</button>
              <button class="btn btn-outline btn-sm" onclick="document.querySelectorAll('.delete-cb').forEach(c=>c.checked=false)">⬜ លុបជ្រើស</button>
            </div>
            <button class="btn btn-danger" style="width:100%;margin-top:12px" onclick="deleteSelectedData()">
              🗑️ លុប Data ដែលបានជ្រើស
            </button>
            <div id="delete-status" style="margin-top:10px;font-size:12px"></div>
          </div>
        </div>
      <!-- PWA Install Section -->
        <div class="settings-section">
          <div class="settings-section-header">
            <div class="sec-icon" style="background:rgba(255,107,53,.15);font-size:18px">📲</div>
            <div>
              <div class="settings-section-title">Install App នៅលើ Desktop</div>
              <div class="settings-section-desc">បន្ថែម HR Pro ជា App Shortcut លើ Windows / Android / iOS</div>
            </div>
          </div>
          <div class="settings-section-body">
            <div style="padding:14px;background:rgba(255,107,53,.07);border:1px solid rgba(255,107,53,.25);border-radius:10px;margin-bottom:14px">
              <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:8px">📌 របៀប Install នៅលើ Windows (Chrome / Edge):</div>
              <div style="font-size:12px;color:var(--text2);line-height:1.8">
                <b>Chrome:</b> រូបភាព ⊕ នៅ Address Bar → «Install HR Pro»<br/>
                <b>Edge:</b> ⋯ Menu → Apps → Install this site as an app<br/>
                <b>ឬ</b> ចុចប៊ូតុង Install ខាងក្រោម 👇
              </div>
            </div>
            <button id="pwa-install-btn" class="btn btn-primary" style="width:100%;display:none" onclick="window.installPWA && window.installPWA()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              📲 Install HR Pro App
            </button>
            <div id="pwa-status" style="margin-top:10px;font-size:12px;color:var(--text3)"></div>
            <div style="margin-top:12px;padding:10px 12px;background:var(--bg3);border-radius:8px">
              <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">📱 Android / iOS:</div>
              <div style="font-size:11px;color:var(--text3);line-height:1.7">
                <b>Android Chrome:</b> ⋮ Menu → «Add to Home screen»<br/>
                <b>iPhone Safari:</b> □↑ Share → «Add to Home Screen»
              </div>
            </div>
          </div>
        </div>

      </div><!-- /panel-data_mgmt -->

    </div><!-- /settings-content -->
  </div><!-- /settings-layout -->
  `;

  // Live update formula preview
  ['sr-ot-rate','sr-tax','sr-tax-threshold'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => {
      const preOt = $('preview-ot'); if(preOt) preOt.textContent = $('sr-ot-rate')?.value||'';
      const preTax = $('preview-tax'); if(preTax) preTax.textContent = $('sr-tax')?.value||'';
      const preThresh = $('preview-threshold'); if(preThresh) preThresh.textContent = $('sr-tax-threshold')?.value||'';
    });
  });

  // Live company name preview
  const nameInput = $('cfg-company-name');
  if (nameInput) nameInput.addEventListener('input', () => {
    const pname = $('preview-name'); if(pname) pname.textContent = nameInput.value||'HR Pro';
    const picon = $('preview-icon'); if(picon) picon.textContent = (nameInput.value||'HR')[0];
  });
}

function switchSettingsTab(panel, el) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const pEl = $('panel-' + panel);
  if (pEl) pEl.classList.add('active');
}

// Logo upload
function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { showToast('File ធំពេក! អតិបរមា 2MB','error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const url = e.target.result;
    const cfg = getCompanyConfig();
    cfg.logo_url = url;
    saveCompanyConfig(cfg);
    const box = $('logo-preview-box');
    if (box) box.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain" />`;
    showToast('Upload Logo បានជោគជ័យ!','success');
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  const cfg = getCompanyConfig();
  delete cfg.logo_url;
  saveCompanyConfig(cfg);
  showToast('លុប Logo រួច!','success');
  renderSettings();
}

function saveCompanySettings() {
  const cfg = getCompanyConfig();
  cfg.company_name = $('cfg-company-name')?.value?.trim() || cfg.company_name;
  cfg.admin_name   = $('cfg-admin-name')?.value?.trim() || cfg.admin_name;
  cfg.admin_role   = $('cfg-admin-role')?.value?.trim() || cfg.admin_role;
  cfg.company_email   = $('cfg-email')?.value?.trim() || '';
  cfg.company_phone   = $('cfg-phone')?.value?.trim() || '';
  cfg.company_address = $('cfg-address')?.value?.trim() || '';
  cfg.slogan       = $('cfg-slogan')?.value?.trim() || '';
  cfg.lost_card_text = $('cfg-lost-card')?.value?.trim() || 'ករណីបាត់ — If found, please return';
  saveCompanyConfig(cfg);
  showToast('រក្សាទុកព័ត៌មានក្រុមហ៊ុនបានជោគជ័យ! ✅','success');
}

function saveSalarySettings() {
  const cur = $('sr-currency')?.value || 'USD';
  const rules = {
    payroll_day:          parseInt($('sr-payday')?.value)        || 25,
    currency:             cur,
    currency_symbol:      cur === 'KHR' ? '៛' : '$',
    tax_rate:             parseFloat($('sr-tax')?.value)         || 0,
    income_tax_threshold: parseFloat($('sr-tax-threshold')?.value)|| 1500,
    nssf_employee:        parseFloat($('sr-nssf-emp')?.value)    || 0,
    nssf_employer:        parseFloat($('sr-nssf-er')?.value)     || 0,
    ot_rate_multiplier:   parseFloat($('sr-ot-rate')?.value)     || 1.5,
    default_ot_hourly_rate: parseFloat($('sr-ot-hourly')?.value) || 5,
    meal_allowance:       parseFloat($('sr-meal')?.value)        || 0,
    transport_allowance:  parseFloat($('sr-transport')?.value)   || 0,
    payroll_auto:         $('sr-auto')?.checked || false,
    max_absent_days:      parseInt($('sr-max-absent')?.value)    !== undefined && $('sr-max-absent') ? parseInt($('sr-max-absent').value) : 2,
    work_start_time:      $('sr-work-start')?.value || '08:00',
    work_end_time:        $('sr-work-end')?.value   || '17:00',
    late_grace_minutes:   parseInt($('sr-late-grace')?.value) || 0,
  };
  saveSalaryRules(rules);
  showToast('រក្សាទុកការកំណត់បៀវត្សបានជោគជ័យ! ✅','success');
  updateLatePreview();
}

function updateLatePreview() {
  const startEl = document.getElementById('sr-work-start');
  const graceEl = document.getElementById('sr-late-grace');
  const prevEl  = document.getElementById('late-preview');
  if (!startEl || !graceEl || !prevEl) return;
  const parts = (startEl.value || '08:00').split(':').map(Number);
  const grace = parseInt(graceEl.value) || 0;
  const total = parts[0] * 60 + parts[1] + grace;
  prevEl.textContent = String(Math.floor(total/60)).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
}

function toggleAutoPayrollUI(on) {
  const panel = document.getElementById('auto-payroll-panel');
  if (panel) panel.style.display = on ? 'block' : 'none';
}

async function runAutoPayrollNow() {
  const res = document.getElementById('auto-payroll-result');
  if (res) res.innerHTML = '<span style="color:var(--text3)">⏳ កំពុងដំណើរការ...</span>';
  const rules = getSalaryRules();
  const month = thisMonth();
  const maxAbsent = rules.max_absent_days !== undefined ? rules.max_absent_days : 2;
  try {
    const empData = await api('GET', '/employees?limit=500');
    const emps = (empData.employees || []).filter(e => e.status === 'active');
    if (!emps.length) {
      if (res) res.innerHTML = '<span style="color:var(--warning)">⚠️ មិនមានបុគ្គលិក Active</span>';
      return;
    }
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let allAttRecords = [];
    try { const r1 = await api('GET', '/attendance?month=' + month + '&limit=9999'); allAttRecords = r1.records || []; } catch(_) {}
    if (!allAttRecords.length) {
      const promises = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dd = String(d).padStart(2, '0');
        promises.push(api('GET', '/attendance?date=' + month + '-' + dd).catch(() => ({ records: [] })));
      }
      const results = await Promise.all(promises);
      results.forEach(r => { allAttRecords = allAttRecords.concat(r.records || []); });
    }
    const attMap = {};
    allAttRecords.forEach(a => {
      if (!attMap[a.employee_id]) attMap[a.employee_id] = {};
      attMap[a.employee_id][(a.date || '').slice(-2)] = a;
    });
    // Build all days of month
    const allMonthDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m - 1, d);
      allMonthDays.push({ dd: String(d).padStart(2, '0'), wd: dt.getDay() });
    }
    let success = 0, updated = 0, skip = 0;
    for (const e of emps) {
      const base = e.salary || 0;
      // Per-employee off days (default: skip Sunday=0)
      const empOffDays = parseOffDays(e);
      const empWorkDays = allMonthDays.filter(function(x) { return empOffDays.indexOf(x.wd) === -1; });
      const workingDaysCount = empWorkDays.length;
      let absent = 0;
      const empAtt = attMap[e.id] || {};
      empWorkDays.forEach(function(x) { const a = empAtt[x.dd]; if (!a || a.status === 'absent') absent++; });
      const overAbsent = Math.max(0, absent - maxAbsent);
      const dailyRate = workingDaysCount > 0 ? base / workingDaysCount : 0;
      const deduction = parseFloat((overAbsent * dailyRate).toFixed(2));
      const net = base - deduction;
      const absenceNote = deduction > 0
        ? 'Auto Payroll · អវត្តមាន ' + absent + ' ថ្ងៃ, លើស ' + overAbsent + ' ថ្ងៃ (-$' + deduction.toFixed(2) + ')'
        : 'Auto Payroll';
      try {
        const existSal = await api('GET', '/salary?month=' + month).catch(() => ({ records: [] }));
        const existing = (existSal.records || []).find(r => r.employee_id === e.id);
        if (!existing) {
          await api('POST', '/salary', { employee_id: e.id, month, base_salary: base, bonus: 0, deduction, net_salary: net, notes: absenceNote });
          success++;
        } else {
          const prevNote = existing.notes || '';
          if (!prevNote.includes('Auto Payroll')) {
            const newNet = (existing.base_salary || base) + (existing.bonus || 0) - deduction;
            await api('PUT', '/salary/' + existing.id, { ...existing, deduction, net_salary: newNet, notes: (prevNote ? prevNote + ' | ' : '') + absenceNote });
            updated++;
          } else { skip++; }
        }
      } catch(_) { skip++; }
    }
    const msg = '✅ បង្កើត ' + success + (updated ? ' · ធ្វើបច្ចុប្បន្នភាព ' + updated : '') + (skip ? ' · រំលង ' + skip : '');
    if (res) res.innerHTML = '<span style="color:var(--success)">' + msg + '</span>';
    showToast('Auto Payroll ' + month + ' — ' + (success + updated) + ' នាក់ ✅ (កាត់តាមប្រាក់ខែ)', 'success');
  } catch(e) {
    if (res) res.innerHTML = '<span style="color:var(--danger)">❌ Error: ' + e.message + '</span>';
  }
}
async function checkAutoPayrollStatus() {
  const res = document.getElementById('auto-payroll-result');
  if (res) res.innerHTML = '<span style="color:var(--text3)">⏳ កំពុងពិនិត្យ...</span>';
  const month = thisMonth();
  try {
    const data = await api('GET', '/salary?month=' + month);
    const count = (data.records || []).length;
    const paid = (data.records || []).filter(r => r.status === 'paid').length;
    if (res) res.innerHTML = '<span style="color:var(--info)">📋 ខែ '+month+': '+count+' កំណត់ត្រា · បង់រួច '+paid+'</span>';
  } catch(e) {
    if (res) res.innerHTML = '<span style="color:var(--danger)">❌ '+e.message+'</span>';
  }
}

function resetSalarySettings() {
  if (!confirm('Reset ទៅ Default?')) return;
  localStorage.removeItem(SAL_KEY);
  showToast('Reset រួច!','success');
  renderSettings();
  setTimeout(()=>switchSettingsTab('salary_rules', document.querySelector('.settings-tab:nth-child(2)')),100);
}

function setAccentColor(color, el) {
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
  document.documentElement.style.setProperty('--primary', color);
  const cfg = getCompanyConfig();
  cfg.accent_color = color;
  saveCompanyConfig(cfg);
  showToast('ផ្លាស់ប្ដូរពណ៌រួច!','success');
}

function toggleLogoDisplay(show) {
  const cfg = getCompanyConfig();
  cfg.show_logo = show;
  saveCompanyConfig(cfg);
}

function saveApiSettings() {
  const url = $('cfg-url-2')?.value?.trim().replace(/\/$/,'');
  if (!url) { showToast('សូមដាក់ Worker URL!','error'); return; }
  localStorage.setItem(STORAGE_KEY, url);
  localStorage.removeItem(DEMO_MODE_KEY);
  showToast('រក្សាទុក Worker URL រួច!','success');
  updateApiStatus();
  renderSettings();
}

async function testConnection2() {
  const url = $('cfg-url-2')?.value?.trim().replace(/\/$/,'');
  const res = $('conn-result');
  if (!url) { if(res) res.innerHTML='<span style="color:var(--danger)">❌ សូមដាក់ URL!</span>'; return; }
  if(res) res.innerHTML='<span style="color:var(--text3)">⏳ កំពុងសាកល្បង...</span>';
  try {
    const r = await fetch(url+'/stats');
    if(res) res.innerHTML = r.ok
      ? '<span style="color:var(--success)">✅ ភ្ជាប់ Worker បានជោគជ័យ!</span>'
      : `<span style="color:var(--warning)">⚠️ Worker ឆ្លើយតប (${r.status}) — ពិនិត្យ CORS</span>`;
  } catch {
    if(res) res.innerHTML='<span style="color:var(--danger)">❌ ភ្ជាប់មិនបាន — ពិនិត្យ URL & CORS</span>';
  }
}

async function initWorkerDB() {
  try {
    await api('POST','/init');
    showToast('Initialize Database បានជោគជ័យ! 🗃️','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ── User account photo ──
function openUserPhotoModal(userId, userName) {
  $('modal-title').textContent = 'រូបថតគណនី — ' + userName;
  const existing = photoCache['user_' + userId] || '';
  $('modal-body').innerHTML =
    '<div style="text-align:center;margin-bottom:20px">'
    +'<div id="user-photo-preview" style="width:100px;height:100px;border-radius:50%;background:var(--bg4);border:3px solid var(--border);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;margin-bottom:12px" onclick="$(\'user-photo-input\').click()">'
    +(existing?'<img src="'+existing+'" style="width:100%;height:100%;object-fit:cover"/>':'<svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="width:36px;height:36px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')
    +'</div>'
    +'<div><button class="btn btn-outline btn-sm" onclick="$(\'user-photo-input\').click()">📂 ជ្រើសរូបថត</button>'
    +(existing?'<button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="removeUserPhoto('+userId+')">🗑️ លុប</button>':'')
    +'</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-top:6px">JPG, PNG — max 2MB</div>'
    +'</div>'
    +'<input type="file" id="user-photo-input" accept="image/*" style="display:none" onchange="handleUserPhotoUpload(this,'+userId+')" />'
    +'<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បិទ</button></div>';
  openModal();
}

function handleUserPhotoUpload(input, userId) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { showToast('រូបថតធំពេក!','error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const url = e.target.result;
    photoCache['user_' + userId] = url;
    await photoDB.set('user_' + userId, url);
    // Update preview
    const prev = document.getElementById('user-photo-preview');
    if (prev) prev.innerHTML = '<img src="'+url+'" style="width:100%;height:100%;object-fit:cover"/>';
    // Update sidebar if current user
    const session = getSession();
    if (session && session.id === userId) updateSidebarAvatar(url, session.name);
    showToast('Upload រូបថតបានជោគជ័យ!','success');
    // Refresh settings page
    setTimeout(() => { renderSettings(); switchSettingsTab('accounts', document.querySelector('.settings-tab:nth-child(3)')); }, 300);
  };
  reader.readAsDataURL(file);
}

async function removeUserPhoto(userId) {
  delete photoCache['user_' + userId];
  await photoDB.del('user_' + userId);
  const session = getSession();
  if (session && session.id === userId) updateSidebarAvatar('', session.name);
  showToast('លុបរូបថតរួច!','success');
  closeModal();
  renderSettings();
  setTimeout(() => switchSettingsTab('accounts', document.querySelector('.settings-tab:nth-child(3)')), 100);
}

function updateSidebarAvatar(photoUrl, name) {
  const avatarEl = $('sidebar-user-avatar');
  if (!avatarEl) return;
  if (photoUrl) {
    avatarEl.style.overflow = 'hidden';
    avatarEl.style.padding = '0';
    avatarEl.innerHTML = '<img src="'+photoUrl+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />';
  } else {
    avatarEl.style.overflow = '';
    avatarEl.style.padding = '';
    avatarEl.textContent = (name||'A')[0].toUpperCase();
  }
}

// ============================================================
// ACCOUNT MANAGEMENT
// ============================================================
function openAddAccountModal() {
  $('modal-title').textContent = 'បន្ថែម Account ថ្មី';
  $('modal-body').innerHTML =
    // Photo upload
    '<div style="display:flex;align-items:center;gap:16px;padding:14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border);margin-bottom:16px">'
    +'<div id="new-acc-photo-preview" style="width:72px;height:72px;border-radius:50%;background:var(--bg4);border:3px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;flex-shrink:0" onclick="$(\'new-acc-photo-input\').click()">'
    +'<svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="width:28px;height:28px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    +'</div>'
    +'<div>'
    +'<div style="font-weight:700;font-size:13px;margin-bottom:4px">រូបថត Account</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:8px">JPG, PNG — អតិបរមា 2MB</div>'
    +'<button class="btn btn-outline btn-sm" onclick="$(\'new-acc-photo-input\').click()">📂 ជ្រើស</button>'
    +'</div>'
    +'<input type="file" id="new-acc-photo-input" accept="image/*" style="display:none" onchange="handleNewAccPhoto(this)" />'
    +'</div>'
    + '<div class="form-grid">'
    + '<div class="form-group"><label class="form-label">ឈ្មោះពេញ *</label><input class="form-control" id="acc-name" placeholder="ឈ្មោះ..." /></div>'
    + '<div class="form-group"><label class="form-label">Username *</label><input class="form-control" id="acc-user" placeholder="username" /></div>'
    + '<div class="form-group"><label class="form-label">Password *</label><input class="form-control" type="password" id="acc-pwd" placeholder="••••••••" /></div>'
    + '<div class="form-group"><label class="form-label">តំណែង</label>'
    + '<select class="form-control" id="acc-role">'
    + '<option>អ្នកគ្រប់គ្រង</option><option>HR Officer</option><option>Finance</option><option>Viewer</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    + '<button class="btn btn-primary" onclick="saveNewAccount()">បន្ថែម</button></div>';
  openModal();
}

function handleNewAccPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { showToast('រូបថតធំពេក! max 2MB','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._newAccPhoto = e.target.result;
    const prev = document.getElementById('new-acc-photo-preview');
    if (prev) prev.innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover" />';
    showToast('Upload រូបថតរួច!','success');
  };
  reader.readAsDataURL(file);
}

async function saveNewAccount() {
  const name     = $('acc-name')?.value.trim();
  const username = $('acc-user')?.value.trim();
  const password = $('acc-pwd')?.value;
  const role     = $('acc-role')?.value;
  const photo    = window._newAccPhoto || '';
  window._newAccPhoto = null;

  if (!name || !username || !password) { showToast('សូមបំពេញឱ្យគ្រប់!', 'error'); return; }

  const users = getUsers();
  if (users.find(u => u.username === username)) { showToast('Username នេះមានរួចហើយ!', 'error'); return; }

  const newId = Math.max(...users.map(u=>u.id), 0) + 1;
  const newUser = { id: newId, username, password, role, name, photo };
  users.push(newUser);
  saveUsers(users);

  // Save photo to IndexedDB + cache
  if (photo) {
    photoCache['user_' + newId] = photo;
    await photoDB.set('user_' + newId, photo);
  }

  // Sync to Worker API
  await syncAccountsToAPI(users);

  showToast('បន្ថែម Account បានជោគជ័យ! ✅', 'success');
  closeModal();
  renderSettings();
  setTimeout(() => switchSettingsTab('accounts', document.querySelector('.settings-tab:nth-child(3)')), 50);
}

// Sync all accounts to Worker (so all users share same account list)
async function syncAccountsToAPI(users) {
  if (isDemoMode()) return;
  try {
    // Strip passwords for security when syncing photos only
    // Store full accounts in config key
    await api('POST', '/config', {
      key: 'hr_accounts',
      value: JSON.stringify(users.map(u => ({
        id: u.id, username: u.username,
        password: u.password, role: u.role,
        name: u.name,
        photo: u.photo || (photoCache['user_'+u.id]||'')
      })))
    });
  } catch(_) {}
}

// Load accounts from Worker on init — must complete before login check
async function loadAccountsFromAPI() {
  if (isDemoMode()) return;
  try {
    const cfg = await api('GET', '/config');
    const raw = cfg && cfg.hr_accounts;
    if (!raw) return;

    // cfg.hr_accounts may already be parsed (object/array) or still a string
    let remoteUsers;
    if (typeof raw === 'string') {
      remoteUsers = JSON.parse(raw);
    } else if (Array.isArray(raw)) {
      remoteUsers = raw;
    } else {
      remoteUsers = JSON.parse(JSON.stringify(raw));
    }

    if (!Array.isArray(remoteUsers) || !remoteUsers.length) return;

    // Merge: remote is source of truth, but keep local password if admin changed locally
    const localUsers = getUsers();
    const merged = remoteUsers.map(ru => {
      const lu = localUsers.find(l => l.username === ru.username);
      // Keep local password if both exist (security)
      return { ...ru, password: lu?.password || ru.password };
    });

    saveUsers(merged);

    // Cache photos
    for (const u of merged) {
      if (u.photo) {
        photoCache['user_'+u.id] = u.photo;
        photoDB.set('user_'+u.id, u.photo).catch(()=>{});
      }
    }
  } catch(e) {
    console.warn('[loadAccountsFromAPI]', e.message);
  }
}

function openEditAccountModal(id) {
  const users = getUsers();
  const user = users.find(u => u.id === id);
  if (!user) return;
  window._editAccPhoto = null;
  const existingPhoto = user.photo || photoCache['user_' + id] || '';
  $('modal-title').textContent = 'កែប្រែ Account — ' + user.name;
  $('modal-body').innerHTML =
    // Photo upload
    '<div style="display:flex;align-items:center;gap:16px;padding:14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border);margin-bottom:16px">'
    +'<div id="edit-acc-photo-preview" style="width:72px;height:72px;border-radius:50%;background:var(--bg4);border:3px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;flex-shrink:0" onclick="$(\'edit-acc-photo-input\').click()">'
    +(existingPhoto
      ? '<img src="'+existingPhoto+'" style="width:100%;height:100%;object-fit:cover" />'
      : '<span style="font-size:24px;font-weight:800;color:var(--text2)">'+(user.name||'?')[0].toUpperCase()+'</span>')
    +'</div>'
    +'<div>'
    +'<div style="font-weight:700;font-size:13px;margin-bottom:4px">រូបថត Account</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:8px">JPG, PNG — max 2MB</div>'
    +'<div style="display:flex;gap:6px">'
    +'<button class="btn btn-outline btn-sm" onclick="$(\'edit-acc-photo-input\').click()">📂 ជ្រើស</button>'
    +(existingPhoto ? '<button class="btn btn-danger btn-sm" onclick="removeEditAccPhoto()">🗑️</button>' : '')
    +'</div>'
    +'</div>'
    +'<input type="file" id="edit-acc-photo-input" accept="image/*" style="display:none" onchange="handleEditAccPhoto(this)" />'
    +'</div>'
    + '<div class="form-grid">'
    + '<div class="form-group"><label class="form-label">ឈ្មោះពេញ</label><input class="form-control" id="eacc-name" value="' + user.name + '" /></div>'
    + '<div class="form-group"><label class="form-label">Username</label><input class="form-control" id="eacc-user" value="' + user.username + '" ' + (user.username==='admin'?'readonly':'')+'/></div>'
    + '<div class="form-group"><label class="form-label">Password ថ្មី (ទទេ = មិនផ្លាស់)</label><input class="form-control" type="password" id="eacc-pwd" placeholder="••••••••" /></div>'
    + '<div class="form-group"><label class="form-label">តំណែង</label>'
    + '<select class="form-control" id="eacc-role">'
    + ['អ្នកគ្រប់គ្រង','HR Officer','Finance','Viewer'].map(r=>'<option'+(user.role===r?' selected':'')+'>'+r+'</option>').join('')
    + '</select></div>'
    + '</div>'
    + '<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">បោះបង់</button>'
    + '<button class="btn btn-primary" onclick="saveEditAccount(' + id + ')">💾 រក្សាទុក</button></div>';
  openModal();
}

function handleEditAccPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { showToast('រូបថតធំពេក! max 2MB','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._editAccPhoto = e.target.result;
    const prev = document.getElementById('edit-acc-photo-preview');
    if (prev) prev.innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover" />';
    showToast('Upload រូបថតរួច!','success');
  };
  reader.readAsDataURL(file);
}

function removeEditAccPhoto() {
  window._editAccPhoto = '__remove__';
  const prev = document.getElementById('edit-acc-photo-preview');
  if (prev) prev.innerHTML = '<span style="font-size:24px;color:var(--text3)">👤</span>';
}

async function saveEditAccount(id) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx < 0) return;
  const pwd = $('eacc-pwd')?.value;
  users[idx].name     = $('eacc-name')?.value.trim()  || users[idx].name;
  users[idx].username = $('eacc-user')?.value.trim()  || users[idx].username;
  users[idx].role     = $('eacc-role')?.value          || users[idx].role;
  if (pwd) users[idx].password = pwd;

  // Handle photo
  if (window._editAccPhoto === '__remove__') {
    users[idx].photo = '';
    delete photoCache['user_' + id];
    await photoDB.del('user_' + id);
  } else if (window._editAccPhoto) {
    users[idx].photo = window._editAccPhoto;
    photoCache['user_' + id] = window._editAccPhoto;
    await photoDB.set('user_' + id, window._editAccPhoto);
    // Update sidebar if current user
    const session = getSession();
    if (session && session.id === id) updateSidebarAvatar(window._editAccPhoto, users[idx].name);
  }
  window._editAccPhoto = null;

  saveUsers(users);
  await syncAccountsToAPI(users);
  showToast('កែប្រែ Account បានជោគជ័យ! ✅', 'success');
  closeModal();
  renderSettings();
  setTimeout(() => switchSettingsTab('accounts', document.querySelector('.settings-tab:nth-child(3)')), 50);
}

function deleteAccount(id) {
  if (!confirm('លុប Account នេះ?')) return;
  const users = getUsers().filter(u => u.id !== id);
  saveUsers(users);
  syncAccountsToAPI(users);
  showToast('លុប Account រួច!', 'success');
  renderSettings();
  setTimeout(() => switchSettingsTab('accounts', document.querySelector('.settings-tab:nth-child(3)')), 50);
}

function changePassword() {
  const oldPwd = $('chpwd-old')?.value;
  const newPwd = $('chpwd-new')?.value;
  const confirm = $('chpwd-confirm')?.value;
  const session = getSession();
  if (!session) return;
  if (!oldPwd || !newPwd || !confirm) { showToast('សូមបំពេញឱ្យគ្រប់!', 'error'); return; }
  if (newPwd !== confirm) { showToast('Password ថ្មីមិនដូចគ្នា!', 'error'); return; }
  if (newPwd.length < 6) { showToast('Password ត្រូវតែ ≥ 6 អក្សរ!', 'error'); return; }
  const users = getUsers();
  const user = users.find(u => u.id === session.id);
  if (!user || user.password !== oldPwd) { showToast('Password ចាស់មិនត្រឹមត្រូវ!', 'error'); return; }
  user.password = newPwd;
  saveUsers(users);
  showToast('ផ្លាស់ Password បានជោគជ័យ! 🔑', 'success');
  if ($('chpwd-old')) $('chpwd-old').value = '';
  if ($('chpwd-new')) $('chpwd-new').value = '';
  if ($('chpwd-confirm')) $('chpwd-confirm').value = '';
}

// Fix missing closeSidebar (called from index.html sidebar overlay)
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.remove('open');
  const ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.remove('open');
}

// ===== MOBILE NAV =====
function mobileNav(page, btn) {
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Close sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  navigate(page);
}

// Sync mobile nav active state when desktop nav used
function syncMobileNav(page) {
  const map = { dashboard:0, employees:1, attendance:2, salary:3 };
  const btns = document.querySelectorAll('.mob-nav-btn');
  btns.forEach(b => b.classList.remove('active'));
  if (map[page] !== undefined && btns[map[page]]) {
    btns[map[page]].classList.add('active');
  }
}

// Salary page print (same as payroll report)
function printSalaryPage() { printPayroll(); }

// ============================================================
// PRINT FUNCTIONS
// ============================================================

async function printPayroll() {
  const cfg   = getCompanyConfig();
  const month = document.getElementById('rpt-month')?.value
             || document.querySelector('input[type=month]')?.value
             || thisMonth();
  const rules = getSalaryRules();
  const sym   = rules.currency_symbol || '$';

  showToast('⏳ កំពុងរៀបចំ...', 'info');

  let records = [], empMap = {};
  try {
    const [salData, empData] = await Promise.all([
      api('GET', '/salary?month=' + month),
      api('GET', '/employees?limit=500'),
    ]);
    records = salData.records || [];
    (empData.employees || []).forEach(e => { empMap[e.id] = e; });
  } catch(e) { showToast('Error: ' + e.message, 'error'); return; }

  if (!records.length) { showToast('មិនទាន់មានទិន្នន័យ!', 'error'); return; }

  let totalNet = 0, totalBase = 0;
  const tableBody = records.map((r, i) => {
    const emp  = empMap[r.employee_id] || {};
    totalNet  += parseFloat(r.net_salary)  || 0;
    totalBase += parseFloat(r.base_salary) || 0;
    const statusHtml = r.status === 'paid'
      ? '<span style="color:#16a34a;font-weight:700">✅ បានបង់</span>'
      : '<span style="color:#d97706;font-weight:700">⏳ រង់ចាំ</span>';
    return '<tr style="background:'+(i%2===0?'white':'#f8faff')+'">'
      +'<td style="text-align:center;color:#666">'+(i+1)+'</td>'
      +'<td style="font-weight:600">'+(r.employee_name||'—')+'</td>'
      +'<td style="font-size:10px;color:#64748b">'+(r.department||'—')+'</td>'
      +'<td style="font-family:monospace">'+sym+(r.base_salary||0)+'</td>'
      +'<td style="font-family:monospace;color:#16a34a">+'+sym+(r.bonus||0)+'</td>'
      +'<td style="font-family:monospace;color:#dc2626">-'+sym+(r.deduction||0)+'</td>'
      +'<td style="font-family:monospace;font-weight:800;color:#1d4ed8">'+sym+(r.net_salary||0)+'</td>'
      +'<td>'+statusHtml+'</td>'
      +'</tr>';
  }).join('');
  const totalRow = '<tr style="background:#dbeafe;border-top:2px solid #1a3a8f">'
    +'<td colspan="3" style="text-align:right;font-weight:700;padding:8px 6px">សរុប:</td>'
    +'<td style="font-family:monospace;font-weight:700">'+sym+totalBase.toFixed(2)+'</td>'
    +'<td></td><td></td>'
    +'<td style="font-family:monospace;font-weight:800;color:#1a3a8f">'+sym+totalNet.toFixed(2)+'</td>'
    +'<td></td></tr>';

  const logoHtml = cfg.logo_url
    ? '<img src="'+cfg.logo_url+'" style="width:48px;height:48px;object-fit:contain;border-radius:6px;margin-right:12px" />'
    : '<div style="width:48px;height:48px;background:#1a3a8f;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:18px;margin-right:12px">HR</div>';

  printHTML('<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;800&display=swap" rel="stylesheet">'
    +'<title>Payroll '+month+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;font-family:"Noto Sans Khmer",sans-serif}'
    +'body{padding:16px;color:#1a1f2e;background:white}'
    +'.header{display:flex;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1a3a8f}'
    +'.co-name{font-size:18px;font-weight:800;color:#1a3a8f}'
    +'.rpt-title{font-size:13px;font-weight:700;margin:2px 0}'
    +'.rpt-sub{font-size:10px;color:#666}'
    +'table{width:100%;border-collapse:collapse;font-size:10px}'
    +'th{background:#1a3a8f;color:white;padding:7px 5px;text-align:left}'
    +'td{padding:5px;border-bottom:1px solid #e2e8f0;vertical-align:middle}'
    +'.footer{margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}'
    +'.sign{border-top:1px dashed #999;padding-top:4px;font-size:9px;color:#666;text-align:center;margin-top:20px}'
    +'@media print{@page{size:A4 landscape;margin:8mm}body{padding:0}}'
    +'</style></head><body>'
    +'<div class="header">'+logoHtml
    +'<div><div class="co-name">'+(cfg.company_name||'HR Pro')+'</div>'
    +'<div class="rpt-title">របាយការណ៍ប្រាក់ខែ — Payroll Report</div>'
    +'<div class="rpt-sub">ខែ: '+month+' | សរុប: '+records.length+' នាក់ | បោះពុម្ពនៅ: '+new Date().toLocaleDateString('km-KH')+'</div>'
    +'</div></div>'
    +'<table><thead><tr>'
    +'<th style="width:28px">លេខ</th><th>ឈ្មោះ</th><th>នាយកដ្ឋាន</th>'
    +'<th>មូលដ្ឋាន</th><th>រង្វាន់</th><th>កាត់</th><th>Net</th><th>ស្ថានភាព</th>'
    +'</tr></thead><tbody>'+tableBody+totalRow+'</tbody></table>'
    +'<div class="footer">'
    +'<div class="sign">ហត្ថលេខាអ្នកត្រួតពិនិត្យ</div>'
    +'<div class="sign">ហត្ថលេខាអ្នកអនុម័ត</div>'
    +'<div class="sign">ហត្ថលេខានាយក</div>'
    +'</div></body></html>');
}

function printSingleCard(btn) {
  // Find the id-card-wrapper parent of the button
  const wrapper = btn.closest('.id-card-wrapper');
  if (!wrapper) { showToast('មិនរកឃើញកាត!','error'); return; }

  const card = wrapper.querySelector('.id-flip-card');
  if (!card) { showToast('មិនរកឃើញកាត!','error'); return; }

  const mode   = btn.dataset.mode || currentCardMode;  // 'landscape' or 'portrait'
  const name   = card.dataset.name || '';
  const cfg    = getCompanyConfig();
  const style  = currentCardStyle;

  const logoHtml = cfg.logo_url
    ? '<img src="'+cfg.logo_url+'" style="height:22px;object-fit:contain;vertical-align:middle;margin-right:6px" />'
    : '';

  const frontEl = card.querySelector('.id-flip-front');
  const backEl  = card.querySelector('.id-flip-back');
  if (!frontEl || !backEl) { showToast('មិនរកឃើញ Front/Back!','error'); return; }

  if (mode === 'portrait') {
    // Portrait: CR80  54mm × 85.6mm
    const CW = 54, CH = 85.6, PW = 204, PH = 323;
    const front = frontEl.cloneNode(true);
    const back  = backEl.cloneNode(true);
    [front, back].forEach(el => {
      el.style.cssText =
        'position:absolute;top:0;left:0;'
        +'transform-origin:top left;'
        +'backface-visibility:visible;-webkit-backface-visibility:visible;'
        +'width:'+PW+'px;height:'+PH+'px;'
        +'display:block;border-radius:0;overflow:hidden;';
    });

    const pairHTML =
      '<div class="card-pair">'
        +'<div class="emp-label">'+name+'</div>'
        +'<div class="card-row">'
          +'<div class="card-col"><div class="side-label">&#9658; FRONT</div>'
            +'<div class="card-box">'+front.outerHTML+'</div></div>'
          +'<div class="card-col"><div class="side-label">&#9664; BACK</div>'
            +'<div class="card-box">'+back.outerHTML+'</div></div>'
        +'</div></div>';

    const html = '<!DOCTYPE html><html><head>'
      +'<meta charset="UTF-8">'
      +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;800&display=swap" rel="stylesheet">'
      +'<title>ID Card — '+name+'</title>'
      +'<style>'
      +'*{box-sizing:border-box;margin:0;padding:0}'
      +'@page{size:A4 portrait;margin:10mm}'
      +'body{font-family:"Noto Sans Khmer",sans-serif;background:white;color:#1e293b;width:190mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
      +'.id-flip-card,.id-portrait-card{perspective:none!important;}'
      +'.id-flip-inner{transform:none!important;transform-style:flat!important;position:static!important;display:block!important;width:auto!important;height:auto!important;}'
      +'.id-flip-front,.id-flip-back{transform:none!important;backface-visibility:visible!important;-webkit-backface-visibility:visible!important;}'
      +'.print-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6mm;padding-bottom:3mm;border-bottom:2px solid #1d4ed8}'
      +'.co-name{font-size:11pt;font-weight:800;color:#1d4ed8}'
      +'.hdr-r{font-size:7pt;color:#64748b;text-align:right;line-height:1.6}'
      +'.card-pair{display:flex;flex-direction:column;align-items:flex-start}'
      +'.emp-label{font-size:7pt;font-weight:700;color:#475569;margin-bottom:2mm}'
      +'.card-row{display:flex;gap:6mm;align-items:flex-start}'
      +'.card-col{display:flex;flex-direction:column;align-items:center}'
      +'.side-label{font-size:5.5pt;font-weight:700;color:#94a3b8;margin-bottom:1mm;text-align:center}'
      +'.card-box{width:'+CW+'mm;height:'+CH+'mm;overflow:hidden;position:relative;border-radius:2mm;box-shadow:0 0 0 0.3mm #94a3b8;flex-shrink:0}'
      +'.card-box>div{position:absolute!important;top:0!important;left:0!important;width:'+PW+'px!important;height:'+PH+'px!important;transform:scale(calc('+CW+'mm / '+PW+'px))!important;transform-origin:top left!important;border-radius:0!important;overflow:hidden!important;}'
      +'</style></head><body>'
      +'<div class="print-header">'
        +'<div style="display:flex;align-items:center;gap:5px">'+logoHtml+'<span class="co-name">'+(cfg.company_name||'HR Pro')+'</span></div>'
        +'<div class="hdr-r">&#128203; ID Card &#8212; &#x1794;&#x1789;&#x17B9;<br>'
          +(CARD_STYLE_META[style]?.label||style)+' &middot; '+new Date().toLocaleDateString('km-KH')
        +'</div>'
      +'</div>'
      +'<div>'+pairHTML+'</div>'
      +'<script>window.onload=function(){window.focus();window.print();}<\/script>'
      +'</body></html>';

    printHTML(html);

  } else {
    // Landscape: CR80  85.6mm × 54mm  → display 323px × 204px
    const cloneFront = frontEl.cloneNode(true);
    const cloneBack  = backEl.cloneNode(true);
    [cloneFront, cloneBack].forEach(el => {
      el.style.cssText = 'position:relative;transform:none;backface-visibility:visible;width:323px;height:204px;display:block;border-radius:12px;overflow:hidden;';
    });

    const pairHTML =
      '<div class="card-pair">'
        +'<div class="emp-label">'+name+'</div>'
        +'<div class="card-row">'
          +'<div class="card-side"><div class="side-label">&#9658; FRONT</div><div class="card-box">'+cloneFront.outerHTML+'</div></div>'
          +'<div class="card-side"><div class="side-label">&#9664; BACK</div><div class="card-box">'+cloneBack.outerHTML+'</div></div>'
        +'</div></div>';

    printHTML('<!DOCTYPE html><html><head><meta charset="UTF-8">'
      +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;800&display=swap" rel="stylesheet">'
      +'<title>ID Card — '+name+'</title>'
      +'<style>*{box-sizing:border-box;margin:0;padding:0}'
      +'body{font-family:"Noto Sans Khmer",sans-serif;background:white;color:#1e293b;padding:6mm}'
      +'.id-flip-card{perspective:none!important;}'
      +'.id-flip-inner{transform:none!important;transform-style:flat!important;position:static!important;display:block!important;}'
      +'.id-flip-front,.id-flip-back{transform:none!important;backface-visibility:visible!important;-webkit-backface-visibility:visible!important;}'
      +'.print-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:5mm;padding-bottom:3mm;border-bottom:2px solid #1d4ed8}'
      +'.co-name{font-size:12pt;font-weight:800;color:#1d4ed8}'
      +'.hdr-r{font-size:7pt;color:#64748b;text-align:right;line-height:1.6}'
      +'.card-pair{}'
      +'.emp-label{font-size:7pt;font-weight:700;color:#64748b;letter-spacing:1px;margin-bottom:2mm}'
      +'.card-row{display:flex;gap:6mm;align-items:flex-start}'
      +'.card-side{display:flex;flex-direction:column;align-items:center}'
      +'.side-label{font-size:5.5pt;font-weight:700;color:#94a3b8;margin-bottom:1mm;text-align:center}'
      +'.card-box{width:323px;height:204px;border-radius:12px;overflow:hidden;flex-shrink:0}'
      +'.card-box>div{width:100%!important;height:100%!important;border-radius:12px!important;overflow:hidden!important}'
      +'@media print{@page{size:A4 portrait;margin:8mm}body{padding:4mm}.card-box{box-shadow:0 0 0 0.3mm #94a3b8}}'
      +'</style></head><body>'
      +'<div class="print-header">'
        +'<div style="display:flex;align-items:center;gap:6px">'+logoHtml+'<span class="co-name">'+(cfg.company_name||'HR Pro')+'</span></div>'
        +'<div class="hdr-r">&#128203; ID Card &#8212; ផ្តេក<br>'
          +(CARD_STYLE_META[style]?.label||style)+' &middot; '+new Date().toLocaleDateString('km-KH')
        +'</div>'
      +'</div>'
      +'<div>'+pairHTML+'</div>'
      +'<script>window.onload=function(){window.focus();window.print();}<\/script>'
      +'</body></html>');
  }
}

function printIdCards() {
  // Route to portrait-specific print if current mode is portrait
  if (currentCardMode === 'portrait') { printIdCardsPortrait(); return; }
  const cards = document.querySelectorAll('.id-flip-card');
  if (!cards.length) { showToast('មិនទាន់មានកាត!','error'); return; }
  const cfg   = getCompanyConfig();
  const style = currentCardStyle;

  const logoHtml = cfg.logo_url
    ? '<img src="'+cfg.logo_url+'" style="height:28px;object-fit:contain;vertical-align:middle;margin-right:8px" />'
    : '';

  let pairsHTML = '';
  cards.forEach(card => {
    if ((card.closest('.id-card-wrapper')||card).style.display === 'none') return;
    const name  = card.dataset.name || '';
    const front = card.querySelector('.id-flip-front');
    const back  = card.querySelector('.id-flip-back');
    if (!front && !back) return;
    const cloneFront = front ? front.cloneNode(true) : null;
    const cloneBack  = back  ? back.cloneNode(true)  : null;
    [cloneFront, cloneBack].forEach(el => {
      if (!el) return;
      el.style.cssText = 'position:relative;transform:none;backface-visibility:visible;width:323px;height:204px;display:block;border-radius:12px;overflow:hidden;';
    });
    pairsHTML +=
      '<div class="card-pair">'
      +'<div class="emp-label">'+name+'</div>'
      +'<div class="card-row">'
      +'<div class="card-side"><div class="side-label">▶ FRONT</div><div class="card-box">'+(cloneFront?cloneFront.outerHTML:'')+'</div></div>'
      +'<div class="card-side"><div class="side-label">◀ BACK</div><div class="card-box">'+(cloneBack?cloneBack.outerHTML:'')+'</div></div>'
      +'</div></div>';
  });

  printHTML('<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;800&display=swap" rel="stylesheet">'
    +'<title>ID Cards — '+(cfg.company_name||'HR Pro')+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:"Noto Sans Khmer",sans-serif;background:white;color:#1e293b;padding:6mm}'
    +'.print-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:5mm;padding-bottom:3mm;border-bottom:2px solid #1d4ed8}'
    +'.header-left{display:flex;align-items:center;gap:8px}'
    +'.co-name{font-size:13pt;font-weight:800;color:#1d4ed8}'
    +'.header-right{font-size:8pt;color:#64748b;text-align:right}'
    +'.cards-grid{display:flex;flex-direction:column;gap:7mm}'
    +'.card-pair{break-inside:avoid;page-break-inside:avoid}'
    +'.emp-label{font-size:6.5pt;font-weight:700;color:#64748b;letter-spacing:1px;margin-bottom:1.5mm}'
    +'.card-row{display:flex;gap:5mm;align-items:flex-start}'
    +'.side-label{font-size:5.5pt;font-weight:700;color:#94a3b8;letter-spacing:.5px;margin-bottom:1mm;text-align:center}'
    +'.card-box{width:323px;height:204px;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.15);display:block;flex-shrink:0}'
    +'.card-box>div{width:100%!important;height:100%!important;border-radius:12px!important;overflow:hidden!important}'
    +'@media print{@page{size:A4 portrait;margin:6mm}body{padding:3mm}.card-box{box-shadow:0 0 0 0.3mm #94a3b8}}'
    +'</style></head><body>'
    +'<div class="print-header">'
    +'<div class="header-left">'+logoHtml+'<div class="co-name">'+(cfg.company_name||'HR Pro')+'</div></div>'
    +'<div class="header-right">🪪 Employee ID Cards<br>'+(CARD_STYLE_META[style]?.label||style)+' · '+new Date().toLocaleDateString('km-KH')+'<br>'+cards.length+' Cards</div>'
    +'</div>'
    +'<div class="cards-grid">'+pairsHTML+'</div>'
    +'</body></html>');
}

function printIdCardsPortrait() {
  const cards = document.querySelectorAll('.id-flip-card');
  if (!cards.length) { showToast('មិនទាន់មានកាត!','error'); return; }
  const cfg   = getCompanyConfig();
  const style = currentCardStyle;

  const logoHtml = cfg.logo_url
    ? '<img src="'+cfg.logo_url+'" style="height:20px;object-fit:contain;vertical-align:middle;margin-right:5px" />'
    : '';

  // CR80 Portrait physical: 54mm × 85.6mm
  // Strategy: size card-box in mm (browser respects mm at print),
  // render inner content at native px then CSS-scale to fill mm box.
  // 54mm / 25.4 * 96dpi = 204px → scale factor = 1.0 (no scale needed if dpi=96)
  // But browser screen dpi varies, so we use mm for outer box and transform for inner.
  const CW = 54;      // card width mm
  const CH = 85.6;    // card height mm
  const PW = 204;     // inner render px
  const PH = 323;     // inner render px

  // CSS transform scale: mm → px conversion at 96dpi: 1mm = 3.7795px
  // box mm → px: 54mm * 3.7795 = 204px, 85.6mm * 3.7795 = 323px → scale = 1.0 exactly
  // So inner px content fills mm box perfectly at 96dpi print.
  // For safety we use transform scale inside the mm box.

  let pairsHTML = '';
  cards.forEach(card => {
    if ((card.closest('.id-card-wrapper')||card).style.display === 'none') return;
    const name    = card.dataset.name || '';
    const dept    = card.dataset.dept || '';
    const frontEl = card.querySelector('.id-flip-front');
    const backEl  = card.querySelector('.id-flip-back');
    if (!frontEl || !backEl) return;

    const front = frontEl.cloneNode(true);
    const back  = backEl.cloneNode(true);
    [front, back].forEach(el => {
      el.style.cssText =
        'position:absolute;top:0;left:0;'
        +'transform-origin:top left;'
        +'backface-visibility:visible;-webkit-backface-visibility:visible;'
        +'width:'+PW+'px;height:'+PH+'px;'
        +'display:block;border-radius:0;overflow:hidden;';
    });

    pairsHTML +=
      '<div class="card-pair">'
        +'<div class="emp-label">'+name+(dept?' · '+dept:'')+'</div>'
        +'<div class="card-row">'
          +'<div class="card-col"><div class="side-label">&#9658; FRONT</div>'
            +'<div class="card-box">'+front.outerHTML+'</div></div>'
          +'<div class="card-col"><div class="side-label">&#9664; BACK</div>'
            +'<div class="card-box">'+back.outerHTML+'</div></div>'
        +'</div></div>';
  });

  const html = '<!DOCTYPE html><html><head>'
    +'<meta charset="UTF-8">'
    +'<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;800&display=swap" rel="stylesheet">'
    +'<title>ID Cards Portrait</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:A4 portrait;margin:8mm}'
    // body width = A4 - margins = 210-16=194mm
    // DO NOT set body width in px — use mm so browser does not auto-scale
    +'body{'
      +'font-family:"Noto Sans Khmer",sans-serif;'
      +'background:white;color:#1e293b;'
      +'width:194mm;'
      +'-webkit-print-color-adjust:exact;print-color-adjust:exact;'
    +'}'
    // Flip card reset
    +'.id-flip-card,.id-portrait-card{perspective:none!important;}'
    +'.id-flip-inner{transform:none!important;transform-style:flat!important;'
      +'position:static!important;display:block!important;width:auto!important;height:auto!important;}'
    +'.id-flip-front,.id-flip-back{'
      +'transform:none!important;backface-visibility:visible!important;'
      +'-webkit-backface-visibility:visible!important;}'
    // Header
    +'.print-header{display:flex;align-items:center;justify-content:space-between;'
      +'margin-bottom:5mm;padding-bottom:3mm;border-bottom:2px solid #1d4ed8;width:100%;}'
    +'.co-name{font-size:11pt;font-weight:800;color:#1d4ed8}'
    +'.hdr-r{font-size:7pt;color:#64748b;text-align:right;line-height:1.6}'
    // Card layout — widths in mm to prevent px-based overflow
    +'.cards-grid{display:flex;flex-direction:column;gap:5mm}'
    +'.card-pair{break-inside:avoid;page-break-inside:avoid}'
    +'.emp-label{font-size:6pt;font-weight:700;color:#475569;letter-spacing:.4px;margin-bottom:1.5mm}'
    +'.card-row{display:flex;gap:5mm;align-items:flex-start}'
    +'.card-col{display:flex;flex-direction:column;align-items:center}'
    +'.side-label{font-size:5.5pt;font-weight:700;color:#94a3b8;margin-bottom:1mm;text-align:center}'
    // card-box sized in mm = exact CR80 portrait physical size
    // inner px content fills this exactly at 96dpi
    +'.card-box{'
      +'width:'+CW+'mm;'        // 54mm = CR80 width
      +'height:'+CH+'mm;'       // 85.6mm = CR80 height
      +'overflow:hidden;'
      +'position:relative;'
      +'border-radius:2mm;'
      +'box-shadow:0 0 0 0.3mm #94a3b8;'
      +'flex-shrink:0;'
    +'}'
    // Inner content: positioned absolute, scale to fit mm box exactly
    // At 96dpi: 54mm = 204.09px, 85.6mm = 323.35px → scale ≈ 1.0
    // Use scale(1) to force correct render
    +'.card-box>div{'
      +'position:absolute!important;'
      +'top:0!important;left:0!important;'
      +'width:'+PW+'px!important;'
      +'height:'+PH+'px!important;'
      +'transform:scale(calc('+CW+'mm / '+PW+'px))!important;'
      +'transform-origin:top left!important;'
      +'border-radius:0!important;'
      +'overflow:hidden!important;'
    +'}'
    +'</style></head><body>'
    +'<div class="print-header">'
      +'<div style="display:flex;align-items:center;gap:5px">'+logoHtml
        +'<span class="co-name">'+(cfg.company_name||'HR Pro')+'</span></div>'
      +'<div class="hdr-r">&#128203; Employee ID Cards &#8212; &#x1794;&#x1789;&#x17B9;<br>'
        +(CARD_STYLE_META[style]?.label||style)
        +' &middot; '+new Date().toLocaleDateString('km-KH')
        +' &middot; '+cards.length+' Cards'
      +'</div>'
    +'</div>'
    +'<div class="cards-grid">'+pairsHTML+'</div>'
    +'<script>window.onload=function(){window.focus();window.print();}<\/script>'
    +'</body></html>';

  const w = window.open('','_blank','width=900,height=750');
  if (!w) { showToast('សូម allow popup!','warning'); return; }
  w.document.write(html);
  w.document.close();
}

// ===== MODAL / TOAST / BADGE =====
function openModal() { $('modal-overlay').classList.add('open'); }
function closeModal() { $('modal-overlay').classList.remove('open'); document.getElementById('modal')?.classList.remove('modal--wide'); }

function showToast(msg, type='info') {
  const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  $('toast-container').appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

function statusBadge(status) {
  return ({active:'<span class="badge badge-green">✅ ធ្វើការ</span>',on_leave:'<span class="badge badge-yellow">🌴 ច្បាប់</span>',inactive:'<span class="badge badge-red">⛔ ផ្អាក</span>'}[status])||`<span class="badge">${status}</span>`;
}

// ============================================================
// AUTO LOGOUT — 15 minutes idle detection
// ============================================================
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const IDLE_WARNING_MS = 14 * 60 * 1000; // Warning at 14 minutes (1 min before logout)
let _idleTimer = null;
let _idleWarnTimer = null;
let _idleWarningShown = false;

function resetIdleTimer() {
  if (!isLoggedIn()) return;
  clearTimeout(_idleTimer);
  clearTimeout(_idleWarnTimer);
  // If warning toast was shown, hide it
  if (_idleWarningShown) {
    const warn = document.getElementById('idle-warning-banner');
    if (warn) warn.remove();
    _idleWarningShown = false;
  }
  // Set warning at 14 min
  _idleWarnTimer = setTimeout(() => {
    if (!isLoggedIn()) return;
    _idleWarningShown = true;
    // Show warning banner
    let banner = document.getElementById('idle-warning-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'idle-warning-banner';
      banner.style.cssText = [
        'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
        'background:#f59e0b','color:#1a1a1a','font-weight:700',
        'padding:12px 24px','border-radius:12px','z-index:99999',
        'box-shadow:0 4px 20px rgba(0,0,0,0.3)','font-size:14px',
        'display:flex','align-items:center','gap:10px','white-space:nowrap',
      ].join(';');
      banner.innerHTML = '⚠️ ប្រព័ន្ធនឹងចាក់ចេញស្វ័យប្រវត្តិក្នុង <span id="idle-countdown">60</span> វិនាទី — <button onclick="resetIdleTimer()" style="background:#1a1a1a;color:#f59e0b;border:none;padding:4px 12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px">ស្នើ​ থাকতে</button>';
      document.body.appendChild(banner);
      // Countdown
      let secs = 60;
      const cdEl = document.getElementById('idle-countdown');
      const cdInterval = setInterval(() => {
        secs--;
        if (cdEl) cdEl.textContent = secs;
        if (secs <= 0 || !document.getElementById('idle-warning-banner')) clearInterval(cdInterval);
      }, 1000);
    }
  }, IDLE_WARNING_MS);

  // Auto logout at 15 min
  _idleTimer = setTimeout(() => {
    if (!isLoggedIn()) return;
    // Remove warning banner if visible
    const warn = document.getElementById('idle-warning-banner');
    if (warn) warn.remove();
    _idleWarningShown = false;
    // Force logout
    localStorage.removeItem(AUTH_KEY);
    document.getElementById('app-shell').style.display = 'none';
    const ls = document.getElementById('login-screen');
    if (ls) {
      ls.style.display = 'flex';
      const box = ls.querySelector('.login-box');
      if (box) { box.style.transform = ''; box.style.opacity = ''; }
      const uEl = document.getElementById('login-username');
      const pEl = document.getElementById('login-password');
      const btn = document.getElementById('login-btn');
      const btnTxt = document.getElementById('login-btn-text');
      if (uEl) uEl.value = '';
      if (pEl) pEl.value = '';
      if (btn) btn.disabled = false;
      if (btnTxt) btnTxt.textContent = 'ចូល';
      const errEl = document.getElementById('login-error');
      if (errEl) errEl.style.display = 'none';
    }
    showToast('⏱️ ចាក់ចេញស្វ័យប្រវត្តិ — អស់ 15 នាទីដោយគ្មានសកម្មភាព', 'warning');
    stopIdleTimer();
  }, IDLE_TIMEOUT_MS);
}

function startIdleTimer() {
  const events = ['mousemove','mousedown','keydown','touchstart','scroll','click','wheel'];
  events.forEach(ev => document.addEventListener(ev, resetIdleTimer, { passive: true }));
  resetIdleTimer();
}

function stopIdleTimer() {
  clearTimeout(_idleTimer);
  clearTimeout(_idleWarnTimer);
  _idleTimer = null;
  _idleWarnTimer = null;
  _idleWarningShown = false;
  const events = ['mousemove','mousedown','keydown','touchstart','scroll','click','wheel'];
  events.forEach(ev => document.removeEventListener(ev, resetIdleTimer));
}

// ============================================================
// AUTH — Login / Logout
// ============================================================
function doLogin() {
  const uEl = document.getElementById('login-username');
  const pEl = document.getElementById('login-password');
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  if (!uEl || !pEl) return;

  const username = uEl.value.trim();
  const password = pEl.value;
  errEl.style.display = 'none';

  if (!username || !password) {
    showLoginError('សូមបំពេញ Username និង Password!'); return;
  }

  btn.disabled = true;
  document.getElementById('login-btn-text').textContent = 'កំពុងចូល...';

  setTimeout(() => {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ id:user.id, username:user.username, name:user.name, role:user.role }));
      animateLoginSuccess();
    } else {
      showLoginError('Username ឬ Password មិនត្រឹមត្រូវ!');
      btn.disabled = false;
      document.getElementById('login-btn-text').textContent = 'ចូល';
      pEl.value = '';
      pEl.focus();
    }
  }, 600);
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.innerHTML = '❌ ' + msg;
  el.style.display = 'flex';
}

function animateLoginSuccess() {
  const box = document.querySelector('.login-box');
  if (box) {
    box.style.transition = 'all 0.35s cubic-bezier(0.4,0,0.2,1)';
    box.style.transform = 'scale(0.95)';
    box.style.opacity = '0';
  }
  setTimeout(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = '';
    initApp();
    startIdleTimer(); // Begin 15-min idle tracking
  }, 350);
}

function doLogout() {
  if (!confirm('តើអ្នកចង់ចាកចេញពីប្រព័ន្ធ?')) return;
  stopIdleTimer(); // Stop idle tracking
  localStorage.removeItem(AUTH_KEY);
  document.getElementById('app-shell').style.display = 'none';
  const ls = document.getElementById('login-screen');
  if (ls) {
    ls.style.display = 'flex';
    const box = ls.querySelector('.login-box');
    if (box) { box.style.transform = ''; box.style.opacity = ''; }
    const uEl = document.getElementById('login-username');
    const pEl = document.getElementById('login-password');
    const btn = document.getElementById('login-btn');
    const btnTxt = document.getElementById('login-btn-text');
    if (uEl) uEl.value = '';
    if (pEl) pEl.value = '';
    if (btn) btn.disabled = false;
    if (btnTxt) btnTxt.textContent = 'ចូល';
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.style.display = 'none';
  }
  showToast('ចាកចេញបានជោគជ័យ!', 'success');
}

function togglePwd() {
  const inp = document.getElementById('login-password');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function showLoginHelp() {
  alert('Default accounts:\n\nadmin / admin123\nhr / hr1234\nfinance / fin1234\n\nអ្នកអាចបន្ថែម account ថ្មីបានក្នុង ⚙️ ការកំណត់ → Accounts');
}

// ============================================================
// THEME — Dark / Light
// ============================================================
function getTheme() { return localStorage.getItem(THEME_KEY) || 'dark'; }

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  // Update all theme icons
  const sunSVG = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  const moonSVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  const iconInner = t === 'dark' ? sunSVG : moonSVG;
  const title = t === 'dark' ? 'ប្ដូរទៅ ពន្លឺ (Light)' : 'ប្ដូរទៅ យប់ (Dark)';
  ['theme-icon-login', 'theme-icon-app'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = iconInner; el.title = title; }
  });
}

function toggleTheme() {
  const cur = getTheme();
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  showToast(getTheme() === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode', 'info');
}

// ============================================================
// INIT — entry point
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Apply saved theme immediately
  applyTheme(getTheme());

  // Pre-fill login company branding
  const cfg = getCompanyConfig();
  const lName = document.getElementById('login-company-name');
  const lIcon = document.getElementById('login-logo-icon');
  if (lName && cfg.company_name) lName.textContent = cfg.company_name;
  if (lIcon && cfg.logo_url) {
    lIcon.innerHTML = '<img src="' + cfg.logo_url + '" style="width:100%;height:100%;object-fit:contain;border-radius:12px" />';
  }

  // Enter on password = login
  const pEl = document.getElementById('login-password');
  const uEl = document.getElementById('login-username');
  if (pEl) pEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (uEl) uEl.addEventListener('keydown', e => { if (e.key === 'Enter') { pEl && pEl.focus(); } });

  // Load accounts and permissions from API FIRST
  await loadAccountsFromAPI();
  await loadPermissionsFromAPI();

  // Check session
  if (isLoggedIn()) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = '';
    initApp();
    startIdleTimer(); // Resume idle tracking for existing session
  }
});

function initApp() {
  $('current-date').textContent = new Date().toLocaleDateString('km-KH', {year:'numeric',month:'short',day:'numeric'});

  // Load config + photos together
  // Ensure adminsupport account exists
  ensureAdminSupport();

  Promise.all([isDemoMode() ? Promise.resolve() : loadCompanyConfig(), loadAllPhotos(), loadAccountsFromAPI(), loadPermissionsFromAPI()]).then(() => {
    const session = getSession();
    if (session) {
      const uname = $('sidebar-user-name');
      const urole = $('sidebar-user-role');
      if (uname) uname.textContent = session.name || session.username;
      if (urole) urole.textContent = session.role || '';
      // Load user photo
      const uPhoto = photoCache['user_' + session.id] || '';
      updateSidebarAvatar(uPhoto, session.name || session.username);
    }
    applyCompanyBranding();
    // Apply nav visibility based on permissions
    updateNavVisibility();
    document.querySelectorAll('.nav-item').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); navigate(a.dataset.page);
    }));
    $('modal-close').addEventListener('click', closeModal);
    $('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });
    $('sidebarToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
    $('global-search').addEventListener('input', e => { if (state.currentPage === 'employees') renderEmployees(e.target.value); });
    $('btn-settings').addEventListener('click', () => navigate('settings'));
    updateApiStatus();
    if (!getApiBase() && localStorage.getItem(DEMO_MODE_KEY) !== '1') {
      showFirstRunSetup();
    } else {
      navigate('dashboard');
    }
  });
}

function showFirstRunSetup() {
  contentArea().innerHTML = `
    <div style="max-width:500px;margin:40px auto;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🚀</div>
      <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">សូមស្វាគមន៍មកកាន់ HR Pro!</h2>
      <p style="color:var(--text3);margin-bottom:28px">ជ្រើសរើសរបៀបដំណើរការប្រព័ន្ធ</p>

      <!-- Option 1: Worker URL -->
      <div class="card" style="padding:22px;margin-bottom:14px;text-align:left">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="font-size:24px">☁️</div>
          <div>
            <div style="font-weight:700;font-size:14px">ភ្ជាប់ Cloudflare Worker</div>
            <div style="font-size:12px;color:var(--text3)">ប្រើ D1 Database ពិតប្រាកដ — sync គ្រប់គ្នា</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <input class="form-control" id="setup-worker-url" placeholder="https://my-worker.username.workers.dev"
            style="flex:1;font-size:12px"
            onkeydown="if(event.key==='Enter') connectWorkerFromSetup()" />
          <button class="btn btn-success" onclick="connectWorkerFromSetup()">
            ✅ ភ្ជាប់
          </button>
        </div>
        <div id="setup-conn-result" style="margin-top:8px;font-size:12px"></div>
      </div>

      <!-- Option 2: Demo Mode -->
      <div class="card" style="padding:22px;cursor:pointer;text-align:left" onclick="enableDemo()">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:24px">🎮</div>
          <div>
            <div style="font-weight:700;font-size:14px">Demo Mode</div>
            <div style="font-size:12px;color:var(--text3)">ដំណើរការភ្លាមៗ គ្មាន API — ទិន្នន័យក្នុង memory</div>
          </div>
          <div style="margin-left:auto;color:var(--text3);font-size:18px">›</div>
        </div>
      </div>
    </div>`;
}

async function connectWorkerFromSetup() {
  const url = document.getElementById('setup-worker-url')?.value.trim().replace(/\/$/,'');
  const res = document.getElementById('setup-conn-result');
  if (!url) { if(res) res.innerHTML='<span style="color:var(--danger)">❌ សូមវាយ URL!</span>'; return; }
  if(res) res.innerHTML='<span style="color:var(--text3)">⏳ កំពុងសាកល្បង...</span>';
  try {
    const r = await fetch(url+'/stats');
    if (r.ok) {
      localStorage.setItem(STORAGE_KEY, url);
      localStorage.removeItem(DEMO_MODE_KEY);
      if(res) res.innerHTML='<span style="color:var(--success)">✅ ភ្ជាប់បានជោគជ័យ!</span>';
      updateApiStatus();
      setTimeout(() => navigate('dashboard'), 800);
    } else {
      if(res) res.innerHTML='<span style="color:var(--warning)">⚠️ Worker ឆ្លើយតប ('+r.status+') — ពិនិត្យ CORS</span>';
    }
  } catch(e) {
    if(res) res.innerHTML='<span style="color:var(--danger)">❌ ភ្ជាប់មិនបាន — ពិនិត្យ URL</span>';
  }
}
// Build: 1777018339