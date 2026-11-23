package id.katsucode.abongulunggembulstokinsan;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.media.MediaMetadataRetriever;
import android.provider.OpenableColumns;
import org.json.JSONArray;
import org.json.JSONObject;
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
    private ValueCallback<Uri[]> filePathCallback;
    private final BroadcastReceiver musicReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (webView == null) return;
            if (MusicPlaybackService.ACTION_COMPLETED.equals(intent.getAction())) {
                webView.post(() -> webView.evaluateJavascript("window.onNativeMusicEnded && window.onNativeMusicEnded();", null));
            } else {
                boolean playing = intent.getBooleanExtra("playing", false);
                webView.post(() -> webView.evaluateJavascript("window.onNativeMusicState && window.onNativeMusicState(" + playing + ");", null));
            }
        }
    };

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
        public void pickMusicFiles() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("audio/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try { startActivityForResult(intent, 4105); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "Pemilih musik tidak dapat dibuka.", Toast.LENGTH_LONG).show(); }
            });
        }

        @JavascriptInterface
        public String playMusic(String uri, String title) {
            try {
                Intent intent = new Intent(MainActivity.this, MusicPlaybackService.class)
                    .setAction(MusicPlaybackService.ACTION_PLAY)
                    .putExtra(MusicPlaybackService.EXTRA_URI, uri)
                    .putExtra(MusicPlaybackService.EXTRA_TITLE, title);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent); else startService(intent);
                return "OK";
            } catch (Exception e) { return "ERROR:" + (e.getMessage() == null ? "Gagal memulai pemutar musik." : e.getMessage()); }
        }

        @JavascriptInterface public void pauseMusic() { startService(new Intent(MainActivity.this, MusicPlaybackService.class).setAction(MusicPlaybackService.ACTION_PAUSE)); }
        @JavascriptInterface public void resumeMusic() { startService(new Intent(MainActivity.this, MusicPlaybackService.class).setAction(MusicPlaybackService.ACTION_RESUME)); }
        @JavascriptInterface public void stopMusic() { startService(new Intent(MainActivity.this, MusicPlaybackService.class).setAction(MusicPlaybackService.ACTION_STOP)); }

        @JavascriptInterface
        public long getMusicDuration(String uri) {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(MainActivity.this, Uri.parse(uri));
                String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                return duration == null ? 0 : Long.parseLong(duration);
            } catch (Exception e) { return 0; }
            finally { try { retriever.release(); } catch (Exception ignored) { } }
        }
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        IntentFilter musicFilter = new IntentFilter();
        musicFilter.addAction(MusicPlaybackService.ACTION_COMPLETED);
        musicFilter.addAction(MusicPlaybackService.ACTION_STATE_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(musicReceiver, musicFilter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(musicReceiver, musicFilter);
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
                        "Server belum berjalan. Buka Termux dan jalankan start-termux.sh.",
                        Toast.LENGTH_LONG).show();
                }
            }
        });
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    private void addMusicUri(JSONArray output, Uri uri) {
        if (uri == null) return;
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) { }
        String name = "Musik tanpa judul", mime = getContentResolver().getType(uri);
        try (android.database.Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0 && cursor.getString(index) != null) name = cursor.getString(index);
            }
        } catch (Exception ignored) { }
        JSONObject item = new JSONObject();
        try { item.put("uri", uri.toString()); item.put("name", name); item.put("mime", mime == null ? "audio/*" : mime); output.put(item); }
        catch (Exception ignored) { }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 4105) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                JSONArray selected = new JSONArray();
                try {
                    if (data.getClipData() != null) {
                        android.content.ClipData clips = data.getClipData();
                        for (int i = 0; i < clips.getItemCount(); i++) addMusicUri(selected, clips.getItemAt(i).getUri());
                    } else if (data.getData() != null) addMusicUri(selected, data.getData());
                } catch (Exception e) {
                    Toast.makeText(this, "Sebagian file musik tidak dapat dibaca.", Toast.LENGTH_LONG).show();
                }
                if (webView != null) webView.evaluateJavascript("window.onNativeMusicPicked && window.onNativeMusicPicked(" + selected.toString() + ");", null);
            }
            return;
        }
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
        try { unregisterReceiver(musicReceiver); } catch (Exception ignored) { }
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
