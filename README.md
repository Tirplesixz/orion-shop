# ORION

React project powered by Vite.

```bash
npm run dev
```

The storefront and local backend run together at `http://127.0.0.1:5173`.

## Admin dashboard

Open `http://127.0.0.1:5173/admin` after starting the project.

Development login:

```text
Username: admin
Password: orion-admin
```

Copy `.env.example` to `.env`, configure `DATABASE_URL`, `SESSION_SECRET` and `ORION_ADMIN_PASSWORD` before starting the project. Uploaded images remain in `public/media/uploads`; all commerce records are stored in PostgreSQL.

The admin dashboard currently supports:

- Store overview with revenue, order, customer and stock metrics
- Creating and editing products
- Campaign and product-view image uploads
- Product sizes, price, theme and visibility
- Draft, active and archived states
- Order fulfilment and payment-status workflows
- Variant inventory, SKU and low-stock thresholds
- Customer profiles generated from checkout history
- Coupons, returns, shipping tracking, analytics and audit history
- Publishing changes to the storefront without editing React source
- English/Thai product content, categories and display ordering
- Ready-to-ship and pre-order fulfilment, weight, variant colour, barcode and variant image URLs
- Unit cost, reserved stock and 15-minute checkout stock reservations
- Multiple shipping methods, Bangkok-only delivery rules and free-shipping thresholds
- Owner, manager and fulfilment administrator roles
- CSV catalogue export/import and bulk publish/archive
- Editable legal/company information and bilingual policies

Build for production:

```bash
npm run build
```

## Background audio

Replace `public/media/audio/orion-instrumental-loop.mp3` to swap the loop while keeping the existing player configuration. To use a different filename, update `BACKGROUND_AUDIO_SRC` near the top of `src/App.jsx`.

## PostgreSQL setup

Create a PostgreSQL database named `orion_shop`, then run:

```bash
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

Useful development command:

```bash
npm run db:studio
```

## Commerce backend

The product experience reads through `src/services/commerce.js`. The storefront includes a persistent shopping bag and private checkout. A completed checkout creates an order, reduces variant stock and appears in the admin dashboard. Cancelling an order restores its stock.

The PostgreSQL schema is defined in `prisma/schema.prisma`. Existing catalogue data from `server/data/products.json` is imported by the seed command when available; otherwise the bundled fallback catalogue is used.

Set the API origin when the backend is ready:

```bash
VITE_API_BASE_URL=https://api.example.com
```

Public endpoints:

- `GET /api/products`
- `GET /api/products/:slug`
- `POST /api/orders`

Authenticated admin endpoints cover products, overview metrics, orders, inventory and customers under `/api/admin/*`.

The mini-project also includes customer registration and login, email verification, forgot/reset password, profile editing, multiple addresses, password changes, per-device session management, account deletion, sandbox payment confirmation, coupon validation, manual shipping tracking, return requests, stock movement history, analytics events and audit logs.

## Transactional email / SMTP

Set the public application URL and SMTP credentials in `.env`:

```text
APP_BASE_URL=http://127.0.0.1:5173
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=ORION <orders@your-domain.com>
```

Restart the server after editing `.env`. The admin sidebar reports whether SMTP is configured and connected. When credentials are blank in development, verification and password-reset responses include a local preview URL so those flows remain testable. Production does not expose preview links. For a real launch, use a verified sending domain and keep `.env` out of version control.

Security defaults include hashed passwords and one-time tokens, HTTP-only same-site session cookies, expiring/revocable sessions, authentication rate limiting, origin checks for state-changing API requests, restricted upload types/sizes and anonymisation of retained order data after account deletion.

## Commerce routes

Every active product has a shareable detail URL at `/products/<slug>`. Checkout can use saved account addresses, validates Thai phone/postal formats, calculates the selected configured delivery method, optionally records full tax-invoice details and produces a printable order receipt. Stock is reserved for 15 minutes when checkout begins.

Company identity, contact information, return period and bilingual Privacy/Terms/Shipping/Returns content can be edited under **Admin → Settings**. Replace the seeded ORION Studio demonstration contact values with the real legal entity before a public launch.

Product images are stored under `public/media/products/<product-slug>/`. Adding local products only requires a new entry in the catalogue; the product switcher appears automatically when more than one item is present.
