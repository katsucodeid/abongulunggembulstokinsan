package id.katsucode.abongulunggembulstokinsan;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONObject;

public final class LocalDatabase extends SQLiteOpenHelper {
    public static final String FILE_NAME = "insan-local.db";
    private static final int VERSION = 1;

    public LocalDatabase(Context context) {
        super(context, FILE_NAME, null, VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE stock (item_key TEXT PRIMARY KEY NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0))");
        db.execSQL("CREATE TABLE users (username TEXT PRIMARY KEY NOT NULL, raw_json TEXT NOT NULL)");
        db.execSQL("CREATE TABLE transactions (id TEXT PRIMARY KEY NOT NULL, type TEXT, date TEXT, raw_json TEXT NOT NULL)");
        db.execSQL("CREATE INDEX transactions_date_idx ON transactions(date)");
        db.execSQL("CREATE TABLE processed_operations (operation_id TEXT PRIMARY KEY NOT NULL)");
        db.execSQL("CREATE TABLE audit_log (id TEXT PRIMARY KEY NOT NULL, at TEXT, raw_json TEXT NOT NULL)");
        db.execSQL("CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY NOT NULL, raw_json TEXT NOT NULL)");
        db.execSQL("CREATE TABLE metadata (meta_key TEXT PRIMARY KEY NOT NULL, raw_json TEXT NOT NULL)");
        db.execSQL("CREATE TABLE imports (id INTEGER PRIMARY KEY AUTOINCREMENT, imported_at TEXT NOT NULL, source_name TEXT, checksum TEXT NOT NULL, stock_count INTEGER NOT NULL, user_count INTEGER NOT NULL, transaction_count INTEGER NOT NULL, processed_count INTEGER NOT NULL, audit_count INTEGER NOT NULL)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Migrasi schema SQLite " + oldVersion + " ke " + newVersion + " belum tersedia; database tidak dihapus.");
    }

    public boolean isEmpty(SQLiteDatabase db) {
        return count(db, "stock") == 0 && count(db, "users") == 0 &&
                count(db, "transactions") == 0 && count(db, "processed_operations") == 0 &&
                count(db, "audit_log") == 0 && count(db, "app_settings") == 0 &&
                count(db, "metadata") == 0 && count(db, "imports") == 0;
    }

    public static long count(SQLiteDatabase db, String table) {
        try (Cursor c = db.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            return c.moveToFirst() ? c.getLong(0) : 0;
        }
    }

    static void putRaw(SQLiteDatabase db, String table, String keyColumn, String key, String raw) {
        ContentValues values = new ContentValues();
        values.put(keyColumn, key);
        values.put("raw_json", raw);
        db.insertOrThrow(table, null, values);
    }

    public JSONObject readStock() throws Exception {
        JSONObject result = new JSONObject();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.rawQuery("SELECT item_key, quantity FROM stock ORDER BY item_key", null)) {
            while (c.moveToNext()) result.put(c.getString(0), c.getLong(1));
        }
        return result;
    }
}
