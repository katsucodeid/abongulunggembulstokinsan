const test = require("node:test");
const assert = require("node:assert/strict");
const registerStockCorrections = require("../stock-corrections");

function setup({ persist = async () => {} } = {}) {
  const db = {
    stock: { paper: 95 },
    transactions: [{
      id: "stock-out-1",
      type: "stock-out",
      lines: { item: "paper", quantity: 5 },
      changes: { paper: -5 },
      createdBy: "staff1"
    }],
    auditLog: Array.from({ length: 10000 }, (_, i) => ({ id: "audit-" + i })),
    processed: []
  };
  let handler;
  const app = { post(path, auth, fn) { assert.equal(path, "/api/transactions/:id/corrections"); handler = fn; } };
  const recordAudit = (user, action, details) => {
    db.auditLog ||= [];
    db.auditLog.push({ id: "new-audit", username: user.username, action, details });
    if (db.auditLog.length > 10000) db.auditLog = db.auditLog.slice(-10000);
  };
  registerStockCorrections(app, {
    auth: (_req, _res, next) => next(),
    locked: fn => fn(),
    persist,
    getDb: () => db,
    recordAudit,
    itemDefs: { paper: { label: "Kertas Minyak" } }
  });
  return { db, handler };
}

function invoke(handler, body) {
  const req = {
    params: { id: "stock-out-1" },
    body,
    user: { username: "admin1", role: "admin" }
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  return Promise.resolve(handler(req, res)).then(() => res);
}

test("failed persistence restores stock, transactions, and exact audit log at its size cap", async () => {
  const beforeAudit = Array.from({ length: 10000 }, (_, i) => ({ id: "audit-" + i }));
  const { db, handler } = setup({
    persist: async () => { throw new Error("disk unavailable"); }
  });
  db.auditLog = beforeAudit.slice();
  const beforeTransactions = db.transactions.slice();
  const result = await invoke(handler, {
    correctionId: "correction-fail",
    action: "revise",
    quantity: 2,
    reason: "Koreksi salah input"
  });
  assert.equal(result.statusCode, 400);
  assert.equal(db.stock.paper, 95);
  assert.deepEqual(db.transactions, beforeTransactions);
  assert.deepEqual(db.auditLog, beforeAudit);
});

test("successful correction changes stock once and retry is idempotent", async () => {
  let writes = 0;
  const { db, handler } = setup({ persist: async () => { writes++; } });
  const request = {
    correctionId: "correction-1",
    action: "revise",
    quantity: 2,
    reason: "Koreksi salah input"
  };
  const first = await invoke(handler, request);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.duplicate, false);
  assert.equal(db.stock.paper, 98);
  assert.equal(writes, 1);

  const retry = await invoke(handler, request);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(db.stock.paper, 98);
  assert.equal(writes, 1);
});
