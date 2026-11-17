package id.katsucode.abongulunggembulstokinsan;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * SQLite persistence for the complete INSAN business document.
 *
 * The JSON document preserves every backend field (including settings,
 * stockStartDate, users, transactions, processed IDs and auditLog) while
 * SQLite supplies durable, atomic commits. The normalized tables remain
 * available for indexed projections as the local API is ported.
 */
public final class InsanLocalDatabase extends SQLiteOpenHelper {
    private static final String DB_NAME = "insan-stock-local.db";
    private static final int DB_VERSION = 2;

    private static final String[][] ITEMS = {
        {"box3", "Box isi 3", "3897"},
        {"box5outer", "Box isi 5 luar (Slongsong)", "3463"},
        {"box5inner", "Box isi 5 dalam (Tatakan Polos)", "3595"},
        {"paper", "Kertas Minyak", "1722"},
        {"mika", "Mika roti roll", "210"}
    };

    private static String utcNow() {
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
        format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return format.format(new java.util.Date());
    }

    public InsanLocalDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        createProjectionTables(db);
        db.execSQL("CREATE TABLE app_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), document_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
        try {
            JSONObject initial = new JSONObject();
            initial.put("version", 1);
            JSONObject stock = new JSONObject();
            for (String[] item : ITEMS) stock.put(item[0], Long.parseLong(item[2]));
            initial.put("stock", stock);
            initial.put("stockStartDate", "2026-11-11");
            initial.put("users", new JSONArray());
            initial.put("transactions", new JSONArray());
            initial.put("processed", new JSONArray());
            initial.put("auditLog", new JSONArray());
            initial.put("settings", new JSONObject());
            ContentValues row = new ContentValues();
            row.put("singleton", 1);
            row.put("document_json", initial.toString());
            row.put("updated_at", utcNow());
            db.insertOrThrow("app_state", null, row);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to initialize local INSAN database", e);
        }
    }

    private void createProjectionTables(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE stock (" +
            "item_key TEXT PRIMARY KEY NOT NULL," +
            "label TEXT NOT NULL," +
            "quantity INTEGER NOT NULL CHECK(quantity >= 0)," +
            "minimum INTEGER)");
        db.execSQL("CREATE TABLE users (" +
            "id TEXT PRIMARY KEY NOT NULL," +
            "username TEXT NOT NULL UNIQUE COLLATE NOCASE," +
            "password_hash TEXT NOT NULL," +
            "role TEXT NOT NULL CHECK(role IN ('admin','staff'))," +
            "created_at TEXT NOT NULL)");
        db.execSQL("CREATE TABLE transactions (" +
            "id TEXT PRIMARY KEY NOT NULL," +
            "type TEXT NOT NULL," +
            "date TEXT NOT NULL," +
            "payload_json TEXT NOT NULL," +
            "created_by TEXT NOT NULL," +
            "created_at TEXT NOT NULL," +
            "updated_at TEXT)");
        db.execSQL("CREATE TABLE processed_operations (" +
            "operation_id TEXT PRIMARY KEY NOT NULL," +
            "processed_at TEXT NOT NULL)");
        db.execSQL("CREATE TABLE audit_log (" +
            "id TEXT PRIMARY KEY NOT NULL," +
            "at TEXT NOT NULL," +
            "username TEXT NOT NULL," +
            "role TEXT NOT NULL," +
            "action TEXT NOT NULL," +
            "details_json TEXT NOT NULL)");
        db.execSQL("CREATE INDEX transactions_date_idx ON transactions(date)");
        db.execSQL("CREATE INDEX audit_log_at_idx ON audit_log(at)");
        for (String[] item : ITEMS) {
            ContentValues row = new ContentValues();
            row.put("item_key", item[0]);
            row.put("label", item[1]);
            row.put("quantity", Long.parseLong(item[2]));
            row.putNull("minimum");
            db.insertOrThrow("stock", null, row);
        }
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            db.execSQL("CREATE TABLE app_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), document_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
            try {
                JSONObject state = new JSONObject();
                JSONObject stock = new JSONObject();
                try (Cursor c = db.query("stock", new String[]{"item_key","quantity"}, null,null,null,null,null)) {
                    while (c.moveToNext()) stock.put(c.getString(0), c.getLong(1));
                }
                state.put("version", 1);
                state.put("stock", stock);
                state.put("stockStartDate", "2026-11-11");
                state.put("users", new JSONArray());
                state.put("transactions", new JSONArray());
                state.put("processed", new JSONArray());
                state.put("auditLog", new JSONArray());
                state.put("settings", new JSONObject());
                ContentValues row = new ContentValues();
                row.put("singleton", 1);
                row.put("document_json", state.toString());
                row.put("updated_at", utcNow());
                db.insertOrThrow("app_state", null, row);
            } catch (Exception e) {
                throw new IllegalStateException("Cannot migrate existing local inventory safely", e);
            }
        }
    }

