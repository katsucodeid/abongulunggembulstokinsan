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
async function queueReplace(items){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(QUEUE,"readwrite"),s=t.objectStore(QUEUE);s.clear();(items||[]).forEach(item=>{if(item?.id)s.put(item);});t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
function newId(){return (crypto.randomUUID?crypto.randomUUID():"tx-"+Date.now()+"-"+Math.random().toString(36).slice(2));}
function setStatus(text,kind="muted"){$("connection").textContent=text;$("connection").className=kind;}
function applyTheme(theme){const light=theme==="light";const root=document.documentElement;root.classList.toggle("light",light);root.dataset.theme=light?"light":"dark";try{localStorage.setItem("insan_theme",light?"light":"dark");}catch{}const button=$("themeToggle");if(button){button.setAttribute("aria-pressed",String(light));button.textContent=light?"☀️ Tema Terang":"🌙 Tema Gelap";}const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",light?"#fff7ec":"#000000");}
function themeInit(){let saved="dark";try{saved=localStorage.getItem("insan_theme")||"dark";}catch{}applyTheme(saved);}
function toggleTheme(){applyTheme(document.documentElement.classList.contains("light")?"dark":"light");}
async function api(path,opts={}){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),opts.timeoutMs||8000);try{const r=await fetch(API+"/api"+path,{...opts,signal:opts.signal||controller.signal,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(opts.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok){const e=new Error(d.error||"Permintaan gagal");e.status=r.status;throw e;}return d;}finally{clearTimeout(timeout);}}
function showLogin(){ $("login").classList.remove("hidden");$("app").classList.add("hidden");}
function showApp(){ $("login").classList.add("hidden");$("app").classList.remove("hidden");}
function currentRole(){return cachedUser?.role||state?.user?.role||"";}
function isAdmin(){return currentRole()==="admin";}
function roleLabel(role){return role==="admin"?"Admin":role==="staff"?"Karyawan":role||"Offline";}
function hideBootLoading(){const splash=$("bootLoading");if(splash)splash.classList.add("hidden");}
async function loadUsers(){
 const list=$("userList"),status=$("userListStatus"),selector=$("selectedUser");if(!list||!isAdmin())return;
 try{
  const data=await api("/users"),users=data.users||[],previous=selector?.value||"";
  list.replaceChildren();
  if(selector){
   selector.replaceChildren();
   const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent=users.length?"Pilih akun yang akan diubah":"Belum ada akun";selector.appendChild(placeholder);
   users.forEach(user=>{const option=document.createElement("option");option.value=user.username;option.textContent=user.username+" · "+roleLabel(user.role);selector.appendChild(option);});
   if(users.some(user=>user.username===previous))selector.value=previous;
  }
  users.forEach(user=>{
   const card=document.createElement("article");card.className="history-card";
   const name=document.createElement("b");name.textContent=user.username;
   const role=document.createElement("p");role.className="muted";role.textContent="Tingkat akun: "+roleLabel(user.role);
   const choose=document.createElement("button");choose.type="button";choose.className="secondary";choose.textContent="Pilih untuk ubah password";
   choose.addEventListener("click",()=>{if(selector)selector.value=user.username;const input=$("resetUserPassword");if(input)input.focus();});
   card.append(name,role,choose);list.appendChild(card);
  });
  if(status)status.textContent=users.length+" akun terdaftar.";
  if(!users.length&&status)status.textContent="Belum ada akun yang terdaftar.";
 }catch(e){if(status)status.textContent="Gagal memuat daftar akun: "+e.message;}
}
async function createUser(){
 const username=$("newUsername"),password=$("newPassword"),role=$("newUserRole"),status=$("userCreateStatus");
 const clean=String(username?.value||"").trim().toLowerCase(),secret=String(password?.value||"");
 if(!/^[a-z0-9._-]{3,32}$/.test(clean)){if(status)status.textContent="Username 3–32 karakter: gunakan huruf kecil, angka, titik, _ atau -.";username?.focus();return;}
 if(secret.length<10||secret.length>128){if(status)status.textContent="Password harus 10–128 karakter.";password?.focus();return;}
 try{
  const result=await api("/users",{method:"POST",body:JSON.stringify({username:clean,password:secret,role:role?.value||"staff"})});
  if(username)username.value="";if(password)password.value="";
  if(status)status.textContent="Akun "+result.username+" berhasil dibuat dengan tingkat "+roleLabel(result.role)+".";
  await loadUsers();
 }catch(e){if(status)status.textContent="Akun gagal dibuat: "+e.message;}
}
async function resetUserPassword(){
 const selector=$("selectedUser"),password=$("resetUserPassword"),status=$("userPasswordStatus");
 const username=String(selector?.value||"").trim(),secret=String(password?.value||"");
 if(!username){if(status)status.textContent="Pilih akun yang akan diubah terlebih dahulu.";selector?.focus();return;}
 if(secret.length<10||secret.length>128){if(status)status.textContent="Password baru harus 10–128 karakter.";password?.focus();return;}
 if(!confirm("Ubah password akun "+username+"?"))return;
 try{
  const result=await api("/users/"+encodeURIComponent(username)+"/password",{method:"PUT",body:JSON.stringify({password:secret})});
  if(password)password.value="";
  if(status)status.textContent=result.message||"Password akun berhasil diperbarui.";
 }catch(e){if(status)status.textContent="Password gagal diperbarui: "+e.message;}
}
async function login(){try{const d=await api("/auth/login",{method:"POST",body:JSON.stringify({username:$("username").value,password:$("password").value})});token=d.token;cachedUser=d.user;localStorage.setItem("insan_token",token);await kvSet("user",cachedUser);await refresh();}catch(e){$("loginMsg").textContent=e.message;}}
async function logout(){closeMenu();token=null;cachedUser=null;localStorage.removeItem("insan_token");await kvDelete("user");showLogin();}
async function refresh(){try{state=await api("/state");window.insanServerConnected=true;const pendingLocal=await queueAll();for(const op of pendingLocal){if(!(state.history||[]).some(tx=>tx.id===op.id)){try{applyLocal(op);}catch(e){/* keep conflicting operation in the queue for review */}}}await kvSet("state",state);showApp();cachedUser=state.user;await renderAll();setStatus("Terhubung · data server terbaru","ok");await syncQueue();}catch(e){window.insanServerConnected=false;if(e instanceof TypeError || !navigator.onLine){state=await kvGet("state");cachedUser=await kvGet("user");if(state&&cachedUser){showApp();await renderAll();setStatus("Offline · perubahan disimpan di perangkat","low");}else{showLogin();$("loginMsg").textContent="Login pertama membutuhkan koneksi ke server.";}}else if(e.status===401){showLogin();$("loginMsg").textContent=e.message;}else{state=await kvGet("state");cachedUser=await kvGet("user");if(state&&cachedUser){showApp();await renderAll();setStatus("Server tidak tersedia · mode offline","low");}else showLogin();}}}
async function renderAll(){if(!state)return;const admin=isAdmin();const backupPanel=$("backupPanel");if(backupPanel)backupPanel.hidden=!admin;const accountsLink=$("accountsNavLink");if(accountsLink)accountsLink.hidden=!admin;syncActiveNav();$("who").textContent=(cachedUser?.username||state.user?.username||"Pengguna")+" · "+roleLabel(currentRole());renderStock();renderAnalyticsHeader();renderHistory();renderDailyTargets();loadReport();maybeAutoDailyReport().catch(()=>{});const q=await queueAll();$("pendingCount").textContent=q.length?(" · "+q.length+" transaksi menunggu sinkronisasi"):"";scheduleQrSnapshot();}
function renderStock(){const defs=state.itemDefs||{};$("stockGrid").innerHTML=Object.entries(state.stock||{}).map(([k,v])=>{const def=defs[k]||{label:k,min:null},low=def.min!==null&&Number(v)<=def.min;return `<div class="panel"><div class="muted">${def.label}</div><div class="qty">${Number(v).toLocaleString("id-ID")} pcs</div><div class="${low?'low':'ok'} muted">${def.min===null?'Batas minimum belum ditetapkan':low?'⚠ Stok minimum tercapai · '+def.min+' pcs':'Aman · minimum '+def.min}</div></div>`;}).join("");renderProductionCapacity();updateStockProductionEstimate();}
function renderAnalyticsHeader(){
 const el=$("headerAnalytics");if(!el||!state)return;
 const stats=collectOperationalStats(),variants=stats.variants||{},names={ori:"Ori",beef:"Beef",spicy:"Spicy",cheese:"Cheese"};
 const stockTotal=Object.values(state.stock||{}).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);
 const produced=Number(stats.totalProduced)||0,top=stats.topVariant?names[stats.topVariant]||stats.topVariant:"Belum ada";
 const breakdown=Object.entries(names).map(([key,label])=>label+" "+(Number(variants[key])||0).toLocaleString("id-ID")).join(" · ");
 const outlets=Object.entries(stats.outlets||{}).map(([name,value])=>name+" "+Number(value||0).toLocaleString("id-ID")).join(" · ");
 renderTechStatistics();
 el.replaceChildren();const main=document.createElement("div");main.className="header-analytics-main";
 const pulse=document.createElement("span");pulse.className="analytics-pulse";
 const label=document.createElement("span");label.textContent="REKAP PRODUKSI SEJAK AWAL";
 const total=document.createElement("strong");total.textContent=produced.toLocaleString("id-ID")+" loyang";
 const summary=document.createElement("span");summary.textContent="Stok tersedia "+stockTotal.toLocaleString("id-ID")+" pcs · Varian terbanyak "+top;
 main.append(pulse,label,total,summary);const detail=document.createElement("div");detail.className="header-analytics-detail";
 detail.textContent=breakdown+(outlets?" · Outlet: "+outlets:"");el.append(main,detail);
}
function updateStockProductionEstimate(){
 const input=$("stockProductionLoyang"),panel=$("stockProductionEstimate");if(!input||!panel||!state?.stock)return;
 const count=Math.max(0,Math.floor(Number(input.value)||0)),used=count*2,items=[["box3","Box isi 3"],["box5outer","Box isi 5 luar"],["box5inner","Box isi 5 dalam"],["paper","Kertas minyak"]],defs=state.itemDefs||{};
 const lines=items.map(([key,label])=>{const current=Number(state.stock[key]||0),minimum=Number(defs[key]?.min??500),remaining=current-used;return label+": "+used.toLocaleString("id-ID")+" pcs terpakai · sisa "+remaining.toLocaleString("id-ID")+" pcs"+(remaining<=minimum?" ⚠ minimum tercapai":"");});
 const capacity=Math.min(...items.map(([key])=>Math.max(0,Math.floor((Number(state.stock[key]||0)-Number(defs[key]?.min??500))/2))));
 panel.textContent=count?("Estimasi "+count.toLocaleString("id-ID")+" loyang · "+lines.join(" | ")+". Kapasitas produksi tambahan sebelum menyentuh batas minimum: "+capacity.toLocaleString("id-ID")+" loyang."):"Masukkan jumlah loyang untuk menghitung pemakaian 2 pcs per loyang dari setiap bahan.";
}
function renderProductionCapacity(){
 const panel=$("productionCapacity");if(!panel||!state?.stock)return;
 const items=["box3","box5outer","box5inner","paper"];
 const defs=state.itemDefs||{};
 const rows=items.map(key=>({key,label:defs[key]?.label||key,stock:Number(state.stock[key])}));
 if(rows.some(row=>!Number.isSafeInteger(row.stock)||row.stock<0)){
  panel.textContent="Estimasi belum tersedia karena data stok kemasan belum lengkap.";return;
 }
 const capacities=rows.map(row=>({...row,capacity:Math.floor(row.stock/2)}));
 const capacity=Math.min(...capacities.map(row=>row.capacity));
 const limits=capacities.filter(row=>row.capacity===capacity);
 panel.replaceChildren();
 const title=document.createElement("strong");title.textContent="Estimasi kapasitas produksi normal";
 const value=document.createElement("div");value.className="qty";value.textContent=capacity.toLocaleString("id-ID")+" loyang";
 const detail=document.createElement("p");detail.className="muted";
 detail.textContent="Pembatas: "+limits.map(row=>row.label).join(", ")+" ("+limits.map(row=>row.stock.toLocaleString("id-ID")+" pcs").join(" / ")+").";
 const note=document.createElement("p");note.className="muted";note.textContent="Simulasi memakai pola normal 2 pcs untuk setiap jenis kemasan per loyang. Mika tidak dihitung; kemasan khusus dapat mengubah hasil.";
 panel.append(title,value,detail,note);
}
function toggleMenu(){const nav=$("mainNav"),backdrop=$("navBackdrop"),btn=$("menuToggle");if(!nav||!backdrop||!btn)return;const open=!nav.classList.contains("open");nav.classList.toggle("open",open);backdrop.classList.toggle("visible",open);btn.setAttribute("aria-expanded",String(open));btn.setAttribute("aria-label",open?"Tutup navigasi":"Buka navigasi");document.body.classList.toggle("nav-open",open);}
function closeMenu(){const nav=$("mainNav"),backdrop=$("navBackdrop"),btn=$("menuToggle");if(!nav||!backdrop||!btn)return;nav.classList.remove("open");backdrop.classList.remove("visible");btn.setAttribute("aria-expanded","false");btn.setAttribute("aria-label","Buka navigasi");document.body.classList.remove("nav-open");}
function toggleNavGroup(id){const panel=$(id),toggle=document.querySelector('.nav-group-toggle[aria-controls="'+id+'"]');if(!panel||!toggle)return;const expanded=toggle.getAttribute("aria-expanded")==="true";toggle.setAttribute("aria-expanded",String(!expanded));panel.classList.toggle("expanded",!expanded);}
function syncActiveNav(){const current=document.querySelector(".tab:not(.hidden)");if(!current)return;document.querySelectorAll("#mainNav button[onclick^='showTab']").forEach(btn=>{const active=btn.getAttribute("onclick").includes("'"+current.id+"'");btn.classList.toggle("nav-active",active);if(active){btn.setAttribute("aria-current","page");const group=btn.closest(".nav-group-items");if(group){group.classList.add("expanded");const toggle=document.querySelector('.nav-group-toggle[aria-controls="'+group.id+'"]');if(toggle)toggle.setAttribute("aria-expanded","true");}}else btn.removeAttribute("aria-current");});}
function showTab(id){const target=$(id);if(!target)return;if(id==="accounts"&&!isAdmin()){showTab("dashboard");return;}document.querySelectorAll(".tab").forEach(x=>x.classList.add("hidden"));target.classList.remove("hidden");syncActiveNav();closeMenu();if(id==="report")loadReport();if(id==="history")renderHistory();if(id==="about")loadAbout();if(id==="accounts")loadUsers();if(id==="music")renderMusic();if(id==="backupqr"){if(latestBackupQrImages?.length)renderQrBackupGallery();else{if($("qrFullStatus"))$("qrFullStatus").textContent="Menyiapkan QR dari snapshot data terbaru…";scheduleQrSnapshot();}}}
async function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(blob);});}
async function downloadBackup(){
  const status=$("backupStatus"),button=$("createBackupButton");
  if(!token||!navigator.onLine){if(status)status.textContent="Hubungkan perangkat ke server untuk membuat cadangan.";return;}
  try{
    if(button)button.disabled=true;
    if(status)status.textContent="Menyiapkan file cadangan…";
    const response=await fetch(API+"/api/admin/backup",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!response.ok){let data={};try{data=await response.json();}catch{}throw new Error(data.error||"Gagal membuat cadangan.");}
    const blob=await response.blob();
    const disposition=response.headers.get("Content-Disposition")||"";
    const match=disposition.match(/filename="([^"]+)"/);
    const filename=match?.[1]||("insan-backup-"+new Date().toISOString().slice(0,10)+".insanbackup");
    if(window.InsanNative?.saveBackup){const saved=window.InsanNative.saveBackup(await blobToBase64(blob),filename);if(!saved||saved.startsWith("ERROR:"))throw new Error(saved||"Penyimpanan gagal.");if(status)status.textContent="Cadangan tersimpan di Download/Insan Stok/"+filename;}
    else{const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);if(status)status.textContent="Unduhan dimulai: "+filename+". Simpan ke folder Download/Insan Stok.";}
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
  if(!token||!navigator.onLine){if(status)status.textContent="Pemulihan membutuhkan koneksi ke server.";return;}
  let backup;
  try{
    backup=JSON.parse(await file.text());
    if(backup?.format!=="INSAN-STOCK-BACKUP"||backup?.formatVersion!==1)throw new Error("Format file tidak dikenali sebagai cadangan INSAN.");
  }catch(e){if(status)status.textContent="File tidak dapat dibaca: "+e.message;return;}
  const confirmed=confirm("PERINGATAN: Pemulihan akan MENGGANTI seluruh data database aktif dengan data dari file ini, termasuk stok, akun, dan transaksi. Server juga membuat cadangan kondisi saat ini sebelum pemulihan. Lanjutkan?");
  if(!confirmed)return;
  try{
    if(button)button.disabled=true;
    if(status)status.textContent="Memeriksa file dan memulihkan database…";
    const result=await api("/admin/restore",{method:"POST",body:JSON.stringify(backup)});
    if(status)status.textContent="Pemulihan berhasil. Silakan login kembali. Pengguna: "+result.summary.users+" · Transaksi: "+result.summary.transactions;
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
    if(status)status.textContent="Riwayat pembaruan lokal belum tersedia. Versi aplikasi: 3.0.0.";if(versionEl)versionEl.textContent="Versi 3.0.0";
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
    if(remoteStatus)remoteStatus.textContent="Informasi commit tidak tersedia saat offline. Fitur lokal dan QR tetap siap digunakan.";
    if(applyBtn)applyBtn.hidden=true;
  }
}

