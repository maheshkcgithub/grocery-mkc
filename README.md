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

The admin page asks for a password (any username).

### Run it on your computer
Needs Node.js 22.13 or newer.

    cd web
    npm install
    ADMIN_PASSWORD=choose-a-password npm start

Then open http://localhost:3000 (shop) and http://localhost:3000/admin.
On Windows PowerShell, set the password with `$env:ADMIN_PASSWORD="choose-a-password"; npm start`.

### Put it online
Deploy the `web` folder to any Node host (for example Render or Railway):
- Start command: `npm start`
- Set the `ADMIN_PASSWORD` environment variable
- Data is kept in `shop.db`. Give the app a persistent disk and set `DB_FILE` to a path on it, or orders are lost on restart.
