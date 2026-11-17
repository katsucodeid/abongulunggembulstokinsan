package id.katsucode.abongulunggembulstokinsan;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Local-first persistence foundation for the standalone APK experiment.
 *
 * The current production UI is not wired to this class yet. Keep the
 * Termux/Express data path unchanged until the complete API adapter and
 * backup migration have been implemented and tested.
 */
public final class InsanLocalDatabase extends SQLiteOpenHelper {
    private static final String DB_NAME = "insan-stock-local.db";
    private static final int DB_VERSION = 1;

    private static final String[][] ITEMS = {
        {"box3", "Box isi 3", "3897"},
        {"box5outer", "Box isi 5 luar (Slongsong)", "3463"},
        {"box5inner", "Box isi 5 dalam (Tatakan Polos)", "3595"},
        {"paper", "Kertas Minyak", "1722"},
        {"mika", "Mika roti roll", "210"}
    };

    public InsanLocalDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
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
        // Never drop local inventory. Add explicit, forward-only migrations here.
        throw new IllegalStateException("Unsupported local database migration: " +
            oldVersion + " -> " + newVersion);
    }

    /** Read stock rows as JSON for the future JavaScript adapter. */
    public JSONObject readStock() throws Exception {
        JSONObject result = new JSONObject();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.query("stock",
                new String[]{"item_key", "quantity", "label", "minimum"},
                null, null, null, null, "item_key ASC")) {
            while (cursor.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("quantity", cursor.getLong(1));
                item.put("label", cursor.getString(2));
                item.put("minimum", cursor.isNull(3) ? JSONObject.NULL : cursor.getLong(3));
                result.put(cursor.getString(0), item);
            }
        }
        return result;
    }

    /** Count records before/after backup import verification. */
    public JSONObject recordCounts() throws Exception {
        JSONObject counts = new JSONObject();
        SQLiteDatabase db = getReadableDatabase();
        String[] tables = {"stock", "users", "transactions", "processed_operations", "audit_log"};
        for (String table : tables) {
            try (Cursor cursor = db.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
                counts.put(table, cursor.moveToFirst() ? cursor.getLong(0) : 0);
            }
        }
        return counts;
    }

    /** Apply a stock delta atomically; reject unknown items, overflow and negative stock. */
    public boolean applyStockDelta(String itemKey, long delta) {
        if (itemKey == null || itemKey.isEmpty()) return false;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            long current;
            try (Cursor cursor = db.query("stock", new String[]{"quantity"},
                    "item_key=?", new String[]{itemKey}, null, null, null)) {
                if (!cursor.moveToFirst()) return false;
                current = cursor.getLong(0);
            }
            if ((delta > 0 && current > Long.MAX_VALUE - delta) ||
                (delta < 0 && current < Long.MIN_VALUE - delta)) return false;
            long next = current + delta;
            if (next < 0) return false;
            ContentValues values = new ContentValues();
            values.put("quantity", next);
            if (db.update("stock", values, "item_key=?", new String[]{itemKey}) != 1) return false;
            db.setTransactionSuccessful();
            return true;
        } finally {
            db.endTransaction();
        }
    }
}
