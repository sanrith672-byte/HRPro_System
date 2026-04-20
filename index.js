// ============================================================
// HR Pro Multi-Company API — Cloudflare Workers + D1 v90
// ============================================================
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-Company-ID,x-company-id','Access-Control-Max-Age':'86400' } });
    try { return await handleRequest(request, env); }
    catch(e) { return new Response(JSON.stringify({error:'Server Error',message:e.message}),{status:500,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-Company-ID,x-company-id'}}); }
  }
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Company-ID,x-company-id',
  'Access-Control-Expose-Headers': 'Content-Type,Authorization,X-Company-ID',
  'Access-Control-Max-Age': '86400',
};
const json = (d,s=200) => new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json',...cors}});
const err  = (m,s=400) => json({error:m},s);

function cid(request, url, body) {
  const h = request.headers.get('X-Company-ID');
  if (h) return parseInt(h)||1;
  const q = (url||new URL(request.url)).searchParams.get('company_id');
  if (q) return parseInt(q)||1;
  if (body?.company_id) return parseInt(body.company_id)||1;
  return 1;
}

// Auto-ensure table exists helper
async function ensureTable(env, sql) {
  try { await env.DB.prepare(sql).run(); } catch(_) {}
}

async function handleRequest(request, env) {
  if (request.method==='OPTIONS') return new Response(null,{headers:cors});
  const url=new URL(request.url), path=url.pathname, m=request.method;
  try {
    if (path==='/companies') { if(m==='GET') return getCompanies(env); if(m==='POST') return createCompany(request,env); }
    if (path.match(/^\/companies\/\d+$/)) { const id=+path.split('/')[2]; if(m==='GET') return getCompany(id,env); if(m==='PUT') return updateCompany(id,request,env); if(m==='DELETE') return deleteCompany(id,env); }
    if (path==='/employees') { if(m==='GET') return getEmployees(request,env,url); if(m==='POST') return createEmployee(request,env,url); }
    if (path.match(/^\/employees\/\d+$/)) { const id=+path.split('/')[2]; if(m==='GET') return getEmployee(id,request,env,url); if(m==='PUT') return updateEmployee(id,request,env,url); if(m==='DELETE') return deleteEmp(id,request,env,url); }
    if (path.match(/^\/employees\/\d+\/photo$/)) { const id=+path.split('/')[2]; if(m==='POST') return saveMedia(id,'photo_data',request,env); if(m==='DELETE') return delMedia(id,'photo_data',env); }
    if (path.match(/^\/employees\/\d+\/qr$/))    { const id=+path.split('/')[2]; if(m==='POST') return saveMedia(id,'qr_data',request,env);   if(m==='DELETE') return delMedia(id,'qr_data',env); }
    if (path==='/config') { if(m==='GET') return getConfig(request,env,url); if(m==='POST') return saveConfig(request,env,url); }
    if (path==='/departments') { if(m==='GET') return getDepts(request,env,url); if(m==='POST') return createDept(request,env,url); }
    if (path.match(/^\/departments\/\d+$/)) { const id=+path.split('/')[2]; if(m==='PUT') return updateDept(id,request,env); if(m==='DELETE') return delDept(id,env); }
    if (path==='/attendance') { if(m==='GET') return getAtt(request,env,url); if(m==='POST') return createAtt(request,env,url); }
    if (path.match(/^\/attendance\/\d+$/)) { const id=+path.split('/')[2]; if(m==='PUT') return updAtt(id,request,env); if(m==='DELETE') return delCo(id,'attendance',request,env,url); }
    if (path==='/salary') { if(m==='GET') return getSal(request,env,url); if(m==='POST') return createSal(request,env,url); }
    if (path.match(/^\/salary\/\d+\/pay$/)) { const id=+path.split('/')[2]; if(m==='PUT') return paySal(id,env); }
    if (path.match(/^\/salary\/\d+$/))     { const id=+path.split('/')[2]; if(m==='PUT') return updSal(id,request,env); if(m==='DELETE') return delRec(id,env,'salary_records'); }
    if (path==='/overtime')         { if(m==='GET') return getAllCo('overtime ot JOIN employees e ON ot.employee_id=e.id AND ot.company_id=e.company_id','ot.*,e.name as employee_name','ot.created_at DESC','ot',request,env,url); if(m==='POST') return insCo(request,env,url,'overtime',['employee_id','date','hours','rate','pay','reason','status']); }
    if (path.match(/^\/overtime\/\d+$/))    { const id=+path.split('/')[2]; if(m==='PUT') return updRec(id,request,env,'overtime'); if(m==='DELETE') return delCo(id,'overtime',request,env,url); }
    if (path==='/allowances')       { if(m==='GET') return getAllCo('allowances al JOIN employees e ON al.employee_id=e.id AND al.company_id=e.company_id','al.*,e.name as employee_name','al.created_at DESC','al',request,env,url); if(m==='POST') return insCo(request,env,url,'allowances',['employee_id','type','amount','month','note']); }
    if (path.match(/^\/allowances\/\d+$/))  { const id=+path.split('/')[2]; if(m==='DELETE') return delCo(id,'allowances',request,env,url); }
    if (path==='/loans')            { if(m==='GET') return getAllCo('loans ln JOIN employees e ON ln.employee_id=e.id AND ln.company_id=e.company_id','ln.*,e.name as employee_name','ln.created_at DESC','ln',request,env,url); if(m==='POST') return insCo(request,env,url,'loans',['employee_id','amount','loan_date','due_date','note','paid_amount','status','installment_months','installment_amount']); }
    if (path.match(/^\/loans\/\d+\/repay$/)) { const id=+path.split('/')[2]; if(m==='PUT') return repay(id,request,env); }
    if (path.match(/^\/loans\/\d+$/))        { const id=+path.split('/')[2]; if(m==='DELETE') return delCo(id,'loans',request,env,url); }
    if (path==='/expenses')         { if(m==='GET') return getAllCo('expense_requests er JOIN employees e ON er.employee_id=e.id AND er.company_id=e.company_id','er.*,e.name as employee_name','er.created_at DESC','er',request,env,url); if(m==='POST') return insCo(request,env,url,'expense_requests',['employee_id','category','amount','request_date','description','status']); }
    if (path.match(/^\/expenses\/\d+$/))    { const id=+path.split('/')[2]; if(m==='PUT') return updRec(id,request,env,'expense_requests'); if(m==='DELETE') return delCo(id,'expense_requests',request,env,url); }
    if (path==='/general-expenses') { if(m==='GET') return getAllCo('general_expenses','*','created_at DESC',null,request,env,url); if(m==='POST') return insCo(request,env,url,'general_expenses',['title','category','amount','expense_date','responsible','status','note']); }
    if (path.match(/^\/general-expenses\/\d+$/)) { const id=+path.split('/')[2]; if(m==='PUT') return updRec(id,request,env,'general_expenses'); if(m==='DELETE') return delCo(id,'general_expenses',request,env,url); }
    if (path==='/leave')            { if(m==='GET') return getAllCo('leave_requests lr JOIN employees e ON lr.employee_id=e.id AND lr.company_id=e.company_id','lr.*,e.name as employee_name','lr.created_at DESC','lr',request,env,url); if(m==='POST') return insCo(request,env,url,'leave_requests',['employee_id','leave_type','start_date','end_date','days','reason','status']); }
    if (path.match(/^\/leave\/\d+$/))       { const id=+path.split('/')[2]; if(m==='PUT') return updRec(id,request,env,'leave_requests'); if(m==='DELETE') return delCo(id,'leave_requests',request,env,url); }
    if (path==='/stats' && m==='GET') return getStats(request,env,url);
    if (path==='/init'  && m==='POST') return initDB(env);
    return err('Not Found',404);
  } catch(e) {
    console.error('Worker error:',e.message);
    return new Response(JSON.stringify({error:'Server Error',message:e.message}),{status:500,headers:{'Content-Type':'application/json',...cors}});
  }
}

// ── Companies ─────────────────────────────────────────────────
async function getCompanies(env) {
  try {
    await ensureTable(env,`CREATE TABLE IF NOT EXISTS companies(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT UNIQUE NOT NULL,logo_url TEXT DEFAULT '',address TEXT DEFAULT '',phone TEXT DEFAULT '',email TEXT DEFAULT '',website TEXT DEFAULT '',created_at TEXT)`);
    const r=await env.DB.prepare('SELECT id,name,code,logo_url,phone,email,website FROM companies ORDER BY id').all();
    return json({companies:r.results||[]});
  } catch(e){return err(e.message);}
}
async function getCompany(id,env){const c=await env.DB.prepare('SELECT * FROM companies WHERE id=?').bind(id).first();return c?json(c):err('Not found',404);}
async function createCompany(request,env){
  const b=await request.json();
  if(!b.name||!b.code) return err('name and code required');
  try{
    await ensureTable(env,`CREATE TABLE IF NOT EXISTS companies(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT UNIQUE NOT NULL,logo_url TEXT DEFAULT '',address TEXT DEFAULT '',phone TEXT DEFAULT '',email TEXT DEFAULT '',website TEXT DEFAULT '',created_at TEXT)`);
    const r=await env.DB.prepare(`INSERT INTO companies(name,code,logo_url,address,phone,email,website,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`).bind(b.name,b.code,b.logo_url||'',b.address||'',b.phone||'',b.email||'',b.website||'').run();
    await initDB(env);
    return json({message:'Company created',id:r.meta.last_row_id},201);
  }catch(e){
    if(e.message&&e.message.includes('UNIQUE')) return err('Code "'+b.code+'" មានរួចហើយ!',400);
    return err(e.message);
  }
}
async function updateCompany(id,request,env){const b=await request.json();await env.DB.prepare(`UPDATE companies SET name=?,code=?,logo_url=?,address=?,phone=?,email=?,website=? WHERE id=?`).bind(b.name||'',b.code||'',b.logo_url||'',b.address||'',b.phone||'',b.email||'',b.website||'',id).run();return json({message:'Updated'});}
async function deleteCompany(id,env){await env.DB.prepare('DELETE FROM companies WHERE id=?').bind(id).run();return json({message:'Deleted'});}

// ── Employees ─────────────────────────────────────────────────
async function ensureEmpCols(env){
  await Promise.allSettled([
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN custom_id TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN bank TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN bank_account TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN bank_holder TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN photo_data TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN qr_data TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN work_history TEXT DEFAULT ''`).run(),
  ]);
}

async function getEmployees(request,env,url){
  const co=cid(request,url,null),search=url.searchParams.get('search')||'',dept=url.searchParams.get('department')||'',status=url.searchParams.get('status')||'',limit=+url.searchParams.get('limit')||50,page=+url.searchParams.get('page')||1,offset=(page-1)*limit;
  await ensureTable(env,`CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,name TEXT NOT NULL,gender TEXT DEFAULT 'male',custom_id TEXT DEFAULT '',position TEXT NOT NULL,department_id INTEGER,phone TEXT DEFAULT '',email TEXT DEFAULT '',salary REAL DEFAULT 0,hire_date TEXT,status TEXT DEFAULT 'active',termination_date TEXT DEFAULT '',work_history TEXT DEFAULT '',bank TEXT DEFAULT '',bank_account TEXT DEFAULT '',bank_holder TEXT DEFAULT '',photo_data TEXT DEFAULT '',qr_data TEXT DEFAULT '',created_at TEXT,updated_at TEXT)`);
  await ensureEmpCols(env);
  const sel=`e.id,e.name,e.gender,e.position,e.department_id,e.phone,e.email,e.salary,e.hire_date,e.status,e.company_id,e.created_at,e.updated_at,COALESCE(e.custom_id,'') as custom_id,COALESCE(e.bank,'') as bank,COALESCE(e.bank_account,'') as bank_account,COALESCE(e.bank_holder,'') as bank_holder,COALESCE(e.photo_data,'') as photo_data,COALESCE(e.qr_data,'') as qr_data,COALESCE(e.termination_date,'') as termination_date,COALESCE(e.work_history,'') as work_history,d.name as department_name,d.icon as dept_icon`;
  let w='WHERE e.company_id=?';const p=[co];
  if(search){w+=` AND (e.name LIKE ? OR e.position LIKE ?)`;p.push(`%${search}%`,`%${search}%`);}
  if(dept){w+=` AND d.name=?`;p.push(dept);}
  if(status){w+=` AND e.status=?`;p.push(status);}
  const from=`employees e LEFT JOIN departments d ON e.department_id=d.id`;
  const cnt=await env.DB.prepare(`SELECT COUNT(*) as t FROM ${from} ${w}`).bind(...p).first();
  const rows=await env.DB.prepare(`SELECT ${sel} FROM ${from} ${w} ORDER BY e.id ASC LIMIT ? OFFSET ?`).bind(...p,limit,offset).all();
  return json({employees:rows.results||[],total:cnt?.t||0,page,limit});
}
async function getEmployee(id,request,env,url){const co=cid(request,url,null);await ensureEmpCols(env);const e=await env.DB.prepare(`SELECT e.*,COALESCE(e.termination_date,'') as termination_date,COALESCE(e.work_history,'') as work_history,d.name as department_name FROM employees e LEFT JOIN departments d ON e.department_id=d.id WHERE e.id=? AND e.company_id=?`).bind(id,co).first();return e?json(e):err('Not found',404);}
async function createEmployee(request,env,url){
  const b=await request.json();const co=cid(request,url,b);await ensureEmpCols(env);
  if(!b.name||!b.position||!b.department_id) return err('name,position,department_id required');
  const r=await env.DB.prepare(`INSERT INTO employees(name,position,department_id,phone,email,salary,hire_date,status,gender,custom_id,bank,bank_account,bank_holder,termination_date,work_history,company_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(b.name,b.position,b.department_id,b.phone||'',b.email||'',b.salary||0,b.hire_date||new Date().toISOString().split('T')[0],b.status||'active',b.gender||'male',b.custom_id||'',b.bank||'',b.bank_account||'',b.bank_holder||'',b.termination_date||'',b.work_history||'',co).run();
  const e=await env.DB.prepare('SELECT * FROM employees WHERE id=?').bind(r.meta.last_row_id).first();
  return json({message:'Created',id:r.meta.last_row_id,employee:e},201);
}
async function updateEmployee(id,request,env,url){
  const b=await request.json();const co=cid(request,url,b);await ensureEmpCols(env);
  await env.DB.prepare(`UPDATE employees SET name=?,position=?,department_id=?,phone=?,email=?,salary=?,hire_date=?,status=?,gender=?,termination_date=?,work_history=?,custom_id=COALESCE(?,custom_id),bank=COALESCE(?,bank),bank_account=COALESCE(?,bank_account),bank_holder=COALESCE(?,bank_holder),updated_at=datetime('now') WHERE id=? AND company_id=?`).bind(b.name,b.position,b.department_id,b.phone||'',b.email||'',b.salary||0,b.hire_date||'',b.status||'active',b.gender||'male',b.termination_date||'',b.work_history||'',b.custom_id||null,b.bank||null,b.bank_account||null,b.bank_holder||null,id,co).run();
  const e=await env.DB.prepare('SELECT * FROM employees WHERE id=?').bind(id).first();
  return json({message:'Updated',employee:e});
}
async function deleteEmp(id,request,env,url){const co=cid(request,url,null);await env.DB.prepare('DELETE FROM employees WHERE id=? AND company_id=?').bind(id,co).run();return json({message:'Deleted'});}
async function saveMedia(id,col,request,env){const b=await request.json();await env.DB.prepare(`UPDATE employees SET ${col}=? WHERE id=?`).bind(b.data||'',id).run();return json({message:'Saved'});}
async function delMedia(id,col,env){await env.DB.prepare(`UPDATE employees SET ${col}='' WHERE id=?`).bind(id).run();return json({message:'Deleted'});}

// ── Config ────────────────────────────────────────────────────
async function getConfig(request,env,url){
  const co=cid(request,url,null);
  try{
    await ensureTable(env,`CREATE TABLE IF NOT EXISTS app_config(key TEXT NOT NULL,company_id INTEGER DEFAULT 1,value TEXT DEFAULT '',PRIMARY KEY(key,company_id))`);
    await Promise.allSettled([env.DB.prepare(`ALTER TABLE app_config ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
    const rows=await env.DB.prepare('SELECT key,value FROM app_config WHERE company_id=?').bind(co).all();
    const cfg={};for(const r of rows.results||[]){try{cfg[r.key]=JSON.parse(r.value);}catch{cfg[r.key]=r.value;}}
    if(cfg.company&&typeof cfg.company==='object') Object.assign(cfg,cfg.company);
    return json(cfg);
  }catch(_){return json({});}
}
async function saveConfig(request,env,url){
  const b=await request.json();const co=cid(request,url,b);
  try{
    await ensureTable(env,`CREATE TABLE IF NOT EXISTS app_config(key TEXT NOT NULL,company_id INTEGER DEFAULT 1,value TEXT DEFAULT '',PRIMARY KEY(key,company_id))`);
    const key=b.key||'company';const val=b.key?(typeof b.value==='string'?b.value:JSON.stringify(b.value)):JSON.stringify(b);
    await env.DB.prepare(`INSERT INTO app_config(key,value,company_id) VALUES(?,?,?) ON CONFLICT(key,company_id) DO UPDATE SET value=excluded.value`).bind(key,val,co).run();
    return json({message:'saved',key});
  }catch(e){return err(e.message);}
}

// ── Departments ───────────────────────────────────────────────
async function getDepts(request,env,url){
  const co=cid(request,url,null);
  await ensureTable(env,`CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,name TEXT NOT NULL,manager TEXT DEFAULT '',icon TEXT DEFAULT '🏢',color TEXT DEFAULT '#118AB2',created_at TEXT,updated_at TEXT)`);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE departments ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
  const r=await env.DB.prepare('SELECT * FROM departments WHERE company_id=? ORDER BY name').bind(co).all();
  return json(r.results||[]);
}
async function createDept(request,env,url){
  const b=await request.json();const co=cid(request,url,b);
  await ensureTable(env,`CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,name TEXT NOT NULL,manager TEXT DEFAULT '',icon TEXT DEFAULT '🏢',color TEXT DEFAULT '#118AB2',created_at TEXT,updated_at TEXT)`);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE departments ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
  const r=await env.DB.prepare(`INSERT INTO departments(name,manager,icon,color,company_id,created_at) VALUES(?,?,?,?,?,datetime('now'))`).bind(b.name||'',b.manager||'',b.icon||'🏢',b.color||'#118AB2',co).run();
  return json({message:'Created',id:r.meta.last_row_id},201);
}
async function updateDept(id,request,env){const b=await request.json();await env.DB.prepare(`UPDATE departments SET name=?,manager=?,icon=?,color=?,updated_at=datetime('now') WHERE id=?`).bind(b.name||'',b.manager||'',b.icon||'🏢',b.color||'#118AB2',id).run();return json({message:'Updated'});}
async function delDept(id,env){const c=await env.DB.prepare('SELECT COUNT(*) as c FROM employees WHERE department_id=?').bind(id).first();if(c?.c>0) return err('មានបុគ្គលិកក្នុងនាយកដ្ឋាននេះ',400);await env.DB.prepare('DELETE FROM departments WHERE id=?').bind(id).run();return json({message:'Deleted'});}

// ── Attendance ────────────────────────────────────────────────
async function getAtt(request,env,url){
  const co=cid(request,url,null),date=url.searchParams.get('date')||'',empId=url.searchParams.get('employee_id')||'',month=url.searchParams.get('month')||'';
  await ensureTable(env,`CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,date TEXT NOT NULL,check_in TEXT DEFAULT '',check_out TEXT DEFAULT '',status TEXT DEFAULT 'present',notes TEXT DEFAULT '',created_at TEXT)`);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE attendance ADD COLUMN company_id INTEGER DEFAULT 1`).run(),env.DB.prepare(`ALTER TABLE attendance ADD COLUMN notes TEXT DEFAULT ''`).run()]);
  let q=`SELECT a.*,e.name as employee_name FROM attendance a JOIN employees e ON a.employee_id=e.id WHERE a.company_id=?`;const p=[co];
  if(date){q+=' AND a.date=?';p.push(date);}if(empId){q+=' AND a.employee_id=?';p.push(+empId);}if(month){q+=` AND strftime('%Y-%m',a.date)=?`;p.push(month);}
  q+=' ORDER BY a.date DESC LIMIT 500';
  const r=await env.DB.prepare(q).bind(...p).all();return json({records:r.results||[]});
}
async function createAtt(request,env,url){
  const b=await request.json();const co=cid(request,url,b);
  await ensureTable(env,`CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,date TEXT NOT NULL,check_in TEXT DEFAULT '',check_out TEXT DEFAULT '',status TEXT DEFAULT 'present',notes TEXT DEFAULT '',created_at TEXT)`);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE attendance ADD COLUMN company_id INTEGER DEFAULT 1`).run(),env.DB.prepare(`ALTER TABLE attendance ADD COLUMN notes TEXT DEFAULT ''`).run()]);
  const r=await env.DB.prepare(`INSERT INTO attendance(employee_id,date,check_in,check_out,status,notes,company_id,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`).bind(b.employee_id,b.date,b.check_in||'',b.check_out||'',b.status||'present',b.notes||'',co).run();
  return json({message:'Created',id:r.meta.last_row_id},201);
}
async function updAtt(id,request,env){const b=await request.json();await env.DB.prepare(`UPDATE attendance SET check_in=?,check_out=?,status=?,notes=? WHERE id=?`).bind(b.check_in||'',b.check_out||'',b.status||'present',b.notes||'',id).run();return json({message:'Updated'});}

// ── Salary ────────────────────────────────────────────────────
async function getSal(request,env,url){
  const co=cid(request,url,null),month=url.searchParams.get('month')||new Date().toISOString().slice(0,7);
  await ensureTable(env,`CREATE TABLE IF NOT EXISTS salary_records(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,month TEXT NOT NULL,base_salary REAL DEFAULT 0,bonus REAL DEFAULT 0,deduction REAL DEFAULT 0,net_salary REAL DEFAULT 0,status TEXT DEFAULT 'pending',note TEXT DEFAULT '',created_at TEXT,updated_at TEXT)`);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE salary_records ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
  const r=await env.DB.prepare(`SELECT sr.*,e.name as employee_name,d.name as department FROM salary_records sr JOIN employees e ON sr.employee_id=e.id LEFT JOIN departments d ON e.department_id=d.id WHERE sr.company_id=? AND strftime('%Y-%m',sr.month)=strftime('%Y-%m',?) ORDER BY e.name`).bind(co,month+'-01').all();
  const recs=r.results||[];
  return json({records:recs,summary:{total_net:recs.reduce((s,x)=>s+(x.net_salary||0),0),total_base:recs.reduce((s,x)=>s+(x.base_salary||0),0),paid:recs.filter(x=>x.status==='paid').length}});
}
async function createSal(request,env,url){
  const b=await request.json();const co=cid(request,url,b);
  await ensureTable(env,`CREATE TABLE IF NOT EXISTS salary_records(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,month TEXT NOT NULL,base_salary REAL DEFAULT 0,bonus REAL DEFAULT 0,deduction REAL DEFAULT 0,net_salary REAL DEFAULT 0,status TEXT DEFAULT 'pending',note TEXT DEFAULT '',created_at TEXT,updated_at TEXT)`);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE salary_records ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
  const net=b.net_salary??((b.base_salary||0)+(b.bonus||0)-(b.deduction||0));
  const r=await env.DB.prepare(`INSERT INTO salary_records(employee_id,month,base_salary,bonus,deduction,net_salary,status,note,company_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(b.employee_id,b.month,b.base_salary||0,b.bonus||0,b.deduction||0,net,b.status||'pending',b.note||'',co).run();
  return json({message:'Created',id:r.meta.last_row_id},201);
}
async function updSal(id,request,env){const b=await request.json();const net=(b.base_salary||0)+(b.bonus||0)-(b.deduction||0);await env.DB.prepare(`UPDATE salary_records SET base_salary=?,bonus=?,deduction=?,net_salary=?,status=?,note=?,updated_at=datetime('now') WHERE id=?`).bind(b.base_salary||0,b.bonus||0,b.deduction||0,net,b.status||'pending',b.note||'',id).run();return json({message:'Updated'});}
async function paySal(id,env){await env.DB.prepare(`UPDATE salary_records SET status='paid',updated_at=datetime('now') WHERE id=?`).bind(id).run();return json({message:'Paid'});}

// ── Generic helpers ───────────────────────────────────────────
async function getAllCo(from,sel,ord,alias,request,env,url){
  const co=cid(request,url,null);const tbl=alias||from.split(' ')[0];
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE ${tbl} ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
  const r=await env.DB.prepare(`SELECT ${sel} FROM ${from} WHERE ${tbl}.company_id=? ORDER BY ${ord}`).bind(co).all();
  return json({records:r.results||[]});
}
async function insCo(request,env,url,table,fields){
  const b=await request.json();const co=cid(request,url,b);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
  const af=[...fields,'company_id'];const r=await env.DB.prepare(`INSERT INTO ${table}(${af.join(',')},created_at) VALUES(${af.map(()=>'?').join(',')},datetime('now'))`).bind(...fields.map(f=>b[f]??null),co).run();
  return json({message:'Created',id:r.meta.last_row_id},201);
}
async function updRec(id,request,env,table){const b=await request.json();const keys=Object.keys(b).filter(k=>k!=='company_id');if(!keys.length) return json({message:'No changes'});await env.DB.prepare(`UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=datetime('now') WHERE id=?`).bind(...keys.map(k=>b[k]),id).run();return json({message:'Updated'});}
async function delRec(id,env,table){await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();return json({message:'Deleted'});}
async function delCo(id,table,request,env,url){const co=cid(request,url,null);await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND company_id=?`).bind(id,co).run();return json({message:'Deleted'});}
async function repay(id,request,env){const {amount}=await request.json();const loan=await env.DB.prepare('SELECT * FROM loans WHERE id=?').bind(id).first();if(!loan) return err('Not found',404);const paid=(loan.paid_amount||0)+amount;const status=paid>=loan.amount?'paid':'active';await env.DB.prepare(`UPDATE loans SET paid_amount=?,status=?,updated_at=datetime('now') WHERE id=?`).bind(paid,status,id).run();return json({message:'Repayment recorded',paid_amount:paid,status});}

// ── Stats ─────────────────────────────────────────────────────
async function getStats(request,env,url){
  const co=cid(request,url,null);
  await Promise.allSettled([env.DB.prepare(`ALTER TABLE employees ADD COLUMN company_id INTEGER DEFAULT 1`).run(),env.DB.prepare(`ALTER TABLE salary_records ADD COLUMN company_id INTEGER DEFAULT 1`).run()]);
  const [emp,act,sal]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as c FROM employees WHERE company_id=?`).bind(co).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM employees WHERE company_id=? AND status='active'`).bind(co).first(),
    env.DB.prepare(`SELECT SUM(net_salary) as t FROM salary_records WHERE company_id=? AND strftime('%Y-%m',month)=strftime('%Y-%m','now')`).bind(co).first(),
  ]);
  return json({total_employees:emp?.c||0,active_employees:act?.c||0,monthly_salary:sal?.t||0,today_attendance:0,total_departments:0});
}

// ── Init DB ───────────────────────────────────────────────────
async function initDB(env){
  const stmts=[
    `CREATE TABLE IF NOT EXISTS companies(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT UNIQUE NOT NULL,logo_url TEXT DEFAULT '',address TEXT DEFAULT '',phone TEXT DEFAULT '',email TEXT DEFAULT '',website TEXT DEFAULT '',created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,name TEXT NOT NULL,manager TEXT DEFAULT '',icon TEXT DEFAULT '🏢',color TEXT DEFAULT '#118AB2',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,name TEXT NOT NULL,gender TEXT DEFAULT 'male',custom_id TEXT DEFAULT '',position TEXT NOT NULL,department_id INTEGER,phone TEXT DEFAULT '',email TEXT DEFAULT '',salary REAL DEFAULT 0,hire_date TEXT,status TEXT DEFAULT 'active',termination_date TEXT DEFAULT '',work_history TEXT DEFAULT '',bank TEXT DEFAULT '',bank_account TEXT DEFAULT '',bank_holder TEXT DEFAULT '',photo_data TEXT DEFAULT '',qr_data TEXT DEFAULT '',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,date TEXT NOT NULL,check_in TEXT DEFAULT '',check_out TEXT DEFAULT '',status TEXT DEFAULT 'present',notes TEXT DEFAULT '',created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS salary_records(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,month TEXT NOT NULL,base_salary REAL DEFAULT 0,bonus REAL DEFAULT 0,deduction REAL DEFAULT 0,net_salary REAL DEFAULT 0,status TEXT DEFAULT 'pending',note TEXT DEFAULT '',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS overtime(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,date TEXT,hours REAL DEFAULT 0,rate REAL DEFAULT 0,pay REAL DEFAULT 0,reason TEXT DEFAULT '',status TEXT DEFAULT 'pending',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS allowances(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,type TEXT NOT NULL,amount REAL DEFAULT 0,month TEXT,note TEXT DEFAULT '',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS loans(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,amount REAL DEFAULT 0,loan_date TEXT,due_date TEXT,note TEXT DEFAULT '',paid_amount REAL DEFAULT 0,status TEXT DEFAULT 'active',installment_months INTEGER DEFAULT 1,installment_amount REAL DEFAULT 0,created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS expense_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,category TEXT NOT NULL,amount REAL DEFAULT 0,request_date TEXT,description TEXT DEFAULT '',status TEXT DEFAULT 'pending',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS general_expenses(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,title TEXT NOT NULL,category TEXT NOT NULL,amount REAL DEFAULT 0,expense_date TEXT,responsible TEXT DEFAULT '',status TEXT DEFAULT 'pending',note TEXT DEFAULT '',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS leave_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id INTEGER DEFAULT 1,employee_id INTEGER NOT NULL,leave_type TEXT NOT NULL,start_date TEXT,end_date TEXT,days INTEGER DEFAULT 0,reason TEXT DEFAULT '',status TEXT DEFAULT 'pending',created_at TEXT,updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS app_config(key TEXT NOT NULL,company_id INTEGER DEFAULT 1,value TEXT DEFAULT '',PRIMARY KEY(key,company_id))`,
  ];
  for(const s of stmts){try{await env.DB.prepare(s).run();}catch(_){}}
  await Promise.allSettled([
    env.DB.prepare(`ALTER TABLE departments ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE attendance ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE attendance ADD COLUMN notes TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE salary_records ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE overtime ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE allowances ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE loans ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE expense_requests ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE general_expenses ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE leave_requests ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE app_config ADD COLUMN company_id INTEGER DEFAULT 1`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN termination_date TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN work_history TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN custom_id TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN bank TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN bank_account TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN bank_holder TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN photo_data TEXT DEFAULT ''`).run(),
    env.DB.prepare(`ALTER TABLE employees ADD COLUMN qr_data TEXT DEFAULT ''`).run(),
  ]);
  try{const c=await env.DB.prepare('SELECT COUNT(*) as c FROM companies').first();if(!c?.c) await env.DB.prepare(`INSERT OR IGNORE INTO companies(name,code,created_at) VALUES('ក្រុមហ៊ុន ១','COMPANY001',datetime('now'))`).run();}catch(_){}
  return json({message:'Database initialized! Multi-company ready.'});
}
