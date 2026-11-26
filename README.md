# Porshi Motors — dealership system and website

Electric bike sales, service and after-sales system for Porshi Motors, Kushtia.

| Part | What it is | Address (Docker) |
|---|---|---|
| Public website | Models, offers, compare, EMI calculator, test ride / service / quotation / finance forms, spare parts, About, WhatsApp / Messenger / Call buttons | `https://motors.porshi.tech` (locally `http://localhost:8095`) |
| Customer portal | Phone + SMS code sign-in; bike, battery health, warranty, next service, payments, balance | `/portal` |
| Admin system | Sales, Service, Stock, CRM and System modules for six staff roles | `/admin` |
| API | FastAPI, with interactive documentation | `/api/docs` |

Bangla and English throughout (switch at the top right). Bangla digits are used in Bangla mode.

## Run it with Docker (recommended)

You need Docker with Compose on the server or your computer.

```bash
cp .env.example .env        # then edit SECRET_KEY and DB_PASSWORD
docker compose up -d --build
```

Open `http://localhost:8095`. The first start creates the tables and loads the sample Kushtia data.

**Demo sign-ins** (password `porshi123` for all staff):

| Role | Phone | Sees |
|---|---|---|
| Admin (Hasan) | 01711003001 | Everything |
| Manager (Mahmud) | 01711003002 | All but staff and settings |
| Salesperson (Rafiq) | 01711003003 | Leads, quotations, orders, bikes, customers, reminders |
| Service manager (Shakil) | 01711003004 | Job cards, mechanics, parts, warranty, batteries |
| Technician (Karim) | 01711002001 | Own job cards and parts issued |
| Accounts (Rina) | 01711003006 | Orders, payments, reports, audit log |

Customer portal: `01711000101` (Rahim) or `01911000202` (Salma). In demo mode the code is `1234`.

## Deploying to Contabo (motors.porshi.tech)

See **[DEPLOY.md](DEPLOY.md)**. One script sets up the server, HTTPS, firewall and daily backups.

## Before going live

1. In `.env`: set a long random `SECRET_KEY`, a strong `DB_PASSWORD`, `DEMO_MODE=false`, `SEED_ON_START=false`, and `PUBLIC_URL` to the real address.
2. Start with an empty database (`docker compose down -v` removes the demo data, **and everything else**).
3. Create the first admin:
   ```bash
   docker compose exec api python -m app.create_admin "Owner name" 017XXXXXXXX "a-strong-password"
   ```
4. Sign in, then fill in **Settings** (real phone, WhatsApp, Facebook page, address, opening hours, brands, warranty periods, finance rate, offers), the **Website catalogue** (models, photos, parts) and **Bikes** (receive each bike with chassis, motor, controller, charger and battery numbers).
5. Connect an SMS gateway (below). On Contabo, HTTPS is handled by Caddy (see DEPLOY.md).
6. Backups run daily on the server (`deploy/backup.sh`); copy them off the server too.

### SMS

`SMS_PROVIDER=console` only writes messages to the API log (`docker compose logs api`). For real SMS set `SMS_PROVIDER=http`, `SMS_API_URL`, `SMS_API_KEY` and `SMS_SENDER`. The sender posts the form fields `api_key, senderid, number, message`, which matches several Bangladeshi bulk-SMS gateways; if yours differs, change `send_sms()` in `backend/app/services.py`. Messages are sent for: portal login codes, "service complete" when a job card is set to Ready, and reminders queued from **Reminders**.

## How the modules connect

```
                 PORSHI MOTORS
        ┌─────────────┼─────────────┐
      SALES         SERVICE        STOCK
    Leads         Job cards       Bikes
    Quotations    Mechanics       Batteries
    Orders        Parts issued    Spare parts + ledger
    Payments      Warranty        Website catalogue
        └─────────────┼─────────────┘
                     CRM
             Customers · Reminders
```

* Website test ride / enquiry → customer + lead. Website service booking → job card (linked to the customer's bike if they bought it here).
* Quotation → **Create order** reserves a bike from stock and records the advance as a payment.
* **Deliver** marks the bike sold, starts the battery warranty, moves the lead to Sold.
* Parts issued on a job card reduce stock and appear in the parts ledger (opening, purchased, sold, used in service, returned, damaged).
* Battery replacement moves a spare onto the bike and restarts its warranty.
* Reminders are worked out from the data every time: service due (from the service interval), battery warranty ending within 3 months, and balances due. Each is sent once.
* Every change is written to the audit log with who made it.

## Development without Docker

```bash
# database: any PostgreSQL 16
createdb porshi
# API
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/porshi uvicorn app.main:app --reload
# website + admin (second terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173, forwards /api to :8000
```

Tests (they wipe and re-seed the database you point them at, so use a separate one):

```bash
cd backend
DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/porshi_test pytest -q
```

## Project layout

```
backend/app/
  models.py       database tables (customers, leads, quotations, orders, payments, vehicles,
                  batteries, spare parts, inventory transactions, service jobs and items,
                  warranty claims, notifications, users, settings, audit log)
  security.py     password hashing, sign-in tokens, the six roles and what each can open
  services.py     shared rules: numbering, warranty months, reminders, SMS
  routers/        public site + portal, sales, service, stock, system (dashboard, reports, staff, settings, audit)
  seed.py         sample Kushtia data (dates are relative to today)
frontend/src/
  public/         website and customer portal
  admin/          admin screens, grouped as in the diagram above
  strings.js      all Bangla / English text
```

## Notes and next steps

* Tables are created automatically on start. Before changing the database layout on a live system, add Alembic migrations.
* Money is stored as whole taka. Dates use the server's date; set the server time zone to Asia/Dhaka.
* Uploaded model photos are kept in the `uploads` Docker volume; include it in backups.
* The sample models, prices, customers and phone numbers are invented. Replace them before launch.
