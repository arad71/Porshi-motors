# Deploying to Contabo at https://motors.porshi.tech

About 20 minutes, most of it waiting for DNS and the first build.

## What you need

- A Contabo VPS running **Ubuntu 22.04 or 24.04**. The smallest Cloud VPS (4 GB RAM or more) is enough.
- The server's **IP address** and **root password** (or SSH key) from the Contabo welcome email.
- Access to the **DNS settings for porshi.tech** (wherever the domain is managed: Contabo, Cloudflare, Namecheap…).
- An **email address** for HTTPS certificate notices.

## 1. Point the domain at the server

At the porshi.tech DNS provider, add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `motors` | your Contabo IPv4 address | 300 (or Auto) |

If the domain uses Cloudflare, set the record to **DNS only** (grey cloud) for the first setup. You can switch the proxy on afterwards, with SSL mode **Full (strict)**.

Check it from your computer before continuing. It should print the server's IP:

```bash
nslookup motors.porshi.tech
```

## 2. Sign in to the server and get the code

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/arad71/Porshi-motors.git /opt/porshi-motors
cd /opt/porshi-motors
```

If the GitHub repository is **private**, the clone asks for a username and password. Use your GitHub username and a [personal access token](https://github.com/settings/tokens) (fine-grained, read-only "Contents" on this repo) as the password. Alternatively, add a read-only **deploy key** to the repo and clone with the `git@github.com:` address.

## 3. Run the setup script

To show the owner a working demo with the sample Kushtia data:

```bash
bash deploy/setup-server.sh --email you@example.com --demo
```

For real use, with an empty database:

```bash
bash deploy/setup-server.sh --email you@example.com
docker compose exec api python -m app.create_admin "Owner name" 017XXXXXXXX "a-strong-password"
```

The website container listens on **port 8095**, on this machine only. If 8095 is taken too, add `--port` with any free port, e.g. `--port 8096`. The script checks the port before starting and lists the ports in use if it's busy.

**If this server already hosts other websites** (Nginx, Apache or another app already using ports 80/443), see [Server already runs other websites](#server-already-runs-other-websites-existing-caddy) below. The script detects this and tells you.

The script:

- checks that motors.porshi.tech points at this server
- updates Ubuntu, turns on automatic security updates and sets the clock to Dhaka time
- installs Docker
- opens only SSH, HTTP and HTTPS in the firewall
- adds swap so the build does not run out of memory
- writes `.env` with new random secrets
- builds and starts the database, API, website and Caddy, which gets the HTTPS certificate automatically and renews it
- schedules a daily backup at 02:30

When it finishes, open **https://motors.porshi.tech**.

## 4. Before real customers use it

1. **Switch off demo mode** if you used `--demo`. Edit `/opt/porshi-motors/.env` and set `DEMO_MODE=false` and `SEED_ON_START=false`. The sample data is still in the database, so to start clean run:
   ```bash
   cd /opt/porshi-motors
   docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v   # deletes ALL data
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   docker compose exec api python -m app.create_admin "Owner name" 017XXXXXXXX "a-strong-password"
   ```
2. Sign in at **https://motors.porshi.tech/admin**, then fill in:
   - **Settings**: phone, WhatsApp, Facebook page, address, hours, brands, warranty periods, finance rate, offers
   - **Website catalogue**: models with photos, and spare parts
   - **Bikes**: receive each bike with its chassis, motor, controller, charger and battery numbers
   - **Staff and roles**: one account per person, so the audit log shows who did what
3. **SMS**: put your gateway details in `.env` (`SMS_PROVIDER=http`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER`), then run `bash deploy/update.sh`. Customers can't sign in to the portal until SMS works, unless demo mode is on.

## Server already runs other websites (existing Caddy)

Only one program can use ports 80 and 443. Your server already runs **Caddy** there, so Porshi Motors runs behind it without starting a second Caddy:

```bash
cd /opt/porshi-motors
git pull
bash deploy/setup-server.sh --behind-proxy --demo          # add --port 8096 if 8095 is taken
```

The script works out how your Caddy runs and prints the exact block to add. Setup doesn't change your existing Caddy config itself, because your other sites depend on it.

**Caddy installed on the server** (`systemctl status caddy` shows it running). Add to `/etc/caddy/Caddyfile`:

```
motors.porshi.tech {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8095
}
```

Then:

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

**Caddy running in a Docker container.** Inside a container, `127.0.0.1` means the container itself, so it reaches Porshi Motors over a shared Docker network instead. The script connects your Caddy container to the `porshi-motors` network. Add this block to that Caddy's Caddyfile:

```
motors.porshi.tech {
	encode zstd gzip
	reverse_proxy porshi-web:80
}
```

Reload it with `docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`. The connection is lost if that Caddy container is re-created, so also add the network to your Caddy's `docker-compose.yml`:

```yaml
services:
  caddy:                 # your Caddy service name
    networks: [default, porshi-motors]
networks:
  porshi-motors:
    external: true
```

Either way, Caddy gets the HTTPS certificate for motors.porshi.tech on its own once the DNS record points at the server.

Servers using **Nginx** instead: setup detects it and prints the Nginx steps (`deploy/nginx-site.conf` plus `certbot --nginx -d motors.porshi.tech`).

## Everyday operations

The commands below use both compose files. If you set up with `--behind-proxy`, leave out `-f docker-compose.prod.yml`. The `deploy/*.sh` scripts work this out for you.

| Task | Command (in `/opt/porshi-motors`) |
|---|---|
| Install the latest version from GitHub | `bash deploy/update.sh` (takes a backup first) |
| Back up now | `bash deploy/backup.sh` (saved to `/opt/porshi-backups`, kept 14 days) |
| Restore a backup | `bash deploy/restore.sh /opt/porshi-backups/db-YYYY-MM-DD-HHMM.sql.gz` |
| See logs | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=100` |
| Restart | `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart` |
| Status | `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` |

Backups on the same server don't protect against losing the server. Copy `/opt/porshi-backups` somewhere else regularly, for example to Contabo Object Storage or Google Drive with `rclone`.

## If something goes wrong

- **Script stops at the DNS check.** The A record isn't visible yet, or it points at another IP. Wait a few minutes and re-run.
- **"Port … is already used".** Re-run with `--port` and a free port, or with `--behind-proxy` if it's port 80 or 443. Re-running is safe: your `.env` and data are kept.
- **Site doesn't load over HTTPS.** Run `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs caddy`. Usually DNS isn't right, or port 80/443 is blocked. Contabo has no external firewall by default, but check the Contabo panel if you added one.
- **Build is killed or very slow.** The server is low on memory. The script adds 2 GB swap; on the smallest plans, re-run the build.
- **"Session expired" on every action.** `SECRET_KEY` changed. Sign in again.

## How it fits together on the server

```
Internet ──443──▶ Caddy, or your existing web server ──▶ web on 127.0.0.1:8095 (website + admin)
                                                    ├── /api/*     ──▶ api (FastAPI)
                                                    └── /uploads/* ──▶ api ──▶ db (PostgreSQL)
```

Only ports 22, 80 and 443 are opened in the firewall (rules for your other applications are kept). Port 8095, the database and the API can't be reached from outside.
