package id.katsucode.abongulunggembulstokinsan;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
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
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.UUID;
import java.util.Map;
import java.util.TreeMap;
import java.util.HashMap;
import java.util.Collections;
import java.util.zip.GZIPOutputStream;
import java.util.zip.GZIPInputStream;
import java.security.MessageDigest;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import com.journeyapps.barcodescanner.CaptureActivity;

public class MainActivity extends Activity {
    private static final String APP_URL = "http://127.0.0.1:8787";
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private static final int MUSIC_PICKER_REQUEST = 4105;
    private static final int QR_PICKER_REQUEST = 4106;
    private JSONArray latestQrImages = new JSONArray();
    private WebView webView;
    private final GembulBridge nativeBridge = new GembulBridge();
    private ValueCallback<Uri[]> filePathCallback;
    private final BroadcastReceiver musicReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (webView == null) return;
            if (MusicPlaybackService.ACTION_COMPLETED.equals(intent.getAction())) {
                webView.post(() -> webView.evaluateJavascript("window.onNativeMusicEnded && window.onNativeMusicEnded();", null));
            } else if (MusicPlaybackService.ACTION_SKIP_PREVIOUS.equals(intent.getAction())) {
                webView.post(() -> webView.evaluateJavascript("window.previousMusic && window.previousMusic();", null));
            } else if (MusicPlaybackService.ACTION_SKIP_NEXT.equals(intent.getAction())) {
                webView.post(() -> webView.evaluateJavascript("window.nextMusic && window.nextMusic();", null));
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
                try {
                    startActivityForResult(intent, MUSIC_PICKER_REQUEST);
                } catch (Exception e) {
                    String message = e.getMessage() == null ? "Pemilih musik tidak dapat dibuka." : e.getMessage();
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
                    notifyMusicPicker("[]", "Pemilih musik gagal dibuka: " + message);
                }
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
        @JavascriptInterface public void releaseMusicUri(String uri) {
            try { getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (Exception ignored) { }
        }

        @JavascriptInterface public int getMusicPosition() { return MusicPlaybackService.currentPosition(); }
        @JavascriptInterface public int getCurrentMusicDuration() { return MusicPlaybackService.currentDuration(); }
        @JavascriptInterface public void seekMusic(int positionMs) { MusicPlaybackService.seekCurrent(positionMs); }

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

        @JavascriptInterface
        public String generateBackupQr(String json) {
            try {
                if (json == null || json.isEmpty()) return "ERROR:Data cadangan kosong.";
                byte[] raw = json.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                if (raw.length > 8 * 1024 * 1024)
                    return "ERROR:Ukuran data cadangan melebihi batas 8 MB.";
                ByteArrayOutputStream compressed = new ByteArrayOutputStream();
                try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) { gzip.write(raw); }
                byte[] bytes = compressed.toByteArray();
                if (bytes.length > 8 * 1024 * 1024)
                    return "ERROR:Ukuran cadangan terkompresi melebihi batas 8 MB.";
                String checksum = toHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                String backupId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
                String encoded = Base64.encodeToString(bytes, Base64.NO_WRAP);
                final int chunkChars = 1200;
                int total = (encoded.length() + chunkChars - 1) / chunkChars;
                JSONArray images = new JSONArray();
                QRCodeWriter writer = new QRCodeWriter();
                for (int index = 0; index < total; index++) {
                    int from = index * chunkChars;
                    int to = Math.min(encoded.length(), from + chunkChars);
                    String payload = "GEMBULQR2|" + backupId + "|" + (index + 1) + "|" + total + "|" + checksum + "|" + encoded.substring(from, to);
                    com.google.zxing.common.BitMatrix matrix = writer.encode(payload, BarcodeFormat.QR_CODE, 520, 520);
                    Bitmap bitmap = Bitmap.createBitmap(520, 520, Bitmap.Config.RGB_565);
                    for (int y = 0; y < 520; y++)
                        for (int x = 0; x < 520; x++)
                            bitmap.setPixel(x, y, matrix.get(x, y) ? Color.BLACK : Color.WHITE);
                    ByteArrayOutputStream png = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, png);
                    bitmap.recycle();
                    JSONObject image = new JSONObject();
                    image.put("name", String.format(java.util.Locale.US, "Gembul-QR-%s-%05d-of-%05d.png", backupId, index + 1, total));
                    image.put("data", Base64.encodeToString(png.toByteArray(), Base64.NO_WRAP));
                    images.put(image);
                }
                latestQrImages = images;
                return images.toString();
            } catch (Exception e) {
                latestQrImages = new JSONArray();
                return "ERROR:" + (e.getMessage() == null ? "QR gagal dibuat." : e.getMessage());
            }
        }

