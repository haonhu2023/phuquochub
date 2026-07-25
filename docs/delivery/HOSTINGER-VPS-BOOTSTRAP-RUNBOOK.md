# PhuQuocHub — Hostinger VPS Production Bootstrap Runbook

**Created:** 2026-07-25 (PLACE-043). A 24-stage, evidence-driven runbook for bringing a real
Hostinger KVM VPS from "just provisioned" to "ready for `scripts/deploy.sh`'s first real run"
(PLACE-038). Every command uses a named placeholder — **no real value is ever written into this
file**. See also: [`PRE-DEPLOYMENT-CHECKLIST.md`](PRE-DEPLOYMENT-CHECKLIST.md) (what to confirm
before this runbook starts), [`PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md`](PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md)
(what may/may not be known to this repository), and
[`RELEASE-AND-ROLLBACK-CHECKLIST.md`](RELEASE-AND-ROLLBACK-CHECKLIST.md) (what happens after this
runbook, at the first real deploy).

**Placeholders used throughout:** `<VPS_IPV4>`, `<DEPLOY_USER>`, `<SSH_PUBLIC_KEY>`,
`<PRODUCTION_DIR>`, `<BACKUP_DIR>`, `<DOMAIN>`, `<SMTP_HOST>`, `<R2_ENDPOINT>`.

**Never run any command in this runbook against a real VPS until Hostinger provisioning is
independently confirmed** — see [`PLACE-043's report`](reports/PLACE-043-hostinger-vps-readiness-report.md).

---

## Stage 1 — Pre-access confirmation

- **Purpose:** confirm the VPS actually exists and is reachable before attempting anything.
- **Action:** in Hostinger hPanel, confirm VPS status = Running, note `<VPS_IPV4>`.
- **Expected result:** a public IPv4 address is visible in hPanel.
- **Safety note:** this is a read-only Dashboard check — no VPS-side action yet.
- **Rollback/recovery:** none needed (nothing changed yet).
- **Evidence to retain:** the plan name, status, IPv4 (non-sensitive — see
  `PRE-DEPLOYMENT-CHECKLIST.md` §1.2 for the exact non-sensitive fact list).

## Stage 2 — First SSH access

- **Purpose:** confirm SSH connectivity works at all, using whatever credential Hostinger
  provisioned by default (often root + password, or a Hostinger-issued key).
