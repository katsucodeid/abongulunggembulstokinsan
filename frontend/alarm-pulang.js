/* Bundled offline ringtone for the INSAN work-home alarm. */
(async function installPulangTone() {
  const id = "pulang-kerja";
  const asset = "./audio/nada-pulang-abon-gulung.mp3";
  const status = document.getElementById("alarmToneStatus");
  try {
    let data = {};
    try { data = JSON.parse(localStorage.getItem("insan_alarm_tone_data_v1") || "{}"); } catch {}
    if (!data[id]) {
      const response = await fetch(asset, { cache: "force-cache" });
      if (!response.ok) throw new Error("File nada belum ditemukan: " + asset);
      const blob = await response.blob();
      data[id] = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      localStorage.setItem("insan_alarm_tone_data_v1", JSON.stringify(data));
    }
    ALARM_TONES[id] = { name: "Pulang Kerja · Abon Gulung Gembul", notes: [659, 784, 988], wave: "sine" };
    if (!localStorage.getItem("insan_alarm_tone_v1")) localStorage.setItem("insan_alarm_tone_v1", id);
    const savedAlarm = JSON.parse(localStorage.getItem("insan_work_alarm_v1") || "null");
    if (savedAlarm?.enabled && !savedAlarm.toneId) {
      savedAlarm.toneId = id;
      localStorage.setItem("insan_work_alarm_v1", JSON.stringify(savedAlarm));
    }
    if (status) status.textContent = "Nada bawaan Pulang Kerja siap · MP3 tersimpan lokal untuk pemutaran offline.";
    if (typeof renderToneLibraries === "function") renderToneLibraries();
    if (typeof renderWorkAlarm === "function") renderWorkAlarm();
  } catch (error) {
    console.warn("Nada Pulang Kerja belum dipasang:", error);
    if (status) status.textContent = "Nada Pulang Kerja belum dipasang. Letakkan file MP3 di frontend/audio lalu muat ulang aplikasi.";
  }
})();
