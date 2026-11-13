const fs = require("fs");
const path = require("path");

const MONTHS = [
  "januari", "februari", "maret", "april", "mei", "juni",
  "juli", "agustus", "september", "oktober", "november", "desember"
];

function localDateKey(value = new Date()) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(key, amount) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function reportFileName(key) {
  const [year, month, day] = key.split("-").map(Number);
  return `${String(day).padStart(2, "0")}${MONTHS[month - 1]}${year}.txt`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function stamp() {
  const now = new Date();
  return [
    localDateKey(now).replace(/-/g, ""),
    String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0")
  ].join("-");
}

async function ensureReportDirectory(reportDir) {
  const downloads = path.dirname(reportDir);
  await fs.promises.access(downloads);
  await fs.promises.mkdir(reportDir, { recursive: true });
}

async function backupExistingDatabase(dataFile, reportDir) {
  let raw;
  try {
    raw = await fs.promises.readFile(dataFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  await ensureReportDirectory(reportDir);
  const filename = `cadangan-sebelum-pembaruan-${stamp()}.txt`;
  const destination = path.join(reportDir, filename);
  const body = [
    "CADANGAN DATABASE ABON GULUNG GEMBUL",
    "Dibuat sebelum pembaruan sistem laporan offline.",
    "Simpan file ini dengan aman dan jangan bagikan kepada orang lain.",
    "",
    raw,
    ""
  ].join("\n");
  await fs.promises.writeFile(destination, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return destination;
}

async function mirrorDatabase(database, reportDir) {
  await ensureReportDirectory(reportDir);
  const destination = path.join(reportDir, "database-stok.txt");
  const temporary = destination + "." + process.pid + "." + require("crypto").randomUUID() + ".tmp";
  const body = [
    "DATABASE LOKAL ABON GULUNG GEMBUL",
    "Salinan otomatis dari database Termux. Jangan edit file ini secara manual.",
    "File ini diperbarui setiap kali ada perubahan data.",
    "",
    JSON.stringify(database, null, 2),
    ""
  ].join("\n");
  try {
    await fs.promises.writeFile(temporary, body, { encoding: "utf8", flag: "w", mode: 0o600 });
    await fs.promises.rename(temporary, destination);
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
  }
}

function createDailyReports({ getDb, persist, locked, itemDefs, reportDir }) {
  let timer = null;
  let stopped = false;

  function buildReport(dateKey) {
    const database = getDb();
    const transactions = (database.transactions || [])
      .filter(tx => String(tx.date || "") === dateKey)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const auditEntries = (database.auditLog || [])
      .filter(entry => entry.at && localDateKey(new Date(entry.at)) === dateKey)
      .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
    const dailyChanges = Object.fromEntries(Object.keys(itemDefs).map(key => [key, 0]));
    const laterChanges = Object.fromEntries(Object.keys(itemDefs).map(key => [key, 0]));

    for (const tx of database.transactions || []) {
      const destination = String(tx.date || "") === dateKey ? dailyChanges
        : String(tx.date || "") > dateKey ? laterChanges : null;
      if (!destination) continue;
      for (const [key, delta] of Object.entries(tx.changes || {})) {
        if (Object.hasOwn(destination, key) && Number.isSafeInteger(delta)) destination[key] += delta;
      }
    }

    const closing = {};
    const opening = {};
    for (const key of Object.keys(itemDefs)) {
      closing[key] = Number(database.stock?.[key] || 0) - laterChanges[key];
      opening[key] = closing[key] - dailyChanges[key];
    }

    const lines = [
      "LAPORAN HARIAN STOK — ABON GULUNG GEMBUL",
      "Tanggal: " + dateKey.split("-").reverse().join("-"),
      "File: " + reportFileName(dateKey),
      "Dibuat otomatis oleh server lokal Termux pada pergantian hari pukul 00.00",
      "",
      "RINGKASAN STOK",
      "Barang | Stok awal | Perubahan hari ini | Stok akhir"
    ];

    for (const [key, definition] of Object.entries(itemDefs)) {
      const delta = dailyChanges[key];
      const signed = delta > 0 ? "+" + formatNumber(delta) : formatNumber(delta);
      lines.push(
        definition.label + " | " + formatNumber(opening[key]) +
        " | " + signed + " pcs | " + formatNumber(closing[key]) + " pcs"
      );
    }

    lines.push("", "AKTIVITAS HARIAN", "Total aktivitas: " + transactions.length);
    if (!transactions.length) lines.push("Tidak ada target atau perubahan stok pada tanggal ini.");

    transactions.forEach((tx, index) => {
      const time = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--";
      lines.push("", (index + 1) + ". " + time + " — " + (
        tx.type === "production" ? "TARGET PRODUKSI" :
        tx.type === "stock-in" ? "BARANG MASUK" :
        tx.type === "stock-out" ? "PENGURANGAN STOK" : String(tx.type || "AKTIVITAS").toUpperCase()
      ));
      lines.push("   Dibuat oleh: " + (tx.createdBy || "Tidak diketahui"));
      if (tx.location) lines.push("   Outlet: " + tx.location);
      if (tx.type === "production") {
        lines.push("   Target: Ori " + formatNumber(tx.lines?.ori) +
          ", Beef " + formatNumber(tx.lines?.beef) +
          ", Spicy " + formatNumber(tx.lines?.spicy) +
          ", Cheese " + formatNumber(tx.lines?.cheese) +
          " (Total " + formatNumber(tx.lines?.total) + " loyang)");
        if (tx.lines?.requestNote) lines.push("   Request: " + tx.lines.requestNote);
      } else if (tx.type === "stock-in") {
        lines.push("   Barang: " + (itemDefs[tx.lines?.item]?.label || tx.lines?.item || "-") +
          ", masuk " + formatNumber(tx.lines?.total) + " pcs");
      } else if (tx.type === "stock-out") {
        lines.push("   Barang: " + (itemDefs[tx.lines?.item]?.label || tx.lines?.item || "-") +
          ", keluar " + formatNumber(tx.lines?.quantity) + " pcs");
        if (tx.lines?.reason) lines.push("   Alasan: " + tx.lines.reason);
      }
      if (tx.note) lines.push("   Catatan: " + tx.note);
      const changes = Object.entries(tx.changes || {})
        .filter(([, value]) => value)
        .map(([key, value]) => (itemDefs[key]?.label || key) + " " + (value > 0 ? "+" : "") + formatNumber(value) + " pcs");
      if (changes.length) lines.push("   Perubahan: " + changes.join("; "));
    });

    lines.push("", "PERUBAHAN DATABASE / RIWAYAT AUDIT", "Jumlah perubahan tercatat: " + auditEntries.length);
    if (!auditEntries.length) lines.push("Tidak ada perubahan pengaturan atau akun pada tanggal ini.");
    auditEntries.forEach((entry, index) => {
      const time = new Date(entry.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      const details = entry.details && Object.keys(entry.details).length
        ? JSON.stringify(entry.details)
        : "-";
      lines.push((index + 1) + ". " + time + " — " + entry.action +
        " | Pengguna: " + (entry.username || "system") +
        " | Detail: " + details);
    });

    lines.push(
      "",
      "CATATAN",
      "- Laporan ini dibuat otomatis dari transaksi dan riwayat perubahan database lokal Termux.",
      "- File database utama tetap berada di folder backend/data pada Termux.",
      "- Salinan database terbaru: database-stok.txt",
      "",
      "Akhir laporan."
    );
    return lines.join("\n") + "\n";
  }

  async function createForDate(dateKey) {
    const filename = reportFileName(dateKey);
    const destination = path.join(reportDir, filename);
    try {
      await fs.promises.access(destination);
      const database = getDb();
      database.lastDailyReportDate = dateKey;
      await persist();
      return false;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await ensureReportDirectory(reportDir);
    const backupName = "cadangan-sebelum-laporan-" + filename;
    const backupPath = path.join(reportDir, backupName);
    try {
      await fs.promises.writeFile(
        backupPath,
        [
          "CADANGAN DATABASE SEBELUM LAPORAN HARIAN",
          "Tanggal laporan: " + dateKey,
          "Dibuat: " + new Date().toISOString(),
          "Jangan edit atau bagikan file ini.",
          "",
          JSON.stringify(getDb(), null, 2),
          ""
        ].join("\n"),
        { encoding: "utf8", flag: "wx", mode: 0o600 }
      );
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }

    await fs.promises.writeFile(destination, buildReport(dateKey), {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
    const database = getDb();
    database.lastDailyReportDate = dateKey;
    await persist();
    console.log("Laporan harian tersimpan:", destination);
    return true;
  }

  async function catchUp() {
    const today = localDateKey();
    const database = getDb();
    const firstTransaction = (database.transactions || [])
      .map(tx => String(tx.date || ""))
      .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort()[0];
    let cursor = database.lastDailyReportDate
      ? addDays(database.lastDailyReportDate, 1)
      : (database.stockStartDate || firstTransaction || today);
    const yesterday = addDays(today, -1);

    while (cursor <= yesterday) {
      await locked(() => createForDate(cursor));
      cursor = addDays(cursor, 1);
    }
  }

  function scheduleNextMidnight() {
    if (stopped) return;
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    timer = setTimeout(async () => {
      try {
        await catchUp();
      } catch (error) {
        console.error("Gagal membuat laporan harian:", error.message);
      }
      scheduleNextMidnight();
    }, Math.max(1000, next.getTime() - now.getTime()));
  }

  return {
    async start() {
      stopped = false;
      try {
        await catchUp();
      } catch (error) {
        console.error("Laporan harian belum dapat dibuat:", error.message);
        console.error("Pastikan izin penyimpanan Termux sudah diberikan dengan termux-setup-storage.");
      }
      scheduleNextMidnight();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}

module.exports = {
  backupExistingDatabase,
  mirrorDatabase,
  createDailyReports,
  localDateKey,
  reportFileName
};
