package id.katsucode.abongulunggembulstokinsan;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Build;
import android.media.RingtoneManager;
import android.provider.Settings;
import java.io.File;
import java.io.FileOutputStream;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Toast;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String APP_URL = "http://127.0.0.1:8787";
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private WebView webView;
    private InsanLocalDatabase localDatabase;
    private ValueCallback<Uri[]> filePathCallback;

    private String sha256(String value) throws Exception {
        java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
        byte[] bytes = digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(java.util.Locale.US, "%02x", b & 0xff));
        return out.toString();
    }

    private class GembulBridge {
        @JavascriptInterface
        public String createLocalBackup() {
            try {
                org.json.JSONObject database = localDatabase.readDatabase();
                org.json.JSONObject backup = new org.json.JSONObject();
                backup.put("format", "INSAN-STOCK-BACKUP");
                backup.put("formatVersion", 1);
                backup.put("app", "INSAN Stock Manager");
                backup.put("createdAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));
                backup.put("checksum", sha256(database.toString()));
                backup.put("database", database);
                return Base64.encodeToString(backup.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8), Base64.NO_WRAP);
            } catch (Exception e) {
                return "ERROR:" + (e.getMessage() == null ? "Gagal membuat cadangan lokal." : e.getMessage());
            }
        }

        @JavascriptInterface
        public String restoreLocalBackup(String base64) {
            try {
                byte[] raw = Base64.decode(base64, Base64.DEFAULT);
                if (raw.length == 0 || raw.length > 25 * 1024 * 1024) return "ERROR:Ukuran cadangan tidak valid.";
                org.json.JSONObject backup = new org.json.JSONObject(new String(raw, java.nio.charset.StandardCharsets.UTF_8));
                if (!"INSAN-STOCK-BACKUP".equals(backup.optString("format")) || backup.optInt("formatVersion") != 1)
                    return "ERROR:Format file bukan cadangan INSAN yang didukung.";
                org.json.JSONObject database = backup.optJSONObject("database");
                if (database == null) return "ERROR:Database di dalam cadangan tidak ditemukan.";
                String expected = backup.optString("checksum");
                if (expected.isEmpty() || !expected.equals(sha256(database.toString())))
                    return "ERROR:Checksum tidak cocok. File rusak atau telah diubah.";
                InsanLocalDatabase.validateDatabase(database);
                org.json.JSONObject previous = localDatabase.readDatabase();
                java.io.File safety = new java.io.File(getFilesDir(), "pre-restore-" + System.currentTimeMillis() + ".insanbackup");
                org.json.JSONObject safetyBackup = new org.json.JSONObject();
                safetyBackup.put("format", "INSAN-STOCK-BACKUP");
                safetyBackup.put("formatVersion", 1);
                safetyBackup.put("app", "INSAN Stock Manager");
                safetyBackup.put("createdAt", new java.util.Date().toString());
                safetyBackup.put("checksum", sha256(previous.toString()));
                safetyBackup.put("database", previous);
                try (FileOutputStream out = new FileOutputStream(safety)) {
                    out.write(safetyBackup.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    out.flush();
                }
                localDatabase.saveDatabase(database);
                org.json.JSONObject summary = new org.json.JSONObject();
                summary.put("ok", true);
                summary.put("users", database.getJSONArray("users").length());
                summary.put("transactions", database.getJSONArray("transactions").length());
                summary.put("stock", database.getJSONObject("stock"));
                return "OK:" + summary.toString();
            } catch (Exception e) {
                return "ERROR:" + (e.getMessage() == null ? "Pemulihan gagal; data aktif tidak diubah." : e.getMessage());
            }
        }
        @JavascriptInterface
        public String saveBackup(String base64, String filename) {
            if (Build.VERSION.SDK_INT < 29) return "ERROR:Android 10+ diperlukan untuk folder Download/Abon Gulung Gembul.";
            Uri item = null;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/vnd.abongulunggembul.stok-backup+json");
                values.put(MediaStore.Downloads.RELATIVE_PATH, "Download/Abon Gulung Gembul");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                item = getContentResolver().insert(
                    MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
                if (item == null) return "ERROR:Gagal membuat file cadangan.";
                try (OutputStream out = getContentResolver().openOutputStream(item, "w")) {
                    if (out == null) throw new IllegalStateException("Tidak dapat membuka file cadangan.");
                    out.write(bytes);
                    out.flush();
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(item, done, null, null);
                return "OK:Download/Abon Gulung Gembul/Laporan/" + filename;
            } catch (Exception e) {
                if (item != null) {
                    try { getContentResolver().delete(item, null, null); } catch (Exception ignored) { }
                }
                return "ERROR:" + (e.getMessage() == null ? "Penyimpanan gagal." : e.getMessage());
            }
        }

        @JavascriptInterface
        public String saveDailyReport(String base64, String filename) {
            if (Build.VERSION.SDK_INT < 29) return "ERROR:Android 10+ diperlukan untuk menyimpan langsung ke folder Download.";
            Uri item = null;
            try {
                if (filename == null || !filename.matches("[0-9]{1,2}[a-z]+[0-9]{4}\\.txt")) return "ERROR:Nama file laporan tidak valid.";
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                String folder = "Download/Abon Gulung Gembul/Laporan";
                String wantedPath = folder.replaceAll("/+$", "");

                // Cari berdasarkan nama di seluruh koleksi Downloads terlebih dahulu.
                // Ini juga menemukan laporan lama yang tersimpan di folder legacy.
                try (android.database.Cursor cursor = getContentResolver().query(
                        collection,
                        new String[] { MediaStore.Downloads._ID, MediaStore.Downloads.RELATIVE_PATH },
                        MediaStore.Downloads.DISPLAY_NAME + "=?",
                        new String[] { filename },
                        MediaStore.Downloads.DATE_MODIFIED + " DESC")) {
                    if (cursor != null) {
                        Uri fallback = null;
                        while (cursor.moveToNext()) {
                            long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID));
                            Uri candidate = Uri.withAppendedPath(collection, String.valueOf(id));
                            String relativePath = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Downloads.RELATIVE_PATH));
                            String normalized = relativePath == null ? "" : relativePath.replaceAll("/+$", "");
                            if (normalized.equals(wantedPath)) {
                                item = candidate;
                                break;
                            }
                            if (fallback == null) fallback = candidate;
                        }
                        if (item == null) item = fallback;
                    }
                }

                ContentValues pending = new ContentValues();
                pending.put(MediaStore.Downloads.IS_PENDING, 1);
                pending.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
                pending.put(MediaStore.Downloads.RELATIVE_PATH, folder + "/");

                if (item != null) {
                    // Pertahankan entri lama: pindahkan ke folder baku bila perlu, lalu timpa isinya.
                    if (getContentResolver().update(item, pending, null, null) <= 0) {
                        item = null;
                    }
                }
                if (item == null) {
                    ContentValues values = new ContentValues(pending);
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    item = getContentResolver().insert(collection, values);
                }
                if (item == null) return "ERROR:Gagal menemukan atau membuat file laporan.";

                try (OutputStream out = getContentResolver().openOutputStream(item, "wt")) {
                    if (out == null) throw new IllegalStateException("Tidak dapat membuka file laporan.");
                    out.write(bytes);
                    out.flush();
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(item, done, null, null);
                return "OK:Download/Abon Gulung Gembul/Laporan/" + filename;
            } catch (Exception e) {
                if (item != null) {
                    try {
                        ContentValues failed = new ContentValues();
                        failed.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(item, failed, null, null);
                    } catch (Exception ignored) { }
                }
                return "ERROR:" + (e.getMessage() == null ? "Penyimpanan laporan gagal." : e.getMessage());
            }
        }

        @JavascriptInterface
        public String scheduleWorkAlarm(long fireAtMillis, String dataUrl) {
            try {
                if (dataUrl == null || !dataUrl.contains(",")) return "ERROR:Nada alarm tidak valid.";
                byte[] audio = Base64.decode(dataUrl.substring(dataUrl.indexOf(",") + 1), Base64.DEFAULT);
                if (audio.length == 0 || audio.length > 8 * 1024 * 1024) return "ERROR:Ukuran audio maksimal 8 MB.";
                try (FileOutputStream out = new FileOutputStream(new File(getFilesDir(), "work-alarm-tone"))) { out.write(audio); }
                AlarmManager manager = (AlarmManager)getSystemService(ALARM_SERVICE);
                Intent intent = new Intent(MainActivity.this, WorkAlarmReceiver.class);
                PendingIntent pending = PendingIntent.getBroadcast(MainActivity.this, 4104, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                manager.cancel(pending);
                if (Build.VERSION.SDK_INT >= 23) {
                    try { manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, pending); }
                    catch (SecurityException denied) { manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, pending); }
                } else manager.setExact(AlarmManager.RTC_WAKEUP, fireAtMillis, pending);
                return "OK";
            } catch (Exception e) { return "ERROR:" + (e.getMessage() == null ? "Gagal menjadwalkan alarm." : e.getMessage()); }
        }

        @JavascriptInterface
        public void cancelWorkAlarm() {
            try {
                AlarmManager manager = (AlarmManager)getSystemService(ALARM_SERVICE);
                Intent intent = new Intent(MainActivity.this, WorkAlarmReceiver.class);
                PendingIntent pending = PendingIntent.getBroadcast(MainActivity.this, 4104, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                manager.cancel(pending);
                startService(new Intent(MainActivity.this, WorkAlarmService.class).setAction(WorkAlarmService.ACTION_STOP));
            } catch (Exception ignored) { }
        }
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        localDatabase = new InsanLocalDatabase(this);\n        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        webView.addJavascriptInterface(new GembulBridge(), "InsanNative");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                    "application/json", "application/octet-stream", "audio/mpeg",
                    "audio/wav", "audio/ogg", "audio/mp4", "audio/aac"
                });
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "Pemilih file tidak dapat dibuka.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onReceivedError(WebView view, WebResourceRequest request,
                    android.webkit.WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this,
                        "Server belum berjalan. Buka Termux dan jalankan start-termux.sh.",
                        Toast.LENGTH_LONG).show();
                }
            }
        });
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                Uri selected = data.getData();
                try {
                    getContentResolver().takePersistableUriPermission(selected,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) { }
                results = new Uri[] { selected };
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
