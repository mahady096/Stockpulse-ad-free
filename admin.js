(function(){
'use strict';
let token=null, users=[];
const fn = () => `${window.APP_CONFIG.API.SUPABASE_URL}/functions/v1/admin-subscriptions`;
async function exchange(){
 const u=window.auth?.currentUser; if(!u) throw new Error('Login required');
 const id=await u.getIdToken(true);
 const r=await fetch(window.APP_CONFIG.API.SUPABASE_AUTH_HOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firebase_token:id})});
 const d=await r.json().catch(()=>({})); if(!r.ok||!d.token) throw new Error(d.error||'Token exchange failed'); token=d.token;
}
async function call(method='GET',body){
 const r=await fetch(fn(),{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const text=await r.text(); let d={}; try{d=text?JSON.parse(text):{}}catch(_){d={error:text||`HTTP ${r.status}`};}
 if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(){
 const q=(document.getElementById('search').value||'').toLowerCase(), f=document.getElementById('filter').value;
 const now=Date.now(), week=now+7*864e5;
 const rows=users.filter(x=>(!q||`${x.email} ${x.uid}`.toLowerCase().includes(q))&&(f==='all'||x.plan===f||(f==='expired'&&x.expired)));
 document.getElementById('m-total').textContent=users.length;
 document.getElementById('m-pro').textContent=users.filter(x=>x.plan==='pro'&&!x.expired).length;
 document.getElementById('m-free').textContent=users.filter(x=>x.plan!=='pro'||x.expired).length;
 document.getElementById('m-exp').textContent=users.filter(x=>x.plan==='pro'&&x.expiresAt&&new Date(x.expiresAt).getTime()<=week&&new Date(x.expiresAt).getTime()>now).length;
 document.getElementById('users-body').innerHTML=rows.map((x,i)=>`<tr><td>${esc(x.email||'—')}</td><td title="${esc(x.uid)}">${esc(x.uid?.slice(0,14))}…</td><td class="${x.plan==='pro'&&!x.expired?'plan-pro':'plan-free'}">${x.plan==='pro'&&!x.expired?'👑 PRO':'🆓 FREE'}</td><td>${x.expiresAt?esc(new Date(x.expiresAt).toLocaleDateString('en-GB')):'—'}</td><td>${x.plan==='pro'&&!x.expired?`<button class="btn btn-pro" onclick="grant('${esc(x.uid)}',30)">+30 days</button> <button class="btn btn-danger" onclick="revoke('${esc(x.uid)}')">Revoke</button>`:`<button class="btn btn-pro" onclick="grant('${esc(x.uid)}',30)">Grant 30 days</button>`}</td></tr>`).join('')||'<tr><td colspan="5">No users found.</td></tr>';
}
window.loadUsers=async()=>{try{const d=await call('GET');users=d.users||[];render()}catch(e){alert(e.message)}};
window.grant=async(uid,days)=>{if(!confirm(`Grant/extend Pro for ${days} days?`))return;try{await call('POST',{action:'grant',uid,days});await loadUsers()}catch(e){alert(e.message)}};
window.revoke=async(uid)=>{if(!confirm('Revoke Pro access?'))return;try{await call('POST',{action:'revoke',uid});await loadUsers()}catch(e){alert(e.message)}};
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('search').addEventListener('input',render);document.getElementById('filter').addEventListener('change',render);
 if(window.auth) window.auth.onAuthStateChanged(async u=>{try{if(!u){document.getElementById('login-msg').textContent='Please login to continue.';return;}await exchange();const d=await call('GET');users=d.users||[];document.getElementById('login').classList.add('hidden');document.getElementById('admin').classList.remove('hidden');document.getElementById('admin-email').textContent=u.email||u.uid;render()}catch(e){document.getElementById('login-msg').textContent='⛔ '+e.message;}});
});
})();