document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu();});
function renderHistory(){
const filter=$("historyFilter")?$("historyFilter").value:"all";
const list=(state.history||[]).filter(x=>filter==="all"||x.type===filter).slice(0,150);
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
if(admin){const btn=document.createElement("button");btn.className="danger";btn.textContent=x.type==="production"?"Hapus target ini":"Hapus transaksi";btn.onclick=()=>deleteTransaction(String(x.id),x.type);card.appendChild(btn);}
root.appendChild(card);
});
if(!list.length)root.textContent="Belum ada riwayat pada filter ini.";
}
async function correctManualStockOut(id,action){
const original=(state?.history||[]).find(x=>x.id===id&&x.type==="stock-out");
if(!original)return alert("Transaksi pengurangan tidak ditemukan. Muat ulang data.");
if(!navigator.onLine||!token)return alert("Koreksi transaksi lama membutuhkan koneksi ke server utama.");
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
async function deleteTransaction(id,expectedType){
 if(!id||!expectedType)return alert("Identitas transaksi tidak valid. Muat ulang riwayat.");
 if(!navigator.onLine||!token)return alert("Penghapusan riwayat memerlukan koneksi server agar transaksi yang tepat dapat diverifikasi.");
 try{
  // Always resolve the selected ID against the latest server snapshot, never by list position.
  const latest=await api("/state");
  const selected=(latest.history||[]).find(tx=>String(tx.id)===String(id));
  if(!selected){state=latest;await kvSet("state",state);await renderAll();return alert("Transaksi yang dipilih sudah tidak ada atau riwayat sudah berubah. Daftar diperbarui; silakan pilih ulang.");}
  if(selected.type!==expectedType){state=latest;await kvSet("state",state);await renderAll();return alert("Jenis transaksi tidak cocok dengan pilihan. Tidak ada data yang dihapus.");}
  if(expectedType==="production"&&(!selected.location||!selected.date||!selected.lines))return alert("Data target tidak lengkap. Penghapusan dibatalkan demi keamanan.");
  const l=selected.lines||{};
  const description=expectedType==="production"
   ? "target "+selected.location+" · "+selected.date+" · "+(l.total||0)+" loyang"
   : expectedType==="stock-in"?"barang masuk · "+(state.itemDefs?.[l.item]?.label||l.item)+" · "+(l.total||0)+" pcs"
   : expectedType==="stock-out"?"pengurangan stok · "+(state.itemDefs?.[l.item]?.label||l.item)+" · "+(l.quantity||0)+" pcs"
   : "transaksi "+expectedType;
  if(!confirm("Hapus "+description+" dari riwayat?\n\nID: "+selected.id+"\n\nStok terkait akan dikembalikan otomatis. Tindakan ini tidak dapat dibatalkan."))return;
  const expected={type:selected.type,date:selected.date||null,location:selected.location||null,createdAt:selected.createdAt||null,createdBy:selected.createdBy||null};
  const d=await api("/transactions/"+encodeURIComponent(selected.id),{method:"DELETE",body:JSON.stringify(expected)});
  state=d.state;await kvSet("state",state);await renderAll();
  const msg=$("syncErrors");if(msg)msg.textContent="Berhasil menghapus "+description+". Stok telah disesuaikan.";
  showTab("history");
 }catch(e){alert("Gagal menghapus transaksi: "+e.message);}
}
function applyLocal(op){
 const p=op.payload||{},changes={};let lines={};
 if(op.type==="stock-in"){const packs=Number(p.packs),perPack=Number(p.perPack),extra=Number(p.extra),total=packs*perPack+extra;if(![packs,perPack,extra,total].every(Number.isSafeInteger)||packs<0||perPack<0||extra<0||total<=0)throw Error("Jumlah barang masuk harus bilangan bulat dan totalnya lebih dari nol.");changes[p.item]=total;lines={item:p.item,packs,perPack,extra,total};}
 else if(op.type==="stock-out"){const quantity=Number(p.quantity),reason=String(p.reason||p.note||"").trim();if(!Number.isSafeInteger(quantity)||quantity<=0)throw Error("Jumlah pengurangan harus bilangan bulat lebih dari nol.");if(!reason)throw Error("Alasan pengurangan wajib diisi.");changes[p.item]=-quantity;lines={item:p.item,quantity,reason};}
 else if(op.type==="production"){
  const variants=["ori","beef","spicy","cheese"];const totalTarget=variants.reduce((sum,key)=>sum+(Number(p[key])||0),0);if(!Number.isSafeInteger(totalTarget)||totalTarget<=0)throw Error("Jumlah target harus lebih dari nol.");if(!["Grand Wisata","Bektim","Harapan Indah"].includes(p.location))throw Error("Pilih outlet yang valid.");lines={ori:0,beef:0,spicy:0,cheese:0,total:0,packagingByVariant:{},requestNote:p.requestNote||""};
  changes.box3=0;changes.box5outer=0;changes.box5inner=0;changes.paper=0;
  for(const key of variants){
   const qty=Number(p[key])||0,custom=p.packagingByVariant?.[key],box3=custom?.enabled?Number(custom.box3)||0:qty*2,box5=custom?.enabled?Number(custom.box5)||0:qty*2;
   lines[key]=qty;lines.total+=qty;lines.packagingByVariant[key]={enabled:!!custom?.enabled,box3,box5};
   changes.box3-=box3;changes.box5outer-=box5;changes.box5inner-=box5;changes.paper-=box5;
  }
 }
 for(const [key,delta] of Object.entries(changes)){if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(Number(state.stock[key])+delta)||Number(state.stock[key])+delta<0)throw Error("Stok lokal "+key+" tidak mencukupi.");}
 for(const [key,delta] of Object.entries(changes))state.stock[key]+=delta;
 state.history=Array.isArray(state.history)?state.history:[];
 state.history.unshift({id:op.id,type:op.type,date:p.date||new Date().toISOString().slice(0,10),location:p.location||"",note:p.note||"",lines,changes,createdBy:cachedUser?.username||"offline",createdAt:new Date().toISOString()});
 state.history=state.history.slice(0,1000);
}
async function submitOperation(type,payload,msgId){
 const op={id:newId(),type,payload};
 applyLocal(op);
 await queueAdd(op);
 await kvSet("state",state);
 const message=$(msgId);if(message)message.textContent="Tersimpan di perangkat. Sinkronisasi berjalan di latar belakang.";
 await renderAll();
 if(navigator.onLine&&token)syncQueue().catch(()=>{});
}
async function stockIn(){try{await submitOperation("stock-in",{item:$("inItem").value,packs:+$("packs").value,perPack:+$("perPack").value,extra:+$("extra").value,note:$("inNote").value},"inMsg");}catch(e){$("inMsg").textContent=e.message;}}
let editingTargetId=null;
const pvars=["ori","beef","spicy","cheese"];
const plabel={ori:"Ori",beef:"Beef",spicy:"Spicy",cheese:"Cheese"};
function packData(){const o={};pvars.forEach(k=>{const n=plabel[k],on=$("packCustom"+n).checked;o[k]={enabled:on,box3:on?Number($("packBox3"+n).value):0,box5:on?Number($("packBox5"+n).value):0};});return o;}
function productionPreview(){let total=0,b3=0,b5=0,details=[];pvars.forEach(k=>{const q=Math.max(0,Number($(k).value)||0),n=plabel[k],on=$("packCustom"+n).checked,x3=on?(Number($("packBox3"+n).value)||0):q*2,x5=on?(Number($("packBox5"+n).value)||0):q*2;total+=q;b3+=x3;b5+=x5;if(q)details.push(n+": "+q+" loyang ("+x5+" Box isi 5, "+x3+" Box isi 3)");});$("productionPreview").textContent=["Total target: "+total.toLocaleString("id-ID")+" loyang",...details,"Perkiraan pemakaian:","• Box isi 3: "+b3.toLocaleString("id-ID")+" pcs","• Box isi 5 luar (Slongsong): "+b5.toLocaleString("id-ID")+" pcs","• Box isi 5 dalam (Tatakan Polos): "+b5.toLocaleString("id-ID")+" pcs","• Kertas Minyak: "+b5.toLocaleString("id-ID")+" pcs"].join("\n");}
pvars.forEach(k=>{const n=plabel[k];[k,"packBox3"+n,"packBox5"+n].forEach(id=>$(id).addEventListener("input",productionPreview));$("packCustom"+n).addEventListener("change",()=>{$("packFields"+n).classList.toggle("hidden",!$("packCustom"+n).checked);productionPreview();});});
$("prodDate").addEventListener("change",()=>{renderDailyTargets();renderTargetSource();});
function renderTargetSource(){const s=$("targetSource");if(!s||!state)return;const prev=s.value,rows=(state.history||[]).filter(x=>x.type==="production"&&x.date===$("prodDate").value);s.innerHTML='<option value="">Pilih target tanggal ini</option>';rows.forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=(x.location||"Outlet")+" · "+(x.lines?.total||0)+" loyang";s.appendChild(o);});if(rows.some(x=>x.id===prev))s.value=prev;}
function loadTargetForRequest(){const id=$("targetSource").value,tx=(state?.history||[]).find(x=>x.id===id&&x.type==="production");if(!tx){$("editTargetMsg").textContent="Pilih target produksi.";return;}const l=tx.lines||{},packs=l.packagingByVariant||{};$("prodDate").value=tx.date||$("prodDate").value;$("location").value=tx.location||"";pvars.forEach(k=>{const n=plabel[k],p=packs[k];$(k).value=Number(l[k]||0);$("packCustom"+n).checked=!!p?.enabled;$("packFields"+n).classList.toggle("hidden",!p?.enabled);$("packBox3"+n).value=Number(p?.box3||0);$("packBox5"+n).value=Number(p?.box5||0);});$("requestNote").value=l.requestNote||"";$("prodNote").value=tx.note||"";editingTargetId=tx.id;$("prodSubmit").textContent="Simpan perubahan target";$("editTargetMsg").textContent="Edit target "+tx.location+". Kemasan dapat diatur per varian.";productionPreview();renderDailyTargets();}
async function production(){try{const vals=pvars.map(k=>Number($(k).value));if(vals.some(v=>!Number.isSafeInteger(v)||v<0)||vals.reduce((a,b)=>a+b,0)<=0)throw Error("Isi setidaknya satu jumlah loyang yang valid.");if(!$("location").value)throw Error("Pilih outlet terlebih dahulu.");const packagingByVariant=packData();for(const k of pvars){const p=packagingByVariant[k];if(p.enabled&&(!Number.isSafeInteger(p.box3)||p.box3<0||!Number.isSafeInteger(p.box5)||p.box5<0))throw Error("Jumlah kemasan "+plabel[k]+" tidak valid.");}const payload={date:$("prodDate").value,location:$("location").value,ori:vals[0],beef:vals[1],spicy:vals[2],cheese:vals[3],packagingByVariant,requestNote:$("requestNote").value.trim(),note:$("prodNote").value};if(editingTargetId){if(!navigator.onLine)throw Error("Edit target lama membutuhkan koneksi internet.");const d=await api("/transactions/"+encodeURIComponent(editingTargetId),{method:"PUT",body:JSON.stringify(payload)});state=d.state;await kvSet("state",state);$("prodMsg").textContent="Target diperbarui dan stok disesuaikan berdasarkan selisih.";}else await submitOperation("production",payload,"prodMsg");editingTargetId=null;$("prodSubmit").textContent="Tambah target outlet";pvars.forEach(k=>{const n=plabel[k];$(k).value=0;$("packCustom"+n).checked=false;$("packFields"+n).classList.add("hidden");$("packBox3"+n).value=0;$("packBox5"+n).value=0;});$("location").value="";$("requestNote").value="";$("prodNote").value="";$("targetSource").value="";productionPreview();await renderAll();}catch(e){$("prodMsg").textContent=e.message;}}
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
async function applyUpdate(commitSha=window.insanLatestCommit){if(!window.insanUpdateAvailable||!commitSha)return;if((await queueAll()).length){alert("Sinkronkan transaksi yang masih tertunda sebelum memperbarui aplikasi.");return;}if(!confirm("Terapkan commit "+commitSha.slice(0,7)+" dari GitHub? Server akan dimulai ulang otomatis. Data stok dan riwayat tetap disimpan."))return;try{$("updateButton").disabled=true;$("updateButton").textContent="Memperbarui…";const d=await api("/update/apply",{method:"POST",body:JSON.stringify({commitSha})});$("updateMessage").textContent=d.message+" Halaman akan tersambung kembali setelah server aktif.";$("updateButton").textContent="Menunggu server…";setTimeout(()=>{let attempts=0;const watcher=setInterval(async()=>{attempts++;try{const status=await api("/update/check");if(status.current===commitSha){clearInterval(watcher);location.reload();}}catch(e){}if(attempts>=120){clearInterval(watcher);$("updateButton").disabled=false;$("updateButton").textContent="Periksa dan coba lagi";$("updateMessage").textContent="Server belum mengonfirmasi commit baru. Periksa log pembaruan di Termux sebelum mencoba lagi."; }},3000);},5000);}catch(e){$("updateButton").disabled=false;$("updateButton").textContent="Update Sekarang";alert("Pembaruan gagal dimulai: "+e.message);}}
async function syncQueue(){if(!navigator.onLine||!token)return;const queue=await queueAll();if(!queue.length)return;try{const d=await api("/sync",{method:"POST",body:JSON.stringify({operations:queue.slice(0,100)})});await queueRemove((d.accepted||[]).map(x=>x.id));if(!(d.rejected||[]).length){state=d.state;setStatus("Semua transaksi tersinkron","ok");$("syncErrors").textContent="";}else{setStatus(d.rejected.length+" transaksi tersimpan lokal tetapi perlu pemeriksaan server","low");$("syncErrors").textContent=d.rejected.map(x=>x.error).join(" · ");}await kvSet("state",state);await renderAll();}catch(e){setStatus("Sinkronisasi tertunda · data tetap tersimpan di perangkat","low");}}
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
function loadReport(){
 if(!state)return;
 const s=state.stock,fmt=n=>Number(n||0).toLocaleString("id-ID");
 const history=state.history||[];
 const manualRows=history.filter(tx=>tx.type==="stock-out").map(tx=>({id:tx.id,date:tx.date,createdAt:tx.createdAt,createdBy:tx.createdBy,item:tx.lines?.item,quantity:tx.lines?.quantity,reason:tx.lines?.reason||tx.note,corrections:history.filter(c=>c.type==="stock-correction"&&c.lines?.targetTransactionId===tx.id).map(c=>({date:c.date,createdBy:c.createdBy,correctedQuantity:c.lines?.correctedQuantity,returnedDelta:c.lines?.returnedDelta,reason:c.lines?.reason||c.note}))}));
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

let qrRefreshTimer=null,latestBackupQrImages=[];
// Pemutar musik lokal v3: antrean, shuffle/repeat, kontrol native, dan pemulihan stabil.
const MUSIC_LIBRARY_KEY="gembul_music_library_v2",MUSIC_PLAYLISTS_KEY="gembul_music_playlists_v2";
let musicLibrary=[],musicPlaylists=[],musicQueue=[],musicQueueIndex=-1,musicCurrentId=null,musicObjectUrl=null,musicIsPlaying=false,musicDurationMs=0,musicProgressTimer=null,musicSeekDragging=false,musicShuffle=false,musicRepeat="off",musicPlayRequest=0;
const musicAudio=$("musicAudio");
function musicId(){return "music-"+Date.now()+"-"+Math.random().toString(36).slice(2,9);}
function musicSave(){try{localStorage.setItem(MUSIC_LIBRARY_KEY,JSON.stringify(musicLibrary));localStorage.setItem(MUSIC_PLAYLISTS_KEY,JSON.stringify(musicPlaylists));if(typeof scheduleQrSnapshot==="function")scheduleQrSnapshot();}catch(e){musicStatus("Perpustakaan penuh. Hapus beberapa entri lama lalu coba lagi.");}}
function musicFormatTime(seconds){if(!Number.isFinite(seconds)||seconds<0)return "00:00";const n=Math.floor(seconds);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
function musicCurrent(){return musicLibrary.find(item=>item.id===musicCurrentId)||null;}
function musicSelectedPlaylist(){return musicPlaylists.find(item=>item.id===$("musicPlaylistSelect")?.value)||null;}
function musicStatus(message){const el=$("musicPlayerStatus");if(el)el.textContent=message;}
function chooseMusicFiles(){musicStatus("Memilih file audio…");try{if(window.InsanNative?.pickMusicFiles){window.InsanNative.pickMusicFiles();return;}}catch(e){musicStatus("Pemilih Android gagal: "+e.message);}const input=$("musicFileInput");if(input)input.click();else musicStatus("Pemilih file tidak tersedia.");}
async function importMusicFiles(){const input=$("musicFileInput"),files=Array.from(input?.files||[]);if(!files.length)return;let added=0,skipped=0;for(const file of files){if(!file.type.startsWith("audio/")&&!/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name)){skipped++;continue;}try{const id=musicId();await kvSet("music_blob_"+id,file);musicLibrary.push({id,name:file.name.replace(/\.[^.]+$/,""),fileName:file.name,mime:file.type||"audio/*",size:file.size,source:"blob",addedAt:new Date().toISOString()});added++;}catch(e){musicStatus("Penyimpanan gagal: "+e.message);}}musicSave();input.value="";renderMusic();const message=added+" lagu berhasil ditambahkan"+(skipped?" · "+skipped+" file dilewati":"")+". File asli tetap aman.";const el=$("musicLibraryStatus");if(el)el.textContent=message;musicStatus(message);}
window.onNativeMusicPicked=items=>{try{const received=Array.isArray(items)?items:[];let added=0,duplicates=0;for(const item of received){if(!item?.uri)continue;if(musicLibrary.some(track=>track.uri===item.uri)){duplicates++;continue;}musicLibrary.push({id:musicId(),name:item.name||"Musik tanpa judul",fileName:item.name||"audio",mime:item.mime||"audio/*",source:"native",uri:item.uri,size:Number(item.size)||0,addedAt:new Date().toISOString()});added++;}musicSave();renderMusic();const message=added?added+" lagu ditambahkan. File asli tidak dipindahkan atau dihapus.":duplicates?"Semua file sudah ada di perpustakaan.":"Tidak ada file audio yang diterima.";if($("musicLibraryStatus"))$("musicLibraryStatus").textContent=message;musicStatus(message);}catch(e){musicStatus("Gagal menambahkan musik: "+e.message);}};
window.onNativeMusicPickerMessage=message=>{if(message)musicStatus(message);};
function createMusicPlaylist(){const input=$("newPlaylistName"),name=String(input?.value||"").trim();if(!name){input?.focus();return;}if(musicPlaylists.some(p=>p.name.toLowerCase()===name.toLowerCase())){musicStatus("Nama daftar putar sudah digunakan.");return;}const playlist={id:musicId(),name,tracks:[],createdAt:new Date().toISOString()};musicPlaylists.push(playlist);musicSave();if(input)input.value="";renderMusic();$("musicPlaylistSelect").value=playlist.id;renderMusic();musicStatus("Daftar putar “"+name+"” dibuat.");}
function deleteSelectedPlaylist(){const playlist=musicSelectedPlaylist();if(!playlist){musicStatus("Pilih daftar putar yang ingin dihapus.");return;}if(!confirm("Hapus daftar putar “"+playlist.name+"”? Lagu tetap ada di perpustakaan."))return;musicPlaylists=musicPlaylists.filter(p=>p.id!==playlist.id);musicSave();renderMusic();musicStatus("Daftar putar dihapus. File musik tetap aman.");}
function addMusicToPlaylist(id){const playlist=musicSelectedPlaylist();if(!playlist){musicStatus("Pilih daftar putar terlebih dahulu.");$("musicPlaylistSelect")?.focus();return;}if(playlist.tracks.includes(id)){musicStatus("Lagu sudah ada di daftar putar.");return;}playlist.tracks.push(id);musicSave();renderMusic();$("musicPlaylistSelect").value=playlist.id;musicStatus("Lagu ditambahkan ke “"+playlist.name+"”.");}
async function removeMusicFromApp(id){const track=musicLibrary.find(item=>item.id===id);if(!track)return;if(!confirm("Hapus “"+track.name+"” dari aplikasi? File asli di perangkat tidak akan dihapus."))return;if(musicCurrentId===id)stopMusicPlayback();if(track.source==="blob")await kvDelete("music_blob_"+id);else if(track.source==="native")window.InsanNative?.releaseMusicUri?.(track.uri);musicLibrary=musicLibrary.filter(item=>item.id!==id);musicPlaylists.forEach(p=>p.tracks=p.tracks.filter(trackId=>trackId!==id));musicQueue=musicQueue.filter(trackId=>trackId!==id);musicSave();renderMusic();musicStatus("Dihapus dari aplikasi. File asli di ponsel tetap utuh.");}
function musicEmpty(message){const el=document.createElement("div");el.className="music-empty";el.textContent=message;return el;}
function musicRow(track,options={}){const row=document.createElement("article");row.className="music-row"+(musicCurrentId===track.id?" active":"");row.tabIndex=0;row.setAttribute("role","button");row.setAttribute("aria-label","Putar "+track.name);row.onclick=()=>options.playlist?playPlaylistFromIndex(options.index):playMusicDirect(track.id);row.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();row.click();}};const icon=document.createElement("div");icon.className="music-row-art";icon.textContent=musicCurrentId===track.id&&musicIsPlaying?"♫":"♪";const info=document.createElement("div");info.className="music-row-info";const name=document.createElement("strong");name.textContent=track.name;const meta=document.createElement("small");meta.textContent=(track.source==="native"?"File perangkat":"Salinan lokal aplikasi")+" · "+(track.size?(track.size/1048576).toFixed(1)+" MB":"Ukuran tidak diketahui");info.append(name,meta);const actions=document.createElement("div");actions.className="music-row-actions";const add=(label,title,fn)=>{const b=document.createElement("button");b.type="button";b.className="secondary";b.textContent=label;b.title=title;b.setAttribute("aria-label",title);b.onclick=e=>{e.stopPropagation();fn();};actions.appendChild(b);};if(!options.playlist)add("＋","Tambahkan ke daftar putar",()=>addMusicToPlaylist(track.id));else add("×","Hapus dari daftar putar",()=>removeTrackFromPlaylist(track.id));add("⋯","Hapus dari aplikasi",()=>removeMusicFromApp(track.id));row.append(icon,info,actions);return row;}
function renderMusic(){const library=$("musicLibraryList"),playlistList=$("musicPlaylistTracks"),select=$("musicPlaylistSelect");if(!library||!playlistList||!select)return;const selectedId=select.value,query=String($("musicSearch")?.value||"").trim().toLowerCase(),selected=musicPlaylists.find(p=>p.id===selectedId)||null;select.replaceChildren();const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent=musicPlaylists.length?"Pilih daftar putar":"Belum ada daftar putar";select.appendChild(placeholder);musicPlaylists.forEach(p=>{const option=document.createElement("option");option.value=p.id;option.textContent=p.name;select.appendChild(option);});if(selected)select.value=selected.id;const counts=[["musicTotalCount",musicLibrary.length],["musicPlaylistCount",musicPlaylists.length],["musicQueueCount",musicQueue.length],["musicLibraryCount",musicLibrary.length+" lagu"]];counts.forEach(([id,value])=>{const el=$(id);if(el)el.textContent=value;});if($("selectedPlaylistTitle"))$("selectedPlaylistTitle").textContent=selected?selected.name:"Pilih daftar putar";if($("selectedPlaylistCount"))$("selectedPlaylistCount").textContent=selected?selected.tracks.length+" lagu":"0 lagu";playlistList.replaceChildren();if(selected){selected.tracks.forEach((id,index)=>{const track=musicLibrary.find(t=>t.id===id);if(track)playlistList.appendChild(musicRow(track,{playlist:true,index}));});if(!playlistList.children.length)playlistList.appendChild(musicEmpty("Daftar putar masih kosong."));}else playlistList.appendChild(musicEmpty("Pilih daftar putar untuk melihat isinya."));library.replaceChildren();const visible=musicLibrary.filter(t=>String(t.name||"").toLowerCase().includes(query));visible.forEach(track=>library.appendChild(musicRow(track)));if(!visible.length)library.appendChild(musicEmpty(query?"Tidak ada lagu yang cocok.":"Tambahkan musik dari perangkat untuk memulai."));const current=musicCurrent();if($("musicNowTitle"))$("musicNowTitle").textContent=current?.name||"Belum ada musik diputar";if($("musicNowSubtitle"))$("musicNowSubtitle").textContent=current?(current.source==="native"?"File asli dari perangkat":"Salinan lokal aplikasi"):"Pilih lagu dari perpustakaan";if($("musicPlaybackLabel"))$("musicPlaybackLabel").textContent=musicIsPlaying?"SEDANG DIPUTAR":current?"DIJEDA":"SIAP DIPUTAR";if($("musicPlayPause")){$("musicPlayPause").textContent=musicIsPlaying?"Ⅱ":"▶";$("musicPlayPause").setAttribute("aria-label",musicIsPlaying?"Jeda musik":"Lanjutkan musik");}if($("musicShuffle"))$("musicShuffle").classList.toggle("active",musicShuffle);if($("musicRepeat")){$("musicRepeat").textContent=musicRepeat==="off"?"↻":musicRepeat==="one"?"↻¹":"↻ ALL";$("musicRepeat").classList.toggle("active",musicRepeat!=="off");}if($("musicLibraryStatus"))$("musicLibraryStatus").textContent=musicLibrary.length?musicLibrary.length+" lagu tersedia di perpustakaan.":"Belum ada musik ditambahkan.";const queueList=$("musicQueueList");if(queueList){queueList.replaceChildren();const upcoming=musicQueue.slice(musicQueueIndex+1);if(!upcoming.length)queueList.appendChild(musicEmpty("Tidak ada lagu berikutnya dalam antrean."));else upcoming.forEach((id,i)=>{const t=musicLibrary.find(x=>x.id===id);if(t)queueList.appendChild(musicRow(t,{queue:true,index:i}));});}}
function removeTrackFromPlaylist(id){const playlist=musicSelectedPlaylist();if(!playlist)return;playlist.tracks=playlist.tracks.filter(trackId=>trackId!==id);musicSave();renderMusic();musicStatus("Lagu dihapus dari daftar putar, bukan dari perpustakaan.");}
function playSelectedPlaylist(){const playlist=musicSelectedPlaylist();if(!playlist){musicStatus("Pilih daftar putar terlebih dahulu.");return;}musicQueue=playlist.tracks.filter(id=>musicLibrary.some(t=>t.id===id));if(!musicQueue.length){musicStatus("Daftar putar belum berisi musik.");return;}if(musicShuffle)musicQueue=musicQueue.sort(()=>Math.random()-.5);musicPlayAt(0);}
function playPlaylistFromIndex(index){const playlist=musicSelectedPlaylist();if(!playlist)return;musicQueue=playlist.tracks.filter(id=>musicLibrary.some(t=>t.id===id));if(musicShuffle)musicQueue=musicQueue.sort(()=>Math.random()-.5);playMusicAt(musicQueue.indexOf(playlist.tracks[index]));}
function playMusicDirect(id){musicQueue=musicLibrary.map(track=>track.id);if(musicShuffle)musicQueue=musicQueue.sort(()=>Math.random()-.5);const index=musicQueue.indexOf(id);playMusicAt(index>=0?index:0);}
async function playMusicAt(index){if(index<0||index>=musicQueue.length){stopMusicPlayback();return;}const request=++musicPlayRequest,oldTrack=musicCurrent(),id=musicQueue[index],track=musicLibrary.find(t=>t.id===id);if(!track){nextMusic();return;}if(oldTrack?.source==="native")window.InsanNative?.stopMusic?.();else musicAudio?.pause();musicQueueIndex=index;musicCurrentId=id;musicIsPlaying=false;musicDurationMs=0;if($("musicSeek"))$("musicSeek").value="0";if($("musicElapsed"))$("musicElapsed").textContent="00:00";if($("musicDuration"))$("musicDuration").textContent="00:00";renderMusic();musicStatus("Menyiapkan “"+track.name+"”…");try{if(track.source==="native"&&window.InsanNative?.playMusic){musicDurationMs=Number(window.InsanNative.getMusicDuration?.(track.uri)||0);const result=window.InsanNative.playMusic(track.uri,track.name);if(result&&String(result).startsWith("ERROR:"))throw new Error(String(result));if(request!==musicPlayRequest)return;musicStatus("Memutar melalui layanan Android. Kontrol tersedia dari aplikasi dan notifikasi.");startNativeProgress();}else{const blob=await kvGet("music_blob_"+id);if(request!==musicPlayRequest)return;if(!blob)throw new Error("File musik lokal tidak ditemukan. Tambahkan ulang dari perangkat.");if(musicObjectUrl)URL.revokeObjectURL(musicObjectUrl);musicObjectUrl=URL.createObjectURL(blob);musicAudio.src=musicObjectUrl;musicAudio.currentTime=0;await musicAudio.play();if(request!==musicPlayRequest){musicAudio.pause();return;}musicIsPlaying=true;musicDurationMs=Number.isFinite(musicAudio.duration)?musicAudio.duration*1000:0;musicStatus("Sedang memutar musik dari penyimpanan lokal.");}renderMusic();}catch(e){if(request===musicPlayRequest){musicIsPlaying=false;musicStatus("Lagu tidak dapat diputar: "+e.message);renderMusic();}}}
function startNativeProgress(){if(musicProgressTimer)clearInterval(musicProgressTimer);musicProgressTimer=setInterval(()=>{if(!musicIsPlaying)return;const position=Number(window.InsanNative?.getMusicPosition?.()||0),duration=Number(window.InsanNative?.getCurrentMusicDuration?.()||musicDurationMs);if(duration>0)musicDurationMs=duration;if(!$("musicSeek"))return;if(!musicSeekDragging){$("musicSeek").value=String(duration?Math.min(1000,position/duration*1000):0);$("musicElapsed").textContent=musicFormatTime(position/1000);$("musicDuration").textContent=musicFormatTime(duration/1000);}},700);}
function nextMusic(ended=false){if(!musicQueue.length)return;if(ended&&musicRepeat==="one"&&musicCurrentId){playMusicAt(musicQueueIndex);return;}if(musicShuffle&&musicQueue.length>1){let next=musicQueueIndex;while(next===musicQueueIndex)next=Math.floor(Math.random()*musicQueue.length);playMusicAt(next);return;}playMusicAt((musicQueueIndex+1+musicQueue.length)%musicQueue.length);}
function previousMusic(){if(!musicQueue.length)return;playMusicAt((musicQueueIndex-1+musicQueue.length)%musicQueue.length);}
async function toggleMusicPlayback(){const current=musicCurrent();if(!current){if(musicQueue.length)await playMusicAt(Math.max(0,musicQueueIndex));else if(musicLibrary.length)playMusicDirect(musicLibrary[0].id);return;}if(musicIsPlaying){if(current.source==="native")window.InsanNative?.pauseMusic?.();else musicAudio?.pause();musicIsPlaying=false;musicStatus("Musik dijeda.");}else{try{if(current.source==="native")window.InsanNative?.resumeMusic?.();else await musicAudio.play();musicIsPlaying=true;musicStatus("Melanjutkan pemutaran.");}catch(e){musicIsPlaying=false;musicStatus("Tidak dapat melanjutkan musik: "+e.message);}}renderMusic();}
function toggleMusicShuffle(){musicShuffle=!musicShuffle;renderMusic();musicStatus(musicShuffle?"Mode acak aktif.":"Mode acak nonaktif.");}
function toggleMusicRepeat(){musicRepeat=musicRepeat==="off"?"all":musicRepeat==="all"?"one":"off";renderMusic();musicStatus(musicRepeat==="off"?"Ulangi nonaktif.":musicRepeat==="all"?"Ulangi seluruh antrean.":"Ulangi satu lagu.");}
function stopMusicPlayback(){musicPlayRequest++;musicAudio?.pause();if(musicAudio){musicAudio.currentTime=0;musicAudio.removeAttribute("src");}window.InsanNative?.stopMusic?.();if(musicObjectUrl){URL.revokeObjectURL(musicObjectUrl);musicObjectUrl=null;}if(musicProgressTimer){clearInterval(musicProgressTimer);musicProgressTimer=null;}musicIsPlaying=false;musicCurrentId=null;musicQueue=[];musicQueueIndex=-1;musicDurationMs=0;renderMusic();if($("musicElapsed"))$("musicElapsed").textContent="00:00";if($("musicDuration"))$("musicDuration").textContent="00:00";if($("musicSeek"))$("musicSeek").value="0";musicStatus("Pemutaran dihentikan.");}
window.onNativeMusicEnded=()=>nextMusic(true);
window.onNativeMusicState=playing=>{musicIsPlaying=!!playing;renderMusic();musicStatus(musicIsPlaying?"Musik sedang diputar.":"Musik dijeda dari kontrol Android.");};
if(musicAudio){musicAudio.addEventListener("timeupdate",()=>{if(musicSeekDragging)return;const duration=musicAudio.duration||0;if($("musicElapsed"))$("musicElapsed").textContent=musicFormatTime(musicAudio.currentTime);if($("musicDuration"))$("musicDuration").textContent=musicFormatTime(duration);if($("musicSeek"))$("musicSeek").value=String(duration?musicAudio.currentTime/duration*1000:0);});musicAudio.addEventListener("loadedmetadata",()=>{musicDurationMs=(musicAudio.duration||0)*1000;if($("musicDuration"))$("musicDuration").textContent=musicFormatTime(musicAudio.duration||0);});musicAudio.addEventListener("ended",()=>nextMusic(true));musicAudio.addEventListener("play",()=>{musicIsPlaying=true;renderMusic();});musicAudio.addEventListener("pause",()=>{if(musicCurrent()?.source==="blob"){musicIsPlaying=false;renderMusic();}});musicAudio.addEventListener("error",()=>{musicIsPlaying=false;musicStatus("Format audio tidak didukung atau file tidak dapat dibaca.");renderMusic();});}
$("musicSeek")?.addEventListener("input",e=>{musicSeekDragging=true;const duration=musicCurrent()?.source==="native"?musicDurationMs/1000:(musicAudio?.duration||0);if(duration>0&&$("musicElapsed"))$("musicElapsed").textContent=musicFormatTime(Number(e.target.value)/1000*duration);});
$("musicSeek")?.addEventListener("change",e=>{const current=musicCurrent(),duration=current?.source==="native"?musicDurationMs/1000:(musicAudio?.duration||0),position=Number(e.target.value)/1000*duration;if(duration>0){if(current?.source==="native")window.InsanNative?.seekMusic?.(Math.round(position*1000));else if(musicAudio)musicAudio.currentTime=position;}musicSeekDragging=false;});
$("musicSearch")?.addEventListener("input",renderMusic);
$("musicPlaylistSelect")?.addEventListener("change",renderMusic);
$("musicFileInput")?.addEventListener("change",importMusicFiles);
(async()=>{try{musicLibrary=JSON.parse(localStorage.getItem(MUSIC_LIBRARY_KEY)||localStorage.getItem("gembul_music_library_v1")||"[]");musicPlaylists=JSON.parse(localStorage.getItem(MUSIC_PLAYLISTS_KEY)||localStorage.getItem("gembul_music_playlists_v1")||"[]");if(!Array.isArray(musicLibrary))musicLibrary=[];if(!Array.isArray(musicPlaylists))musicPlaylists=[];musicPlaylists.forEach(p=>{if(!Array.isArray(p.tracks))p.tracks=[];});musicSave();renderMusic();}catch(e){musicLibrary=[];musicPlaylists=[];musicStatus("Perpustakaan musik tidak dapat dibaca: "+e.message);}})();

