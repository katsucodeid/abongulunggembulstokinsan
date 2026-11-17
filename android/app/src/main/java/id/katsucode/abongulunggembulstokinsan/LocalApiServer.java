package id.katsucode.abongulunggembulstokinsan;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Base64;
import fi.iki.elonen.NanoHTTPD;
import org.json.JSONArray;
import org.json.JSONObject;
import org.mindrot.jbcrypt.BCrypt;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Fully embedded loopback web/API service. Business data is persisted only in SQLite. */
public final class LocalApiServer extends NanoHTTPD {
    private final Context context;
    private final InsanLocalDatabase database;
    private final Map<String, JSONObject> sessions = new ConcurrentHashMap<>();
    private final Map<String, long[]> loginAttempts = new ConcurrentHashMap<>();
    private static final String[] KEYS={"box3","box5outer","box5inner","paper","mika"};
    private static final String[] LABELS={"Box isi 3","Box isi 5 luar (Slongsong)","Box isi 5 dalam (Tatakan Polos)","Kertas Minyak","Mika roti roll"};
    private static final String[] OUTLETS={"Grand Wisata","Bektim","Harapan Indah"};

    public LocalApiServer(Context c, InsanLocalDatabase db) throws java.io.IOException {
        super("127.0.0.1",18787); context=c.getApplicationContext(); database=db; start(SOCKET_READ_TIMEOUT,false);
    }
    private JSONObject read() throws Exception { return database.readDatabase(); }
    private synchronized void save(JSONObject d) throws Exception { database.saveDatabase(d); }
    private JSONObject itemDefs(JSONObject d) throws Exception {
        JSONObject out=new JSONObject(), settings=d.optJSONObject("settings");
        JSONObject mins=settings==null?null:settings.optJSONObject("minStock");
        for(int i=0;i<KEYS.length;i++){JSONObject v=new JSONObject();v.put("label",LABELS[i]);Object min=mins==null?JSONObject.NULL:mins.opt(KEYS[i]);v.put("min",min==null?JSONObject.NULL:min);out.put(KEYS[i],v);}
        return out;
    }
    private JSONObject snapshot(JSONObject d, JSONObject user) throws Exception {
        JSONArray history=d.optJSONArray("transactions"); JSONArray recent=new JSONArray();
        if(history!=null) for(int i=Math.max(0,history.length()-1000);i<history.length();i++) recent.put(history.get(i));
        JSONObject out=new JSONObject();out.put("stock",d.getJSONObject("stock"));out.put("itemDefs",itemDefs(d));out.put("history",reverse(recent));
        out.put("user",user==null?JSONObject.NULL:new JSONObject().put("username",user.optString("username")).put("role",user.optString("role")));return out;
    }
    private JSONArray reverse(JSONArray a)throws Exception{JSONArray r=new JSONArray();for(int i=a.length()-1;i>=0;i--)r.put(a.get(i));return r;}
    private JSONObject body(IHTTPSession s)throws Exception{Map<String,String> files=new HashMap<>();s.parseBody(files);String raw=files.get("postData");return raw==null||raw.isEmpty()?new JSONObject():new JSONObject(raw);}
    private Response json(int status, JSONObject value){return newFixedLengthResponse(Response.Status.lookup(status), "application/json; charset=utf-8",value.toString());}
    private JSONObject error(String message)throws Exception{return new JSONObject().put("error",message);}
    private JSONObject user(IHTTPSession s){
        String h=s.getHeaders().get("authorization");if(h==null||!h.toLowerCase(Locale.ROOT).startsWith("bearer "))return null;
        return sessions.get(h.substring(7).trim());
    }
    private Response requireUser(IHTTPSession s, JSONObject u){return u==null?json(401,safeError("Sesi tidak valid. Silakan login kembali.")):null;}
    private JSONObject safeError(String m){try{return error(m);}catch(Exception e){return new JSONObject();}}
    private Response admin(JSONObject u){return !"admin".equals(u.optString("role"))?json(403,safeError("Khusus admin.")):null;}
    private String id(){return UUID.randomUUID().toString();}
    private String now(){return java.time.Instant.now().toString();}
    private void audit(JSONObject d,JSONObject u,String action,JSONObject details)throws Exception{
        JSONArray a=d.optJSONArray("auditLog");if(a==null){a=new JSONArray();d.put("auditLog",a);}
        a.put(new JSONObject().put("id",id()).put("at",now()).put("username",u==null?"system":u.optString("username")).put("role",u==null?"system":u.optString("role")).put("action",action).put("details",details==null?new JSONObject():details));
        while(a.length()>10000)a.remove(0);
    }
    private long number(JSONObject o,String k,long fallback)throws Exception{
        Object v=o.has(k)?o.get(k):fallback;if(!(v instanceof Number))throw new Exception("Nilai "+k+" harus bilangan bulat.");
        double x=((Number)v).doubleValue();if(x<0||x!=Math.rint(x)||x>Long.MAX_VALUE)throw new Exception("Nilai "+k+" harus bilangan bulat nol atau lebih.");return (long)x;
    }
    private JSONObject operation(JSONObject op,String username,JSONObject d)throws Exception{
        String oid=op.optString("id"),type=op.optString("type");if(oid.isEmpty()||oid.length()>100)throw new Exception("ID transaksi tidak valid.");
        JSONArray processed=d.optJSONArray("processed");if(processed==null){processed=new JSONArray();d.put("processed",processed);}
        for(int i=0;i<processed.length();i++)if(oid.equals(processed.optString(i)))return new JSONObject().put("id",oid).put("duplicate",true);
        JSONObject p=op.optJSONObject("payload");if(p==null)p=new JSONObject();
        JSONObject changes=new JSONObject(),lines=new JSONObject();String date=p.optString("date",java.time.LocalDate.now().toString()),note=p.optString("note",""),location="";
        if("stock-out".equals(type)||"stock-in".equals(type)){
            String item=p.optString("item");if(!Arrays.asList(KEYS).contains(item))throw new Exception("Barang tidak dikenal.");
            long qty;
            if("stock-out".equals(type)){qty=number(p,"quantity",0);if(qty<=0)throw new Exception("Jumlah pengurangan harus lebih dari nol.");note=p.optString("note").trim();if(note.isEmpty())throw new Exception("Alasan pengurangan wajib diisi.");lines.put("item",item).put("quantity",qty).put("reason",note);changes.put(item,-qty);}
            else{long packs=number(p,"packs",0),per=number(p,"perPack",0),extra=number(p,"extra",0);qty=Math.addExact(Math.multiplyExact(packs,per),extra);if(qty<=0)throw new Exception("Jumlah barang masuk harus lebih dari nol.");lines.put("item",item).put("packs",packs).put("perPack",per).put("extra",extra).put("total",qty);changes.put(item,qty);}
        } else if("production".equals(type)){
            long ori=number(p,"ori",0),beef=number(p,"beef",0),spicy=number(p,"spicy",0),cheese=number(p,"cheese",0),total=Math.addExact(Math.addExact(ori,beef),Math.addExact(spicy,cheese));
            if(total<=0)throw new Exception("Jumlah loyang harus lebih dari nol.");
            location=p.optString("location");if(!Arrays.asList(OUTLETS).contains(location))throw new Exception("Pilih salah satu outlet yang tersedia.");
            JSONObject packaging=new JSONObject();long box3=0,box5=0;
            JSONObject by=p.optJSONObject("packagingByVariant"),custom=p.optJSONObject("custom");
            String[] variants={"ori","beef","spicy","cheese"};long[] amounts={ori,beef,spicy,cheese};
            if(by==null&&custom!=null&&custom.optBoolean("enabled")){box3=number(custom,"box3",0);box5=number(custom,"box5",0);for(int i=0;i<4;i++)packaging.put(variants[i],new JSONObject().put("enabled",false).put("box3",amounts[i]*2).put("box5",amounts[i]*2));}
            else for(int i=0;i<4;i++){JSONObject v=by==null?null:by.optJSONObject(variants[i]);boolean enabled=v!=null&&v.optBoolean("enabled");long b3=enabled?number(v,"box3",0):amounts[i]*2,b5=enabled?number(v,"box5",0):amounts[i]*2;box3=Math.addExact(box3,b3);box5=Math.addExact(box5,b5);packaging.put(variants[i],new JSONObject().put("enabled",enabled).put("box3",b3).put("box5",b5));}
            if(by==null&&custom!=null&&custom.optBoolean("enabled")){box3=-box3;box5=-box5;}
            changes.put("box3",-box3).put("box5outer",-box5).put("box5inner",-box5).put("paper",-box5);
            lines.put("ori",ori).put("beef",beef).put("spicy",spicy).put("cheese",cheese).put("total",total).put("packagingByVariant",packaging).put("requestNote",p.optString("requestNote",""));
        } else throw new Exception("Jenis transaksi tidak dikenal.");
        JSONObject stock=d.getJSONObject("stock");
        for(int ki=0;ki<keys(changes).length();ki++){String key=keys(changes).getString(ki);long delta=changes.getLong(key),current=stock.getLong(key);if(delta<0&&current < -delta)throw new Exception("Stok "+key+" tidak mencukupi.");Math.addExact(current,delta);}
        for(int ki=0;ki<keys(changes).length();ki++){String key=keys(changes).getString(ki);stock.put(key,Math.addExact(stock.getLong(key),changes.getLong(key)));}
        JSONObject tx=new JSONObject().put("id",oid).put("type",type).put("date",date).put("location",location).put("note",note).put("lines",lines).put("changes",changes).put("createdBy",username).put("createdAt",now());
        d.getJSONArray("transactions").put(tx);audit(d,new JSONObject().put("username",username).put("role","staff"),"transaction.create",new JSONObject().put("id",oid).put("type",type));
        processed.put(oid);while(processed.length()>5000)processed.remove(0);
        return new JSONObject().put("id",oid).put("accepted",true);
    }
    private Response staticFile(String uri){
        String path=uri.equals("/")?"index.html":uri.substring(1);
        if(path.contains("..")||path.startsWith("/")||path.isEmpty())return newFixedLengthResponse(Response.Status.FORBIDDEN,"text/plain","Forbidden");
        try(InputStream in=context.getAssets().open("www/"+path);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
            String mime=path.endsWith(".html")?"text/html; charset=utf-8":path.endsWith(".js")?"application/javascript; charset=utf-8":path.endsWith(".css")?"text/css; charset=utf-8":path.endsWith(".png")?"image/png":path.endsWith(".jpg")||path.endsWith(".jpeg")?"image/jpeg":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".json")?"application/json":"application/octet-stream";
            return newFixedLengthResponse(Response.Status.OK,mime,new java.io.ByteArrayInputStream(out.toByteArray()),out.size());
        }catch(Exception e){if(!path.contains("."))return staticFile("/index.html");return newFixedLengthResponse(Response.Status.NOT_FOUND,"text/plain","Not found");}
    }
    @Override public Response serve(IHTTPSession s){
        try{
            String path=s.getUri(),method=s.getMethod().name();JSONObject u=user(s);
            if(!path.startsWith("/api/"))return staticFile(path);
            if(path.equals("/api/health"))return json(200,new JSONObject().put("ok",true).put("service","INSAN Android Embedded API").put("storage","sqlite").put("online",false));
            if(path.equals("/api/auth/status")){JSONObject d=read();return json(200,new JSONObject().put("setupRequired",d.getJSONArray("users").length()==0));}
            if(path.equals("/api/auth/bootstrap")&&Method.POST.equals(s.getMethod())){
                JSONObject p=body(s),d=read();if(d.getJSONArray("users").length()!=0)return json(409,error("Akun admin sudah dibuat."));
                String name=p.optString("username").trim(),pass=p.optString("password");if(name.length()<3||name.length()>40||!name.matches("[A-Za-z0-9._-]+")||pass.length()<10)return json(400,error("Username minimal 3 karakter dan password minimal 10 karakter."));
                JSONArray users=d.getJSONArray("users");users.put(new JSONObject().put("id",id()).put("username",name).put("passwordHash",BCrypt.hashpw(pass,BCrypt.gensalt(12))).put("role","admin").put("createdAt",now()));audit(d,null,"user.bootstrap",new JSONObject().put("username",name));save(d);return json(201,new JSONObject().put("ok",true));
            }
            if(path.equals("/api/auth/login")&&Method.POST.equals(s.getMethod())){
                JSONObject p=body(s);String name=p.optString("username").trim(),pass=p.optString("password");long now=System.currentTimeMillis();long[] a=loginAttempts.get(name.toLowerCase(Locale.ROOT));if(a!=null&&now-a[0]<900000&&a[1]>=10)return json(429,error("Terlalu banyak percobaan login. Coba lagi setelah 15 menit."));
                JSONObject d=read();JSONObject found=null;JSONArray users=d.getJSONArray("users");for(int i=0;i<users.length();i++){JSONObject x=users.getJSONObject(i);if(name.equalsIgnoreCase(x.optString("username"))){found=x;break;}}
                if(found==null||!BCrypt.checkpw(pass,found.optString("passwordHash",""))){if(a==null||now-a[0]>=900000)a=new long[]{now,0};a[1]++;loginAttempts.put(name.toLowerCase(Locale.ROOT),a);return json(401,error("Username atau password salah."));}
                loginAttempts.remove(name.toLowerCase(Locale.ROOT));JSONObject safe=new JSONObject().put("username",found.getString("username")).put("role",found.getString("role"));String token=Base64.encodeToString((id()+":"+id()).getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP);sessions.put(token,safe);audit(d,safe,"auth.login",new JSONObject());save(d);return json(200,new JSONObject().put("token",token).put("user",safe));
            }
            if(path.equals("/api/state")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;return json(200,snapshot(read(),u));}
            if(path.equals("/api/sync")&&Method.POST.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;JSONObject p=body(s),d=read();JSONArray ops=p.optJSONArray("operations");if(ops==null||ops.length()==0||ops.length()>100)return json(400,error("Kirim 1 sampai 100 transaksi per sinkronisasi."));JSONArray accepted=new JSONArray(),rejected=new JSONArray();for(int i=0;i<ops.length();i++){JSONObject op=ops.optJSONObject(i);try{if(op==null)throw new Exception("Transaksi tidak valid.");accepted.put(operation(op,u.optString("username"),d));}catch(Exception e){rejected.put(new JSONObject().put("id",op==null?JSONObject.NULL:op.opt("id")).put("error",e.getMessage()));}}save(d);return json(200,new JSONObject().put("accepted",accepted).put("rejected",rejected).put("state",snapshot(d,u)));}
            if(path.equals("/api/report")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;JSONObject d=read(),st=d.getJSONObject("stock");String report="*INSAN*:\nBox isi 3 : "+st.optLong("box3")+"pcs\nBox isi 5 luar : "+st.optLong("box5outer")+"pcs\nBox isi 5 dalam : "+st.optLong("box5inner")+"pcs\nKertas Minyak: "+st.optLong("paper")+"pcs\nMika roti roll : "+st.optLong("mika")+"pcs";JSONArray manual=new JSONArray(),all=d.getJSONArray("transactions");for(int mi=0;mi<all.length();mi++){JSONObject tx=all.getJSONObject(mi);if(!"stock-out".equals(tx.optString("type")))continue;JSONObject l=tx.optJSONObject("lines");String item=l==null?"":l.optString("item");long quantity=l==null?0:l.optLong("quantity");JSONArray corrections=new JSONArray();for(int ci=0;ci<all.length();ci++){JSONObject ct=all.getJSONObject(ci),cl=ct.optJSONObject("lines");if("stock-correction".equals(ct.optString("type"))&&cl!=null&&tx.optString("id").equals(cl.optString("targetTransactionId")))corrections.put(new JSONObject().put("date",ct.opt("date")).put("createdAt",ct.opt("createdAt")).put("createdBy",ct.optString("createdBy","-")).put("originalQuantity",cl.optLong("originalQuantity")).put("correctedQuantity",cl.optLong("correctedQuantity")).put("returnedDelta",cl.optLong("returnedDelta")).put("reason",cl.optString("reason")));}manual.put(new JSONObject().put("id",tx.optString("id")).put("date",tx.opt("date")).put("createdAt",tx.opt("createdAt")).put("createdBy",tx.optString("createdBy","-")).put("item",item).put("quantity",quantity).put("reason",l==null?tx.optString("note"):l.optString("reason",tx.optString("note"))).put("note",tx.optString("note")).put("corrections",corrections));}return json(200,new JSONObject().put("report",report).put("stock",st).put("stockStartDate",d.opt("stockStartDate")).put("manualStockOuts",manual));}
            if(path.equals("/api/users")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONObject d=read();JSONArray out=new JSONArray();for(int i=0;i<d.getJSONArray("users").length();i++){JSONObject a=d.getJSONArray("users").getJSONObject(i);out.put(new JSONObject().put("username",a.optString("username")).put("role",a.optString("role")));}return json(200,new JSONObject().put("users",out));}
            if(path.equals("/api/users")&&Method.POST.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONObject p=body(s),d=read();String name=p.optString("username").trim(),pass=p.optString("password"),role=p.optString("role","staff");if(name.length()<3||pass.length()<10||!Arrays.asList("admin","staff").contains(role))return json(400,error("Username, password minimal 10 karakter, dan role valid wajib diisi."));JSONArray users=d.getJSONArray("users");for(int i=0;i<users.length();i++)if(name.equalsIgnoreCase(users.getJSONObject(i).optString("username")))return json(409,error("Username sudah digunakan."));users.put(new JSONObject().put("id",id()).put("username",name).put("passwordHash",BCrypt.hashpw(pass,BCrypt.gensalt(12))).put("role",role).put("createdAt",now()));audit(d,u,"user.create",new JSONObject().put("username",name).put("role",role));save(d);return json(201,new JSONObject().put("ok",true).put("username",name).put("role",role));}
            if(path.equals("/api/admin/backup")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONObject d=read();String checksum=hex(MessageDigest.getInstance("SHA-256").digest(d.toString().getBytes(StandardCharsets.UTF_8)));return json(200,new JSONObject().put("format","INSAN-STOCK-BACKUP").put("formatVersion",1).put("app","INSAN Stock Manager").put("createdAt",now()).put("checksum",checksum).put("database",d));}
            if(path.equals("/api/admin/restore")&&Method.POST.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONObject p=body(s),d=p.optJSONObject("database");if(!"INSAN-STOCK-BACKUP".equals(p.optString("format"))||p.optInt("formatVersion")!=1||d==null)return json(400,error("Format file bukan cadangan INSAN yang didukung."));String sum=hex(MessageDigest.getInstance("SHA-256").digest(d.toString().getBytes(StandardCharsets.UTF_8)));if(!sum.equals(p.optString("checksum")))return json(400,error("Checksum tidak cocok."));InsanLocalDatabase.validateDatabase(d);JSONObject old=read();save(old);save(d);sessions.clear();return json(200,new JSONObject().put("ok",true).put("message","Pemulihan berhasil. Silakan login kembali."));}
            if(path.equals("/api/admin/settings")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONObject set=read().optJSONObject("settings");return json(200,new JSONObject().put("minStock",set==null?new JSONObject():set.optJSONObject("minStock")));}
            if(path.equals("/api/admin/settings/min-stock")&&Method.PUT.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONObject p=body(s).optJSONObject("minStock");if(p==null)return json(400,error("Pengaturan minimum stok tidak valid."));JSONObject d=read(),next=new JSONObject();for(String k:KEYS){Object v=p.opt(k);if(v==null||v==JSONObject.NULL||"".equals(v))next.put(k,JSONObject.NULL);else if(v instanceof Number&&((Number)v).doubleValue()>=0&&((Number)v).doubleValue()==((Number)v).longValue())next.put(k,v);else return json(400,error("Batas minimum "+k+" tidak valid."));}JSONObject set=d.optJSONObject("settings");if(set==null)set=new JSONObject();set.put("minStock",next);d.put("settings",set);audit(d,u,"settings.min_stock.update",next);save(d);return json(200,new JSONObject().put("ok",true).put("minStock",next));}
            if(path.equals("/api/analytics/usage")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;JSONObject d=read();int days=30;try{days=Math.max(7,Math.min(365,Integer.parseInt(s.getParameters().getOrDefault("days",Collections.singletonList("30")).get(0))));}catch(Exception ignored){}String from=java.time.LocalDate.now().minusDays(days).toString();JSONObject usage=new JSONObject(),daily=new JSONObject();for(String k:KEYS)usage.put(k,0);JSONArray txs=d.getJSONArray("transactions");for(int i=0;i<txs.length();i++){JSONObject tx=txs.getJSONObject(i);if(tx.optString("date").compareTo(from)<0)continue;JSONObject ch=tx.optJSONObject("changes");if(ch==null)continue;for(int ci=0;ci<keys(ch).length();ci++){String k=keys(ch).getString(ci);long delta=ch.optLong(k);if(usage.has(k)&&delta<0){usage.put(k,usage.optLong(k)-delta);JSONObject day=daily.optJSONObject(tx.optString("date"));if(day==null)day=new JSONObject();day.put(k,day.optLong(k)-delta);daily.put(tx.optString("date"),day);}}}return json(200,new JSONObject().put("days",days).put("from",from).put("through",java.time.LocalDate.now().toString()).put("usage",usage).put("daily",daily).put("itemDefs",itemDefs(d)));}
            if(path.equals("/api/production/calendar")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;String month=s.getParameters().getOrDefault("month",Collections.singletonList(java.time.LocalDate.now().toString().substring(0,7))).get(0);if(!month.matches("\\d{4}-\\d{2}"))return json(400,error("Format bulan harus YYYY-MM."));JSONArray events=new JSONArray(),txs=read().getJSONArray("transactions");for(int i=0;i<txs.length();i++){JSONObject t=txs.getJSONObject(i);if("production".equals(t.optString("type"))&&t.optString("date").startsWith(month)){JSONObject l=t.optJSONObject("lines");events.put(new JSONObject().put("id",t.optString("id")).put("date",t.optString("date")).put("location",t.optString("location")).put("total",l==null?0:l.optInt("total")).put("createdBy",t.optString("createdBy")));}}return json(200,new JSONObject().put("month",month).put("events",events));}
            if(path.equals("/api/admin/audit")&&Method.GET.equals(s.getMethod())){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONArray a=read().optJSONArray("auditLog");if(a==null)a=new JSONArray();int limit=200;try{limit=Math.max(1,Math.min(1000,Integer.parseInt(s.getParameters().getOrDefault("limit",Collections.singletonList("200")).get(0))));}catch(Exception ignored){}JSONArray recent=new JSONArray();for(int ai=Math.max(0,a.length()-limit);ai<a.length();ai++)recent.put(a.get(ai));return json(200,new JSONObject().put("entries",reverse(recent)));}
            if(path.equals("/api/export/transactions.csv")&&Method.GET.equals(s.getMethod())){
                Response x=requireUser(s,u);if(x!=null)return x;
                JSONArray txs=read().getJSONArray("transactions");
                StringBuilder csv=new StringBuilder("\"Tanggal\",\"Jenis\",\"Outlet\",\"Pengguna\",\"Total loyang\",\"Catatan\",\"Perubahan stok\"\r\n");
                for(int i=0;i<txs.length();i++){
                    JSONObject t=txs.getJSONObject(i),l=t.optJSONObject("lines"),ch=t.optJSONObject("changes");
                    StringBuilder changes=new StringBuilder();
                    if(ch!=null)for(int ci=0;ci<keys(ch).length();ci++){String k=keys(ch).getString(ci);if(changes.length()>0)changes.append("; ");changes.append(k).append(":").append(ch.opt(k));}
                    String[] vals={t.optString("date"),t.optString("type"),t.optString("location"),t.optString("createdBy"),l==null?"":l.optString("total"),t.optString("note"),changes.toString()};
                    for(int z=0;z<vals.length;z++){if(z>0)csv.append(",");csv.append('"').append(vals[z].replace("\"","\"\"")).append('"');}
                    csv.append("\r\n");
                }
                return newFixedLengthResponse(Response.Status.OK,"text/csv; charset=utf-8",csv.toString());
            }
            if(path.equals("/api/update/check")||path.equals("/api/update/commits")||path.equals("/api/update/history")){Response x=requireUser(s,u);if(x!=null)return x;return json(503,error("Pembaruan GitHub tidak tersedia dalam mode offline. Data dan transaksi lokal tetap dapat digunakan."));}
            if(path.equals("/api/update/apply")){Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;return json(503,error("Pembaruan aplikasi dilakukan dengan memasang APK versi baru. Data SQLite lokal tetap dipertahankan."));}
            if(path.startsWith("/api/transactions/")&&path.endsWith("/corrections")&&Method.POST.equals(s.getMethod()))return correction(s,u,path);
            if(path.startsWith("/api/transactions/")&&Method.PUT.equals(s.getMethod()))return editTransaction(s,u,path.substring("/api/transactions/".length()));
            if(path.startsWith("/api/transactions/")&&Method.DELETE.equals(s.getMethod()))return deleteTransaction(s,u,path.substring("/api/transactions/".length()));
            return json(404,error("Endpoint lokal tidak ditemukan: "+method+" "+path));
        }catch(Exception e){return json(400,safeError(e.getMessage()==null?"Permintaan lokal gagal.":e.getMessage()));}
    }
    private JSONArray keys(JSONObject o){JSONArray a=o.names();return a==null?new JSONArray():a;}
    private String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format(Locale.US,"%02x",x&255));return s.toString();}
    private Response editTransaction(IHTTPSession s,JSONObject u,String txid)throws Exception{
        Response x=requireUser(s,u);if(x!=null)return x;JSONObject d=read(),p=body(s);JSONArray a=d.getJSONArray("transactions");int ix=-1;JSONObject old=null;for(int i=0;i<a.length();i++)if(txid.equals(a.getJSONObject(i).optString("id"))){ix=i;old=a.getJSONObject(i);break;}if(old==null)return json(404,error("Target produksi tidak ditemukan."));if(!"production".equals(old.optString("type")))return json(400,error("Hanya target produksi yang dapat diedit."));if(!"admin".equals(u.optString("role"))&&!u.optString("username").equals(old.optString("createdBy")))return json(403,error("Anda hanya dapat mengedit target yang dibuat sendiri."));
        JSONObject fake=new JSONObject().put("id",txid).put("type","production").put("payload",p);JSONObject oldChanges=old.optJSONObject("changes");d.getJSONArray("transactions").remove(ix);JSONArray processed=d.getJSONArray("processed");for(int pi=processed.length()-1;pi>=0;pi--)if(txid.equals(processed.optString(pi)))processed.remove(pi);JSONObject stock=d.getJSONObject("stock");if(oldChanges!=null)for(int oi=0;oi<keys(oldChanges).length();oi++){String k=keys(oldChanges).getString(oi);stock.put(k,Math.addExact(stock.optLong(k),oldChanges.optLong(k)));}operation(fake,u.optString("username"),d);JSONObject newTx=d.getJSONArray("transactions").getJSONObject(d.getJSONArray("transactions").length()-1);newTx.put("createdAt",old.optString("createdAt"));newTx.put("updatedAt",now()).put("updatedBy",u.optString("username"));audit(d,u,"transaction.update",new JSONObject().put("id",txid));save(d);return json(200,new JSONObject().put("ok",true).put("state",snapshot(d,u)));
    }
    private Response deleteTransaction(IHTTPSession s,JSONObject u,String txid)throws Exception{
        Response x=requireUser(s,u);if(x!=null)return x;if((x=admin(u))!=null)return x;JSONObject d=read();JSONArray a=d.getJSONArray("transactions");int ix=-1;JSONObject tx=null;for(int i=0;i<a.length();i++)if(txid.equals(a.getJSONObject(i).optString("id"))){ix=i;tx=a.getJSONObject(i);break;}if(tx==null)return json(404,error("Transaksi tidak ditemukan."));JSONObject changes=tx.optJSONObject("changes"),stock=d.getJSONObject("stock");if("stock-out".equals(tx.optString("type"))){for(int ci=0;ci<a.length();ci++){JSONObject corr=a.optJSONObject(ci),cl=corr==null?null:corr.optJSONObject("lines");if(corr!=null&&"stock-correction".equals(corr.optString("type"))&&cl!=null&&txid.equals(cl.optString("targetTransactionId")))return json(400,error("Transaksi pengurangan ini sudah memiliki koreksi. Selesaikan catatan koreksinya terlebih dahulu."));}}if(changes!=null)for(int ci=0;ci<keys(changes).length();ci++){String k=keys(changes).getString(ci);long next=stock.optLong(k)-changes.optLong(k);if(next<0)throw new Exception("Pembatalan transaksi tidak aman.");stock.put(k,next);}a.remove(ix);JSONArray processed=d.getJSONArray("processed");for(int i=processed.length()-1;i>=0;i--)if(txid.equals(processed.optString(i)))processed.remove(i);audit(d,u,"transaction.delete",new JSONObject().put("id",txid));save(d);return json(200,new JSONObject().put("ok",true).put("state",snapshot(d,u)));
    }
    private Response correction(IHTTPSession s,JSONObject u,String path)throws Exception {
        Response authResponse=requireUser(s,u);if(authResponse!=null)return authResponse;
        JSONObject p=body(s),d=read();
        String target=path.substring("/api/transactions/".length(),path.length()-"/corrections".length());
        String cid=p.optString("correctionId"),action=p.optString("action"),reason=p.optString("reason").trim();
        if(cid.isEmpty()||cid.length()>100||reason.length()<3||!Arrays.asList("revise","return","reverse").contains(action))throw new Exception("Data koreksi tidak valid.");
        JSONArray txs=d.getJSONArray("transactions");
        for(int i=0;i<txs.length();i++){
            JSONObject existing=txs.getJSONObject(i);
            if(cid.equals(existing.optString("id"))){
                JSONObject l=existing.optJSONObject("lines");
                boolean same="stock-correction".equals(existing.optString("type"))&&l!=null&&target.equals(l.optString("targetTransactionId"))&&action.equals(l.optString("action"))&&reason.equals(l.optString("reason"))&&
                    ((p.opt("quantity")==null&&l.opt("requestQuantity")==null)||(p.opt("quantity")!=null&&String.valueOf(p.opt("quantity")).equals(String.valueOf(l.opt("requestQuantity")))));
                if(!same)return json(409,error("ID koreksi sudah digunakan oleh transaksi lain."));
                return json(200,new JSONObject().put("ok",true).put("duplicate",true).put("state",snapshot(d,u)));
            }
        }
        JSONObject originalTx=null;
        for(int i=0;i<txs.length();i++)if(target.equals(txs.getJSONObject(i).optString("id")))originalTx=txs.getJSONObject(i);
        if(originalTx==null||!"stock-out".equals(originalTx.optString("type")))throw new Exception("Transaksi pengurangan manual tidak ditemukan.");
        if(!"admin".equals(u.optString("role"))&&!u.optString("username").equals(originalTx.optString("createdBy")))return json(403,error("Anda hanya dapat mengoreksi pengurangan sendiri."));
        JSONObject originalLines=originalTx.optJSONObject("lines");
        if(originalLines==null)throw new Exception("Data transaksi awal tidak valid.");
        String item=originalLines.optString("item");long originalQuantity=originalLines.optLong("quantity");
        if(!Arrays.asList(KEYS).contains(item)||originalQuantity<=0)throw new Exception("Data transaksi awal tidak valid.");
        long alreadyReturned=0;
        for(int i=0;i<txs.length();i++){JSONObject t=txs.getJSONObject(i),l=t.optJSONObject("lines");if("stock-correction".equals(t.optString("type"))&&l!=null&&target.equals(l.optString("targetTransactionId")))alreadyReturned=Math.addExact(alreadyReturned,l.optLong("returnedDelta"));}
        long currentReduction=originalQuantity-alreadyReturned;
        if(currentReduction<0||currentReduction>originalQuantity)throw new Exception("Riwayat koreksi transaksi tidak konsisten.");
        long desiredReduction;
        if("revise".equals(action)){desiredReduction=number(p,"quantity",0);if(desiredReduction>originalQuantity)throw new Exception("Jumlah pengurangan yang benar tidak boleh melebihi "+originalQuantity+".");}
        else if("return".equals(action)){long q=number(p,"quantity",0);if(q<=0||q>currentReduction)throw new Exception("Jumlah pengembalian melebihi sisa pengurangan "+currentReduction+" pcs.");desiredReduction=currentReduction-q;}
        else desiredReduction=0;
        long desiredReturned=originalQuantity-desiredReduction,returnedDelta=desiredReturned-alreadyReturned;
        if(returnedDelta==0)throw new Exception("Tidak ada perubahan jumlah yang perlu disimpan.");
        JSONObject stock=d.getJSONObject("stock");long nextStock=Math.addExact(stock.optLong(item),returnedDelta);
        if(nextStock<0)throw new Exception("Koreksi ditolak karena akan membuat stok "+item+" negatif.");
        stock.put(item,nextStock);
        JSONObject correctionLines=new JSONObject().put("targetTransactionId",target).put("item",item).put("originalQuantity",originalQuantity).put("previousReturnedQuantity",alreadyReturned).put("returnedDelta",returnedDelta).put("returnedTotal",desiredReturned).put("correctedQuantity",desiredReduction).put("requestQuantity",p.has("quantity")?p.get("quantity"):JSONObject.NULL).put("action",action).put("reason",reason);
        txs.put(new JSONObject().put("id",cid).put("type","stock-correction").put("date",java.time.LocalDate.now().toString()).put("location","").put("note",reason).put("lines",correctionLines).put("changes",new JSONObject().put(item,returnedDelta)).put("createdBy",u.optString("username")).put("createdAt",now()));
        audit(d,u,"stock.manual_correction",new JSONObject().put("transactionId",target).put("correctionId",cid).put("item",item).put("returnedDelta",returnedDelta).put("reason",reason));
        save(d);
        return json(200,new JSONObject().put("ok",true).put("duplicate",false).put("state",snapshot(d,u)));
    }

}
