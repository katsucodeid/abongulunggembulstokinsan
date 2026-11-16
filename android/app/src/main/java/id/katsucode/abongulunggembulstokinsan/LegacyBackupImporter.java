package id.katsucode.abongulunggembulstokinsan;

import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Iterator;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * One-time, all-or-nothing importer for the existing INSAN-STOCK-BACKUP v1 envelope.
 * It never clears an existing local database and stores each original record as JSON.
 */
public final class LegacyBackupImporter {
    private static final String[] STOCK_KEYS = {"box3", "box5outer", "box5inner", "paper", "mika"};

    private LegacyBackupImporter() {}

    public static final class ImportResult {
        public final int stockCount, userCount, transactionCount, processedCount, auditCount;
        public final String checksum;
        ImportResult(int s, int u, int t, int p, int a, String h) {
            stockCount=s; userCount=u; transactionCount=t; processedCount=p; auditCount=a; checksum=h;
        }
    }

    public static ImportResult importStream(LocalDatabase helper, InputStream input, String sourceName) throws Exception {
        if (input == null) throw new IllegalArgumentException("File cadangan tidak dapat dibaca.");
        byte[] bytes = readAll(input);
        if (bytes.length == 0 || bytes.length > 50 * 1024 * 1024) throw new IllegalArgumentException("Ukuran file cadangan tidak valid (maksimal 50 MB).");
        JSONObject envelope = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (!"INSAN-STOCK-BACKUP".equals(envelope.optString("format")) || envelope.optInt("formatVersion", -1) != 1)
            throw new IllegalArgumentException("Format cadangan bukan INSAN-STOCK-BACKUP versi 1.");

        JSONObject data = envelope.optJSONObject("database");
        if (data == null) throw new IllegalArgumentException("Objek database tidak ditemukan.");
        JSONObject stock = data.optJSONObject("stock");
        JSONArray users = data.optJSONArray("users");
        JSONArray transactions = data.optJSONArray("transactions");
        JSONArray processed = data.optJSONArray("processed");
        if (stock == null || users == null || transactions == null || processed == null)
            throw new IllegalArgumentException("Struktur database tidak lengkap; data lokal tidak diubah.");

        for (String key : STOCK_KEYS) {
            Object value = stock.opt(key);
            if (!(value instanceof Number) || !isWholeNonNegative((Number)value))
                throw new IllegalArgumentException("Nilai stok " + key + " tidak valid.");
        }
        validateUniqueRecords(users, "username", "pengguna");
        validateUniqueRecords(transactions, "id", "transaksi");
        for (int i=0; i<processed.length(); i++) {
            if (!(processed.opt(i) instanceof String) || ((String)processed.opt(i)).isEmpty())
                throw new IllegalArgumentException("Daftar ID transaksi diproses tidak valid.");
        }
        JSONArray audit = data.optJSONArray("auditLog");
        if (audit == null) audit = new JSONArray();
        validateUniqueRecords(audit, "id", "audit");

        String digest = sha256(data.toString().getBytes(StandardCharsets.UTF_8));
        String expected = envelope.optString("checksum", "");
        if (!expected.matches("(?i)[a-f0-9]{64}") || !digest.equalsIgnoreCase(expected))
            throw new IllegalArgumentException("Checksum cadangan tidak cocok. Impor dibatalkan agar data rusak tidak masuk.");

        SQLiteDatabase db = helper.getWritableDatabase();
        db.beginTransaction();
        try {
            if (!helper.isEmpty(db)) throw new IllegalStateException("Database lokal sudah berisi data. Impor hanya diizinkan ke database kosong; data yang ada tidak akan ditimpa.");
            for (String key : STOCK_KEYS) {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put("item_key", key); v.put("quantity", stock.getLong(key));
                db.insertOrThrow("stock", null, v);
            }
            for (int i=0; i<users.length(); i++) {
                JSONObject row = users.getJSONObject(i);
                String username = row.optString("username", "");
                if (username.isEmpty()) throw new IllegalArgumentException("Username pada cadangan kosong.");
                LocalDatabase.putRaw(db, "users", "username", username, row.toString());
            }
            for (int i=0; i<transactions.length(); i++) {
                JSONObject row = transactions.getJSONObject(i);
                String id = row.optString("id", "");
                if (id.isEmpty()) throw new IllegalArgumentException("ID transaksi pada cadangan kosong.");
                android.content.ContentValues v = new android.content.ContentValues();
                v.put("id", id); v.put("type", row.optString("type", null));
                v.put("date", row.optString("date", null)); v.put("raw_json", row.toString());
                db.insertOrThrow("transactions", null, v);
            }
            for (int i=0; i<processed.length(); i++) {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put("operation_id", processed.getString(i));
                db.insertOrThrow("processed_operations", v);
            }
            for (int i=0; i<audit.length(); i++) {
                JSONObject row = audit.getJSONObject(i);
                String id = row.optString("id", "");
                if (id.isEmpty()) throw new IllegalArgumentException("ID audit pada cadangan kosong.");
                android.content.ContentValues v = new android.content.ContentValues();
                v.put("id", id); v.put("at", row.optString("at", null)); v.put("raw_json", row.toString());
                db.insertOrThrow("audit_log", null, v);
            }

            // Preserve every root-level field not represented by a normalized table.
            JSONObject metadata = new JSONObject();
            Iterator<String> keys = data.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!"stock".equals(key) && !"users".equals(key) && !"transactions".equals(key) &&
                        !"processed".equals(key) && !"auditLog".equals(key) && !"settings".equals(key)) {
                    metadata.put(key, data.get(key));
                }
            }
            LocalDatabase.putRaw(db, "metadata", "meta_key", "legacy_root", metadata.toString());
            JSONObject settings = data.optJSONObject("settings");
            if (settings != null) LocalDatabase.putRaw(db, "app_settings", "setting_key", "legacy", settings.toString());

            android.content.ContentValues imported = new android.content.ContentValues();
            imported.put("imported_at", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(new Date()));
            imported.put("source_name", sourceName == null ? "backup" : sourceName);
            imported.put("checksum", digest);
            imported.put("stock_count", STOCK_KEYS.length); imported.put("user_count", users.length());
            imported.put("transaction_count", transactions.length()); imported.put("processed_count", processed.length());
            imported.put("audit_count", audit.length());
            db.insertOrThrow("imports", null, imported);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return new ImportResult(STOCK_KEYS.length, users.length(), transactions.length(), processed.length(), audit.length(), digest);
    }

    private static void validateUniqueRecords(JSONArray rows, String key, String label) throws JSONException {
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (int i=0; i<rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) throw new IllegalArgumentException("Data " + label + " ke-" + (i+1) + " tidak valid.");
            String id = row.optString(key, "");
            if (id.isEmpty() || !seen.add(id)) throw new IllegalArgumentException("ID " + label + " kosong atau ganda: " + id);
        }
    }

    private static boolean isWholeNonNegative(Number n) {
        double d=n.doubleValue();
        return Double.isFinite(d) && d >= 0 && d == Math.rint(d) && d <= Long.MAX_VALUE;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int n;
        while ((n=in.read(buffer))!=-1) out.write(buffer,0,n);
        return out.toByteArray();
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder out=new StringBuilder();
        for(byte b:hash) out.append(String.format(java.util.Locale.ROOT,"%02x",b&0xff));
        return out.toString();
    }
}
