const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
if (!process.env.ADMIN_PASSWORD) console.warn("ADMIN_PASSWORD is not set, so the admin password is 'admin'. Set it before going live.");

// ---- Database ----
const dbFile = process.env.DB_FILE || path.join(__dirname, "shop.db");
const isNew = !fs.existsSync(dbFile);
const db = new DatabaseSync(dbFile);
db.exec(`
  CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL,
    stock INTEGER NOT NULL, image TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY, customer TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
    items TEXT NOT NULL, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'new',
    created TEXT NOT NULL DEFAULT (datetime('now')));
`);
if (isNew) {
  const add = db.prepare("INSERT INTO products(name, price, stock, image) VALUES(?,?,?,?)");
  [["Mjölk 3% 1 l", 17.9, 24, "🥛"], ["Bread loaf", 32.5, 8, "🍞"], ["Bananas 1 kg", 24.9, 15, "🍌"],
   ["Eggs 12-pack", 49, 3, "🥚"], ["Coffee 450 g", 69.9, 10, "☕"]].forEach(p => add.run(...p));
}

const app = express();
app.use(express.json({ limit: "2mb" }));

// ---- Admin login: the browser shows a username/password box (any username) ----
const same = (a, b) => crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());
function adminOnly(req, res, next) {
  const [type, value = ""] = (req.headers.authorization || "").split(" ");
  const pass = type === "Basic" ? Buffer.from(value, "base64").toString().split(":").slice(1).join(":") : "";
  if (same(pass, ADMIN_PASSWORD)) return next();
  res.set("WWW-Authenticate", 'Basic realm="Shop admin"').status(401).send("Login required");
}
app.use(["/admin", "/admin.html", "/api/admin"], adminOnly);
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.use(express.static(path.join(__dirname, "public")));

// ---- Customer API ----
app.get("/api/products", (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY name").all());
});

app.post("/api/orders", (req, res) => {
  const { customer, phone, address, items } = req.body || {};
  const filled = [customer, phone, address].every(s => typeof s === "string" && s.trim());
  if (!filled) return res.status(400).json({ error: "Please fill in your name, phone and address." });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Your cart is empty." });

  const getProduct = db.prepare("SELECT * FROM products WHERE id = ?");
  const takeStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
  const lines = [];
  let total = 0;
  db.exec("BEGIN");
  try {
    for (const { id, qty } of items) {
      const p = getProduct.get(id);
      if (!p || !Number.isInteger(qty) || qty < 1) throw new Error("A product in your cart is no longer available. Please refresh the page.");
      if (qty > p.stock) throw new Error(`Sorry, only ${p.stock} left of ${p.name}.`);
      takeStock.run(qty, p.id);
      lines.push({ id: p.id, name: p.name, price: p.price, qty });
      total += p.price * qty;
    }
    total = Math.round(total * 100) / 100;
    const r = db.prepare("INSERT INTO orders(customer, phone, address, items, total) VALUES(?,?,?,?,?)")
      .run(customer.trim(), phone.trim(), address.trim(), JSON.stringify(lines), total);
    db.exec("COMMIT");
    res.json({ id: Number(r.lastInsertRowid), total });
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(400).json({ error: e.message });
  }
});

// ---- Admin API: products ----
function readProduct(body) {
  const { name, price, stock, image = "" } = body || {};
  if (typeof name !== "string" || !name.trim()) return "Enter a product name.";
  if (typeof price !== "number" || !(price >= 0)) return "Enter a price, like 17.90.";
  if (!Number.isInteger(stock) || stock < 0) return "Enter stock as a whole number.";
  if (typeof image !== "string" || image.length > 1_500_000) return "That photo is too large.";
  return { name: name.trim(), price, stock, image };
}

app.post("/api/admin/products", (req, res) => {
  const p = readProduct(req.body);
  if (typeof p === "string") return res.status(400).json({ error: p });
  const r = db.prepare("INSERT INTO products(name, price, stock, image) VALUES(?,?,?,?)").run(p.name, p.price, p.stock, p.image);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put("/api/admin/products/:id", (req, res) => {
  const p = readProduct(req.body);
  if (typeof p === "string") return res.status(400).json({ error: p });
  db.prepare("UPDATE products SET name=?, price=?, stock=?, image=? WHERE id=?").run(p.name, p.price, p.stock, p.image, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/products/:id", (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---- Admin API: sales ----
app.get("/api/admin/orders", (req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

app.patch("/api/admin/orders/:id", (req, res) => {
  const { status } = req.body || {};
  if (!["new", "delivered", "cancelled"].includes(status)) return res.status(400).json({ error: "Unknown status." });
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  db.exec("BEGIN");
  // Cancelling puts the items back in stock; un-cancelling takes them out again
  const sign = status === "cancelled" && order.status !== "cancelled" ? 1 : order.status === "cancelled" && status !== "cancelled" ? -1 : 0;
  if (sign) for (const l of JSON.parse(order.items)) db.prepare("UPDATE products SET stock = stock + ? WHERE id=?").run(sign * l.qty, l.id);
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, order.id);
  db.exec("COMMIT");
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Shop: http://localhost:${PORT}   Admin: http://localhost:${PORT}/admin`));