// Cadangan QR offline otomatis mengikuti snapshot data terakhir.
async function buildLocalQrBackupPayload(){
 if(!state)throw new Error("Data aplikasi belum dimuat.");
 const pending=await queueAll();
 return {format:"GEMBUL-OFFLINE-QR",formatVersion:2,createdAt:new Date().toISOString(),
  state,queue:pending,
  preferences:{theme:document.documentElement.classList.contains("light")?"light":"dark"},
  music:{library:Array.isArray(musicLibrary)?musicLibrary.map(item=>({name:item.name,mime:item.mime,size:item.size})):[],
   playlists:Array.isArray(musicPlaylists)?musicPlaylists.map(p=>({id:p.id,name:p.name,tracks:Array.isArray(p.tracks)?p.tracks:[]})):[]}};
}
let qrGalleryPage=0;
function renderQrBackupGallery(){
 const images=Array.isArray(latestBackupQrImages)?latestBackupQrImages:[];
 const full=$("qrFullPreview"),pageSize=8,totalPages=Math.max(1,Math.ceil(images.length/pageSize));
 qrGalleryPage=Math.min(Math.max(0,qrGalleryPage),totalPages-1);
 if(full){
  full.replaceChildren();
  if(images.length){
   const from=qrGalleryPage*pageSize;
   images.slice(from,from+pageSize).forEach((item,offset)=>{
    const figure=document.createElement("figure");figure.className="qr-full-item";
    const image=document.createElement("img");image.alt="QR cadangan bagian "+(from+offset+1)+" dari "+images.length;image.loading="lazy";image.decoding="async";image.src="data:image/png;base64,"+item.data;
    const caption=document.createElement("figcaption");caption.textContent="Bagian "+(from+offset+1)+" / "+images.length;
    figure.append(image,caption);full.appendChild(figure);
   });
  }else{const empty=document.createElement("p");empty.className="muted";empty.textContent="QR belum tersedia.";full.appendChild(empty);}
 }
 if($("qrFullCount"))$("qrFullCount").textContent=images.length?images.length.toLocaleString("id-ID")+" QR":"Belum tersedia";
 if($("qrFullStatus"))$("qrFullStatus").textContent=images.length?"Cadangan lengkap dibagi menjadi "+images.length.toLocaleString("id-ID")+" QR. Tampilkan halaman "+(qrGalleryPage+1)+" dari "+totalPages+". Pindai semua bagian, atau simpan seluruh gambar ke Galeri.":"QR belum tersedia.";
 if($("qrBackupStatus"))$("qrBackupStatus").textContent=images.length?images.length.toLocaleString("id-ID")+" QR · snapshot lengkap · "+new Date().toLocaleTimeString("id-ID"):"QR belum dibuat.";
 const prev=$("qrPagePrev"),next=$("qrPageNext"),label=$("qrPageLabel");
 if(prev)prev.disabled=!images.length||qrGalleryPage===0;
 if(next)next.disabled=!images.length||qrGalleryPage>=totalPages-1;
 if(label)label.textContent=images.length?"Halaman "+(qrGalleryPage+1)+" / "+totalPages:"—";
}
function changeQrGalleryPage(delta){qrGalleryPage+=delta;renderQrBackupGallery();}
async function generateLatestQrBackup(){
 if(!window.InsanNative?.generateBackupQr)throw new Error("Pembuatan QR lengkap hanya tersedia di aplikasi Android.");
 const payload=await buildLocalQrBackupPayload();
 const result=window.InsanNative.generateBackupQr(JSON.stringify(payload));
 if(String(result).startsWith("ERROR:")){latestBackupQrImages=[];renderQrBackupGallery();throw new Error(String(result));}
 latestBackupQrImages=JSON.parse(result);qrGalleryPage=0;
 if(!Array.isArray(latestBackupQrImages)||!latestBackupQrImages.length)throw new Error("Tidak ada gambar QR yang berhasil dibuat.");
 renderQrBackupGallery();
 return latestBackupQrImages;
}
function scheduleQrSnapshot(){
 if(!state||!window.InsanNative?.generateBackupQr)return;
 if(qrRefreshTimer)clearTimeout(qrRefreshTimer);
 qrRefreshTimer=setTimeout(async()=>{try{await generateLatestQrBackup();}
 catch(e){const message="Pembuatan QR tertunda: "+e.message;if($("qrBackupStatus"))$("qrBackupStatus").textContent=message;if($("qrFullStatus"))$("qrFullStatus").textContent=message;}},900);
}
async function refreshQrBackupNow(){
 try{if($("qrFullStatus"))$("qrFullStatus").textContent="Menyusun ulang semua QR dari data paling baru…";await generateLatestQrBackup();}
 catch(e){if($("qrFullStatus"))$("qrFullStatus").textContent="Gagal memperbarui QR: "+e.message;if($("qrBackupStatus"))$("qrBackupStatus").textContent="Gagal memperbarui QR: "+e.message;}
}
async function saveQrBackupImages(){
 try{
  if($("qrBackupStatus"))$("qrBackupStatus").textContent="Menyegarkan seluruh QR dari data paling baru…";
  await generateLatestQrBackup();
  if(!window.InsanNative?.saveBackupQrImages)throw new Error("Simpan QR ke Galeri hanya tersedia di aplikasi Android.");
  const saved=window.InsanNative.saveBackupQrImages();
  if(!saved||String(saved).startsWith("ERROR:"))throw new Error(String(saved||"Penyimpanan QR gagal."));
  const message=String(saved).replace(/^OK:/,"")+" Semua bagian berasal dari satu snapshot lengkap.";
  if($("qrBackupStatus"))$("qrBackupStatus").textContent=message;
  if($("qrFullStatus"))$("qrFullStatus").textContent=message;
 }catch(e){const message="Gagal menyimpan QR: "+e.message;if($("qrBackupStatus"))$("qrBackupStatus").textContent=message;if($("qrFullStatus"))$("qrFullStatus").textContent=message;}
}
function scanBackupQr(){if(window.InsanNative?.scanQrCamera){window.InsanNative.scanQrCamera();return;}$("qrBackupStatus").textContent="Pemindai kamera hanya tersedia di aplikasi Android.";}
function pickBackupQrImages(){if(window.InsanNative?.pickQrImages){window.InsanNative.pickQrImages();return;}const input=$("qrImageInput");input?.click();}
window.onNativeQrSegments=async(values,message)=>{try{
 const parts=Array.isArray(values)?values:[];if(!parts.length){if($("qrRestoreStatus"))$("qrRestoreStatus").textContent=message||"Tidak ada QR terbaca.";return;}
 let received=0,completed=[];
 for(const rawValue of parts){const raw=String(rawValue);
  if(raw.startsWith("GEMBULQR3|")){
   const assembled=window.InsanNative?.assembleBackupQr?.(JSON.stringify([raw]));
   if(!assembled||String(assembled).startsWith("ERROR:"))throw new Error(String(assembled||"Tidak dapat membaca QR tunggal."));
   const backup=JSON.parse(assembled);if(backup.format!=="GEMBUL-OFFLINE-QR"||backup.formatVersion!==2||!backup.state?.stock||!Array.isArray(backup.state.history))throw new Error("Isi QR bukan cadangan Gembul yang valid.");
   completed.push({key:null,backup});received++;continue;
  }
  const fields=raw.split("|");if(fields.length!==6||fields[0]!=="GEMBULQR2")continue;
  const id=fields[1],index=Number(fields[2]),total=Number(fields[3]);if(!id||!Number.isInteger(index)||!Number.isInteger(total)||index<1||index>total)continue;
  const key="gembul_qr_parts_"+id,stored=await kvGet(key)||{total,parts:{}};if(stored.total!==total)throw new Error("Jumlah bagian QR tidak konsisten.");stored.parts[index]=raw;await kvSet(key,stored);received++;
  if(Object.keys(stored.parts).length===total){const all=Object.keys(stored.parts).sort((a,b)=>Number(a)-Number(b)).map(k=>stored.parts[k]);const assembled=window.InsanNative?.assembleBackupQr?.(JSON.stringify(all));if(!assembled||String(assembled).startsWith("ERROR:"))throw new Error(String(assembled||"Tidak dapat menggabungkan QR."));const backup=JSON.parse(assembled);if(backup.format!=="GEMBUL-OFFLINE-QR"||backup.formatVersion!==2||!backup.state?.stock||!Array.isArray(backup.state.history))throw new Error("Isi QR bukan cadangan Gembul yang valid.");completed.push({key,backup});}
 }
 if($("qrRestoreStatus"))$("qrRestoreStatus").textContent=message||"QR diterima.";
 for(const item of completed){const backup=item.backup;if(!confirm("Cadangan lengkap ditemukan ("+new Date(backup.createdAt).toLocaleString("id-ID")+"). Pulihkan stok, target, riwayat, laporan, dan antrean lokal dari QR ini? Data lokal saat ini akan diganti."))continue;const currentUser=cachedUser||await kvGet("user");state=backup.state;if(currentUser)state.user=currentUser;cachedUser=currentUser||state.user||null;await kvSet("state",state);if(cachedUser)await kvSet("user",cachedUser);await queueReplace(Array.isArray(backup.queue)?backup.queue:[]);if(backup.preferences?.theme){document.documentElement.classList.toggle("light",backup.preferences.theme==="light");localStorage.setItem("theme",backup.preferences.theme);}if(backup.music&&Array.isArray(backup.music.library)){musicLibrary=backup.music.library;musicPlaylists=Array.isArray(backup.music.playlists)?backup.music.playlists:[];musicSave();renderMusic();}if(item.key)await kvDelete(item.key);await renderAll();if($("qrRestoreStatus"))$("qrRestoreStatus").textContent="Pemulihan offline berhasil. Stok, target, riwayat, dan laporan sudah dimuat ke perangkat ini. Periksa data sebelum melanjutkan.";showApp();}
 if(!completed.length&&$("qrRestoreStatus"))$("qrRestoreStatus").textContent="Bagian QR diterima ("+received+" baru). "+(message||"Pindai bagian lainnya sampai seluruh nomor lengkap.");
}catch(e){if($("qrRestoreStatus"))$("qrRestoreStatus").textContent="Pemulihan QR gagal: "+e.message;}};
$("stockProductionLoyang")?.addEventListener("input",updateStockProductionEstimate);
window.addEventListener("offline",()=>setStatus("Offline · tetap bisa mencatat stok","low"));
setInterval(checkForUpdates,300000);
(async()=>{
 const splash=$("bootLoading"),message=$("bootLoadingMessage");
 if(splash)splash.classList.remove("hidden");
 try{
  if(message)message.textContent="Memeriksa koneksi server…";
  const health=await api("/health",{timeoutMs:5000});
  window.insanServerConnected=true;
  if(!health?.ok)throw new Error("Server belum siap.");
  cachedUser=await kvGet("user");
  if(message)message.textContent="Server terhubung · memuat data…";
  if(token||cachedUser)await refresh();else{showLogin();setStatus("Server terhubung · silakan login","ok");}
 }catch(error){
  window.insanServerConnected=false;
  try{
   cachedUser=await kvGet("user");
   state=await kvGet("state");
   if(state&&cachedUser){
    showApp();await renderAll();setStatus("Server belum terhubung · mode offline aktif","low");
   }else{
    showLogin();$("loginMsg").textContent="Server belum terhubung. Login pertama membutuhkan koneksi ke server.";
    setStatus("Server belum terhubung","low");
   }
  }catch(storageError){
   showLogin();$("loginMsg").textContent="Server tidak terhubung dan data lokal tidak dapat dibaca.";
   setStatus("Koneksi dan penyimpanan lokal tidak tersedia","low");
  }
 }finally{
  if(!navigator.onLine)setStatus("Offline · data lokal akan digunakan jika tersedia","low");
  hideBootLoading();
 }
})();


