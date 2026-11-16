package id.katsucode.abongulunggembulstokinsan;

import static org.junit.Assert.*;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RunWith(AndroidJUnit4.class)
public class LegacyBackupImporterTest {
    private String checksum(String json) throws Exception {
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8));
        StringBuilder out=new StringBuilder();
        for(byte b:bytes) out.append(String.format(java.util.Locale.ROOT,"%02x",b&0xff));
        return out.toString();
    }

    private String backup() throws Exception {
        JSONObject db=new JSONObject();
        JSONObject stock=new JSONObject();
        stock.put("box3",123); stock.put("box5outer",234); stock.put("box5inner",345);
        stock.put("paper",456); stock.put("mika",56); stock.put("futureMaterial",789);
        db.put("version",1); db.put("stock",stock); db.put("stockStartDate","2026-11-11");
        db.put("users",new JSONArray().put(new JSONObject().put("username","admin").put("role","admin").put("passwordHash","hash")));
        db.put("transactions",new JSONArray().put(new JSONObject().put("id","tx-1").put("type","stock-in").put("date","2026-11-16").put("lines",new JSONObject().put("total",10))));
        db.put("processed",new JSONArray().put("tx-1"));
        db.put("auditLog",new JSONArray().put(new JSONObject().put("id","audit-1").put("action","transaction.create")));
        db.put("settings",new JSONObject().put("minStock",new JSONObject().put("paper",10)));
        String raw=db.toString();
        return new JSONObject().put("format","INSAN-STOCK-BACKUP").put("formatVersion",1)
                .put("checksum",checksum(raw)).put("database",db).toString();
    }

    @Test public void importsAllRecordsAndKeepsStock() throws Exception {
        Context context=ApplicationProvider.getApplicationContext();
        context.deleteDatabase(LocalDatabase.FILE_NAME);
        LocalDatabase helper=new LocalDatabase(context);
        LegacyBackupImporter.ImportResult result=LegacyBackupImporter.importStream(helper,
                new ByteArrayInputStream(backup().getBytes(StandardCharsets.UTF_8)),"fixture.insanbackup");
        assertEquals(6,result.stockCount); assertEquals(1,result.userCount);
        assertEquals(1,result.transactionCount); assertEquals(1,result.processedCount);
        assertEquals(1,result.auditCount);
        assertEquals(123,helper.readStock().getLong("box3"));
        assertEquals(789,helper.readStock().getLong("futureMaterial"));
        SQLiteDatabase db=helper.getReadableDatabase();
        assertEquals(1,LocalDatabase.count(db,"users"));
        assertEquals(1,LocalDatabase.count(db,"transactions"));
        assertEquals(1,LocalDatabase.count(db,"processed_operations"));
        assertEquals(1,LocalDatabase.count(db,"audit_log"));
        assertEquals(1,LocalDatabase.count(db,"imports"));
        helper.close(); context.deleteDatabase(LocalDatabase.FILE_NAME);
    }

    @Test public void rejectsBadChecksumWithoutWritingAnything() throws Exception {
        Context context=ApplicationProvider.getApplicationContext();
        context.deleteDatabase(LocalDatabase.FILE_NAME);
        LocalDatabase helper=new LocalDatabase(context);
        String bad=backup().replaceFirst("[a-f0-9]{64}","0000000000000000000000000000000000000000000000000000000000000000");
        try {
            LegacyBackupImporter.importStream(helper,new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)),"bad.insanbackup");
            fail("Checksum tidak cocok harus ditolak");
        } catch (IllegalArgumentException expected) {
            assertEquals(0,LocalDatabase.count(helper.getReadableDatabase(),"stock"));
        } finally { helper.close(); context.deleteDatabase(LocalDatabase.FILE_NAME); }
    }

    @Test public void refusesToOverwriteExistingLocalData() throws Exception {
        Context context=ApplicationProvider.getApplicationContext();
        context.deleteDatabase(LocalDatabase.FILE_NAME);
        LocalDatabase helper=new LocalDatabase(context);
        SQLiteDatabase db=helper.getWritableDatabase();
        db.execSQL("INSERT INTO stock(item_key,quantity) VALUES('paper',99)");
        try {
            LegacyBackupImporter.importStream(helper,new ByteArrayInputStream(backup().getBytes(StandardCharsets.UTF_8)),"fixture");
            fail("Database yang berisi data harus dipertahankan");
        } catch (IllegalStateException expected) {
            assertEquals(99,helper.readStock().getLong("paper"));
            assertEquals(0,LocalDatabase.count(helper.getReadableDatabase(),"transactions"));
        } finally { helper.close(); context.deleteDatabase(LocalDatabase.FILE_NAME); }
    }
}
