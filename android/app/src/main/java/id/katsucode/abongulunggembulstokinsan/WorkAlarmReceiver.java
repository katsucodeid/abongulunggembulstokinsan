package id.katsucode.abongulunggembulstokinsan;
import android.content.*;
import android.os.Build;
public class WorkAlarmReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context,Intent intent){
   Intent service=new Intent(context,WorkAlarmService.class).setAction(WorkAlarmService.ACTION_START);
   if(Build.VERSION.SDK_INT>=26)context.startForegroundService(service);else context.startService(service);
 }
}