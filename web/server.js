const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const nodemailer = require("nodemailer");

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
    stock INTEGER NOT NULL, image TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Other');
  CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY, customer TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
    items TEXT NOT NULL, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'new',
    created TEXT NOT NULL DEFAULT (datetime('now')));
`);
// Databases made by older versions get the newer columns
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
if (!hasColumn("products", "category")) db.exec("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'");
if (!hasColumn("orders", "email")) db.exec("ALTER TABLE orders ADD COLUMN email TEXT NOT NULL DEFAULT ''");

// ---- Email (optional): set SMTP_HOST, SMTP_USER and SMTP_PASS to turn it on ----
const SHOP_NAME = process.env.SHOP_NAME || "MKC Grocery";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null;
if (!mailer) console.warn("Email is off. Set SMTP_HOST, SMTP_USER and SMTP_PASS to email customers.");

async function sendMail({ to, subject, text, bcc }) {
  if (!mailer || !to) return false;
  await mailer.sendMail({ from: { name: SHOP_NAME, address: process.env.MAIL_FROM || process.env.SMTP_USER }, to, bcc, subject, text });
  return true;
}
const itemLines = items => items.map(i => `  ${i.qty} x ${i.name}   ${(i.price * i.qty).toFixed(2)} kr`).join("\n");
const isEmail = s => typeof s === "string" && s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Shop sections, in the order customers see them
const CATEGORIES = ["Fresh vegetables", "Dairy", "Bread", "Meat", "Poultry", "Fish", "Other"];

if (isNew) {
  const add = db.prepare("INSERT INTO products(category, name, price, stock, image) VALUES(?,?,?,?,?)");
  const examples = {
    "Fresh vegetables": [["Carrots 1 kg", 14.9, 40, "carrots"], ["Potatoes 2 kg", 24.9, 30, "potatoes"], ["Tomatoes 500 g", 22.9, 25, "tomatoes"],
      ["Cucumber", 12.9, 20, "cucumber"], ["Broccoli", 19.9, 15, "broccoli"], ["Yellow onions 1 kg", 15.9, 30, "onions"],
      ["Red bell pepper", 9.9, 25, "bell-pepper"], ["Iceberg lettuce", 17.9, 12, "lettuce"], ["Garlic 3-pack", 8.9, 40, "garlic"]],
    "Dairy": [["Mjölk 3% 1 l", 17.9, 24, "milk"], ["Butter 500 g", 54.9, 12, "butter"], ["Hushållsost 1 kg", 109, 8, "cheese"],
      ["Greek yoghurt 1 kg", 39.9, 10, "yoghurt"], ["Eggs 12-pack", 49, 3, "eggs"]],
    "Bread": [["Sourdough loaf", 42.9, 8, "sourdough"], ["Baguette", 24.9, 10, "baguette"], ["Croissants 4-pack", 39.9, 6, "croissant"],
      ["Bagels 4-pack", 34.9, 7, "bagel"], ["Tunnbröd", 29.9, 9, "flatbread"], ["Pretzel", 18.9, 10, "pretzel"]],
    "Meat": [["Beef entrecôte 400 g", 129, 6, "steak"], ["Pork ribs 1 kg", 89.9, 5, "ribs"], ["Bacon 140 g", 22.9, 20, "bacon"],
      ["Falukorv 800 g", 39.9, 12, "sausage"], ["Burger patties 4-pack", 69.9, 8, "burger"]],
    "Poultry": [["Chicken drumsticks 1 kg", 59.9, 10, "drumsticks"], ["Whole chicken 1.2 kg", 79.9, 6, "whole-chicken"],
      ["Chicken breast fillets 900 g", 109, 8, "chicken-breast"], ["Turkey breast 500 g", 89.9, 4, "turkey"], ["Duck breast 350 g", 99.9, 3, "duck"]],
    "Fish": [["Salmon fillet 400 g", 89.9, 8, "salmon"], ["Cod fillet 400 g", 79.9, 6, "cod"], ["Peeled shrimp 500 g", 99, 7, "shrimp"],
      ["Crayfish 1 kg", 199, 4, "crayfish"], ["Pickled herring 470 g", 34.9, 10, "herring"], ["Mussels 1 kg", 59.9, 5, "mussels"]],
  };
  for (const [cat, items] of Object.entries(examples))
    for (const [name, price, stock, img] of items) add.run(cat, name, price, stock, `img/${img}.webp`);
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
app.get("/api/categories", (req, res) => res.json(CATEGORIES));

app.post("/api/orders", (req, res) => {
  const { customer, email, phone, address, items } = req.body || {};
  const filled = [customer, phone, address].every(s => typeof s === "string" && s.trim());
  if (!filled) return res.status(400).json({ error: "Please fill in your name, email, phone and address." });
  if (!isEmail(email)) return res.status(400).json({ error: "Please enter a valid email address, like anna@example.com." });
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
    const r = db.prepare("INSERT INTO orders(customer, email, phone, address, items, total) VALUES(?,?,?,?,?,?)")
      .run(customer.trim(), email.trim(), phone.trim(), address.trim(), JSON.stringify(lines), total);
    db.exec("COMMIT");
    const id = Number(r.lastInsertRowid);
    res.json({ id, total, emailing: Boolean(mailer) });
    // Confirmation to the customer, with a copy to the shop (sent after replying, so a slow mail server doesn't delay the customer)
    sendMail({
      to: email.trim(), bcc: process.env.SHOP_EMAIL, subject: `${SHOP_NAME}: order #${id} confirmed`,
      text: `Hi ${customer.trim()},\n\nThank you for your order #${id}.\n\n${itemLines(lines)}\n\nTotal: ${total.toFixed(2)} kr\n\n`
        + `We'll deliver to:\n${address.trim()}\n\nWe'll call you on ${phone.trim()} to arrange delivery. You pay on delivery.\n\n${SHOP_NAME}`,
    }).catch(e => console.error(`Order #${id}: confirmation email failed: ${e.message}`));
  } catch (e) {
    db.exec("ROLLBACK");
    res.status(400).json({ error: e.message });
  }
});

