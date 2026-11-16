package id.katsucode.abongulunggembulstokinsan;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class LocalDataActivity extends Activity {
    private static final int PICK_BACKUP = 5201;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LocalDatabase database;
    private LinearLayout content;
    private TextView status;
    private TextView summary;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        database = new LocalDatabase(this);
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int pad = (int)(getResources().getDisplayMetrics().density * 20);
        content.setPadding(pad, pad, pad, pad);
        scroll.addView(content);
        setContentView(scroll);

        addText("Database Lokal INSAN", 24, true);
        addText("Fondasi offline — data disimpan di penyimpanan privat aplikasi (SQLite).", 15, false);
        addButton("Impor cadangan .insanbackup", v -> chooseBackup());
        addButton("Perbarui tampilan data", v -> refreshData());
        status = addText("Belum ada impor pada perangkat ini.", 14, false);
        addText("Ringkasan database", 19, true);
        summary = addText("Memuat…", 15, false);
        refreshData();
        addText("Catatan: layar ini adalah fondasi migrasi dan pemeriksaan data. Fitur transaksi, koreksi stok, laporan, manajemen pengguna, serta sinkronisasi belum dipindahkan ke mode SQLite.", 14, false);
    }

    private TextView addText(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        if (bold) view.setTypeface(null, android.graphics.Typeface.BOLD);
        view.setPadding(0, 0, 0, (int)(getResources().getDisplayMetrics().density * 12));
        content.addView(view);
        return view;
    }

    private void addButton(String label, View.OnClickListener action) {
        Button button = new Button(this);
        button.setText(label);
        button.setOnClickListener(action);
        content.addView(button);
    }

    private void chooseBackup() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/json", "application/octet-stream", "application/vnd.insan.stock-backup+json"
        });
        startActivityForResult(intent, PICK_BACKUP);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_BACKUP || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        status.setText("Memeriksa file cadangan. Jangan tutup aplikasi…");
        worker.execute(() -> {
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                String name = uri.getLastPathSegment();
                LegacyBackupImporter.ImportResult result = LegacyBackupImporter.importStream(database, input, name);
                runOnUiThread(() -> {
                    status.setText("Impor berhasil. Checksum SHA-256: " + result.checksum);
                    Toast.makeText(this, "Data cadangan berhasil diimpor ke SQLite.", Toast.LENGTH_LONG).show();
                    refreshData();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    status.setText("Impor dibatalkan: " + (e.getMessage() == null ? "File tidak valid." : e.getMessage()));
                    Toast.makeText(this, "Impor gagal. Data lokal tidak ditimpa.", Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void refreshData() {
        try {
            SQLiteDatabase db = database.getReadableDatabase();
            StringBuilder report = new StringBuilder();
            report.append("Stok:\n");
            try (Cursor c = db.rawQuery("SELECT item_key, quantity FROM stock ORDER BY item_key", null)) {
                if (!c.moveToFirst()) report.append("Belum ada data stok.\n");
                else do { report.append("• ").append(c.getString(0)).append(": ").append(c.getLong(1)).append("\n"); } while (c.moveToNext());
            }
            report.append("\nPengguna: ").append(LocalDatabase.count(db, "users"));
            report.append("\nTransaksi: ").append(LocalDatabase.count(db, "transactions"));
            report.append("\nID operasi diproses: ").append(LocalDatabase.count(db, "processed_operations"));
            report.append("\nRiwayat audit: ").append(LocalDatabase.count(db, "audit_log"));
            report.append("\nPengaturan: ").append(LocalDatabase.count(db, "app_settings"));
            report.append("\nCatatan impor: ").append(LocalDatabase.count(db, "imports"));
            if (summary != null) summary.setText(report.toString());
        } catch (Exception e) {
            status.setText("Database lokal belum dapat dibaca: " + e.getMessage());
        }
    }

    @Override protected void onDestroy() {
        worker.shutdown();
        if (database != null) database.close();
        super.onDestroy();
    }
}
