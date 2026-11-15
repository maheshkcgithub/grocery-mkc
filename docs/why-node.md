# Why the online shop uses Node.js

1. An online shop needs a server, so that every customer sees the same products and every order reaches the owner.
2. Node.js runs JavaScript, the same language the shop and admin pages already use in the browser, so the whole shop is written in one language.
3. Node.js 22 and newer has SQLite built in, so the products and orders are saved in a single file with no separate database to install.
4. The only extra package is Express, a small and widely used library that serves the pages and handles orders.
5. A shop mostly waits for requests, such as loading products or placing an order, and Node.js handles many such requests at once on modest hardware.
6. Node.js is free, runs on Windows, Mac and Linux, and is supported by most hosting services, including Render.
7. Its large community means problems and answers are easy to find online.
8. The desktop version (`app.py`) still uses Python, because it runs on one computer and needs no server.
