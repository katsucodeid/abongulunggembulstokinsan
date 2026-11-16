const crypto = require("crypto");

module.exports = function registerStockCorrections(app, ctx) {
  const { auth, locked, persist, getDb, recordAudit, itemDefs } = ctx;

  app.post("/api/transactions/:id/corrections", auth, async (req, res) => {
    try {
      const result = await locked(async () => {
        const db = getDb();
        const correctionId = String(req.body?.correctionId || "").trim();
        const action = String(req.body?.action || "");
        const reason = String(req.body?.reason || "").trim();
        if (!correctionId || correctionId.length > 100) throw new Error("ID koreksi tidak valid.");
        if (!["revise", "return", "reverse"].includes(action)) throw new Error("Jenis koreksi tidak dikenal.");
        if (reason.length < 3) throw new Error("Alasan koreksi wajib diisi (minimal 3 karakter).");

        const duplicate = db.transactions.find(t => t.id === correctionId);
        if (duplicate) return { duplicate: true, state: { stock: { ...db.stock }, itemDefs, history: db.transactions.slice(-1000).reverse(), user: { username: req.user.username, role: req.user.role } } };

        const original = db.transactions.find(t => t.id === req.params.id);
        if (!original || original.type !== "stock-out") throw new Error("Transaksi pengurangan manual tidak ditemukan.");
        if (req.user.role !== "admin" && original.createdBy !== req.user.username) throw new Error("Anda hanya dapat mengoreksi pengurangan stok yang dibuat sendiri.");

        const item = original.lines?.item;
        const originalQuantity = original.lines?.quantity;
        if (!Object.hasOwn(itemDefs, item) || !Number.isSafeInteger(originalQuantity) || originalQuantity <= 0) throw new Error("Data transaksi awal tidak valid.");

        const previousCorrections = db.transactions.filter(t => t.type === "stock-correction" && t.lines?.targetTransactionId === original.id);
        const alreadyReturned = previousCorrections.reduce((sum, t) => sum + Number(t.lines?.returnedDelta || 0), 0);
        const currentReduction = originalQuantity - alreadyReturned;
        if (!Number.isSafeInteger(currentReduction) || currentReduction < 0) throw new Error("Riwayat koreksi transaksi tidak konsisten.");

        let desiredReduction;
        if (action === "revise") {
          desiredReduction = req.body?.quantity;
          if (!Number.isSafeInteger(desiredReduction) || desiredReduction < 0 || desiredReduction > originalQuantity) {
            throw new Error("Jumlah pengurangan yang benar harus bilangan bulat antara 0 dan " + originalQuantity + ".");
          }
        } else if (action === "return") {
          const returnQuantity = req.body?.quantity;
          if (!Number.isSafeInteger(returnQuantity) || returnQuantity <= 0 || returnQuantity > currentReduction) {
            throw new Error("Jumlah pengembalian harus lebih dari 0 dan tidak melebihi sisa pengurangan " + currentReduction + " pcs.");
          }
          desiredReduction = currentReduction - returnQuantity;
        } else {
          desiredReduction = 0;
        }

        const desiredReturned = originalQuantity - desiredReduction;
        const returnedDelta = desiredReturned - alreadyReturned;
        if (returnedDelta === 0) throw new Error("Tidak ada perubahan jumlah yang perlu disimpan.");
        const nextStock = db.stock[item] + returnedDelta;
        if (!Number.isSafeInteger(nextStock) || nextStock < 0) throw new Error("Koreksi ditolak karena akan membuat stok " + itemDefs[item].label + " tidak valid.");

        db.stock[item] = nextStock;
        const now = new Date().toISOString();
        const lines = {
          targetTransactionId: original.id,
          item,
          originalQuantity,
          previousReturnedQuantity: alreadyReturned,
          returnedDelta,
          returnedTotal: desiredReturned,
          correctedQuantity: desiredReduction,
          action,
          reason
        };
        db.transactions.push({
          id: correctionId,
          type: "stock-correction",
          date: now.slice(0, 10),
          location: "",
          note: reason,
          lines,
          changes: { [item]: returnedDelta },
          createdBy: req.user.username,
          createdAt: now
        });
        recordAudit(req.user, "stock.manual_correction", {
          transactionId: original.id,
          correctionId,
          item,
          originalQuantity,
          previousReduction: currentReduction,
          correctedQuantity: desiredReduction,
          returnedDelta,
          reason
        });
        await persist();
        return {
          duplicate: false,
          state: { stock: { ...db.stock }, itemDefs, history: db.transactions.slice(-1000).reverse(), user: { username: req.user.username, role: req.user.role } }
        };
      });
      res.json({ ok: true, duplicate: result.duplicate, state: result.state });
    } catch (e) {
      res.status(400).json({ error: e.message || "Koreksi stok gagal disimpan." });
    }
  });
};
