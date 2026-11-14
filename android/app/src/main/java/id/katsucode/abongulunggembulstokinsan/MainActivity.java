import java.io.InputStream;
import java.net.URL;
import java.net.HttpURLConnection;
import android.content.pm.PackageManager;
import android.provider.Settings;
package id.katsucode.abongulunggembulstokinsan;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    private class GembulBridge {
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
                return "OK:Download/Abon Gulung Gembul/" + filename;
            } catch (Exception e) {
                if (item != null) {
                    try { getContentResolver().delete(item, null, null); } catch (Exception ignored) { }
                }
                return "ERROR:" + (e.getMessage() == null ? "Penyimpanan gagal." : e.getMessage());
            }
        }
        @JavascriptInterface
        public String downloadAndInstallApk(String urlString) {
            if (Build.VERSION.SDK_INT < 29) return "ERROR:Fitur unduh APK otomatis memerlukan Android 10 atau lebih baru.";
            if (urlString == null || !urlString.startsWith("https://github.com/katsucodeid/abongulunggembulstokinsan/releases/")) return "ERROR:Sumber APK tidak diizinkan.";
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                try { Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())); settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(settings); return "PERMISSION_REQUIRED"; }
                catch (Exception e) { return "ERROR:Tidak dapat membuka pengaturan izin pemasangan."; }
            }
            new Thread(() -> {
                Uri item = null; HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection)new URL(urlString).openConnection();
                    connection.setInstanceFollowRedirects(true); connection.setConnectTimeout(20000); connection.setReadTimeout(90000);
                    connection.setRequestProperty("User-Agent", "AbonGulungGembul-Android"); connection.connect();
                    int code = connection.getResponseCode(); if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
                    if (connection.getContentLengthLong() > 200L * 1024 * 1024) throw new IllegalStateException("APK melebihi 200 MB.");
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, "Abon-Gulung-Gembul-Stok-Kertas.apk");
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive");
                    values.put(MediaStore.Downloads.RELATIVE_PATH, "Download/Abon Gulung Gembul");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    item = getContentResolver().insert(MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
                    if (item == null) throw new IllegalStateException("Tidak dapat membuat file APK.");
                    long total=0;
                    try (InputStream in=connection.getInputStream(); OutputStream out=getContentResolver().openOutputStream(item,"w")) {
                        if(out==null)throw new IllegalStateException("Tidak dapat menyimpan APK.");
                        byte[] buffer=new byte[32768]; int count;
                        while((count=in.read(buffer))!=-1){total+=count;if(total>200L*1024*1024)throw new IllegalStateException("APK melebihi 200 MB.");out.write(buffer,0,count);}
                        out.flush();
                    }
                    if(total<1024*1024)throw new IllegalStateException("Unduhan APK tidak lengkap.");
                    ContentValues done=new ContentValues();done.put(MediaStore.Downloads.IS_PENDING,0);getContentResolver().update(item,done,null,null);
                    Uri apkUri=item;
                    runOnUiThread(()->{try{Intent install=new Intent(Intent.ACTION_VIEW);install.setDataAndType(apkUri,"application/vnd.android.package-archive");install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(install);}catch(Exception e){Toast.makeText(MainActivity.this,"APK tersimpan di Download/Abon Gulung Gembul.",Toast.LENGTH_LONG).show();}});
                } catch(Exception e) {
                    if(item!=null)try{getContentResolver().delete(item,null,null);}catch(Exception ignored){}
                    runOnUiThread(()->Toast.makeText(MainActivity.this,"Gagal mengunduh APK: "+e.getMessage(),Toast.LENGTH_LONG).show());
                } finally {if(connection!=null)connection.disconnect();}
            }).start(); return "STARTED";
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
        webView = new WebView(this);
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
                        "Server lokal belum berjalan. Buka Termux pada HP ini lalu jalankan: bash scripts/start-termux.sh.",
                        Toast.LENGTH_LONG).show();
                }
            }
        });
        setContentView(webView);
        webView.loadUrl("http://127.0.0.1:8787");
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
