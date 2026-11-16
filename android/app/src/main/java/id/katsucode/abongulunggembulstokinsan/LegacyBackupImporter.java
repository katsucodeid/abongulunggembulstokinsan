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
        byte[] bytes = readAll(input, 50 * 1024 * 1024);
        if (bytes.length == 0) throw new IllegalArgumentException("File cadangan kosong.");
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
            if (!stock.has(key)) throw new IllegalArgumentException("Data stok wajib tidak ditemukan: " + key);
        }
        Iterator<String> stockKeys = stock.keys();
        while (stockKeys.hasNext()) {
            String key = stockKeys.next();
            Object value = stock.opt(key);
            if (!(value instanceof Number) || !isWholeNonNegative((Number)value))
                throw new IllegalArgumentException("Nilai stok " + key + " tidak valid.");
        }
        validateUniqueRecords(users, "username", "pengguna");
        validateUniqueRecords(transactions, "id", "transaksi");
        java.util.HashSet<String> processedIds = new java.util.HashSet<>();
        for (int i=0; i<processed.length(); i++) {
            if (!(processed.opt(i) instanceof String) || ((String)processed.opt(i)).isEmpty() ||
                    !processedIds.add((String) processed.opt(i)))
                throw new IllegalArgumentException("Daftar ID transaksi diproses tidak valid atau berisi duplikat.");
        }
        JSONArray audit = data.optJSONArray("auditLog");
        if (audit == null) audit = new JSONArray();
        validateUniqueRecords(audit, "id", "audit");

        // The legacy server hashes JSON.stringify(database), whose object-key order is significant.
        // Hash the original database JSON value after removing only insignificant whitespace;
        // do not depend on JSONObject's unspecified key iteration order.
        String rawDatabase = extractDatabaseJson(new String(bytes, StandardCharsets.UTF_8));
        String digest = sha256(rawDatabase.getBytes(StandardCharsets.UTF_8));
        String expected = envelope.optString("checksum", "");
        if (!expected.matches("(?i)[a-f0-9]{64}") || !digest.equalsIgnoreCase(expected))
            throw new IllegalArgumentException("Checksum cadangan tidak cocok. Impor dibatalkan agar data rusak tidak masuk.");

        SQLiteDatabase db = helper.getWritableDatabase();
        db.beginTransaction();
        try {
            if (!helper.isEmpty(db)) throw new IllegalStateException("Database lokal sudah berisi data. Impor hanya diizinkan ke database kosong; data yang ada tidak akan ditimpa.");
            Iterator<String> importedStockKeys = stock.keys();
            while (importedStockKeys.hasNext()) {
                String key = importedStockKeys.next();
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
                db.insertOrThrow("processed_operations", null, v);
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
            // Keep a complete source snapshot as a forward-compatibility safety net.
            LocalDatabase.putRaw(db, "metadata", "meta_key", "legacy_database", data.toString());
            JSONObject settings = data.optJSONObject("settings");
            if (settings != null) LocalDatabase.putRaw(db, "app_settings", "setting_key", "legacy", settings.toString());

            android.content.ContentValues imported = new android.content.ContentValues();
            imported.put("imported_at", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(new Date()));
            imported.put("source_name", sourceName == null ? "backup" : sourceName);
            imported.put("checksum", digest);
            imported.put("stock_count", stock.length()); imported.put("user_count", users.length());
            imported.put("transaction_count", transactions.length()); imported.put("processed_count", processed.length());
            imported.put("audit_count", audit.length());
            db.insertOrThrow("imports", null, imported);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return new ImportResult(stock.length(), users.length(), transactions.length(), processed.length(), audit.length(), digest);
    }

    private static String extractDatabaseJson(String source) {
        int i = skipWhitespace(source, 0);
        if (i >= source.length() || source.charAt(i) != '{') throw new IllegalArgumentException("Envelope cadangan tidak valid.");
        i++;
        int foundStart = -1, foundEnd = -1;
        while (true) {
            i = skipWhitespace(source, i);
            if (i >= source.length() || source.charAt(i) == '}') break;
            if (source.charAt(i) != '"') throw new IllegalArgumentException("Kunci envelope tidak valid.");
            int keyEnd = scanString(source, i);
            String key = source.substring(i, keyEnd + 1);
            i = skipWhitespace(source, keyEnd + 1);
            if (i >= source.length() || source.charAt(i) != ':') throw new IllegalArgumentException("Pemisah envelope tidak valid.");
            int valueStart = skipWhitespace(source, i + 1);
            int valueEnd = scanValue(source, valueStart);
            if ("\"database\"".equals(key)) {
                if (foundStart >= 0) throw new IllegalArgumentException("Kunci database ganda pada envelope.");
                foundStart = valueStart;
                foundEnd = valueEnd;
            }
            i = skipWhitespace(source, valueEnd + 1);
            if (i < source.length() && source.charAt(i) == ',') { i++; continue; }
            if (i < source.length() && source.charAt(i) == '}') break;
            throw new IllegalArgumentException("Struktur envelope cadangan tidak valid.");
        }
        if (foundStart < 0 || foundEnd < foundStart || source.charAt(foundStart) != '{')
            throw new IllegalArgumentException("Objek database mentah tidak ditemukan.");
        return compactJson(source.substring(foundStart, foundEnd + 1));
    }

    private static int skipWhitespace(String s, int i) {
        while (i < s.length() && (s.charAt(i) == ' ' || s.charAt(i) == '\n' || s.charAt(i) == '\r' || s.charAt(i) == '\t')) i++;
        return i;
    }

    private static int scanString(String s, int start) {
        boolean escaped = false;
        for (int i = start + 1; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (escaped) escaped = false;
            else if (ch == '\\') escaped = true;
            else if (ch == '"') return i;
        }
        throw new IllegalArgumentException("String JSON tidak ditutup.");
    }

    private static int scanValue(String s, int start) {
        if (start >= s.length()) throw new IllegalArgumentException("Nilai JSON hilang.");
        char first = s.charAt(start);
        if (first == '"') return scanString(s, start);
        if (first == '{' || first == '[') {
            int depth = 0;
            boolean inString = false, escaped = false;
            for (int i = start; i < s.length(); i++) {
                char ch = s.charAt(i);
                if (inString) {
                    if (escaped) escaped = false;
                    else if (ch == '\\') escaped = true;
                    else if (ch == '"') inString = false;
                } else {
                    if (ch == '"') inString = true;
                    else if (ch == '{' || ch == '[') depth++;
                    else if (ch == '}' || ch == ']') {
                        depth--;
                        if (depth == 0) return i;
                    }
                }
            }
            throw new IllegalArgumentException("Objek atau array JSON tidak ditutup.");
        }
        int i = start;
        while (i < s.length() && s.charAt(i) != ',' && s.charAt(i) != '}' && s.charAt(i) != ']') i++;
        return i - 1;
    }

    private static String compactJson(String json) {
        StringBuilder out = new StringBuilder(json.length());
        boolean inString = false, escaped = false;
        for (int i = 0; i < json.length(); i++) {
            char ch = json.charAt(i);
            if (inString) {
                out.append(ch);
                if (escaped) escaped = false;
                else if (ch == '\\') escaped = true;
                else if (ch == '"') inString = false;
            } else if (ch == '"') {
                inString = true;
                out.append(ch);
            } else if (ch != ' ' && ch != '\n' && ch != '\r' && ch != '\t') out.append(ch);
        }
        if (inString) throw new IllegalArgumentException("String JSON tidak lengkap.");
        return out.toString();
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
        return !Double.isNaN(d) && !Double.isInfinite(d) && d >= 0 && d == Math.rint(d) && d <= Long.MAX_VALUE;
    }

    private static byte[] readAll(InputStream in, int maxBytes) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int n;
        while ((n=in.read(buffer))!=-1) {
            if (out.size() + n > maxBytes) throw new IllegalArgumentException("Ukuran file cadangan melebihi batas 50 MB.");
            out.write(buffer,0,n);
        }
        return out.toByteArray();
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder out=new StringBuilder();
        for(byte b:hash) out.append(String.format(java.util.Locale.ROOT,"%02x",b&0xff));
        return out.toString();
    }
}
