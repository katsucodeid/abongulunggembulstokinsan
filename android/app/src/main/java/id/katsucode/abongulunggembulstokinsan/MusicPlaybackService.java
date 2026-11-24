package id.katsucode.abongulunggembulstokinsan;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;

public class MusicPlaybackService extends Service {
    public static final String ACTION_PLAY = "id.katsucode.gembul.MUSIC_PLAY";
    public static final String ACTION_PAUSE = "id.katsucode.gembul.MUSIC_PAUSE";
    public static final String ACTION_RESUME = "id.katsucode.gembul.MUSIC_RESUME";
    public static final String ACTION_STOP = "id.katsucode.gembul.MUSIC_STOP";
    public static final String ACTION_COMPLETED = "id.katsucode.gembul.MUSIC_COMPLETED";
    public static final String ACTION_STATE_CHANGED = "id.katsucode.gembul.MUSIC_STATE_CHANGED";
    public static final String EXTRA_URI = "music_uri";
    public static final String EXTRA_TITLE = "music_title";
    private static final String CHANNEL_ID = "gembul_music_playback";
    private static final int NOTIFICATION_ID = 4201;
    private MediaPlayer player;
    private String currentTitle = "Musik";
    private boolean prepared = false;
    private static MusicPlaybackService activeService;

    @Override public void onCreate() {
        super.onCreate();
        activeService = this;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Pemutar musik", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Kontrol pemutaran musik Abon Gulung Gembul");
            channel.setSound(null, null);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_STOP : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            releasePlayer();
            sendState(false);
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) {
            if (player != null && prepared && player.isPlaying()) player.pause();
            updateNotification(false);
            sendState(false);
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            if (player != null && prepared && !player.isPlaying()) player.start();
            updateNotification(true);
            sendState(true);
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(action)) {
            String uri = intent.getStringExtra(EXTRA_URI);
            currentTitle = intent.getStringExtra(EXTRA_TITLE);
            if (currentTitle == null || currentTitle.trim().isEmpty()) currentTitle = "Musik";
            startForeground(NOTIFICATION_ID, buildNotification(true));
            releasePlayer();
            try {
                player = new MediaPlayer();
                player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
                player.setWakeMode(getApplicationContext(), android.os.PowerManager.PARTIAL_WAKE_LOCK);
                player.setDataSource(this, Uri.parse(uri));
                player.setOnPreparedListener(mp -> {
                    prepared = true;
                    mp.start();
                    updateNotification(true);
                    sendState(true);
                });
                player.setOnCompletionListener(mp -> {
                    sendBroadcast(new Intent(ACTION_COMPLETED).setPackage(getPackageName()));
                });
                player.setOnErrorListener((mp, what, extra) -> {
                    sendBroadcast(new Intent(ACTION_COMPLETED).setPackage(getPackageName()));
                    return true;
                });
                player.prepareAsync();
            } catch (Exception e) {
                android.util.Log.e("GembulMusic", "Tidak dapat memutar musik", e);
                releasePlayer();
                stopForeground(true);
                stopSelf();
            }
        }
        return START_NOT_STICKY;
    }

    public static int currentPosition() { try { return activeService != null && activeService.player != null && activeService.prepared ? activeService.player.getCurrentPosition() : 0; } catch (Exception e) { return 0; } }
    public static int currentDuration() { try { return activeService != null && activeService.player != null && activeService.prepared ? activeService.player.getDuration() : 0; } catch (Exception e) { return 0; } }
    public static void seekCurrent(int positionMs) { try { if (activeService != null && activeService.player != null && activeService.prepared) activeService.player.seekTo(Math.max(0, Math.min(positionMs, activeService.player.getDuration()))); } catch (Exception ignored) { } }

    private void sendState(boolean playing) {
        sendBroadcast(new Intent(ACTION_STATE_CHANGED).setPackage(getPackageName()).putExtra("playing", playing));
    }

    private Notification buildNotification(boolean playing) {
        Intent actionIntent = new Intent(this, MusicPlaybackService.class)
            .setAction(playing ? ACTION_PAUSE : ACTION_RESUME);
        PendingIntent actionPending = PendingIntent.getService(this, 4202, actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stopIntent = new Intent(this, MusicPlaybackService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 4203, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(currentTitle)
            .setContentText(playing ? "Sedang memutar · Abon Gulung Gembul" : "Musik dijeda")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Jeda" : "Lanjutkan", actionPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Hentikan", stopPending);
        return builder.build();
    }

    private void updateNotification(boolean playing) {
        if (Build.VERSION.SDK_INT >= 26 || player != null) {
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE))
                .notify(NOTIFICATION_ID, buildNotification(playing));
        }
    }

    private void releasePlayer() {
        prepared = false;
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            try { player.release(); } catch (Exception ignored) { }
            player = null;
        }
    }

    @Override public void onDestroy() {
        releasePlayer();
        if (activeService == this) activeService = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}