// Live operational statistics and typing/deleting system interface.
function collectOperationalStats(){
 const history=Array.isArray(state?.history)?state.history:[];
 const production=history.filter(tx=>tx?.type==="production");
 const variants={ori:0,beef:0,spicy:0,cheese:0},outlets={};
 let totalProduced=0;
 for(const tx of production){
  const lines=tx.lines||{};
  for(const key of Object.keys(variants)){
   const quantity=Number(lines[key])||0;
   if(Number.isFinite(quantity)&&quantity>0){variants[key]+=quantity;totalProduced+=quantity;}
  }
  const outlet=tx.location||"Outlet tidak diketahui";
  outlets[outlet]=(outlets[outlet]||0)+(Number(lines.total)||Object.keys(variants).reduce((sum,key)=>sum+(Number(lines[key])||0),0));
 }
 const server=state?.stats||{};
 const hasServerProduction=Number(server.productionEntries)>0||Number(server.totalProduced)>0;
 return {
  totalProduced:hasServerProduction?Number(server.totalProduced)||0:totalProduced,
  productionEntries:hasServerProduction?Number(server.productionEntries)||0:production.length,
  variants:hasServerProduction?server.variants||variants:variants,
  outlets:hasServerProduction&&Object.keys(server.outlets||{}).length?server.outlets:outlets,
  topVariant:server.topVariant||null,
  firstProductionAt:server.firstProductionAt||production.slice().sort((a,b)=>String(a.createdAt||a.date||"").localeCompare(String(b.createdAt||b.date||"")))[0]?.createdAt||production.slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")))[0]?.date||null,
  lastProductionAt:server.lastProductionAt||production.slice().sort((a,b)=>String(b.createdAt||b.date||"").localeCompare(String(a.createdAt||a.date||"")))[0]?.createdAt||null
 };
}
function renderTechStatistics(){
 if(!state)return;
 const stats=collectOperationalStats(),variants=stats.variants||{},names={ori:"Ori",beef:"Beef",spicy:"Spicy",cheese:"Cheese"};
 const fmt=value=>(Number(value)||0).toLocaleString("id-ID");
 const stock=state.stock||{},stockTotal=Object.values(stock).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);
 const ranked=Object.entries(names).map(([key,label])=>({key,label,count:Number(variants[key])||0})).sort((a,b)=>b.count-a.count);
 const top=ranked[0]&&ranked[0].count>0?ranked[0]:null;
 const put=(id,value)=>{const node=$(id);if(node)node.textContent=value;};
 put("techStockTotal",fmt(stockTotal)+" pcs");
 put("techProductionTotal",fmt(stats.totalProduced)+" loyang");
 put("techProductionEntries",fmt(stats.productionEntries));
 put("techTopVariant",top?top.label:"Belum ada");
 put("techTopVariantCount",top?fmt(top.count)+" loyang dibuat":"belum ada produksi");
 const first=stats.firstProductionAt,last=stats.lastProductionAt;
 const dateFmt=value=>value?new Date(value).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}):"";
 put("techProductionPeriod",(dateFmt(first)||"awal pencatatan")+(dateFmt(last)?" – "+dateFmt(last):""));
 put("techVariantBreakdown",ranked.map(x=>x.label+" "+fmt(x.count)).join(" · "));
 const outlets=Object.entries(stats.outlets||{}).sort((a,b)=>Number(b[1])-Number(a[1]));
 put("techOutletBreakdown",outlets.length?outlets.map(([name,value])=>name+" "+fmt(value)).join(" · "):"Belum ada data outlet");
 put("techCopyrightYear",String(new Date().getFullYear()));
}
function buildTechMessages(){
 const stats=collectOperationalStats(),variants=stats.variants||{},names={ori:"Ori",beef:"Beef",spicy:"Spicy",cheese:"Cheese"};
 const fmt=value=>(Number(value)||0).toLocaleString("id-ID");
 const stock=state?.stock||{},stockTotal=Object.values(stock).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);
 const ranked=Object.entries(names).map(([key,label])=>({label,count:Number(variants[key])||0})).sort((a,b)=>b.count-a.count);
 const top=ranked[0]?.count?ranked[0]:null;
 const from=stats.firstProductionAt?new Date(stats.firstProductionAt).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}):"awal pencatatan";
 const outlets=Object.entries(stats.outlets||{}).sort((a,b)=>Number(b[1])-Number(a[1]));
 return [
  "KALKULASI STOK: "+fmt(stockTotal)+" pcs tersedia dari seluruh item.",
  "REKAP PRODUKSI SEJAK "+from+": "+fmt(stats.totalProduced)+" loyang tercatat.",
  "ANALISIS VARIAN: "+ranked.map(x=>x.label+" "+fmt(x.count)).join(" · ")+".",
  "VARIAN TERBANYAK: "+(top?top.label+" dengan "+fmt(top.count)+" loyang.":"Belum ada data produksi."),
  "TOTAL CATATAN PRODUKSI: "+fmt(stats.productionEntries)+" transaksi.",
  "REKAP OUTLET: "+(outlets.length?outlets.map(([name,value])=>name+" "+fmt(value)).join(" · "):"belum tersedia")+".",
  "ESTIMASI OPERASIONAL: angka dihitung dari data server dan riwayat produksi.",
  "KatsuCode ID × Insan · sistem informasi operasional Abon Gulung Gembul."
 ];
}
function startTechTicker(){
 const target=$("techTickerText");if(!target||target.dataset.ready==="1")return;
 target.dataset.ready="1";
 let messages=[],messageIndex=0,charIndex=0,deleting=false,timer=null,refreshAt=0;
 const tick=()=>{
  if(!state){timer=window.setTimeout(tick,1000);return;}
  if(Date.now()-refreshAt>5000){messages=buildTechMessages();refreshAt=Date.now();messageIndex%=messages.length;}
  const message=messages[messageIndex]||"INSAN SYSTEM INTERFACE · KatsuCode ID × Insan";
  charIndex+=deleting?-1:1;
  target.textContent=message.slice(0,Math.max(0,charIndex));
  let delay=deleting?22:34;
  if(!deleting&&charIndex>=message.length){deleting=true;delay=2100;}
  else if(deleting&&charIndex<=0){deleting=false;messageIndex=(messageIndex+1)%messages.length;delay=450;}
  timer=window.setTimeout(tick,delay);
 };
 if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches){target.textContent="INSAN SYSTEM INTERFACE · KatsuCode ID × Insan";return;}
 timer=window.setTimeout(tick,500);
 document.addEventListener("visibilitychange",()=>{if(document.hidden){window.clearTimeout(timer);}else{window.clearTimeout(timer);timer=window.setTimeout(tick,250);}});
}
startTechTicker();