        @JavascriptInterface
        public String saveBackupQrImages() {
            if (Build.VERSION.SDK_INT < 29) return "ERROR:Android 10+ diperlukan untuk menyimpan QR ke galeri.";
            if (latestQrImages == null || latestQrImages.length() == 0) return "ERROR:QR belum dibuat.";
            int saved = 0;
            try {
                for (int i = 0; i < latestQrImages.length(); i++) {
                    JSONObject image = latestQrImages.getJSONObject(i);
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, image.getString("name"));
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Abon Gulung Gembul/QR Backup");
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException("Tidak dapat membuat gambar QR.");
                    try (OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
                        if (out == null) throw new IllegalStateException("Tidak dapat menyimpan gambar QR.");
                        out.write(Base64.decode(image.getString("data"), Base64.DEFAULT)); out.flush();
                    }
                    ContentValues done = new ContentValues(); done.put(MediaStore.Images.Media.IS_PENDING, 0);
                    getContentResolver().update(uri, done, null, null); saved++;
                }
                return "OK:" + saved + " gambar QR tersimpan di Pictures/Abon Gulung Gembul/QR Backup.";
            } catch (Exception e) { return "ERROR:" + (e.getMessage() == null ? "Gagal menyimpan QR." : e.getMessage()); }
        }

        @JavascriptInterface
        public void pickQrImages() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, QR_PICKER_REQUEST); }
                catch (Exception e) { notifyQrSegments("[]", "Galeri tidak dapat dibuka: " + e.getMessage()); }
            });
        }

        @JavascriptInterface
        public void scanQrCamera() {
            runOnUiThread(() -> {
                try {
                    IntentIntegrator scanner = new IntentIntegrator(MainActivity.this);
                    scanner.setDesiredBarcodeFormats(Collections.singletonList("QR_CODE"));
                    scanner.setPrompt("Arahkan kamera ke QR cadangan Abon Gulung Gembul");
                    scanner.setBeepEnabled(false); scanner.setOrientationLocked(false);
                    scanner.setCaptureActivity(CaptureActivity.class); scanner.initiateScan();
                } catch (Exception e) { notifyQrSegments("[]", "Pemindai kamera gagal dibuka: " + e.getMessage()); }
            });
        }

        @JavascriptInterface
        public String assembleBackupQr(String encodedSegments) {
            try {
                JSONArray incoming = new JSONArray(encodedSegments);
                if (incoming.length() == 1) {
                    String raw = incoming.getString(0);
                    String[] single = raw.split("\\|", 3);
                    if (single.length == 3 && "GEMBULQR3".equals(single[0])) {
                        byte[] compressed = Base64.decode(single[2], Base64.DEFAULT);
                        String actual = toHex(MessageDigest.getInstance("SHA-256").digest(compressed));
                        if (!actual.equalsIgnoreCase(single[1]))
                            return "ERROR:Checksum QR tidak cocok. Cadangan mungkin rusak.";
                        ByteArrayOutputStream restored = new ByteArrayOutputStream();
                        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
                            byte[] buffer = new byte[8192]; int count;
                            while ((count = gzip.read(buffer)) != -1) restored.write(buffer, 0, count);
                        }
                        return restored.toString("UTF-8");
                    }
                }
                // Backward compatibility: restore older multi-part GEMBULQR2 backups.
                Map<Integer, String> chunks = new TreeMap<>();
                String backupId = null, checksum = null; int total = -1;
                for (int i = 0; i < incoming.length(); i++) {
                    String[] fields = incoming.getString(i).split("\\|", 6);
                    if (fields.length != 6 || !"GEMBULQR2".equals(fields[0])) return "ERROR:Format QR tidak dikenali.";
                    if (backupId == null) { backupId = fields[1]; total = Integer.parseInt(fields[3]); checksum = fields[4]; }
                    if (!backupId.equals(fields[1]) || total != Integer.parseInt(fields[3]) || !checksum.equals(fields[4])) return "ERROR:QR berasal dari paket cadangan berbeda.";
                    int index = Integer.parseInt(fields[2]);
                    if (index < 1 || index > total) return "ERROR:Nomor bagian QR tidak valid.";
                    chunks.put(index, fields[5]);
                }
                if (total < 1 || chunks.size() != total) return "ERROR:Bagian QR belum lengkap (" + chunks.size() + "/" + total + ").";
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                for (int i = 1; i <= total; i++) {
                    String part = chunks.get(i);
                    if (part == null) return "ERROR:Bagian QR nomor " + i + " belum ditemukan.";
                    bytes.write(Base64.decode(part, Base64.DEFAULT));
                }
                byte[] compressed = bytes.toByteArray();
                String actual = toHex(MessageDigest.getInstance("SHA-256").digest(compressed));
                if (!actual.equalsIgnoreCase(checksum)) return "ERROR:Checksum tidak cocok. Cadangan mungkin rusak.";
                ByteArrayOutputStream restored = new ByteArrayOutputStream();
                try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = gzip.read(buffer)) != -1) restored.write(buffer, 0, count);
                }
                return restored.toString("UTF-8");
            } catch (Exception e) {
                return "ERROR:" + (e.getMessage() == null ? "QR tidak dapat dipulihkan." : e.getMessage());
            }
        }

        private String toHex(byte[] bytes) {
            StringBuilder out = new StringBuilder();
            for (byte value : bytes) out.append(String.format(java.util.Locale.US, "%02x", value & 0xff));
            return out.toString();
        }

        private String decodeQrImage(Uri uri) {
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                Bitmap source = BitmapFactory.decodeStream(input);
                if (source == null) return null;
                int width = source.getWidth(), height = source.getHeight(), max = Math.max(width, height);
                if (max > 1800) {
                    float scale = 1800f / max;
                    Bitmap scaled = Bitmap.createScaledBitmap(source, Math.round(width * scale), Math.round(height * scale), true);
                    source.recycle(); source = scaled; width = source.getWidth(); height = source.getHeight();
                }
                int[] pixels = new int[width * height]; source.getPixels(pixels, 0, width, 0, 0, width, height); source.recycle();
                BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(width, height, pixels)));
                Map<DecodeHintType, Object> hints = new HashMap<>(); hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
                return new MultiFormatReader().decode(bitmap, hints).getText();
            } catch (Exception ignored) { return null; }
        }

        private void notifyQrSegments(String payload, String message) {
            if (webView == null) return;
            String safe = JSONObject.quote(message == null ? "" : message);
            webView.post(() -> webView.evaluateJavascript("if(window.onNativeQrSegments){window.onNativeQrSegments(" + payload + "," + safe + ");}", null));
        }

    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        IntentFilter musicFilter = new IntentFilter();
        musicFilter.addAction(MusicPlaybackService.ACTION_COMPLETED);
        musicFilter.addAction(MusicPlaybackService.ACTION_STATE_CHANGED);
        musicFilter.addAction(MusicPlaybackService.ACTION_SKIP_PREVIOUS);
        musicFilter.addAction(MusicPlaybackService.ACTION_SKIP_NEXT);
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
        webView.addJavascriptInterface(nativeBridge, "InsanNative");
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

    private void addMusicUri(JSONArray output, Uri uri, int grantedFlags) {
        if (uri == null) return;
        try {
            int persistableFlags = grantedFlags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if ((grantedFlags & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0
                    && (persistableFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0) {
                getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
        } catch (Exception ignored) { }
        String name = "Musik tanpa judul", mime = getContentResolver().getType(uri);
        long size = 0;
        try (android.database.Cursor cursor = getContentResolver().query(uri,
                new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex >= 0 && cursor.getString(nameIndex) != null) name = cursor.getString(nameIndex);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
            }
        } catch (Exception ignored) { }
        JSONObject item = new JSONObject();
        try {
            item.put("uri", uri.toString());
            item.put("name", name);
            item.put("mime", mime == null ? "audio/*" : mime);
            item.put("size", size);
            output.put(item);
        } catch (Exception ignored) { }
    }

    private void notifyMusicPicker(String payload, String message) {
        if (webView == null) return;
        String safeMessage = JSONObject.quote(message);
        webView.post(() -> webView.evaluateJavascript(
            "if(window.onNativeMusicPicked){window.onNativeMusicPicked(" + payload + ");}" +
            "if(window.onNativeMusicPickerMessage){window.onNativeMusicPickerMessage(" + safeMessage + ");}", null
        ));
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == MUSIC_PICKER_REQUEST) {
            JSONArray selected = new JSONArray();
            if (resultCode == Activity.RESULT_OK && data != null) {
                int grantedFlags = data.getFlags();
                try {
                    android.content.ClipData clips = data.getClipData();
                    if (clips != null && clips.getItemCount() > 0) {
                        for (int i = 0; i < clips.getItemCount(); i++) {
                            addMusicUri(selected, clips.getItemAt(i).getUri(), grantedFlags);
                        }
                    } else if (data.getData() != null) {
                        addMusicUri(selected, data.getData(), grantedFlags);
                    }
                } catch (Exception e) {
                    Toast.makeText(this, "Sebagian file musik tidak dapat dibaca: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
            String message = selected.length() > 0
                ? selected.length() + " file musik berhasil diterima Android."
                : "Tidak ada file musik yang diterima. Pilih file audio lalu tekan Buka.";
            notifyMusicPicker(selected.toString(), message);
            if (selected.length() == 0 && resultCode == Activity.RESULT_OK) {
                Toast.makeText(this, message, Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode == IntentIntegrator.REQUEST_CODE) {
            IntentResult scan = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
            JSONArray values = new JSONArray();
            if (scan != null && scan.getContents() != null) values.put(scan.getContents());
            nativeBridge.notifyQrSegments(values.toString(), values.length() > 0 ? "Satu bagian QR berhasil dipindai." : "Pemindaian QR dibatalkan.");
            return;
        }
        if (requestCode == QR_PICKER_REQUEST) {
            JSONArray values = new JSONArray();
            if (resultCode == Activity.RESULT_OK && data != null) {
                try {
                    android.content.ClipData clips = data.getClipData();
                    if (clips != null && clips.getItemCount() > 0) {
                        for (int i = 0; i < clips.getItemCount(); i++) {
                            String decoded = nativeBridge.decodeQrImage(clips.getItemAt(i).getUri());
                            if (decoded != null) values.put(decoded);
                        }
                    } else if (data.getData() != null) {
                        String decoded = nativeBridge.decodeQrImage(data.getData());
                        if (decoded != null) values.put(decoded);
                    }
                } catch (Exception e) { Toast.makeText(this, "Gambar QR tidak dapat dibaca: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
            }
            nativeBridge.notifyQrSegments(values.toString(), values.length() > 0 ? values.length() + " QR berhasil dibaca dari galeri." : "Tidak ada QR yang terbaca. Pilih gambar QR cadangan yang jelas.");
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
