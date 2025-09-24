// Local auth demo
const LS_USERS = 'prestamista.users';
const LS_SESSION = 'prestamista.session';
function getUsers(){ try { return JSON.parse(localStorage.getItem(LS_USERS))||[] } catch { return [] } }
function setUsers(u){ localStorage.setItem(LS_USERS, JSON.stringify(u)); }
function setSession(email){ localStorage.setItem(LS_SESSION, JSON.stringify({email})); }
function getSession(){ try { return JSON.parse(localStorage.getItem(LS_SESSION)) } catch { return null } }
function clearSession(){ localStorage.removeItem(LS_SESSION); }

async function hash(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function register(email, password){
  const users = getUsers();
  if (!email || !password) throw new Error('Completá email y contraseña.');
  if (users.find(u=>u.email===email)) throw new Error('Ya existe un usuario con ese email.');
  users.push({ email, pass: await hash(password), settings: { prestamista_nombre: '', prestamista_dni: '', prestamista_dom: '' } });
  setUsers(users);
}

async function login(email, password){
  const users = getUsers();
  const u = users.find(u=>u.email===email);
  if (!u) throw new Error('Usuario inexistente.');
  const hp = await hash(password);
  if (u.pass !== hp) throw new Error('Contraseña incorrecta.');
  setSession(email);
}

async function ensureAuth(){
  const sess = getSession();
  const path = location.pathname;
  const file = path.split('/').pop() || 'index.html';
  const atLogin = (file === 'index.html'); // solo consideramos login cuando es index.html
  if (!sess && !atLogin){ location.replace('index.html'); }
  if (sess && atLogin){ location.replace('app.html'); }
}
  if (sess && atLogin){ location.href = 'app.html'; }
}

document.addEventListener('DOMContentLoaded', async () => {
  await ensureAuth();
  if (location.pathname.endsWith('index.html') || location.pathname.endsWith('/') || location.pathname.endsWith('')){
    const email = document.getElementById('email');
    const pass = document.getElementById('password');
    document.getElementById('btnLogin').addEventListener('click', async ()=>{
      try { await login(email.value.trim(), pass.value); location.href='app.html'; }
      catch(e){ alert(e.message); }
    });
    document.getElementById('btnRegister').addEventListener('click', async ()=>{
      try { await register(email.value.trim(), pass.value); alert('Usuario creado. Ahora ingresá.'); }
      catch(e){ alert(e.message); }
    });
  } else {
    const sess = getSession();
    document.getElementById('userEmail').textContent = sess?.email || '';
    document.getElementById('btnLogout').addEventListener('click', ()=>{ clearSession(); location.href='index.html'; });
  }
});
