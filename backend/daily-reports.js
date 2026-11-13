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

    const dateParts = dateKey.split("-").map(Number);
    const dateLabel = String(dateParts[2]).padStart(2, "0") + " " +
      MONTHS[dateParts[1] - 1] + " " + dateParts[0];
    const outletOrder = ["Harapan Indah", "Grand Wisata", "Bektim"];
    const variants = [
      ["ori", "Ori"], ["beef", "Beef"], ["spicy", "Spicy"], ["cheese", "Cheese"]
    ];
    const productionByOutlet = new Map();
    for (const tx of transactions.filter(entry => entry.type === "production")) {
      const outlet = tx.location || "Outlet tidak diketahui";
      if (!productionByOutlet.has(outlet)) productionByOutlet.set(outlet, []);
      productionByOutlet.get(outlet).push(tx);
    }

    const lines = [
      "Target ( " + dateLabel + " )",
      ""
    ];
    const outlets = [
      ...outletOrder.filter(name => productionByOutlet.has(name)),
      ...[...productionByOutlet.keys()].filter(name => !outletOrder.includes(name))
    ];
    if (!outlets.length) lines.push("Belum ada target produksi pada tanggal ini.");
    for (const outlet of outlets) {
      const outletTransactions = productionByOutlet.get(outlet) || [];
      const totals = Object.fromEntries(variants.map(([key]) => [key, 0]));
      for (const tx of outletTransactions) {
        for (const [key] of variants) totals[key] += Number(tx.lines?.[key] || 0);
      }
      const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
      lines.push("› " + outlet + " | Total " + formatNumber(total) + " Loyang", "");
      for (const [key, label] of variants) {
        if (!totals[key]) continue;
        lines.push("~ " + label + " - " + formatNumber(totals[key]) + " Loyang");
        const packaging = outletTransactions.reduce((sum, tx) => {
          const entry = tx.lines?.packagingByVariant?.[key];
          if (!entry) return sum;
          sum.box3 += Number(entry.box3 || 0);
          sum.box5 += Number(entry.box5 || 0);
          sum.hasCustom = sum.hasCustom || entry.enabled === true;
          return sum;
        }, { box3: 0, box5: 0, hasCustom: false });
        if (packaging.hasCustom) {
          const details = [];
          if (packaging.box5) details.push(formatNumber(packaging.box5) + " Box isi 5");
          if (packaging.box3) details.push(formatNumber(packaging.box3) + " Box isi 3");
          if (details.length) lines.push("  (" + details.join(", ") + ")");
        }
      }
      lines.push("-----------------------------", "");
    }

    const stockLabels = {
      box3: "Box isi 3",
      box5outer: "Box isi 5 luar",
      box5inner: "Box isi 5 dalam",
      paper: "Kertas Minyak",
      mika: "Mika roti roll"
    };
    lines.push("Stok Sebelumnya:", "");
    for (const [key, label] of Object.entries(stockLabels)) {
      lines.push(label + " : " + formatNumber(opening[key]) + "pcs");
    }

    const used = Object.fromEntries(Object.keys(itemDefs).map(key => [key, 0]));
    for (const tx of transactions) {
      if (tx.type !== "production" && tx.type !== "stock-out") continue;
      for (const [key, delta] of Object.entries(tx.changes || {})) {
        if (Object.hasOwn(used, key) && Number.isSafeInteger(delta) && delta < 0) {
          used[key] += Math.abs(delta);
        }
      }
    }
    lines.push("", "Jumlah Stok Terpakai:");
    const usedEntries = Object.entries(used).filter(([, quantity]) => quantity > 0);
    if (!usedEntries.length) lines.push("- Tidak ada pemakaian stok tercatat.");
    else {
      for (const [key, quantity] of usedEntries) {
        lines.push("- " + stockLabels[key] + " : " + formatNumber(quantity) + "pcs");
      }
    }

    lines.push("", "Jumlah:", "");
    for (const [key, label] of Object.entries(stockLabels)) {
      lines.push(label + " : " + formatNumber(opening[key]) + " - " +
        formatNumber(used[key]) + " = " + formatNumber(closing[key]) + "pcs");
    }
    lines.push("", "Keterangan: Laporan Ini Dibuat Otomatis", "");
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
