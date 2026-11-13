package id.katsucode.abongulunggembulstokinsan;

import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.os.*;

import java.io.File;

public class WorkAlarmService extends Service {
    public static final String ACTION_START="id.katsucode.abongulunggembulstokinsan.ALARM_START";
    public static final String ACTION_STOP="id.katsucode.abongulunggembulstokinsan.ALARM_STOP";
    private static final String CHANNEL="work_alarm_channel";
    private MediaPlayer player;

    @Override public void onCreate(){super.onCreate();createChannel();}
    private void createChannel(){
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel ch=new NotificationChannel(CHANNEL,"Alarm kerja","high");
            ch.setDescription("Alarm pengingat waktu pulang kerja");
            ch.setSound(null,null);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null && ACTION_STOP.equals(intent.getAction())){stopPlayback();stopForeground(true);stopSelf();return START_NOT_STICKY;}
        Intent stop=new Intent(this,WorkAlarmService.class).setAction(ACTION_STOP);
        PendingIntent stopPi=PendingIntent.getService(this,2,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Waktunya pulang!")
            .setContentText("Alarm kerja sedang berbunyi").setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause,"Matikan alarm",stopPi);
        Notification n = builder.build();
        startForeground(4103,n);
        try{
            File tone=new File(getFilesDir(),"work-alarm-tone");
            if(tone.exists()){
                stopPlayback();
                player=new MediaPlayer();
                player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                player.setDataSource(tone.getAbsolutePath());player.setLooping(true);
                player.setOnPreparedListener(mp -> mp.start());player.prepareAsync();
            }
        }catch(Exception e){android.util.Log.e("WorkAlarm","Tidak dapat memutar nada",e);}
        return START_STICKY;
    }
    private void stopPlayback(){if(player!=null){try{player.stop();}catch(Exception ignored){}player.release();player=null;}}
    @Override public void onDestroy(){stopPlayback();super.onDestroy();}
    @Override public android.os.IBinder onBind(Intent intent){return null;}
}