- **Action:** `ssh root@<VPS_IPV4>` (or the credential Hostinger's hPanel shows for first access).
- **Expected result:** a shell prompt on the VPS.
- **Safety note:** this first login may still use a Hostinger default credential — that is
  expected and acceptable for exactly this one session; do not reuse it afterward (see Stage 8).
- **Rollback/recovery:** if this fails, use Hostinger's **web terminal / recovery console**
  (hPanel) instead of troubleshooting SSH blind.
- **Evidence to retain:** confirmation that a shell prompt was reached (not the credential itself).

## Stage 3 — Verify host fingerprint

- **Purpose:** protect against a man-in-the-middle on this very first connection.
- **Action:** compare the SSH host key fingerprint SSH shows on first connect
  (`The authenticity of host '<VPS_IPV4>' can't be established... ECDSA key fingerprint is
  SHA256:...`) against the fingerprint shown in Hostinger's own hPanel (if hPanel displays one) or
  obtained via the web console (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` run *inside*
  the VPS's own web terminal, an out-of-band channel).
- **Expected result:** the two fingerprints match.
- **Safety note:** **never** blindly type `yes` at the host-key prompt without this comparison —
  this is the one moment SSH's trust model can be silently defeated.
- **Rollback/recovery:** if fingerprints don't match, stop immediately and use Hostinger support,
  not this SSH session.
- **Evidence to retain:** the fingerprint string itself is not sensitive and may be recorded.

## Stage 4 — Create deployment user

- **Purpose:** stop operating as `root` for routine work.
- **Action:** `adduser <DEPLOY_USER>` then `usermod -aG docker <DEPLOY_USER>` (the `docker` group
  membership is required later, Stage 13/14; adding it now avoids a second pass).
- **Expected result:** a new non-root user exists.
- **Safety note:** do not delete or disable the `root` account — it remains Hostinger's own
  recovery path via the web console.
- **Rollback/recovery:** `deluser <DEPLOY_USER>` reverses this if needed (only if no production
  data yet depends on it).
- **Evidence to retain:** the username (non-sensitive) — never the password used to create it.

## Stage 5 — Add SSH public key

- **Purpose:** enable key-based login for `<DEPLOY_USER>`, the prerequisite for ever disabling
  password login (Stage 8).
- **Action:** as `<DEPLOY_USER>` (or root, writing to their home): create `~/.ssh/authorized_keys`
  containing exactly `<SSH_PUBLIC_KEY>` (the Owner's own public key — **never** a private key,
  **never** generated on the VPS on the Owner's behalf).
- **Expected result:** `~/.ssh/authorized_keys` contains one line, correct permissions
  (`chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`).
- **Safety note:** wrong permissions on `~/.ssh` silently make SSH refuse the key with no clear
  error — verify permissions explicitly (`ls -la ~/.ssh`) before trusting Stage 6.
- **Rollback/recovery:** remove the line from `authorized_keys` if the wrong key was added.
- **Evidence to retain:** the public key's fingerprint (`ssh-keygen -lf`), not the key material
  itself, is sufficient evidence it was installed correctly.

## Stage 6 — Verify second SSH session

- **Purpose:** prove key-based login actually works **before** touching password/root login at
  all (Stage 8's own precondition).
- **Action:** from a **separate** terminal (keep the Stage 2 session open as a fallback), run
  `ssh <DEPLOY_USER>@<VPS_IPV4>`.
- **Expected result:** login succeeds with no password prompt.
- **Safety note:** **do not close the Stage 2 root session until this succeeds** — it is your only
  recovery path if key auth is broken.
- **Rollback/recovery:** if it fails, fix `authorized_keys`/permissions using the still-open
  Stage 2 session; do not proceed to Stage 8 until this stage passes.
- **Evidence to retain:** confirmation of a passwordless login (not a screen recording containing
  the terminal's full scrollback, which could include hostnames/paths better kept minimal).

## Stage 7 — Configure sudo

- **Purpose:** give `<DEPLOY_USER>` administrative capability without being logged in as root
  directly.
- **Action:** `usermod -aG sudo <DEPLOY_USER>` (Debian/Ubuntu) — verify with `sudo -l` as
  `<DEPLOY_USER>`.
- **Expected result:** `<DEPLOY_USER>` can run `sudo` commands (may prompt for their own password,
  which is fine — this is distinct from *SSH* password login, addressed in Stage 8).
- **Safety note:** this is "controlled sudo" per this task's own baseline — full, unrestricted
  `sudo ALL=(ALL) NOPASSWD:ALL` is broader than needed; the default `sudo` group membership
  (password-prompted) is the recommended baseline unless a specific automation need requires more.
- **Rollback/recovery:** `deluser <DEPLOY_USER> sudo` to revoke if needed.
- **Evidence to retain:** `sudo -l` output confirms the grant (no secret in this output).

## Stage 8 — Secure SSH

- **Purpose:** close the two most common VPS attack surfaces: password brute-force and root-over-SSH.
- **Action:** edit `/etc/ssh/sshd_config`: set `PasswordAuthentication no` and
  `PermitRootLogin no`, then `systemctl restart sshd`.
- **Expected result:** only key-based, non-root SSH login works afterward.
- **Safety note:** **only do this after Stage 6 has already succeeded** — disabling password/root
  login before proving key access works is the single most common way to lock yourself out of a
  fresh VPS. Keep the Hostinger web/recovery console (Stage 1) as the standing emergency path
  regardless.
- **Rollback/recovery:** Hostinger's **recovery console** (out-of-band, not SSH) can always revert
  `sshd_config` if this stage goes wrong.
- **Evidence to retain:** the two changed config lines (non-sensitive).

## Stage 9 — Apply system updates

- **Purpose:** start from a patched base OS.
- **Action:** `sudo apt update && sudo apt upgrade -y` (Ubuntu Server 24.04 LTS, the approved OS —
  PLACE-038).
- **Expected result:** package list refreshed, upgrades applied, no held/broken packages.
- **Safety note:** a kernel upgrade may require a reboot — schedule that deliberately (see Stage 9
  note below), not mid-bootstrap.
- **Rollback/recovery:** none typically needed; if a specific package upgrade breaks something,
  `apt install <package>=<previous-version>` can pin back.
- **Evidence to retain:** `apt list --upgradable` before/after (non-sensitive package names/versions).

## Stage 10 — Configure timezone/NTP

- **Purpose:** correct timestamps matter for logs, TLS certificate validity checks, and backup
  scheduling (`scripts/backup.sh`'s own cron-based design, PLACE-038).
- **Action:** `sudo timedatectl set-timezone Asia/Ho_Chi_Minh` (or UTC, per Owner preference — not
  fixed by this repository); confirm `timedatectl` shows `NTP service: active`.
- **Expected result:** correct local time, NTP synchronized.
- **Safety note:** none — this is a low-risk, easily-reversible setting.
- **Rollback/recovery:** `timedatectl set-timezone <previous>` reverses it.
- **Evidence to retain:** `timedatectl` output (non-sensitive).

## Stage 11 — Configure firewall

- **Purpose:** implement the "DB/Redis/MinIO never exposed to the Internet" principle already
  designed in `docs/architecture/deployment.md` and matched by `docker-compose.prod.yml`'s own
  port-publishing choices (PLACE-038: only Caddy publishes 80/443).
- **Action:** `sudo ufw allow OpenSSH` (or the specific SSH port in use) `&& sudo ufw allow 80/tcp
  && sudo ufw allow 443/tcp && sudo ufw enable`.
- **Expected result:** `sudo ufw status` shows exactly SSH + 80 + 443 allowed, everything else
  denied by default.
- **Safety note:** **always allow SSH before enabling ufw** — enabling the firewall without an SSH
  allow rule locks out the very session configuring it.
- **Rollback/recovery:** `sudo ufw disable` (from the Hostinger recovery console if SSH is
  already lost) reverses this entirely.
- **Evidence to retain:** `sudo ufw status verbose` output (non-sensitive — port numbers only).

## Stage 12 — Configure swap (if needed)

- **Purpose:** a safety margin against OOM kills, especially relevant at the MINIMUM VIABLE
  resource tier (see the report's Resource Suitability section).
- **Action:** if the chosen plan is at or below the Recommended tier's RAM, create a swap file:
  `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo
  swapon /swapfile` and add it to `/etc/fstab` for persistence.
- **Expected result:** `free -h` shows the new swap available.
- **Safety note:** swap is not a substitute for adequate RAM for Postgres specifically (heavy swap
  usage under DB load indicates the tier is too small — see the report's UPGRADE THRESHOLD).
- **Rollback/recovery:** `sudo swapoff /swapfile && sudo rm /swapfile` (and remove the `/etc/fstab`
  line) reverses it.
- **Evidence to retain:** `free -h` before/after (non-sensitive).

## Stage 13 — Install Docker Engine

- **Purpose:** the entire PhuQuocHub production stack runs via Docker Compose (PLACE-026/038).
- **Action:** follow Docker's official Ubuntu install steps (add Docker's apt repository and GPG
  key, `sudo apt install docker-ce docker-ce-cli containerd.io`).
- **Expected result:** `docker version` shows both Client and Server sections.
- **Safety note:** do not use the distro's own outdated `docker.io` package — it lags behind the
  Compose v5.x features this repository's compose files already assume.
- **Rollback/recovery:** `sudo apt remove docker-ce docker-ce-cli containerd.io` reverses the
  install (no production data exists yet at this bootstrap stage to protect).
- **Evidence to retain:** `docker version` output (non-sensitive).

## Stage 14 — Install Docker Compose plugin

- **Purpose:** `docker compose` (the plugin, not the standalone `docker-compose` binary) is what
  every script in `scripts/*.sh` invokes.
- **Action:** the Docker Engine install above typically already includes
  `docker-compose-plugin`; verify with `docker compose version`.
- **Expected result:** `Docker Compose version v5.x` (matches the version this repository's own
  local development used — PLACE-038/040/042 evidence).
- **Safety note:** none.
- **Rollback/recovery:** `sudo apt remove docker-compose-plugin` if a version conflict occurs.
- **Evidence to retain:** `docker compose version` output.

## Stage 15 — Create production directory structure

- **Purpose:** a stable, predictable location for the deployed repository checkout, matching what
  `scripts/deploy.sh`/`backup.sh`/`restore.sh` already assume (a project directory containing
  `docker-compose.prod.yml`).
- **Action:** `sudo mkdir -p <PRODUCTION_DIR> <BACKUP_DIR>`.
- **Expected result:** both directories exist.
- **Safety note:** choose a path outside any Hostinger-managed web-root convention that might be
  auto-served or auto-backed-up in a conflicting way.
- **Rollback/recovery:** `sudo rmdir` if empty, or `sudo rm -rf` only if genuinely certain nothing
  of value exists there yet (bootstrap-time only).
- **Evidence to retain:** `ls -la <PRODUCTION_DIR>` (non-sensitive path only).

## Stage 16 — Configure ownership and permissions

- **Purpose:** `<DEPLOY_USER>` (in the `docker` group since Stage 4) should own and operate these
  directories without needing `sudo` for routine deploys.
- **Action:** `sudo chown -R <DEPLOY_USER>:<DEPLOY_USER> <PRODUCTION_DIR> <BACKUP_DIR>`.
- **Expected result:** `<DEPLOY_USER>` can read/write both directories without `sudo`.
- **Safety note:** do not make these world-writable — owner-only (`750`/`700`) is sufficient.
- **Rollback/recovery:** `sudo chown root:root ...` reverses if needed.
- **Evidence to retain:** `ls -la` showing ownership (non-sensitive).

## Stage 17 — Prepare environment-file location

- **Purpose:** the real production `.env` (containing real `DB_PASSWORD`/`REDIS_PASSWORD`/
  `JWT_*`/`R2_*` values — see `PRE-DEPLOYMENT-CHECKLIST.md` §2) must exist on the VPS, **never**
  in this Git repository.
- **Action:** create `<PRODUCTION_DIR>/.env` directly on the VPS (via `scp`, an editor over SSH,
  or Hostinger's file manager) — never via `git add`.
- **Expected result:** `<PRODUCTION_DIR>/.env` exists, readable only by `<DEPLOY_USER>`
  (`chmod 600`).
- **Safety note:** confirm `<PRODUCTION_DIR>/.gitignore` (or the repository's own root
  `.gitignore`, already covering `backups/`) also excludes `.env` if the deploy method involves
  any `git pull` on the VPS itself.
- **Rollback/recovery:** the file can simply be recreated from the Owner's password manager
  (see `PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md`) if lost.
- **Evidence to retain:** confirmation the file exists and has `600` permissions — **never** its
  contents.

## Stage 18 — Prepare secrets handling

- **Purpose:** decide, once, where every real production secret is generated and stored, before
  the first real deploy needs any of them.
- **Action:** generate `DB_PASSWORD`/`REDIS_PASSWORD`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` as
  strong random values (e.g. `openssl rand -base64 32`), store them in the Owner's password
  manager AND in `<PRODUCTION_DIR>/.env` (Stage 17) — nowhere else.
- **Expected result:** every `change-me-*` placeholder from `.env.example`/
  `docker-compose.prod.yml` (PLACE-039/040) has a real counterpart in the VPS-only `.env`.
- **Safety note:** see `PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md` for the full do/don't list.
- **Rollback/recovery:** rotate any individual secret by regenerating it and restarting the
  affected service (`docker compose up -d --no-deps <service>`).
- **Evidence to retain:** which variables have been set (names only), never the values.

## Stage 19 — Prepare backup paths

- **Purpose:** `scripts/backup.sh` needs `<BACKUP_DIR>` to exist and be writable before its first
  cron-scheduled run (already actually proven working in PLACE-038, against local test data).
- **Action:** confirm `<BACKUP_DIR>` (Stage 15/16) is writable by `<DEPLOY_USER>`; schedule
  `scripts/backup.sh` via `crontab -e` (e.g. nightly); if real R2 credentials exist by this point,
  also schedule `scripts/sync-offsite.sh` immediately after.
- **Expected result:** a cron entry exists; a manual first run of `scripts/backup.sh` produces a
  real dump file in `<BACKUP_DIR>`.
- **Safety note:** never commit anything from `<BACKUP_DIR>` to Git (root `.gitignore` already
  excludes `backups/`, matching the local convention).
- **Rollback/recovery:** `crontab -e` to remove the entry if scheduling needs to change.
- **Evidence to retain:** the cron line itself (non-sensitive), the dump file's size/timestamp.

## Stage 20 — Prepare reverse proxy

- **Purpose:** Caddy (the approved reverse proxy, PLACE-037/038) needs `infrastructure/caddy/Caddyfile`
  present once the repository is checked out into `<PRODUCTION_DIR>`.
- **Action:** confirm the Caddyfile's `phuquochub.com` site block will resolve correctly once DNS
  (Stage 21) points here; `docker compose config --quiet` to validate before first `up`.
- **Expected result:** `docker compose config --quiet` exits 0 on the VPS, same as already proven
  locally (PLACE-038/040/042 evidence).
- **Safety note:** do not remove the Caddyfile's local `:8080` test address (PLACE-038) — it
  remains useful for verifying routing without waiting on DNS/TLS.
- **Rollback/recovery:** none needed at this stage (no traffic yet).
- **Evidence to retain:** `docker compose config --quiet` exit code.

## Stage 21 — Prepare DNS/TLS prerequisites

- **Purpose:** Caddy's automatic HTTPS (PLACE-037 §21) needs a real `A`/`AAAA` record pointing
  `<DOMAIN>` at `<VPS_IPV4>` before it can obtain a certificate.
- **Action:** **read-only** — confirm (do not yet create, unless the Owner has explicitly
  authorized this specific action separately) where `<DOMAIN>`'s DNS is currently managed
  (Hostinger's own DNS, Cloudflare, or another registrar — `PRE-DEPLOYMENT-CHECKLIST.md` §1.2
  item 8) and what it currently points to, if anything.
- **Expected result:** a clear answer: DNS provider name + current target (or "no `A` record
  yet").
- **Safety note:** **PLACE-043 does not change DNS** — this stage is inspection only; creating the
  real record is a separate, explicitly Owner-authorized action.
- **Rollback/recovery:** N/A (read-only stage).
- **Evidence to retain:** DNS provider name, current record type/target if any (non-sensitive).

## Stage 22 — Prepare monitoring

- **Purpose:** infra-native monitoring (Docker healthchecks + structured logs, PLACE-037/038) is
  already implemented in the application/compose layer; this stage is only the VPS-side
  prerequisite (log rotation is already configured per-service in `docker-compose.prod.yml`,
  PLACE-038) plus the external uptime-monitor account (Owner-side, PLACE-039 §3, still open).
- **Action:** confirm `docker compose logs --tail=50` works for each service once the stack is up
  (Stage 23); the external uptime monitor's setup itself happens outside this VPS entirely (an
  Owner account, pointed at `<DOMAIN>`/api/health once DNS is live).
- **Expected result:** logs are readable via `docker compose logs`.
- **Safety note:** none.
- **Rollback/recovery:** N/A.
- **Evidence to retain:** confirmation logs are readable (no log content needs to be retained here).

## Stage 23 — Pre-deployment validation

- **Purpose:** the last check before ever running `scripts/deploy.sh` for real.
- **Action:** run every read-only command in the Phase-7 baseline checklist (below) one more
  time, post-bootstrap, and compare against the Production Bootstrap Gap Analysis
  (`PLACE-043's report`) — every item should now read READY, not PARTIAL/MISSING.
- **Expected result:** all bootstrap gaps closed, `docker compose config --quiet` exits 0,
  `<PRODUCTION_DIR>/.env` has every real secret set, backup cron confirmed, DNS confirmed pointed
  correctly if TLS is about to be attempted.
- **Safety note:** do **not** proceed to `scripts/deploy.sh` if any item is still MISSING/BLOCKED.
- **Rollback/recovery:** N/A — this stage is a gate, not a mutation.
- **Evidence to retain:** the final gap-analysis table, all-READY.

## Stage 24 — Rollback and recovery access

- **Purpose:** confirm every recovery path this repository already designed
  (`RELEASE-AND-ROLLBACK-CHECKLIST.md`, `DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md`,
  `INCIDENT-RESPONSE-RUNBOOK.md`) is actually reachable from this specific VPS before the first
  real deploy — not just in theory.
- **Action:** confirm `scripts/rollback.sh`/`restore.sh`/`backup.sh` are present and executable in
  `<PRODUCTION_DIR>/scripts/`; confirm the Hostinger recovery console (Stage 1/3/8/11's standing
  fallback) is still reachable; confirm at least one retained image tag will exist after the
  first real deploy (there is none yet, pre-first-deploy — this is simply the check that the
  *mechanism* is in place).
- **Expected result:** all three scripts present, executable, and their own safety guards (e.g.
  `scripts/migration-rollback-rehearsal.sh`'s `NODE_ENV`/`DB_HOST` guards, PLACE-042) intact.
- **Safety note:** this stage is verification only — it does not itself perform a rollback.
- **Rollback/recovery:** N/A (this stage IS the recovery-readiness check).
- **Evidence to retain:** `ls -la <PRODUCTION_DIR>/scripts/` showing all expected scripts present
  and executable.

---

## Read-only VPS baseline command checklist (used in Stages 1/23, safe to re-run anytime)

```
# OS
cat /etc/os-release
uname -a

# Identity
whoami
id
hostnamectl

# CPU
nproc
lscpu

# Memory
free -h

# Storage
lsblk
df -h

# Network
ip addr
ip route
ss -tulpn

# Time
timedatectl

# Firewall
sudo ufw status verbose

# Updates
apt list --upgradable

# Docker
docker version
docker compose version

# Git
git --version

# Swap
swapon --show

# Existing services
systemctl --type=service --state=running

# Existing containers
docker ps -a

# Existing web servers (check each; absence is expected and fine pre-bootstrap)
systemctl status nginx --no-pager 2>&1 | head -3
systemctl status apache2 --no-pager 2>&1 | head -3
systemctl status caddy --no-pager 2>&1 | head -3

# Existing databases (check each; absence is expected and fine pre-bootstrap)
systemctl status postgresql --no-pager 2>&1 | head -3
systemctl status mysql --no-pager 2>&1 | head -3
systemctl status redis-server --no-pager 2>&1 | head -3
```

**Every command above is read-only or additive-safe.** None of them format a disk, reset a
firewall, purge a package, delete a user, delete a container/volume, delete a database, reboot,
reinstall the OS, change a password, or lock down SSH. Those actions are deliberately **excluded**
from this checklist — see Stage 8's own precondition (verified key access first) for the one
security-hardening exception this runbook does perform, and only in the correct order.
