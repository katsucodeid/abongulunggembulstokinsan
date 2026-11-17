package id.katsucode.abongulunggembulstokinsan;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@RunWith(AndroidJUnit4.class)
public class LocalApiIntegrationTest {
    private static final String BASE="http://127.0.0.1:18787";

    private static final class Reply {
        final int status; final JSONObject json;
        Reply(int s,JSONObject j){status=s;json=j;}
    }
    private Reply request(String method,String path,JSONObject body,String token)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(BASE+path).openConnection();
        c.setRequestMethod(method);c.setConnectTimeout(7000);c.setReadTimeout(7000);
        c.setRequestProperty("Accept","application/json");
        if(token!=null)c.setRequestProperty("Authorization","Bearer "+token);
        if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
        int status=c.getResponseCode();java.io.InputStream in=status>=400?c.getErrorStream():c.getInputStream();
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);in.close();
        JSONObject json=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));c.disconnect();return new Reply(status,json);
    }
    private JSONObject payload(String type,String id,JSONObject data)throws Exception{return new JSONObject().put("id",id).put("type",type).put("payload",data);}
    private JSONObject state(String token)throws Exception{return request("GET","/api/state",null,token).json;}
    private void assertStatus(Reply r,int expected){assertEquals(r.json.toString(),expected,r.status);}

    @Test public void localApiPersistsAndEnforcesBusinessRulesWithoutInternet()throws Exception{
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase("insan-stock-local.db");
        InsanLocalDatabase db=new InsanLocalDatabase(context);
        LocalApiServer server=new LocalApiServer(context,db);
        try{
            HttpURLConnection home=(HttpURLConnection)new URL(BASE+"/").openConnection();home.setConnectTimeout(7000);assertEquals(200,home.getResponseCode());String html=new String(home.getInputStream().readAllBytes(),StandardCharsets.UTF_8);assertTrue(html.contains("Selamat datang"));home.disconnect();
            HttpURLConnection logo=(HttpURLConnection)new URL(BASE+"/img/BackgroundEraser_20261016_074306739.png").openConnection();assertEquals(200,logo.getResponseCode());assertTrue(logo.getContentType().startsWith("image/png"));logo.getInputStream().close();logo.disconnect();
            Reply health=request("GET","/api/health",null,null);
            assertStatus(health,200);assertEquals("sqlite",health.json.getString("storage"));
            assertTrue(request("GET","/api/auth/status",null,null).json.getBoolean("setupRequired"));

            assertStatus(request("POST","/api/auth/bootstrap",new JSONObject().put("username","localadmin").put("password","StrongPass123!"),null),201);
            Reply login=request("POST","/api/auth/login",new JSONObject().put("username","localadmin").put("password","StrongPass123!"),null);
            assertStatus(login,200);String token=login.json.getString("token");

            JSONObject stockIn=payload("stock-in","stockin-1",new JSONObject().put("item","mika").put("packs",1).put("perPack",10).put("extra",0));
            Reply first=request("POST","/api/sync",new JSONObject().put("operations",new JSONArray().put(stockIn)),token);
            assertStatus(first,200);assertEquals(10,first.json.getJSONObject("state").getJSONObject("stock").getInt("mika"));
            Reply retry=request("POST","/api/sync",new JSONObject().put("operations",new JSONArray().put(stockIn)),token);
            assertStatus(retry,200);assertTrue(retry.json.getJSONArray("accepted").getJSONObject(0).getBoolean("duplicate"));
            assertEquals(10,retry.json.getJSONObject("state").getJSONObject("stock").getInt("mika"));

            JSONObject out=payload("stock-out","out-1",new JSONObject().put("item","mika").put("quantity",2).put("note","Uji koreksi"));
            assertStatus(request("POST","/api/sync",new JSONObject().put("operations",new JSONArray().put(out)),token),200);
            assertEquals(8,state(token).getJSONObject("stock").getInt("mika"));
            JSONObject correction=new JSONObject().put("correctionId","corr-1").put("action","return").put("quantity",1).put("reason","Satu pcs dikembalikan");
            Reply corrected=request("POST","/api/transactions/out-1/corrections",correction,token);
            assertStatus(corrected,200);assertEquals(9,corrected.json.getJSONObject("state").getJSONObject("stock").getInt("mika"));
            Reply duplicateCorrection=request("POST","/api/transactions/out-1/corrections",correction,token);
            assertStatus(duplicateCorrection,200);assertTrue(duplicateCorrection.json.getBoolean("duplicate"));
            assertEquals(9,state(token).getJSONObject("stock").getInt("mika"));
            JSONObject impossible=payload("stock-out","out-too-large",new JSONObject().put("item","mika").put("quantity",999999).put("note","Uji stok tidak cukup"));
            Reply rejected=request("POST","/api/sync",new JSONObject().put("operations",new JSONArray().put(impossible)),token);assertStatus(rejected,200);assertEquals(1,rejected.json.getJSONArray("rejected").length());assertEquals(9,rejected.json.getJSONObject("state").getJSONObject("stock").getInt("mika"));
            JSONObject invalidCorrection=new JSONObject().put("correctionId","corr-invalid").put("action","revise").put("quantity",3).put("reason","Uji melebihi jumlah awal");
            assertStatus(request("POST","/api/transactions/out-1/corrections",invalidCorrection,token),400);assertEquals(9,state(token).getJSONObject("stock").getInt("mika"));

            JSONArray supplies=new JSONArray();for(String item:new String[]{"box3","box5outer","box5inner","paper"})supplies.put(payload("stock-in","supply-"+item,new JSONObject().put("item",item).put("packs",1).put("perPack",10).put("extra",0)));assertStatus(request("POST","/api/sync",new JSONObject().put("operations",supplies),token),200);
            JSONObject production=payload("production","prod-1",new JSONObject().put("date","2026-11-17").put("location","Grand Wisata").put("ori",1).put("beef",0).put("spicy",0).put("cheese",0));
            assertStatus(request("POST","/api/sync",new JSONObject().put("operations",new JSONArray().put(production)),token),200);
            assertEquals(8,state(token).getJSONObject("stock").getInt("box3"));
            Reply edited=request("PUT","/api/transactions/prod-1",new JSONObject().put("date","2026-11-17").put("location","Grand Wisata").put("ori",2).put("beef",0).put("spicy",0).put("cheese",0),token);
            assertStatus(edited,200);assertEquals(6,edited.json.getJSONObject("state").getJSONObject("stock").getInt("box3"));
            Reply deleted=request("DELETE","/api/transactions/prod-1",null,token);
            assertStatus(deleted,200);assertEquals(10,deleted.json.getJSONObject("state").getJSONObject("stock").getInt("box3"));

            JSONObject min=new JSONObject().put("box3",100).put("box5outer",null).put("box5inner",null).put("paper",null).put("mika",5);
            assertStatus(request("PUT","/api/admin/settings/min-stock",new JSONObject().put("minStock",min),token),200);
            assertStatus(request("GET","/api/admin/settings",null,token),200);
            assertStatus(request("GET","/api/production/calendar?month=2026-11",null,token),200);
            assertStatus(request("GET","/api/report",null,token),200);
            assertStatus(request("GET","/api/admin/audit?limit=50",null,token),200);
            HttpURLConnection csvConnection=(HttpURLConnection)new URL(BASE+"/api/export/transactions.csv").openConnection();csvConnection.setRequestMethod("GET");csvConnection.setRequestProperty("Authorization","Bearer "+token);csvConnection.setConnectTimeout(7000);csvConnection.setReadTimeout(7000);assertEquals(200,csvConnection.getResponseCode());String csvText=new String(csvConnection.getInputStream().readAllBytes(),StandardCharsets.UTF_8);assertTrue(csvText.contains("Tanggal")&&csvText.contains("Perubahan stok"));csvConnection.disconnect();

            Reply users=request("GET","/api/users",null,token);assertStatus(users,200);assertEquals(1,users.json.getJSONArray("users").length());
            Reply backup=request("GET","/api/admin/backup",null,token);assertStatus(backup,200);assertEquals("INSAN-STOCK-BACKUP",backup.json.getString("format"));
            Reply restored=request("POST","/api/admin/restore",backup.json,token);assertStatus(restored,200);assertTrue(restored.json.has("safetyBackup"));
            boolean safetyFound=false;java.io.File[] localFiles=context.getFilesDir().listFiles();if(localFiles!=null)for(java.io.File file:localFiles)if(file.getName().equals(restored.json.getString("safetyBackup")))safetyFound=true;assertTrue("Pre-restore safety backup must exist",safetyFound);
            login=request("POST","/api/auth/login",new JSONObject().put("username","localadmin").put("password","StrongPass123!"),null);assertStatus(login,200);token=login.json.getString("token");
            JSONObject before=state(token).getJSONObject("stock");
            server.stop();db.close();
            InsanLocalDatabase reopened=new InsanLocalDatabase(context);
            try{JSONObject persisted=reopened.readDatabase();assertEquals(9,persisted.getJSONObject("stock").getInt("mika"));assertEquals(1,persisted.getJSONArray("users").length());assertTrue(persisted.getJSONArray("transactions").length()>=7);}
            finally{reopened.close();}
        }finally{
            try{server.stop();}catch(Exception ignored){}
            try{db.close();}catch(Exception ignored){}
        }
    }
}
