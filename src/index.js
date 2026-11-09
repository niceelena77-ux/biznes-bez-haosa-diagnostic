const J={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:J});
const LIMIT=900000;
function authorized(req,env){const t=req.headers.get('authorization')||'';return !!env.ADMIN_TOKEN && t==='Bearer '+env.ADMIN_TOKEN;}
async function api(req,env,url){
 if(!env.DB)return json({error:'База D1 не подключена'},503);
 if(url.pathname==='/api/results' && req.method==='POST'){
  if(Number(req.headers.get('content-length')||0)>LIMIT)return json({error:'Слишком большой файл'},413);
  let data;try{const raw=await req.text();if(raw.length>LIMIT)return json({error:'Слишком большой файл'},413);data=JSON.parse(raw)}catch{return json({error:'Некорректные данные'},400)}
  if(!data||!Array.isArray(data.answers)||!Array.isArray(data.results)||typeof data.version!=='string'||data.answers.length>10000||data.results.length>10000)return json({error:'Некорректный формат'},400);
  const id=crypto.randomUUID(),created=new Date().toISOString();
  try{await env.DB.prepare('INSERT INTO diagnostic_results(id,created_at,version,body) VALUES(?,?,?,?)').bind(id,created,data.version,JSON.stringify(data)).run()}catch{return json({error:'Не удалось сохранить'},500)}
  return json({id,created_at:created},201);
 }
 if(url.pathname.startsWith('/api/admin/')){
  if(!authorized(req,env))return json({error:'Нет доступа'},401);
  if(url.pathname==='/api/admin/results'&&req.method==='GET'){
   const page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page')||0)||0));
   const {results}=await env.DB.prepare('SELECT id,created_at,version FROM diagnostic_results ORDER BY created_at DESC LIMIT 50 OFFSET ?').bind(page*50).all();
   return json({results,page});
  }
  if(url.pathname==='/api/admin/export'&&req.method==='GET'){
   const id=url.searchParams.get('id');if(!id||id.length>80)return json({error:'Укажите ID'},400);
   const result=await env.DB.prepare('SELECT * FROM diagnostic_results WHERE id=?').bind(id).first();
   if(!result)return json({error:'Не найдено'},404);
   return new Response(JSON.stringify({id:result.id,created_at:result.created_at,...JSON.parse(result.body)},null,2),{headers:{...J,'content-disposition':`attachment; filename="diagnostic-${id}.json"`}});
  }
  if(url.pathname==='/api/admin/export-all'&&req.method==='GET'){
   const rows=await env.DB.prepare('SELECT id,created_at,body FROM diagnostic_results ORDER BY created_at DESC LIMIT 1000').all();
   return new Response(JSON.stringify(rows.results.map(r=>({id:r.id,created_at:r.created_at,...JSON.parse(r.body)})),null,2),{headers:{...J,'content-disposition':'attachment; filename="diagnostic-results.json"'}});
  }
 }
 return json({error:'Не найдено'},404);
}
export default {async fetch(req,env){const url=new URL(req.url);try{
 if(url.pathname.startsWith('/api/'))return await api(req,env,url);
 if(url.pathname==='/admin'||url.pathname==='/admin/')return new Response(ADMIN,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'"}});
 if(!env.ASSETS)return new Response('Static assets not configured',503);
 return env.ASSETS.fetch(req);
 }catch(e){return json({error:'Ошибка сервера'},500)}}};
const ADMIN=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Результаты диагностики</title><style>body{font:17px system-ui;margin:24px auto;padding:0 15px;max-width:760px;color:#17243a}button,input{padding:12px;font:inherit;max-width:100%;margin:5px}button{background:#1e5089;color:white;border:0;border-radius:8px}article{border:1px solid #ccd;border-radius:10px;padding:12px;margin:10px 0}small{color:#657}a{color:#174b85}</style><h1>Результаты диагностики</h1><p>Это закрытая страница организатора. Введите свой секретный ключ администратора. Не отправляйте его участникам.</p><input id="token" type="password" placeholder="Секретный ключ" autocomplete="off"><button onclick="load()">Показать результаты</button><p id="msg"></p><div id="list"></div><button onclick="all()">Скачать все результаты (до 1000)</button><script>
const $=id=>document.getElementById(id);function key(){return $('token').value.trim()}async function get(path){let r=await fetch(path,{headers:{authorization:'Bearer '+key()}});if(!r.ok)throw Error('Ошибка '+r.status+': проверьте ключ и базу');return r}
async function load(){try{let d=await(await get('/api/admin/results')).json();$('list').replaceChildren();$('msg').textContent='Найдено на странице: '+d.results.length;for(const r of d.results){let a=document.createElement('article'),p=document.createElement('p'),b=document.createElement('button');p.textContent='Дата: '+r.created_at+' | Версия: '+r.version+' | № '+r.id;b.textContent='Скачать ответы';b.onclick=()=>download('/api/admin/export?id='+encodeURIComponent(r.id),'diagnostic-'+r.id+'.json');a.append(p,b);$('list').append(a)}}catch(e){$('msg').textContent=e.message}}
async function download(path,name){try{let blob=await(await get(path)).blob(),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}catch(e){$('msg').textContent=e.message}}
function all(){download('/api/admin/export-all','all-diagnostics.json')}
</script></html>`;
