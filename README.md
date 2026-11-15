# Grocery POS

Simple desktop app to sell groceries. Built with Python, Tkinter and SQLite.

## Run
    python app.py

## Package as an executable
    pip install pyinstaller
    pyinstaller --onefile --windowed app.py

The executable is created in `dist/`.

## Online shop (`web/`)
Customers order on the shop page. You manage products and see sales on a separate admin page.

| Page | Address | Who |
|---|---|---|
| Shop | `/` | Customers: browse, cart, place order (pay on delivery) |
| Admin: Products | `/admin` | You: add products with photos, edit price and stock, remove |
| Admin: Sales | `/admin`, Sales tab | You: today's sales, all orders, mark delivered or cancelled |

The shop has sections: Fresh vegetables, Dairy, Bread, Meat, Poultry and Fish (plus Other). A new shop starts with 36 example products.
The admin page asks for a password (any username).

Product pictures in `web/public/img` are Microsoft Fluent Emoji (MIT licence, see `web/public/img/LICENSE.txt`). You can replace any of them with your own photo from the admin page.

### Emails to customers
Customers give their email at checkout. The shop then emails them:
- a confirmation when they order (you get a copy at `SHOP_EMAIL`)
- a message when you cancel their order

Email is off until you set these environment variables:

| Variable | Yahoo Mail | Gmail |
|---|---|---|
| `SMTP_HOST` | `smtp.mail.yahoo.com` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` | `465` |
| `SMTP_USER` | `yourshop@yahoo.com` | `yourshop@gmail.com` |
| `SMTP_PASS` | a Yahoo **app password** (Account security → Generate app password) | a Gmail **app password** (Google Account → Security → App passwords) |
| `SHOP_EMAIL` | where you want copies of new orders (optional) | |
| `SHOP_NAME` | name shown as the sender (optional, default "MKC Grocery") | |

If an email can't be sent, the order still goes through and the reason is written to the server log.

Why Node.js? See [docs/why-node.md](docs/why-node.md).

### Run it on your computer
Needs Node.js 22.13 or newer.

    cd web
    npm install
    ADMIN_PASSWORD=choose-a-password npm start

To try emails locally, also set the `SMTP_...` variables below.

Then open http://localhost:3000 (shop) and http://localhost:3000/admin.
On Windows PowerShell, set the password with `$env:ADMIN_PASSWORD="choose-a-password"; npm start`.

### Put it online with Render
`render.yaml` sets everything up. In Render: **New → Blueprint**, pick this repository, enter an admin password, and click **Apply**.
It uses the Starter plan with a 1 GB disk, so orders are kept. The free plan can't keep data.
