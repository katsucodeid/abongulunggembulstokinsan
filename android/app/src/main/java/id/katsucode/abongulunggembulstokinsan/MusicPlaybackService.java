package id.katsucode.abongulunggembulstokinsan;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

public class MusicPlaybackService extends Service {
    public static final String ACTION_PLAY = "id.katsucode.gembul.MUSIC_PLAY";
    public static final String ACTION_PAUSE = "id.katsucode.gembul.MUSIC_PAUSE";
    public static final String ACTION_RESUME = "id.katsucode.gembul.MUSIC_RESUME";
    public static final String ACTION_STOP = "id.katsucode.gembul.MUSIC_STOP";
    public static final String ACTION_SKIP_PREVIOUS = "id.katsucode.gembul.MUSIC_SKIP_PREVIOUS";
    public static final String ACTION_SKIP_NEXT = "id.katsucode.gembul.MUSIC_SKIP_NEXT";
    public static final String ACTION_COMPLETED = "id.katsucode.gembul.MUSIC_COMPLETED";
    public static final String ACTION_STATE_CHANGED = "id.katsucode.gembul.MUSIC_STATE_CHANGED";
    public static final String EXTRA_URI = "music_uri";
    public static final String EXTRA_TITLE = "music_title";
    private static final String CHANNEL_ID = "gembul_music_playback";
    private static final int NOTIFICATION_ID = 4201;
    private MediaPlayer player;
    private MediaSession mediaSession;
    private String currentTitle = "Musik";
    private boolean prepared = false;
    private boolean playing = false;
    private static MusicPlaybackService activeService;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable progressUpdater = new Runnable() {
        @Override public void run() {
            if (prepared) updateNotification(playing);
            if (playing) handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        activeService = this;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Abon Gulung Musik", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Judul, durasi, dan kontrol pemutar musik");
            channel.setSound(null, null);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
        mediaSession = new MediaSession(this, "AbonGulungMusik");
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() {
                onStartCommand(new Intent(MusicPlaybackService.this, MusicPlaybackService.class).setAction(ACTION_RESUME), 0, 0);
            }
            @Override public void onPause() {
                onStartCommand(new Intent(MusicPlaybackService.this, MusicPlaybackService.class).setAction(ACTION_PAUSE), 0, 0);
            }
            @Override public void onSkipToPrevious() {
                onStartCommand(new Intent(MusicPlaybackService.this, MusicPlaybackService.class).setAction(ACTION_SKIP_PREVIOUS), 0, 0);
            }
            @Override public void onSkipToNext() {
                onStartCommand(new Intent(MusicPlaybackService.this, MusicPlaybackService.class).setAction(ACTION_SKIP_NEXT), 0, 0);
            }
            @Override public void onSeekTo(long position) {
                seekCurrent((int)position);
            }
            @Override public void onStop() {
                onStartCommand(new Intent(MusicPlaybackService.this, MusicPlaybackService.class).setAction(ACTION_STOP), 0, 0);
            }
        });
        mediaSession.setActive(true);
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
            playing = false;
            handler.removeCallbacks(progressUpdater);
            updateNotification(false);
            sendState(false);
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            if (player != null && prepared && !player.isPlaying()) player.start();
            playing = player != null && prepared;
            updateNotification(playing);
            if (playing) handler.post(progressUpdater);
            sendState(playing);
            return START_NOT_STICKY;
        }
        if (ACTION_SKIP_PREVIOUS.equals(action) || ACTION_SKIP_NEXT.equals(action)) {
            String control = ACTION_SKIP_PREVIOUS.equals(action) ? ACTION_SKIP_PREVIOUS : ACTION_SKIP_NEXT;
            sendBroadcast(new Intent(control).setPackage(getPackageName()));
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
                    playing = true;
                    mp.start();
                    updateNotification(true);
                    handler.removeCallbacks(progressUpdater);
                    handler.post(progressUpdater);
                    sendState(true);
                });
                player.setOnCompletionListener(mp -> {
                    playing = false;
                    handler.removeCallbacks(progressUpdater);
                    updateNotification(false);
                    sendBroadcast(new Intent(ACTION_COMPLETED).setPackage(getPackageName()));
                });
                player.setOnErrorListener((mp, what, extra) -> {
                    playing = false;
                    handler.removeCallbacks(progressUpdater);
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
    public static void seekCurrent(int positionMs) { try { if (activeService != null && activeService.player != null && activeService.prepared) { activeService.player.seekTo(Math.max(0, Math.min(positionMs, activeService.player.getDuration()))); activeService.updateNotification(activeService.playing); } } catch (Exception ignored) { } }

    private void sendState(boolean isPlaying) {
        sendBroadcast(new Intent(ACTION_STATE_CHANGED).setPackage(getPackageName()).putExtra("playing", isPlaying));
    }

    private PendingIntent serviceAction(String action, int requestCode) {
        Intent intent = new Intent(this, MusicPlaybackService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private String formatTime(int millis) {
        int total = Math.max(0, millis) / 1000;
        return String.format(java.util.Locale.getDefault(), "%02d:%02d", total / 60, total % 60);
    }

    private void updateMediaSession(boolean isPlaying) {
        if (mediaSession == null) return;
        long duration = prepared && player != null ? player.getDuration() : 0;
        long position = prepared && player != null ? player.getCurrentPosition() : 0;
        mediaSession.setMetadata(new android.media.MediaMetadata.Builder()
            .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, currentTitle)
            .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, "Abon Gulung Musik")
            .putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, duration)
            .build());
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
            PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_PREVIOUS |
            PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SEEK_TO;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, position, isPlaying ? 1f : 0f)
            .build());
    }

    private Notification buildNotification(boolean isPlaying) {
        PendingIntent previous = serviceAction(ACTION_SKIP_PREVIOUS, 4204);
        PendingIntent toggle = serviceAction(isPlaying ? ACTION_PAUSE : ACTION_RESUME, 4202);
        PendingIntent next = serviceAction(ACTION_SKIP_NEXT, 4205);
        PendingIntent stop = serviceAction(ACTION_STOP, 4203);
        Intent openIntent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 4206, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int position = prepared && player != null ? player.getCurrentPosition() : 0;
        int duration = prepared && player != null ? player.getDuration() : 0;
        updateMediaSession(isPlaying);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(currentTitle)
            .setContentText(formatTime(position) + " / " + formatTime(duration))
            .setContentIntent(content)
            .setWhen(0)
            .setShowWhen(false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .addAction(android.R.drawable.ic_media_previous, "Sebelumnya", previous)
            .addAction(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Jeda" : "Putar", toggle)
            .addAction(android.R.drawable.ic_media_next, "Berikutnya", next)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Hentikan", stop);
        if (Build.VERSION.SDK_INT >= 21) {
            builder.setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        }
        return builder.build();
    }

    private void updateNotification(boolean isPlaying) {
        if (mediaSession != null) updateMediaSession(isPlaying);
        if (Build.VERSION.SDK_INT >= 26 || player != null) {
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE))
                .notify(NOTIFICATION_ID, buildNotification(isPlaying));
        }
    }

    private void releasePlayer() {
        prepared = false;
        playing = false;
        handler.removeCallbacks(progressUpdater);
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            try { player.release(); } catch (Exception ignored) { }
            player = null;
        }
    }

    @Override public void onDestroy() {
        releasePlayer();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        if (activeService == this) activeService = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}