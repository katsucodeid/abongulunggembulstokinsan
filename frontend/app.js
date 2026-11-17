const API=(window.INSAN_CONFIG?.API_BASE||"").replace(/\/$/,"");
const $=id=>document.getElementById(id);
let token=localStorage.getItem("insan_token"), state=null, cachedUser=null;
const DB_NAME="insan-stock-local", STORE="kv", QUEUE="queue";
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);if(!d.objectStoreNames.contains(QUEUE))d.createObjectStore(QUEUE,{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function kvGet(key){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function kvSet(key,value){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put(value,key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
async function kvDelete(key){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).delete(key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
async function queueAll(){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(QUEUE).objectStore(QUEUE).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function queueAdd(op){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(QUEUE,"readwrite");t.objectStore(QUEUE).put(op);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
async function queueRemove(ids){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(QUEUE,"readwrite"),s=t.objectStore(QUEUE);ids.forEach(id=>s.delete(id));t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
function newId(){return (crypto.randomUUID?crypto.randomUUID():"tx-"+Date.now()+"-"+Math.random().toString(36).slice(2));}
function setStatus(text,kind="muted"){$("connection").textContent=text;$("connection").className=kind;}
function applyTheme(theme){const light=theme==="light";const root=document.documentElement;root.classList.toggle("light",light);root.dataset.theme=light?"light":"dark";try{localStorage.setItem("insan_theme",light?"light":"dark");}catch{}const button=$("themeToggle");if(button){button.setAttribute("aria-pressed",String(light));button.textContent=light?"☀️ Tema Terang":"🌙 Tema Gelap";}const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",light?"#fff7ec":"#171b22");}
function themeInit(){let saved="dark";try{saved=localStorage.getItem("insan_theme")||"dark";}catch{}applyTheme(saved);}
function toggleTheme(){applyTheme(document.documentElement.classList.contains("light")?"dark":"light");}
async function api(path,opts={}){const r=await fetch(API+"/api"+path,{...opts,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(opts.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok){const e=new Error(d.error||"Permintaan gagal");e.status=r.status;throw e;}return d;}
function showLogin(){ $("login").classList.remove("hidden");$("app").classList.add("hidden");}
function showApp(){ $("login").classList.add("hidden");$("app").classList.remove("hidden");}
async function checkFirstAdminSetup(){try{const r=await fetch(API+"/api/auth/status");if(!r.ok)return;const d=await r.json();const button=$("bootstrapButton"),hint=$("bootstrapHint");if(button)button.hidden=!d.setupRequired;if(hint)hint.textContent=d.setupRequired?"Database lokal belum memiliki akun. Buat akun admin pertama untuk mulai menggunakan aplikasi.":"Silakan login menggunakan akun yang sudah ada.";}catch{}}
async function createFirstAdmin(){const username=$("username").value.trim(),password=$("password").value;if(username.length<3||password.length<10){$("loginMsg").textContent="Username minimal 3 karakter dan password minimal 10 karakter.";return;}try{const r=await fetch(API+"/api/auth/bootstrap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Gagal membuat admin.");$("loginMsg").textContent="Akun admin dibuat. Silakan login.";await checkFirstAdminSetup();}catch(e){$("loginMsg").textContent=e.message;}}
async function login(){try{const d=await api("/auth/login",{method:"POST",body:JSON.stringify({username:$("username").value,password:$("password").value})});token=d.token;cachedUser=d.user;localStorage.setItem("insan_token",token);await kvSet("user",cachedUser);await refresh();}catch(e){$("loginMsg").textContent=e.message;}}
async function logout(){closeMenu();token=null;cachedUser=null;localStorage.removeItem("insan_token");await kvDelete("user");showLogin();}
async function refresh(){await checkFirstAdminSetup();try{state=await api("/state");await kvSet("state",state);showApp();cachedUser=state.user;await renderAll();setStatus("Tersambung ke database lokal","ok");await syncQueue();}catch(e){if(e instanceof TypeError || !navigator.onLine){state=await kvGet("state");cachedUser=await kvGet("user");if(state&&cachedUser){showApp();await renderAll();setStatus("Offline · perubahan disimpan di perangkat","low");}else{showLogin();$("loginMsg").textContent="Database lokal belum memiliki akun admin. Buat akun admin pertama.";}}else if(e.status===401){showLogin();$("loginMsg").textContent=e.message;}else{state=await kvGet("state");cachedUser=await kvGet("user");if(state&&cachedUser){showApp();await renderAll();setStatus("Database lokal tidak tersedia · periksa aplikasi","low");}else showLogin();}}}
async function renderAll(){if(!state)return;const backupPanel=$("backupPanel");if(backupPanel)backupPanel.hidden=(cachedUser?.role||state.user?.role)!=="admin";syncActiveNav();$("who").textContent=(cachedUser?.username||state.user?.username||"Pengguna")+" · "+(cachedUser?.role||state.user?.role||"offline");renderStock();renderHistory();renderDailyTargets();await loadReport();await maybeAutoDailyReport();const q=await queueAll();$("pendingCount").textContent=q.length?(" · "+q.length+" transaksi menunggu sinkronisasi"):"";checkForUpdates();}
function renderStock(){const defs=state.itemDefs||{};$("stockGrid").innerHTML=Object.entries(state.stock||{}).map(([k,v])=>{const def=defs[k]||{label:k,min:null};return `<div class="panel"><div class="muted">${def.label}</div><div class="qty">${Number(v).toLocaleString("id-ID")} pcs</div><div class="${def.min!==null&&v<def.min?'low':'ok'} muted">${def.min===null?'Batas minimum belum ditetapkan':v<def.min?'Di bawah minimum '+def.min:'Aman · minimum '+def.min}</div></div>`;}).join("");}
function toggleMenu(){const nav=$("mainNav"),backdrop=$("navBackdrop"),btn=$("menuToggle");if(!nav||!backdrop||!btn)return;const open=!nav.classList.contains("open");nav.classList.toggle("open",open);backdrop.classList.toggle("visible",open);btn.setAttribute("aria-expanded",String(open));btn.setAttribute("aria-label",open?"Tutup navigasi":"Buka navigasi");document.body.classList.toggle("nav-open",open);}
function closeMenu(){const nav=$("mainNav"),backdrop=$("navBackdrop"),btn=$("menuToggle");if(!nav||!backdrop||!btn)return;nav.classList.remove("open");backdrop.classList.remove("visible");btn.setAttribute("aria-expanded","false");btn.setAttribute("aria-label","Buka navigasi");document.body.classList.remove("nav-open");}
function toggleNavGroup(id){const panel=$(id),toggle=document.querySelector('.nav-group-toggle[aria-controls="'+id+'"]');if(!panel||!toggle)return;const expanded=toggle.getAttribute("aria-expanded")==="true";toggle.setAttribute("aria-expanded",String(!expanded));panel.classList.toggle("expanded",!expanded);}
function syncActiveNav(){const current=document.querySelector(".tab:not(.hidden)");if(!current)return;document.querySelectorAll("#mainNav button[onclick^='showTab']").forEach(btn=>{const active=btn.getAttribute("onclick").includes("'"+current.id+"'");btn.classList.toggle("nav-active",active);if(active){btn.setAttribute("aria-current","page");const group=btn.closest(".nav-group-items");if(group){group.classList.add("expanded");const toggle=document.querySelector('.nav-group-toggle[aria-controls="'+group.id+'"]');if(toggle)toggle.setAttribute("aria-expanded","true");}}else btn.removeAttribute("aria-current");});}
function showTab(id){const target=$(id);if(!target)return;document.querySelectorAll(".tab").forEach(x=>x.classList.add("hidden"));target.classList.remove("hidden");syncActiveNav();closeMenu();if(id==="report")loadReport();if(id==="history")renderHistory();if(id==="about")loadAbout();}
async function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(blob);});}
async function downloadBackup(){
 const status=$("backupStatus"),button=$("createBackupButton");
 try{
  if(button)button.disabled=true;
  if(status)status.textContent="Menyiapkan cadangan database…";
  if(window.InsanNative?.createLocalBackup&&window.InsanNative?.saveBackup){
   const encoded=window.InsanNative.createLocalBackup();
   if(!encoded||encoded.startsWith("ERROR:"))throw new Error(String(encoded||"Gagal membaca database lokal."));
   const filename="insan-backup-"+new Date().toISOString().replace(/[:.]/g,"-")+".insanbackup";
   const saved=window.InsanNative.saveBackup(encoded,filename);
   if(!saved||saved.startsWith("ERROR:"))throw new Error(saved||"Penyimpanan cadangan gagal.");
   if(status)status.textContent="Cadangan database lokal tersimpan: "+saved+". Tidak memerlukan internet.";
   return;
  }
  if(!token||!navigator.onLine)throw new Error("Fitur cadangan lokal memerlukan APK terbaru. Server tidak tersedia.");
  const response=await fetch(API+"/api/admin/backup",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(!response.ok){let data={};try{data=await response.json();}catch{}throw new Error(data.error||"Gagal membuat cadangan.");}
  const blob=await response.blob(),disposition=response.headers.get("Content-Disposition")||"",match=disposition.match(/filename="([^"]+)"/);
  const filename=match?.[1]||("insan-backup-"+new Date().toISOString().slice(0,10)+".insanbackup");
  if(window.InsanNative?.saveBackup){const saved=window.InsanNative.saveBackup(await blobToBase64(blob),filename);if(!saved||saved.startsWith("ERROR:"))throw new Error(saved||"Penyimpanan gagal.");if(status)status.textContent="Cadangan tersimpan: "+saved;}
  else{const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);if(status)status.textContent="Unduhan dimulai: "+filename;}
 }catch(e){if(status)status.textContent="Gagal membuat cadangan: "+e.message;}
 finally{if(button)button.disabled=false;}
}
async function restoreBackupFile(){
  const input=$("backupFileInput"),status=$("backupStatus"),button=$("restoreBackupButton");
  if(input&&!input.files?.length){input.click();if(status)status.textContent="Pilih file .insanbackup dari penyimpanan perangkat.";return;}
  const file=input?.files?.[0];
  if(!file){if(status)status.textContent="Pilih file .insanbackup terlebih dahulu.";return;}
  if(!file.name.toLowerCase().endsWith(".insanbackup")){if(status)status.textContent="Ekstensi file harus .insanbackup.";return;}
  if(file.size>25*1024*1024){if(status)status.textContent="Ukuran file melebihi batas 25 MB.";return;}
  let backup;
  try{
    backup=JSON.parse(await file.text());
    if(backup?.format!=="INSAN-STOCK-BACKUP"||backup?.formatVersion!==1)throw new Error("Format file tidak dikenali sebagai cadangan INSAN.");
  }catch(e){if(status)status.textContent="File tidak dapat dibaca: "+e.message;return;}
  const confirmed=confirm("PERINGATAN: Pemulihan akan MENGGANTI seluruh data database lokal dengan data dari file ini, termasuk stok, akun, dan transaksi. Aplikasi membuat cadangan kondisi saat ini sebelum pemulihan. Lanjutkan?");
  if(!confirmed)return;
  try{
    if(button)button.disabled=true;
    if(status)status.textContent="Memeriksa file dan memulihkan database…";
    if(window.InsanNative?.restoreLocalBackup){
      const restored=window.InsanNative.restoreLocalBackup(await blobToBase64(file));
      if(!restored||!restored.startsWith("OK:"))throw new Error(String(restored||"Pemulihan lokal gagal."));
      const summary=JSON.parse(restored.slice(3));
      if(status)status.textContent="Pemulihan lokal berhasil. Pengguna: "+summary.users+" · Transaksi: "+summary.transactions+". Cadangan sebelum pemulihan juga disimpan di penyimpanan internal aplikasi.";
    }else{
      if(!token||!navigator.onLine)throw new Error("Pemulihan lokal memerlukan APK terbaru; server tidak tersedia.");
      const result=await api("/admin/restore",{method:"POST",body:JSON.stringify(backup)});
      if(status)status.textContent="Pemulihan lokal berhasil. Pengguna: "+result.summary.users+" · Transaksi: "+result.summary.transactions;
    }
    localStorage.removeItem("insan_token");
    token=null;
    setTimeout(()=>location.reload(),1200);
  }catch(e){if(status)status.textContent="Pemulihan dibatalkan: "+e.message;}
  finally{if(button)button.disabled=false;}
}
async function loadAbout(){
  const versionEl=$("aboutVersion"), list=$("changeLogList"), status=$("changeLogStatus");
  const remoteList=$("latestCommitList"), remoteStatus=$("latestCommitStatus"), applyBtn=$("applyLatestCommit");
  if(!list)return;
  try{
    const data=await api("/update/history");
    if(versionEl)versionEl.textContent="Versi "+(data.version||"—");
    list.replaceChildren();
    (data.commits||[]).forEach(item=>{
      const card=document.createElement("article");card.className="history-card";
      const title=document.createElement("b");title.textContent=item.message||"Pembaruan";
      const meta=document.createElement("div");meta.className="muted";meta.textContent=(item.date||"")+(item.sha?" · "+item.sha:"");
      card.append(title,meta);list.appendChild(card);
    });
    if(status)status.textContent="Riwayat commit yang sudah terpasang · hingga 8 commit terakhir.";
  }catch(e){
    if(status)status.textContent="Riwayat lokal belum tersedia: "+e.message;
  }
  try{
    const remote=await api("/update/commits");
    const commits=remote.commits||[];
    window.insanLatestCommit=commits[0]?.sha||null;
    window.insanUpdateAvailable=!!(window.insanLatestCommit&&window.insanLatestCommit!==remote.current&&(cachedUser?.role||state?.user?.role)==="admin");
    if(remoteList)remoteList.replaceChildren();
    commits.forEach((item,index)=>{
      if(!remoteList)return;
      const card=document.createElement("article");card.className="history-card";
      const title=document.createElement("b");title.textContent=item.message||"Pembaruan";
      const meta=document.createElement("div");meta.className="muted";
      const date=item.date?new Date(item.date).toLocaleString("id-ID"):"Tanggal tidak tersedia";
      meta.textContent=date+" · "+(item.author||"Kontributor")+" · "+item.shortSha+(item.sha===remote.current?" · Terpasang":"");
      card.append(title,meta);
      if(index===0&&item.sha!==remote.current){
        const tag=document.createElement("p");tag.className="muted";tag.textContent="Commit terbaru pada branch main";
        card.appendChild(tag);
      }
      remoteList.appendChild(card);
    });
    if(remoteStatus)remoteStatus.textContent=commits.length
      ?(remote.current===commits[0].sha?"Aplikasi sudah berada pada commit terbaru.":"Ditemukan "+commits.length+" commit terbaru dari GitHub.")
      :"Belum ada commit yang dapat ditampilkan.";
    if(applyBtn){
      const admin=(cachedUser?.role||state?.user?.role)==="admin";
      applyBtn.hidden=!admin||!window.insanUpdateAvailable;
      applyBtn.disabled=!window.insanUpdateAvailable;
      applyBtn.textContent=window.insanUpdateAvailable?"Terapkan commit terbaru":"Sudah menggunakan commit terbaru";
    }
  }catch(e){
    window.insanLatestCommit=null;window.insanUpdateAvailable=false;
    if(remoteStatus)remoteStatus.textContent="Gagal mengambil commit dari GitHub: "+e.message;
    if(applyBtn)applyBtn.hidden=true;
  }
}

document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu();});
function renderHistory(){
const filter=$("historyFilter")?$("historyFilter").value:"all";
const list=(state.history||[]).filter(x=>filter==="all"||x.type===filter);
const admin=(cachedUser?.role||state.user?.role)==="admin";
const username=cachedUser?.username||state.user?.username;
const root=$("historyList");root.innerHTML="";
list.forEach(x=>{
const card=document.createElement("article");card.className="history-card";
const title=document.createElement("b");
title.textContent=x.type==="stock-in"?"Barang masuk":x.type==="stock-out"?"Pengurangan stok manual":x.type==="stock-correction"?"Koreksi pengurangan stok":"Target produksi";
card.appendChild(title);
const meta=document.createElement("div");meta.className="muted";meta.textContent=(x.date||"")+" · Oleh: "+(x.createdBy||"-");card.appendChild(meta);
const detail=document.createElement("div");detail.className="detail";
const l=x.lines||{};
if(x.type==="stock-in")detail.textContent="Barang: "+(state.itemDefs?.[l.item]?.label||l.item)+" · Total masuk: "+(l.total||0)+" pcs";
else if(x.type==="stock-out")detail.textContent="Barang: "+(state.itemDefs?.[l.item]?.label||l.item)+" · Dikurangi awal: "+(l.quantity||0)+" pcs · Alasan: "+(l.reason||x.note||"-");
else if(x.type==="stock-correction"){
const label=state.itemDefs?.[l.item]?.label||l.item;
const direction=Number(l.returnedDelta||0)>0?"Stok dikembalikan: +"+l.returnedDelta+" pcs":"Pengurangan ditambahkan: "+l.returnedDelta+" pcs";
detail.textContent="Barang: "+label+" · Pengurangan awal: "+(l.originalQuantity||0)+" pcs · Pengurangan benar: "+(l.correctedQuantity||0)+" pcs · "+direction+" · Alasan: "+(l.reason||x.note||"-")+" · ID transaksi awal: "+(l.targetTransactionId||"-");
}else detail.textContent="Outlet: "+(x.location||"-")+" · Ori: "+(l.ori||0)+" · Beef: "+(l.beef||0)+" · Spicy: "+(l.spicy||0)+" · Cheese: "+(l.cheese||0)+" · Total: "+(l.total||0)+" loyang"+(l.requestNote?" · Request: "+l.requestNote:"");
if(x.note&&x.type!=="stock-correction")detail.textContent+=" · Catatan: "+x.note;
card.appendChild(detail);
if(x.type==="stock-out"&&(admin||x.createdBy===username)){
const actions=document.createElement("div");actions.className="row";
const revise=document.createElement("button");revise.className="secondary";revise.textContent="Revisi jumlah";revise.onclick=()=>correctManualStockOut(x.id,"revise");actions.appendChild(revise);
const addBack=document.createElement("button");addBack.className="secondary";addBack.textContent="Kembalikan sebagian";addBack.onclick=()=>correctManualStockOut(x.id,"return");actions.appendChild(addBack);
const reverse=document.createElement("button");reverse.className="danger";reverse.textContent="Batalkan pengurangan";reverse.onclick=()=>correctManualStockOut(x.id,"reverse");actions.appendChild(reverse);
card.appendChild(actions);
}
if(admin){const btn=document.createElement("button");btn.className="danger";btn.textContent="Hapus transaksi";btn.onclick=()=>deleteTransaction(x.id);card.appendChild(btn);}
root.appendChild(card);
});
if(!list.length)root.textContent="Belum ada riwayat pada filter ini.";
}
async function correctManualStockOut(id,action){
const original=(state?.history||[]).find(x=>x.id===id&&x.type==="stock-out");
if(!original)return alert("Transaksi pengurangan tidak ditemukan. Muat ulang data.");
if(!token)return alert("Login kembali untuk mengoreksi transaksi.");
try{
const queued=await queueAll();
if(queued.length)return alert("Masih ada transaksi offline yang belum tersinkron. Sinkronkan dahulu agar koreksi memakai data stok terbaru.");
const l=original.lines||{},quantity=Number(l.quantity||0);
const corrections=(state.history||[]).filter(x=>x.type==="stock-correction"&&x.lines?.targetTransactionId===id);
const alreadyReturned=corrections.reduce((sum,x)=>sum+Number(x.lines?.returnedDelta||0),0);
const currentReduction=quantity-alreadyReturned;
let correctedQuantity=0;
if(action==="revise"){
const value=prompt("Jumlah pengurangan yang benar untuk "+(state.itemDefs?.[l.item]?.label||l.item)+" (pcs). Isi 0 untuk membatalkan seluruh pengurangan.",String(currentReduction));
if(value===null)return;
correctedQuantity=Number(value);
if(!Number.isSafeInteger(correctedQuantity)||correctedQuantity<0||correctedQuantity>quantity)throw new Error("Masukkan bilangan bulat antara 0 dan "+quantity+".");
}else if(action==="return"){
const value=prompt("Berapa pcs yang ingin dikembalikan ke stok? Sisa pengurangan saat ini: "+currentReduction+" pcs.",String(currentReduction));
if(value===null)return;
const returned=Number(value);
if(!Number.isSafeInteger(returned)||returned<=0||returned>currentReduction)throw new Error("Masukkan jumlah antara 1 dan "+currentReduction+".");
correctedQuantity=currentReduction-returned;
}else correctedQuantity=0;
const reason=prompt("Tuliskan alasan koreksi stok (wajib).");
if(reason===null)return;
if(reason.trim().length<3)throw new Error("Alasan koreksi wajib diisi minimal 3 karakter.");
const actionText=action==="revise"?"Revisi pengurangan menjadi "+correctedQuantity+" pcs":action==="return"?"Kembalikan sebagian stok":"Batalkan seluruh pengurangan";
if(!confirm(actionText+"? Stok akan disesuaikan dan koreksi dicatat di riwayat."))return;
const data=await api("/transactions/"+encodeURIComponent(id)+"/corrections",{method:"POST",body:JSON.stringify({correctionId:newId(),action,quantity:action==="return"?currentReduction-correctedQuantity:correctedQuantity,reason:reason.trim()})});
state=data.state;await kvSet("state",state);await renderAll();
alert(data.duplicate?"Koreksi ini sudah pernah diproses.":"Koreksi stok berhasil disimpan.");
}catch(e){alert("Koreksi gagal: "+e.message);}
}
async function deleteTransaction(id){if(!id||!confirm("Yakin menghapus transaksi ini? Stok akan dikembalikan otomatis. Tindakan ini tidak dapat dibatalkan."))return;try{const d=await api("/transactions/"+encodeURIComponent(id),{method:"DELETE"});state=d.state;await kvSet("state",state);await renderAll();$("syncErrors").textContent="Transaksi dihapus; perubahan stok sudah dibatalkan.";showTab("history");}catch(e){alert("Gagal menghapus transaksi: "+e.message);}}
function applyLocal(op){const p=op.payload;let changes={};if(op.type==="stock-in"){const total=(p.packs||0)*(p.perPack||0)+(p.extra||0);changes[p.item]=total;}else if(op.type==="stock-out"){changes[p.item]=-(p.quantity||0);}else{const total=(p.ori||0)+(p.beef||0)+(p.spicy||0)+(p.cheese||0);if(p.custom?.enabled){changes={box3:-(p.custom.box3||0),box5outer:-(p.custom.box5||0),box5inner:-(p.custom.box5||0),paper:-(p.custom.box5||0)};}else{const use=total*2;changes={box3:-use,box5outer:-use,box5inner:-use,paper:-use};}}
for(const [k,d] of Object.entries(changes)){if(!Number.isSafeInteger(d)||!Number.isSafeInteger(state.stock[k]+d)||state.stock[k]+d<0)throw Error("Stok lokal "+k+" tidak mencukupi.");}
for(const [k,d] of Object.entries(changes))state.stock[k]+=d;
state.history.unshift({id:op.id,type:op.type,date:p.date||new Date().toISOString().slice(0,10),location:p.location||"",lines:op.type==="stock-in"?{item:p.item,packs:p.packs,perPack:p.perPack,extra:p.extra}:p,changes,createdBy:cachedUser?.username||"offline",createdAt:new Date().toISOString()});state.history=state.history.slice(0,30);}
async function submitOperation(type,payload,msgId){const op={id:newId(),type,payload};try{const d=await api("/sync",{method:"POST",body:JSON.stringify({operations:[op]})});if(d.rejected?.length){const rejected=new Error(d.rejected[0].error);rejected.status=409;throw rejected;}state=d.state;await kvSet("state",state);$(msgId).textContent="Tersimpan ke database lokal.";}catch(e){if(!(e instanceof TypeError))throw e;applyLocal(op);await queueAdd(op);await kvSet("state",state);$(msgId).textContent="Server lokal belum tersedia. Perubahan sementara disimpan di antrean perangkat.";}await renderAll();}
async function stockIn(){try{await submitOperation("stock-in",{item:$("inItem").value,packs:+$("packs").value,perPack:+$("perPack").value,extra:+$("extra").value,note:$("inNote").value},"inMsg");}catch(e){$("inMsg").textContent=e.message;}}
let editingTargetId=null;
const pvars=["ori","beef","spicy","cheese"];
const plabel={ori:"Ori",beef:"Beef",spicy:"Spicy",cheese:"Cheese"};
function packData(){const o={};pvars.forEach(k=>{const n=plabel[k],on=$("packCustom"+n).checked;o[k]={enabled:on,box3:on?Number($("packBox3"+n).value):0,box5:on?Number($("packBox5"+n).value):0};});return o;}
function productionPreview(){let total=0,b3=0,b5=0,details=[];pvars.forEach(k=>{const q=Math.max(0,Number($(k).value)||0),n=plabel[k],on=$("packCustom"+n).checked,x3=on?(Number($("packBox3"+n).value)||0):q*2,x5=on?(Number($("packBox5"+n).value)||0):q*2;total+=q;b3+=x3;b5+=x5;if(q)details.push(n+": "+q+" loyang ("+x5+" Box isi 5, "+x3+" Box isi 3)");});$("productionPreview").textContent="Total "+total+" loyang · "+(details.join(" | ")||"Isi jumlah loyang")+". Pengurangan: Box isi 3 "+b3+", Box isi 5 luar/dalam "+b5+", Kertas Minyak "+b5+".";}
pvars.forEach(k=>{const n=plabel[k];[k,"packBox3"+n,"packBox5"+n].forEach(id=>$(id).addEventListener("input",productionPreview));$("packCustom"+n).addEventListener("change",()=>{$("packFields"+n).classList.toggle("hidden",!$("packCustom"+n).checked);productionPreview();});});
$("prodDate").addEventListener("change",()=>{renderDailyTargets();renderTargetSource();});
function renderTargetSource(){const s=$("targetSource");if(!s||!state)return;const prev=s.value,rows=(state.history||[]).filter(x=>x.type==="production"&&x.date===$("prodDate").value);s.innerHTML='<option value="">Pilih target tanggal ini</option>';rows.forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=(x.location||"Outlet")+" · "+(x.lines?.total||0)+" loyang";s.appendChild(o);});if(rows.some(x=>x.id===prev))s.value=prev;}
function loadTargetForRequest(){const id=$("targetSource").value,tx=(state?.history||[]).find(x=>x.id===id&&x.type==="production");if(!tx){$("editTargetMsg").textContent="Pilih target produksi.";return;}const l=tx.lines||{},packs=l.packagingByVariant||{};$("prodDate").value=tx.date||$("prodDate").value;$("location").value=tx.location||"";pvars.forEach(k=>{const n=plabel[k],p=packs[k];$(k).value=Number(l[k]||0);$("packCustom"+n).checked=!!p?.enabled;$("packFields"+n).classList.toggle("hidden",!p?.enabled);$("packBox3"+n).value=Number(p?.box3||0);$("packBox5"+n).value=Number(p?.box5||0);});$("requestNote").value=l.requestNote||"";$("prodNote").value=tx.note||"";editingTargetId=tx.id;$("prodSubmit").textContent="Simpan perubahan target";$("editTargetMsg").textContent="Edit target "+tx.location+". Kemasan dapat diatur per varian.";productionPreview();renderDailyTargets();}
async function production(){try{const vals=pvars.map(k=>Number($(k).value));if(vals.some(v=>!Number.isSafeInteger(v)||v<0)||vals.reduce((a,b)=>a+b,0)<=0)throw Error("Isi setidaknya satu jumlah loyang yang valid.");if(!$("location").value)throw Error("Pilih outlet terlebih dahulu.");const packagingByVariant=packData();for(const k of pvars){const p=packagingByVariant[k];if(p.enabled&&(!Number.isSafeInteger(p.box3)||p.box3<0||!Number.isSafeInteger(p.box5)||p.box5<0))throw Error("Jumlah kemasan "+plabel[k]+" tidak valid.");}const payload={date:$("prodDate").value,location:$("location").value,ori:vals[0],beef:vals[1],spicy:vals[2],cheese:vals[3],packagingByVariant,requestNote:$("requestNote").value.trim(),note:$("prodNote").value};if(editingTargetId){const d=await api("/transactions/"+encodeURIComponent(editingTargetId),{method:"PUT",body:JSON.stringify(payload)});state=d.state;await kvSet("state",state);$("prodMsg").textContent="Target diperbarui dan stok disesuaikan berdasarkan selisih.";}else await submitOperation("production",payload,"prodMsg");editingTargetId=null;$("prodSubmit").textContent="Tambah target outlet";pvars.forEach(k=>{const n=plabel[k];$(k).value=0;$("packCustom"+n).checked=false;$("packFields"+n).classList.add("hidden");$("packBox3"+n).value=0;$("packBox5"+n).value=0;});$("location").value="";$("requestNote").value="";$("prodNote").value="";$("targetSource").value="";productionPreview();await renderAll();}catch(e){$("prodMsg").textContent=e.message;}}
async function manualStockOut(){try{const quantity=Number($("outQuantity").value);const reason=$("outReason").value.trim();if(!Number.isSafeInteger(quantity)||quantity<=0)throw Error("Jumlah pengurangan harus bilangan bulat lebih dari nol.");if(!reason)throw Error("Alasan pengurangan wajib diisi.");if(!confirm("Kurangi stok "+quantity+" pcs? Pastikan barang dan alasan sudah benar."))return;await submitOperation("stock-out",{item:$("outItem").value,quantity,note:reason,reason,date:new Date().toISOString().slice(0,10)},"outMsg");$("outQuantity").value="";$("outReason").value="";}catch(e){$("outMsg").textContent=e.message;}}
function renderDailyTargets(){
const box=$("targetDailyReport");if(!box||!state)return;
const date=$("prodDate").value;
const rows=(state.history||[]).filter(x=>x.type==="production"&&x.date===date).slice().sort((x,y)=>String(x.createdAt||"").localeCompare(String(y.createdAt||"")));
renderTargetSource();
const groups=new Map();
rows.forEach(x=>{
const name=x.location||"Outlet tidak diketahui";
if(!groups.has(name))groups.set(name,{Ori:0,Beef:0,Spicy:0,Cheese:0,total:0});
const g=groups.get(name),l=x.lines||{};
g.Ori+=Number(l.ori||0);g.Beef+=Number(l.beef||0);g.Spicy+=Number(l.spicy||0);g.Cheese+=Number(l.cheese||0);
g.total+=Number(l.ori||0)+Number(l.beef||0)+Number(l.spicy||0)+Number(l.cheese||0);
});
box.innerHTML="";
const heading=document.createElement("b");heading.textContent="Rekap target · "+(date||"-");box.appendChild(heading);
if(!groups.size){const p=document.createElement("p");p.className="muted";p.textContent="Belum ada target untuk tanggal ini.";box.appendChild(p);return;}
groups.forEach((variants,outlet)=>{
const card=document.createElement("section");card.className="outlet-target-card";
const top=document.createElement("div");top.className="outlet-target-heading";
const h=document.createElement("h3");h.textContent=outlet;
const total=document.createElement("strong");total.textContent="Total "+variants.total.toLocaleString("id-ID")+" Loyang";
top.append(h,total);card.appendChild(top);
Object.entries(variants).filter(([name,count])=>name!=="total"&&count>0).forEach(([variant,count])=>{
const line=document.createElement("div");line.className="outlet-target-line";
const name=document.createElement("span");name.textContent=variant;
const qty=document.createElement("strong");qty.textContent=count.toLocaleString("id-ID")+" Loyang";
line.append(name,qty);card.appendChild(line);
});
box.appendChild(card);
});
}
async function checkForUpdates(){if(!token||!navigator.onLine)return;try{const d=await api("/update/check");if(d.available){window.insanLatestCommit=d.latest;window.insanUpdateAvailable=(cachedUser?.role||state?.user?.role)==="admin";$("updateNotice").classList.remove("hidden");$("updateTitle").textContent="Pembaruan INSAN tersedia";const admin=(cachedUser?.role||state?.user?.role)==="admin";$("updateMessage").textContent=d.message+(admin?" · Tekan tombol untuk memperbarui.":" · Hubungi admin untuk memasang pembaruan.");$("updateButton").hidden=!admin;window.insanUpdateAvailable=admin;}else{$("updateNotice").classList.add("hidden");window.insanUpdateAvailable=false;window.insanLatestCommit=null;}}catch(e){/* update check is optional while offline */}}
async function applyUpdate(commitSha=window.insanLatestCommit){if(!window.insanUpdateAvailable||!commitSha)return;if((await queueAll()).length){alert("Sinkronkan transaksi yang masih tertunda sebelum memperbarui aplikasi.");return;}if(!confirm("Terapkan commit "+commitSha.slice(0,7)+" dari GitHub? Server akan dimulai ulang otomatis. Data stok dan riwayat tetap disimpan."))return;try{$("updateButton").disabled=true;$("updateButton").textContent="Memperbarui…";const d=await api("/update/apply",{method:"POST",body:JSON.stringify({commitSha})});$("updateMessage").textContent=d.message+" Halaman akan tersambung kembali setelah server aktif.";$("updateButton").textContent="Menunggu server…";setTimeout(()=>{let attempts=0;const watcher=setInterval(async()=>{attempts++;try{const status=await api("/update/check");if(status.current===commitSha){clearInterval(watcher);location.reload();}}catch(e){}if(attempts>=120){clearInterval(watcher);$("updateButton").disabled=false;$("updateButton").textContent="Periksa dan coba lagi";$("updateMessage").textContent="Pembaruan otomatis tidak tersedia pada APK mandiri. Pasang APK versi terbaru untuk memperbarui aplikasi."; }},3000);},5000);}catch(e){$("updateButton").disabled=false;$("updateButton").textContent="Update Sekarang";alert("Pembaruan gagal dimulai: "+e.message);}}
async function syncQueue(){if(!token)return;const queue=await queueAll();if(!queue.length)return;try{const d=await api("/sync",{method:"POST",body:JSON.stringify({operations:queue.slice(0,100)})});await queueRemove(d.accepted.map(x=>x.id));state=d.state;await kvSet("state",state);if(d.rejected.length){setStatus(d.rejected.length+" transaksi perlu diperiksa: stok server berubah","low");$("syncErrors").textContent=d.rejected.map(x=>x.error).join(" · ");}else{setStatus("Antrean transaksi tersimpan ke database lokal","ok");$("syncErrors").textContent="";}await renderAll();}catch(e){setStatus("Belum dapat sinkron · data aman tersimpan lokal","low");}}
function buildDailyProductionReport(dateKey){
 if(!state||!dateKey)throw new Error("Data stok atau tanggal laporan belum tersedia.");
 const fmt=n=>Number(n||0).toLocaleString("id-ID");
 const names={box3:"Box isi 3",box5outer:"Box isi 5 luar",box5inner:"Box isi 5 dalam",paper:"Kertas Minyak",mika:"Mika roti roll"};
 const all=(state.history||[]).filter(tx=>tx&&tx.date);
 const day=all.filter(tx=>tx.date===dateKey).sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
 const later=all.filter(tx=>String(tx.date)>dateKey);
 const keys=Object.keys(names),daily=Object.fromEntries(keys.map(k=>[k,0])),future=Object.fromEntries(keys.map(k=>[k,0])),used=Object.fromEntries(keys.map(k=>[k,0]));
 for(const tx of all){
  const target=tx.date===dateKey?daily:String(tx.date)>dateKey?future:null;
  if(!target)continue;
  for(const [key,delta] of Object.entries(tx.changes||{}))if(Object.hasOwn(target,key)&&Number.isSafeInteger(delta))target[key]+=delta;
 }
 for(const tx of day){
  if(!["production","stock-out","stock-correction"].includes(tx.type))continue;
  for(const [key,delta] of Object.entries(tx.changes||{}))if(Object.hasOwn(used,key)&&Number.isSafeInteger(delta)){if(delta<0)used[key]+=Math.abs(delta);else if(tx.type==="stock-correction")used[key]=Math.max(0,used[key]-delta);}
 }
 const closing={},opening={};
 for(const key of keys){closing[key]=Number(state.stock?.[key]||0)-future[key];opening[key]=closing[key]-daily[key];}
 const [year,month,date]=dateKey.split("-").map(Number);
 const dateLabel=new Date(year,month-1,date,12).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}).toLowerCase();
 const order=["Harapan Indah","Grand Wisata","Bektim"],variants=[["ori","Ori"],["beef","Beef"],["spicy","Spicy"],["cheese","Cheese"]];
 const groups=new Map();
 for(const tx of day.filter(x=>x.type==="production")){
  const outlet=tx.location||"Outlet tidak diketahui";
  if(!groups.has(outlet))groups.set(outlet,[]);
  groups.get(outlet).push(tx);
 }
 const outlets=[...order.filter(x=>groups.has(x)),...Array.from(groups.keys()).filter(x=>!order.includes(x))];
 const lines=["Target ( "+dateLabel+" )",""];
 if(!outlets.length)lines.push("Belum ada target produksi pada tanggal ini.","");
 for(const outlet of outlets){
  const rows=groups.get(outlet),totals=Object.fromEntries(variants.map(([k])=>[k,0]));
  for(const tx of rows)for(const [key] of variants)totals[key]+=Number(tx.lines?.[key]||0);
  const total=Object.values(totals).reduce((a,b)=>a+b,0);
  lines.push("› "+outlet+" | Total "+fmt(total)+" Loyang","");
  for(const [key,label] of variants)if(totals[key]>0)lines.push("~ "+label+" - "+fmt(totals[key])+" Loyang");
  lines.push("-----------------------------","");
 }
 lines.push("Stok Sebelumnya:","");
 for(const key of keys)lines.push(names[key]+" : "+fmt(opening[key])+"pcs");
 lines.push("","Jumlah Stok Terpakai:");
 const usedRows=keys.filter(k=>used[k]>0);
 if(!usedRows.length)lines.push("- Tidak ada pemakaian stok tercatat.");
 else for(const key of usedRows)lines.push("- "+names[key]+" : "+fmt(used[key])+"pcs");
 const incoming=Object.fromEntries(keys.map(k=>[k,0]));
 for(const tx of day.filter(x=>x.type==="stock-in"))for(const [key,delta] of Object.entries(tx.changes||{}))if(Object.hasOwn(incoming,key)&&Number.isSafeInteger(delta)&&delta>0)incoming[key]+=delta;
 if(keys.some(k=>incoming[k]>0)){lines.push("","Barang Masuk:");for(const key of keys)if(incoming[key]>0)lines.push("+ "+names[key]+" : "+fmt(incoming[key])+"pcs");}
 lines.push("","Jumlah:","");
 for(const key of keys){
  const expression=incoming[key]>0?fmt(opening[key])+" + "+fmt(incoming[key])+" - "+fmt(used[key]):fmt(opening[key])+" - "+fmt(used[key]);
  lines.push(names[key]+" : "+expression+" = "+fmt(closing[key])+"pcs");
 }
 const outs=day.filter(x=>x.type==="stock-out");
 lines.push("","Pengurangan Stok Diluar Target:");
 if(!outs.length)lines.push("- Tidak ada pengurangan stok manual.");
 else for(const tx of outs){
  const item=names[tx.lines?.item]||tx.lines?.item||"Barang";
  const corrections=day.filter(x=>x.type==="stock-correction"&&x.lines?.targetTransactionId===tx.id);
  const effective=Math.max(0,Number(tx.lines?.quantity||0)-corrections.reduce((sum,x)=>sum+Number(x.lines?.returnedDelta||0),0));
  lines.push("- "+item+" : "+fmt(effective)+"pcs"+(tx.lines?.reason||tx.note?" · "+(tx.lines?.reason||tx.note):""));
 }
 lines.push("","Keterangan: Laporan Ini Dibuat Otomatis","");
 return lines.join("\n");
}
function isValidReportDate(dateKey){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||"")))return false;
 const [year,month,day]=dateKey.split("-").map(Number);
 const check=new Date(Date.UTC(year,month-1,day));
 return check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&check.getUTCDate()===day;
}
function generateDailyProductionReport(){
 const dateKey=$("dailyReportDate")?.value;
 try{
  if(!isValidReportDate(dateKey))throw new Error("Pilih tanggal laporan yang valid terlebih dahulu.");
  $("dailyProductionReportText").value=buildDailyProductionReport(dateKey);
  $("dailyProductionReportStatus").textContent="Pratinjau laporan tanggal "+dateKey+" siap. Tekan Buat / Perbarui untuk menyimpan file tanggal tersebut.";
 }
 catch(e){
  if($("dailyProductionReportText"))$("dailyProductionReportText").value="";
  $("dailyProductionReportStatus").textContent="Gagal membuat laporan: "+e.message;
 }
}
function wibDateParts(){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 return Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
}
function wibDateKey(){const p=wibDateParts();return p.year+"-"+p.month+"-"+p.day;}
function dailyReportFilename(dateKey){
 const [year,month,day]=dateKey.split("-").map(Number);
 const months=["januari","februari","maret","april","mei","juni","juli","agustus","september","oktober","november","desember"];
 return day+months[month-1]+year+".txt";
}
async function saveDailyProductionReport(automatic=false){
 const dateKey=automatic?wibDateKey():($("dailyReportDate")?.value||wibDateKey());
 const status=$("dailyProductionReportStatus");
 try{
  if(!$("dailyProductionReportText"))return false;
  if(!isValidReportDate(dateKey))throw new Error("Pilih tanggal laporan yang valid terlebih dahulu.");
  $("dailyReportDate").value=dateKey;
  const content=buildDailyProductionReport(dateKey);
  $("dailyProductionReportText").value=content;
  const filename=dailyReportFilename(dateKey);
  const blob=new Blob(["\uFEFF",content+"\n"],{type:"text/plain;charset=utf-8"});
  if(window.InsanNative?.saveDailyReport){
   const saved=window.InsanNative.saveDailyReport(await blobToBase64(blob),filename);
   if(!saved||!saved.startsWith("OK:"))throw new Error(String(saved||"Penyimpanan laporan gagal."));
   if(status)status.textContent=(automatic?"Laporan otomatis":"Laporan berhasil dibuat / diperbarui")+": Download/Abon Gulung Gembul/Laporan/"+filename+" · file dengan tanggal yang sama ditimpa, bukan dibuat sebagai salinan baru.";
  }else{
   const url=URL.createObjectURL(blob),link=document.createElement("a");
   link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   if(status)status.textContent=(automatic?"Laporan otomatis disiapkan":"Laporan dibuat")+". Unduhan "+filename+" dimulai. Browser dapat menambahkan akhiran (1) karena pembatasan unduhan; penimpaan file yang sudah ada dijamin melalui aplikasi Android.";
  }
  if(automatic)localStorage.setItem("insan_daily_report_auto_"+dateKey,"saved");
  return true;
 }catch(e){if(status)status.textContent="Gagal membuat/menyimpan laporan: "+(e.message||e);return false;}
}
function downloadDailyProductionReportTxt(){return saveDailyProductionReport(false);}
async function maybeAutoDailyReport(){
 if(!state)return;
 const p=wibDateParts(),dateKey=p.year+"-"+p.month+"-"+p.day;
 if(Number(p.hour)<18||localStorage.getItem("insan_daily_report_auto_"+dateKey)==="saved")return;
 await saveDailyProductionReport(true);
}
function formatManualStockOutReport(rows){
 const fmt=n=>Number(n||0).toLocaleString("id-ID");
 const lines=["","========================================","RIWAYAT PENGURANGAN STOK MANUAL","========================================"];
 if(!rows.length){lines.push("Belum ada transaksi pengurangan stok manual.");return lines.join("\n");}
 rows.forEach((tx,index)=>{
  const item=state?.itemDefs?.[tx.item]?.label||tx.item||"Barang tidak diketahui";
  lines.push("",(index+1)+". Tanggal: "+(tx.date||"-"),"   Barang: "+item,"   Jumlah dikurangi: "+fmt(tx.quantity)+" pcs","   Alasan: "+(tx.reason||tx.note||"-"),"   Dicatat oleh: "+(tx.createdBy||"-"),"   ID transaksi: "+(tx.id||"-"));
  (tx.corrections||[]).forEach((c,i)=>{
   lines.push("   Koreksi "+(i+1)+": "+(c.date||"-")+" · jumlah benar "+fmt(c.correctedQuantity)+" pcs · pengembalian "+fmt(c.returnedDelta)+" pcs","   Alasan koreksi: "+(c.reason||"-"),"   Dikoreksi oleh: "+(c.createdBy||"-"));
  });
 });
 return lines.join("\n");
}
async function loadReport(){
 if(!state)return;
 const s=state.stock,fmt=n=>Number(n||0).toLocaleString("id-ID");
 let manualRows=(state.history||[]).filter(tx=>tx.type==="stock-out").map(tx=>({id:tx.id,date:tx.date,createdAt:tx.createdAt,createdBy:tx.createdBy,item:tx.lines?.item,quantity:tx.lines?.quantity,reason:tx.lines?.reason||tx.note,corrections:(state.history||[]).filter(c=>c.type==="stock-correction"&&c.lines?.targetTransactionId===tx.id).map(c=>({date:c.date,createdBy:c.createdBy,correctedQuantity:c.lines?.correctedQuantity,returnedDelta:c.lines?.returnedDelta,reason:c.lines?.reason||c.note}))}));
 if(token&&navigator.onLine){
  try{const report=await api("/report");if(Array.isArray(report.manualStockOuts))manualRows=report.manualStockOuts;}catch(e){/* use cached history while offline/server is unavailable */}
 }
 const stockText=`*INSAN*:
Box isi 3 : ${fmt(s.box3)}pcs
Box isi 5 luar : ${fmt(s.box5outer)}pcs
Box isi 5 dalam : ${fmt(s.box5inner)}pcs
Kertas Minyak: ${fmt(s.paper)}pcs
Mika roti roll : ${fmt(s.mika)}pcs`;
 $("reportText").value=stockText+formatManualStockOutReport(manualRows);
}
async function downloadManualStockReportTxt(){
 let manualRows=(state?.history||[]).filter(tx=>tx.type==="stock-out").map(tx=>({id:tx.id,date:tx.date,createdBy:tx.createdBy,item:tx.lines?.item,quantity:tx.lines?.quantity,reason:tx.lines?.reason||tx.note,corrections:(state.history||[]).filter(c=>c.type==="stock-correction"&&c.lines?.targetTransactionId===tx.id).map(c=>({date:c.date,createdBy:c.createdBy,correctedQuantity:c.lines?.correctedQuantity,returnedDelta:c.lines?.returnedDelta,reason:c.lines?.reason||c.note}))}));
 if(token&&navigator.onLine){try{const report=await api("/report");if(Array.isArray(report.manualStockOuts))manualRows=report.manualStockOuts;}catch(e){/* cached history remains available */}}
 let reportText=$("reportText").value;
 if(!reportText.includes("RIWAYAT PENGURANGAN STOK MANUAL"))reportText+="\n"+formatManualStockOutReport(manualRows);
 const content="LAPORAN STOK INSAN\nDibuat: "+new Date().toLocaleString("id-ID")+"\n\n"+reportText+"\n";
 const blob=new Blob(["\uFEFF",content],{type:"text/plain;charset=utf-8"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="laporan-stok-insan-"+new Date().toISOString().slice(0,10)+".txt";
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function generateFullStockReport(){
const source=$("stockOpnameInput").value;
if(!source.trim()){ $("stockOpnameMsg").textContent="Tempel pesan stock opname terlebih dahulu."; return; }
const section=/\*INSAN\*:[\s\S]*?(?=\n(?:_{5,}|-{5,})|$)/i;
if(!section.test(source)){ $("stockOpnameMsg").textContent="Bagian *INSAN* tidak ditemukan. Pastikan pesan memiliki judul *INSAN*:. Tidak ada teks yang diubah."; return; }
const s=state?.stock;
if(!s){ $("stockOpnameMsg").textContent="Data stok belum tersedia. Hubungkan ke server lalu perbarui data."; return; }
const fmt=n=>Number(n||0).toLocaleString("id-ID");
const replacement=`*INSAN*:
Box isi 3 : ${fmt(s.box3)}pcs
Box isi 5 luar : ${fmt(s.box5outer)}pcs
Box isi 5 dalam : ${fmt(s.box5inner)}pcs
Kertas Minyak: ${fmt(s.paper)}pcs
Mika roti roll : ${fmt(s.mika)}pcs`;
$("reportText").value=source.replace(section,replacement);
$("stockOpnameMsg").textContent="Berhasil! Hanya bagian *INSAN* yang diperbarui menggunakan stok terbaru dari database.";
}
async function copyReport(){try{await navigator.clipboard.writeText($("reportText").value);alert("Laporan disalin.");}catch{$("reportText").select();document.execCommand("copy");alert("Laporan disalin.");}}
function updateLiveClock(){const now=new Date();const time=$("liveClock"),date=$("liveDate");if(time)time.textContent=new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(now);if(date)date.textContent=new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(now);}
themeInit();updateLiveClock();setInterval(updateLiveClock,1000);setInterval(()=>{maybeAutoDailyReport();},60000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)maybeAutoDailyReport();});
$("prodDate").value=new Date().toISOString().slice(0,10);
{$("dailyReportDate").value=wibDateKey();}
if("serviceWorker" in navigator && location.protocol!=="file:")navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).catch(()=>{});
window.addEventListener("online",()=>{setStatus("Koneksi tersedia · memperbarui data…");refresh();});