// ---- Admin API: products ----
function readProduct(body) {
  const { name, price, stock, image = "", category = "Other" } = body || {};
  if (!CATEGORIES.includes(category)) return "Choose a section for the product.";
  if (typeof name !== "string" || !name.trim()) return "Enter a product name.";
  if (typeof price !== "number" || !(price >= 0)) return "Enter a price, like 17.90.";
  if (!Number.isInteger(stock) || stock < 0) return "Enter stock as a whole number.";
  if (typeof image !== "string" || image.length > 1_500_000) return "That photo is too large.";
  // A photo is an uploaded picture, a built-in picture from img/, or a short symbol from older versions
  const okImage = !image || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
    || /^img\/[a-z0-9-]+\.webp$/.test(image) || /^[^<>"'&]{1,8}$/.test(image);
  if (!okImage) return "That photo can't be used.";
  return { category, name: name.trim(), price, stock, image };
}

app.post("/api/admin/products", (req, res) => {
  const p = readProduct(req.body);
  if (typeof p === "string") return res.status(400).json({ error: p });
  const r = db.prepare("INSERT INTO products(category, name, price, stock, image) VALUES(?,?,?,?,?)").run(p.category, p.name, p.price, p.stock, p.image);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put("/api/admin/products/:id", (req, res) => {
  const p = readProduct(req.body);
  if (typeof p === "string") return res.status(400).json({ error: p });
  db.prepare("UPDATE products SET category=?, name=?, price=?, stock=?, image=? WHERE id=?").run(p.category, p.name, p.price, p.stock, p.image, req.params.id);
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
  // Cancelling puts the items back in stock; restoring a cancelled order takes them out again
  const sign = status === "cancelled" && order.status !== "cancelled" ? 1 : order.status === "cancelled" && status !== "cancelled" ? -1 : 0;
  const items = JSON.parse(order.items);
  if (sign === -1) {
    for (const l of items) {
      const p = db.prepare("SELECT name, stock FROM products WHERE id=?").get(l.id);
      if (p && p.stock < l.qty) return res.status(400).json({ error: `Can't restore: only ${p.stock} ${p.name} left in stock.` });
    }
  }
  db.exec("BEGIN");
  if (sign) for (const l of items) db.prepare("UPDATE products SET stock = stock + ? WHERE id=?").run(sign * l.qty, l.id);
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, order.id);
  db.exec("COMMIT");

  // Tell the customer when their order is cancelled; the reply says whether the email went out
  if (sign !== 1) return res.json({ ok: true, emailed: false });
  sendMail({
    to: order.email, subject: `${SHOP_NAME}: order #${order.id} cancelled`,
    text: `Hi ${order.customer},\n\nWe're sorry, your order #${order.id} has been cancelled.\n\n${itemLines(items)}\n\n`
      + `Total: ${order.total.toFixed(2)} kr\n\nYou have not been charged, since payment is on delivery.\n`
      + `If you have any questions, just reply to this email.\n\n${SHOP_NAME}`,
  }).then(
    emailed => res.json({ ok: true, emailed }),
    e => { console.error(`Order #${order.id}: cancellation email failed: ${e.message}`); res.json({ ok: true, emailed: false }) });
});

app.listen(PORT, () => console.log(`Shop: http://localhost:${PORT}   Admin: http://localhost:${PORT}/admin`));