    /** Return the complete persisted backend-compatible database document. */
    public JSONObject readDatabase() throws Exception {
        try (Cursor c = getReadableDatabase().query("app_state",
                new String[]{"document_json"}, "singleton=1", null, null, null, null)) {
            if (!c.moveToFirst()) throw new IllegalStateException("Local database state is missing.");
            return new JSONObject(c.getString(0));
        }
    }

    /**
     * Atomically replace the full business document. Unknown extension fields
     * are retained so future backend fields are not silently discarded.
     */
    public void saveDatabase(JSONObject document) throws Exception {
        validateDatabase(document);
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues row = new ContentValues();
            row.put("singleton", 1);
            row.put("document_json", document.toString());
            row.put("updated_at", utcNow());
            db.insertWithOnConflict("app_state", null, row, SQLiteDatabase.CONFLICT_REPLACE);
            syncProjectionTables(db, document);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    /** Validate the minimum data contract before import or persistence. */
    public static void validateDatabase(JSONObject document) throws Exception {
        if (document == null) throw new IllegalArgumentException("Database kosong.");
        JSONObject stock = document.optJSONObject("stock");
        JSONArray users = document.optJSONArray("users");
        JSONArray transactions = document.optJSONArray("transactions");
        JSONArray processed = document.optJSONArray("processed");
        if (stock == null || users == null || transactions == null || processed == null)
            throw new IllegalArgumentException("Struktur database INSAN tidak lengkap.");
        for (String[] item : ITEMS) {
            Object value = stock.opt(item[0]);
            if (!(value instanceof Number) || ((Number)value).longValue() < 0 ||
                ((Number)value).doubleValue() != ((Number)value).longValue())
                throw new IllegalArgumentException("Nilai stok " + item[0] + " tidak valid.");
        }
        for (int i = 0; i < users.length(); i++) {
            JSONObject user = users.optJSONObject(i);
            if (user == null || user.optString("username").isEmpty() ||
                user.optString("role").isEmpty())
                throw new IllegalArgumentException("Data pengguna tidak valid.");
        }
        for (int i = 0; i < transactions.length(); i++) {
            JSONObject tx = transactions.optJSONObject(i);
            if (tx == null || tx.optString("id").isEmpty() || tx.optString("type").isEmpty())
                throw new IllegalArgumentException("Data transaksi tidak valid.");
        }
    }

    /**
     * Rebuild indexed projections in the same SQLite transaction as the canonical
     * document. The JSON document remains authoritative and retains unknown fields.
     */
    private static void syncProjectionTables(SQLiteDatabase db, JSONObject document) throws Exception {
        db.delete("stock", null, null);
        db.delete("users", null, null);
        db.delete("transactions", null, null);
        db.delete("processed_operations", null, null);
        db.delete("audit_log", null, null);

        JSONObject stock = document.getJSONObject("stock");
        JSONObject minimums = document.optJSONObject("settings") == null
            ? new JSONObject() : document.optJSONObject("settings").optJSONObject("minStock");
        for (String[] item : ITEMS) {
            ContentValues row = new ContentValues();
            row.put("item_key", item[0]);
            row.put("label", item[1]);
            row.put("quantity", stock.getLong(item[0]));
            Object minimum = minimums == null ? null : minimums.opt(item[0]);
            if (minimum instanceof Number && ((Number) minimum).longValue() >= 0 &&
                ((Number) minimum).doubleValue() == ((Number) minimum).longValue()) {
                row.put("minimum", ((Number) minimum).longValue());
            } else row.putNull("minimum");
            db.insertOrThrow("stock", null, row);
        }

        JSONArray users = document.getJSONArray("users");
        for (int i = 0; i < users.length(); i++) {
            JSONObject user = users.getJSONObject(i);
            String username = user.getString("username");
            String id = user.optString("id", username);
            String passwordHash = user.optString("passwordHash", "");
            String role = user.optString("role", "staff");
            String createdAt = user.optString("createdAt", utcNow());
            if (passwordHash.isEmpty()) throw new IllegalArgumentException("Hash kata sandi pengguna " + username + " tidak tersedia.");
            if (!"admin".equals(role) && !"staff".equals(role)) throw new IllegalArgumentException("Peran pengguna " + username + " tidak valid.");
            ContentValues row = new ContentValues();
            row.put("id", id);
            row.put("username", username);
            row.put("password_hash", passwordHash);
            row.put("role", role);
            row.put("created_at", createdAt);
            db.insertOrThrow("users", null, row);
        }

        JSONArray transactions = document.getJSONArray("transactions");
        for (int i = 0; i < transactions.length(); i++) {
            JSONObject tx = transactions.getJSONObject(i);
            ContentValues row = new ContentValues();
            row.put("id", tx.getString("id"));
            row.put("type", tx.getString("type"));
            row.put("date", tx.optString("date", ""));
            row.put("payload_json", tx.toString());
            row.put("created_by", tx.optString("createdBy", "system"));
            row.put("created_at", tx.optString("createdAt", utcNow()));
            if (tx.has("updatedAt")) row.put("updated_at", tx.optString("updatedAt"));
            else row.putNull("updated_at");
            db.insertOrThrow("transactions", null, row);
        }

        JSONArray processed = document.getJSONArray("processed");
        for (int i = 0; i < processed.length(); i++) {
            String operationId = processed.getString(i);
            ContentValues row = new ContentValues();
            row.put("operation_id", operationId);
            row.put("processed_at", utcNow());
            db.insertOrThrow("processed_operations", null, row);
        }

        JSONArray audit = document.optJSONArray("auditLog");
        if (audit != null) for (int i = 0; i < audit.length(); i++) {
            JSONObject entry = audit.getJSONObject(i);
            ContentValues row = new ContentValues();
            row.put("id", entry.getString("id"));
            row.put("at", entry.optString("at", utcNow()));
            row.put("username", entry.optString("username", "system"));
            row.put("role", entry.optString("role", "system"));
            row.put("action", entry.optString("action", "unknown"));
            row.put("details_json", entry.optJSONObject("details") == null
                ? "{}" : entry.optJSONObject("details").toString());
            db.insertOrThrow("audit_log", null, row);
        }
    }

    /** Counts used by migration diagnostics and restore verification. */
    public JSONObject recordCounts() throws Exception {
        JSONObject state = readDatabase();
        JSONObject counts = new JSONObject();
        counts.put("stock", state.optJSONObject("stock").length());
        counts.put("users", state.optJSONArray("users").length());
        counts.put("transactions", state.optJSONArray("transactions").length());
        counts.put("processed_operations", state.optJSONArray("processed").length());
        counts.put("audit_log", state.optJSONArray("auditLog") == null ? 0 : state.optJSONArray("auditLog").length());
        return counts;
    }

    /** Atomic stock delta against the canonical SQLite business document. */
    public boolean applyStockDelta(String itemKey, long delta) {
        if (itemKey == null || itemKey.isEmpty()) return false;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSONObject state = readDatabase();
            JSONObject stock = state.getJSONObject("stock");
            if (!stock.has(itemKey)) return false;
            long current = stock.getLong(itemKey);
            if ((delta > 0 && current > Long.MAX_VALUE - delta) ||
                (delta < 0 && current < Long.MIN_VALUE - delta)) return false;
            long next = current + delta;
            if (next < 0) return false;
            stock.put(itemKey, next);
            ContentValues row = new ContentValues();
            row.put("singleton", 1);
            row.put("document_json", state.toString());
            row.put("updated_at", utcNow());
            db.insertWithOnConflict("app_state", null, row, SQLiteDatabase.CONFLICT_REPLACE);
            db.setTransactionSuccessful();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            db.endTransaction();
        }
    }
}