// Alarm tab terpisah + pustaka nada lokal.
let workAlarmTimer=null,workAlarmAudio=null,workAlarmRinging=false,alarmTestTimer=null,alarmPreviewAudio=null,alarmPreviewId=null;
const WORK_ALARM_KEY="insan_work_alarm_v1",ALARM_TONE_KEY="insan_alarm_tone_v1",ALARM_TONE_DATA_KEY="insan_alarm_tone_data_v1";
const ALARM_TONES={gentle:{name:"Lonceng Lembut",notes:[659,784,988,784,880,988],wave:"sine"},digital:{name:"Digital Pulse",notes:[880,0,1175,0,880,0,1175],wave:"square"},classic:{name:"Alarm Klasik",notes:[740,740,0,988,988,0,740,988],wave:"triangle"},sunrise:{name:"Sunrise Chime",notes:[523,659,784,1047,784,659],wave:"sine"},softbell:{name:"Soft Bell",notes:[784,988,1175,988,784],wave:"sine"},retro:{name:"Retro Arcade",notes:[988,784,659,784,988,1175],wave:"square"},doubletone:{name:"Double Tone",notes:[880,880,0,659,659,0,880,880],wave:"triangle"},nature:{name:"Morning Birds",notes:[1047,1319,1175,1568,1319,1047],wave:"sine"},urgent:{name:"Urgent Beep",notes:[1200,0,1200,0,1500,0,1200],wave:"square"}};
function alarmEndTime(start){const [h,m]=String(start||"07:00").split(":").map(Number),total=(h*60+m+600)%1440;return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");}
function customToneMeta(){try{return JSON.parse(localStorage.getItem("insan_alarm_custom_meta_v1")||"{}");}catch{return {};}}
function toneEntries(){return {...ALARM_TONES,...customToneMeta()};}
function selectedAlarmTone(){const id=localStorage.getItem(ALARM_TONE_KEY)||"gentle";return toneEntries()[id]?id:"gentle";}
async function getToneSource(id){if(ALARM_TONES[id])return toneData()[id]||await blobToDataUrl(makeToneWav(id));const src=customToneMeta()[id]?.dataUrl;if(!src)throw new Error("Nada kustom tidak ditemukan.");return src;}
function importAlarmTone(){const input=$("customAlarmToneFile"),file=input?.files?.[0];if(!file)return;if(file.size>3*1024*1024){$("alarmToneStatus").textContent="Ukuran file maksimal 5 MB agar aman untuk penyimpanan browser.";return;}if(!/^audio\//.test(file.type)&&!(/\.(mp3|wav|ogg|m4a|aac)$/i).test(file.name)){$("alarmToneStatus").textContent="Pilih file MP3, WAV, OGG, M4A, atau AAC.";return;}const reader=new FileReader();reader.onload=()=>{try{const meta=customToneMeta(),id="custom-"+Date.now();meta[id]={name:file.name.replace(/\.[^.]+$/,""),custom:true,dataUrl:reader.result};localStorage.setItem("insan_alarm_custom_meta_v1",JSON.stringify(meta));$("alarmToneStatus").textContent="Nada "+meta[id].name+" ditambahkan. Tekan ✓ untuk mengaktifkan.";input.value="";renderToneLibraries();}catch(e){$("alarmToneStatus").textContent="Penyimpanan penuh. Gunakan file audio lebih kecil.";}};reader.readAsDataURL(file);}
function toneData(){try{return JSON.parse(localStorage.getItem(ALARM_TONE_DATA_KEY)||"{}");}catch{return {};}}
function makeToneWav(id){const tone=ALARM_TONES[id]||ALARM_TONES.gentle,rate=16000,duration=4,samples=rate*duration,buffer=new ArrayBuffer(44+samples*2),view=new DataView(buffer),write=(p,str)=>{for(let i=0;i<str.length;i++)view.setUint8(p+i,str.charCodeAt(i));};write(0,"RIFF");view.setUint32(4,36+samples*2,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,samples*2,true);for(let i=0;i<samples;i++){const t=i/rate,slot=Math.floor(t/(duration/tone.notes.length)),freq=tone.notes[slot%tone.notes.length],within=(t%(duration/tone.notes.length))/(duration/tone.notes.length),env=freq?Math.min(1,within*18)*Math.max(0,1-within*.55):0,wave=tone.wave==="square"?(Math.sin(2*Math.PI*freq*t)>=0?1:-1):tone.wave==="triangle"?(2/Math.PI)*Math.asin(Math.sin(2*Math.PI*freq*t)):Math.sin(2*Math.PI*freq*t);view.setInt16(44+i*2,Math.max(-1,Math.min(1,wave*env*.48))*32767,true);}return new Blob([buffer],{type:"audio/wav"});}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
function renderToneLibraries(){const library=$("alarmToneLibrary"),downloaded=$("downloadedAlarmTones");if(!library||!downloaded)return;const saved=toneData(),selected=selectedAlarmTone(),all=Object.entries(toneEntries()),query=($("alarmToneSearch")?.value||"").trim().toLowerCase(),filter=$("alarmToneFilter")?.value||"all",savedCount=all.filter(([id])=>!!saved[id]||!!customToneMeta()[id]).length;const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value;};setText("toneTotalCount",all.length);setText("toneDownloadedCount",savedCount);setText("toneAvailableCount",all.length-savedCount);setText("downloadedToneSummary",savedCount+" nada tersimpan");setText("alarmCurrentTone","Nada alarm aktif: "+((ALARM_TONES[selected]||ALARM_TONES.gentle).name));library.replaceChildren();downloaded.replaceChildren();const playing=id=>!!(alarmPreviewAudio&&alarmPreviewId===id&&!alarmPreviewAudio.paused);const makeRow=(id,tone,isSaved)=>{const row=document.createElement("article");row.className="tone-row"+(selected===id?" tone-current":"");const info=document.createElement("div");info.className="tone-name";const name=document.createElement("div");name.textContent=tone.name;const sub=document.createElement("span");sub.className="tone-sub";sub.textContent=(selected===id?"Nada alarm aktif · ":"")+(isSaved?"Tersimpan di perangkat":"Belum diunduh");info.append(name,sub);const controls=document.createElement("div");controls.className="tone-actions";const add=(symbol,label,fn,pressed=false)=>{const btn=document.createElement("button");btn.type="button";btn.className="secondary";btn.textContent=symbol;btn.title=label;btn.setAttribute("aria-label",label);btn.setAttribute("aria-pressed",String(pressed));btn.onclick=fn;controls.appendChild(btn);};if(isSaved){add(playing(id)?"Ⅱ":"▶",playing(id)?"Jeda "+tone.name:"Putar "+tone.name,()=>toggleTonePreview(id),playing(id));add("✓",selected===id?"Nada alarm aktif":"Tetapkan "+tone.name+" sebagai nada alarm",()=>setAlarmTone(id),selected===id);}else add("↓","Unduh "+tone.name,()=>downloadTone(id));row.append(info,controls);return row;};const visible=all.filter(([id,tone])=>{const isSaved=!!saved[id]||!!customToneMeta()[id];return tone.name.toLowerCase().includes(query)&&(filter==="all"||(filter==="downloaded"&&isSaved)||(filter==="available"&&!isSaved));});visible.forEach(([id,tone])=>library.appendChild(makeRow(id,tone,!!saved[id])));if(!visible.length){const empty=document.createElement("p");empty.className="hint";empty.textContent=query?"Tidak ada nada yang cocok dengan pencarian.":"Tidak ada nada pada kategori ini.";library.appendChild(empty);}all.filter(([id])=>!!saved[id]||!!customToneMeta()[id]).forEach(([id,tone])=>downloaded.appendChild(makeRow(id,tone,true)));if(!downloaded.children.length){const empty=document.createElement("p");empty.className="hint";empty.textContent="Belum ada nada tersimpan. Tekan ikon unduh pada nada yang tersedia.";downloaded.appendChild(empty);}const search=$("alarmToneSearch"),select=$("alarmToneFilter");if(search&&!search.dataset.bound){search.dataset.bound="1";search.addEventListener("input",renderToneLibraries);}if(select&&!select.dataset.bound){select.dataset.bound="1";select.addEventListener("change",renderToneLibraries);}}
async function downloadTone(id){try{const all=toneData();all[id]=await blobToDataUrl(makeToneWav(id));localStorage.setItem(ALARM_TONE_DATA_KEY,JSON.stringify(all));const a=document.createElement("a"),url=URL.createObjectURL(makeToneWav(id));a.href=url;a.download="INSAN-"+id+"-alarm.wav";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$("alarmToneStatus").textContent=ALARM_TONES[id].name+" tersimpan lokal dan file WAV diunduh.";renderToneLibraries();}catch(e){$("alarmToneStatus").textContent="Gagal menyimpan nada. Ruang penyimpanan browser mungkin penuh.";console.warn(e);}}
async function playTonePreview(id){try{const src=await getToneSource(id);if(alarmPreviewAudio){alarmPreviewAudio.pause();alarmPreviewAudio.currentTime=0;}alarmPreviewId=id;alarmPreviewAudio=new Audio(src);alarmPreviewAudio.onended=()=>renderToneLibraries();await alarmPreviewAudio.play();renderToneLibraries();}catch(e){console.warn("Pratinjau audio gagal",e);}}
function toggleTonePreview(id){if(alarmPreviewAudio&&alarmPreviewId===id){if(alarmPreviewAudio.paused)alarmPreviewAudio.play().then(renderToneLibraries).catch(e=>console.warn(e));else{alarmPreviewAudio.pause();renderToneLibraries();}}else playTonePreview(id);}
function pauseTonePreview(id){if(alarmPreviewAudio&&alarmPreviewId===id){alarmPreviewAudio.pause();renderToneLibraries();}}
function resumeTonePreview(id){toggleTonePreview(id);}
function setAlarmTone(id){if(!toneEntries()[id]||(!ALARM_TONES[id]&&!customToneMeta()[id])){$("alarmToneStatus").textContent="Unduh nada terlebih dahulu.";return;}localStorage.setItem(ALARM_TONE_KEY,id);const saved=JSON.parse(localStorage.getItem(WORK_ALARM_KEY)||"null");if(saved?.enabled){saved.toneId=id;localStorage.setItem(WORK_ALARM_KEY,JSON.stringify(saved));}$("alarmToneStatus").textContent="✓ "+ALARM_TONES[id].name+" ditetapkan sebagai nada alarm.";renderToneLibraries();renderWorkAlarm();}
function renderWorkAlarm(){const input=$("workStartTime"),end=$("workEndTime"),status=$("workAlarmStatus"),toggle=$("workAlarmToggle"),stop=$("workAlarmStop");if(!input||!end)return;const saved=JSON.parse(localStorage.getItem(WORK_ALARM_KEY)||"null");if(saved?.start)input.value=saved.start;end.textContent=alarmEndTime(input.value)+" WIB";if(saved?.enabled){const when=new Date(saved.fireAt),tone=toneEntries()[saved.toneId||selectedAlarmTone()]||ALARM_TONES.gentle;status.textContent="Alarm aktif · "+input.value+" → "+alarmEndTime(input.value)+" WIB · "+when.toLocaleDateString("id-ID")+" · "+tone.name;toggle.textContent="Perbarui & aktifkan";stop.disabled=false;}else{status.textContent=workAlarmRinging?"Alarm sedang berbunyi.":"Alarm belum diaktifkan.";toggle.textContent="Aktifkan alarm";stop.disabled=!workAlarmRinging;}}
function stopAlarmSound(){workAlarmRinging=false;if(workAlarmAudio){try{workAlarmAudio.pause();workAlarmAudio.currentTime=0;}catch{}workAlarmAudio=null;}renderWorkAlarm();}
async function playAlarmSound(isTest=false){workAlarmRinging=true;renderWorkAlarm();const saved=JSON.parse(localStorage.getItem(WORK_ALARM_KEY)||"null"),candidate=isTest?selectedAlarmTone():(saved?.toneId||selectedAlarmTone()),id=toneEntries()[candidate]?candidate:"gentle";const src=await getToneSource(id);try{if(workAlarmAudio)workAlarmAudio.pause();workAlarmAudio=new Audio(src);workAlarmAudio.loop=true;await workAlarmAudio.play();}catch(e){console.warn("Audio alarm gagal diputar",e);}if("Notification"in window&&Notification.permission==="granted"){try{new Notification(isTest?"Tes Alarm INSAN":"Waktunya pulang! 🏡",{body:isTest?"Ini adalah percobaan nada alarm.":"Terima kasih sudah bekerja hari ini. Saatnya beristirahat.",tag:"insan-work-alarm"});}catch{}}}
async function toggleWorkAlarm(){const input=$("workStartTime"),raw=String(input?.value||"").trim(),match=raw.match(/^(\d{1,2})[:.](\d{2})$/);if(!match){alert("Masukkan jam mulai kerja dengan format HH:MM, contoh 07:00.");input?.focus();return;}const hour=Number(match[1]),minute=Number(match[2]);if(!Number.isInteger(hour)||!Number.isInteger(minute)||hour<0||hour>23||minute<0||minute>59){alert("Jam mulai kerja tidak valid. Gunakan rentang 00:00 sampai 23:59.");input?.focus();return;}const start=String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0");input.value=start;if("Notification"in window&&Notification.permission==="default"){try{await Notification.requestPermission();}catch{}}const [h,m]=start.split(":").map(Number),now=new Date(),fire=new Date(now);fire.setHours(h,m,0,0);fire.setMinutes(fire.getMinutes()+600);if(fire<=now)fire.setDate(fire.getDate()+1);const toneId=selectedAlarmTone();try{const src=await getToneSource(toneId);if(window.InsanNative?.scheduleWorkAlarm){const result=window.InsanNative.scheduleWorkAlarm(fire.getTime(),src);if(result!=="OK")throw new Error(String(result||"Gagal menjadwalkan alarm Android."));}else{scheduleWorkAlarm();$("alarmToneStatus").textContent="Mode browser: alarm tidak dijamin berbunyi setelah aplikasi ditutup.";}}catch(e){$("alarmToneStatus").textContent="Gagal mengaktifkan alarm: "+(e.message||e);return;}localStorage.setItem(WORK_ALARM_KEY,JSON.stringify({start,fireAt:fire.toISOString(),enabled:true,toneId}));workAlarmRinging=false;renderWorkAlarm();$("workAlarmStatus").textContent=window.InsanNative?.scheduleWorkAlarm?"Alarm aktif melalui sistem Android · "+start+" → "+alarmEndTime(start)+" WIB":"Alarm browser aktif · "+start+" → "+alarmEndTime(start)+" WIB";}
function stopWorkAlarm(){localStorage.removeItem(WORK_ALARM_KEY);if(workAlarmTimer)clearTimeout(workAlarmTimer);workAlarmTimer=null;window.InsanNative?.cancelWorkAlarm?.();stopAlarmSound();renderWorkAlarm();}
function scheduleWorkAlarm(){if(workAlarmTimer)clearTimeout(workAlarmTimer);const saved=JSON.parse(localStorage.getItem(WORK_ALARM_KEY)||"null");if(!saved?.enabled)return;if(window.InsanNative?.scheduleWorkAlarm)return;const delay=new Date(saved.fireAt).getTime()-Date.now();if(delay<=0){localStorage.removeItem(WORK_ALARM_KEY);playAlarmSound(false);return;}workAlarmTimer=setTimeout(()=>{localStorage.removeItem(WORK_ALARM_KEY);playAlarmSound(false);renderWorkAlarm();},delay);}
async function scheduleAlarmTest(minutes){if(![1,2,3].includes(minutes))return;const active=JSON.parse(localStorage.getItem(WORK_ALARM_KEY)||"null"),status=$("alarmDebugStatus");if(active?.enabled){status.textContent="Matikan jadwal alarm kerja terlebih dahulu agar tes tidak menggantikan jadwal utama.";return;}if(alarmTestTimer)clearTimeout(alarmTestTimer);stopAlarmSound();const fireAt=new Date(Date.now()+minutes*60000);status.textContent="Menyiapkan tes alarm…";try{const src=await getToneSource(selectedAlarmTone());if(window.InsanNative?.scheduleWorkAlarm){const result=window.InsanNative.scheduleWorkAlarm(fireAt.getTime(),src);if(result!=="OK")throw new Error(String(result||"Gagal menjadwalkan alarm Android."));status.textContent="Tes alarm Android dijadwalkan "+minutes+" menit lagi · "+fireAt.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});return;}status.textContent="Tes browser dijadwalkan "+minutes+" menit lagi · "+fireAt.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});alarmTestTimer=setTimeout(()=>{status.textContent="Tes alarm berbunyi · "+new Date().toLocaleTimeString("id-ID");playAlarmSound(true);},minutes*60000);}catch(e){status.textContent="Gagal menjadwalkan tes alarm: "+(e.message||e);}}
function cancelAlarmTest(){if(alarmTestTimer)clearTimeout(alarmTestTimer);alarmTestTimer=null;$("alarmDebugStatus").textContent="Tes alarm browser dibatalkan. Alarm Android yang sudah dijadwalkan tetap aktif; gunakan Matikan untuk membatalkannya.";if(workAlarmRinging)stopAlarmSound();}
if($("workStartTime")){$("workStartTime").addEventListener("input",()=>{$("workEndTime").textContent=alarmEndTime($("workStartTime").value)+" WIB";});renderWorkAlarm();scheduleWorkAlarm();renderToneLibraries();const customInput=$("customAlarmToneFile");if(customInput&&!customInput.dataset.bound){customInput.dataset.bound="1";customInput.addEventListener("change",importAlarmTone);}document.addEventListener("visibilitychange",()=>{if(!document.hidden)scheduleWorkAlarm();});}
window.addEventListener("offline",()=>setStatus("Offline · tetap bisa mencatat stok","low"));
setInterval(checkForUpdates,300000);
(async()=>{cachedUser=await kvGet("user");if(token||cachedUser)await refresh();else showLogin();if(!navigator.onLine)setStatus("Offline","low");})();
