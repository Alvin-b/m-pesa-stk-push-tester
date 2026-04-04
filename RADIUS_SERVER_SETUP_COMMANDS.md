# FreeRADIUS Setup Commands - Complete Guide

This guide provides all commands needed to configure FreeRADIUS on your remote server to work with Supabase database for WiFi billing authentication.

## Prerequisites

Before starting, gather these credentials from your Supabase dashboard:
- **Database Server:** `db.gvfbgxcetcamjdjvteji.supabase.co`
- **Username:** `postgres`
- **Password:** Get from Supabase Settings → Database → Connection info → Password
- **Database:** `postgres`

Also have ready:
- **MikroTik Router IP Address:** (your router's public IP or VPN IP)
- **RADIUS Shared Secret:** A strong password (used for MikroTik to authenticate to RADIUS)

---

## Step 1: SSH to Your Server

```bash
ssh your-username@your-server-ip
# Or use PuTTY/MobaXterm on Windows
```

---

## Step 2: Install FreeRADIUS and PostgreSQL Support

```bash
sudo apt update
sudo apt install freeradius freeradius-postgresql postgresql-client -y
```

---

## Step 3: Configure PostgreSQL Connection in FreeRADIUS

Edit the SQL module configuration:

```bash
sudo nano /etc/freeradius/3.0/mods-available/sql
```

**Replace the entire `sql { ... }` block with:**

```conf
sql {
    dialect = "postgresql"
    driver = "rlm_sql_postgresql"
    server = "db.gvfbgxcetcamjdjvteji.supabase.co"
    port = 5432
    login = "postgres"
    password = "YOUR_SUPABASE_PASSWORD_HERE"
    radius_db = "postgres"
    
    # Connection pooling
    pool {
        start = 5
        min = 4
        max = 10
        spare = 3
        uses = 0
        lifetime = 0
        idle_timeout = 60
    }
    
    # Use clients from SQL database
    read_clients = yes
    client_table = "nas"
}
```

**To exit and save in nano:** Press `Ctrl+X`, then `Y`, then `Enter`

---

## Step 4: Enable SQL Module

```bash
cd /etc/freeradius/3.0/mods-enabled
sudo ln -sf ../mods-available/sql sql
```

---

## Step 5: Fix Listener Port Conflict

This is the critical issue preventing FreeRADIUS from starting.

```bash
# First, view all listen blocks in the default site
sudo grep -n "^listen {" /etc/freeradius/3.0/sites-enabled/default
```

You should see output like:
```
59:listen {
205:listen {
246:listen {
259:listen {
```

**Check which lines have the conflicting ports:**

```bash
sudo sed -n '59,70p' /etc/freeradius/3.0/sites-enabled/default
sudo sed -n '205,216p' /etc/freeradius/3.0/sites-enabled/default
sudo sed -n '246,257p' /etc/freeradius/3.0/sites-enabled/default
sudo sed -n '259,270p' /etc/freeradius/3.0/sites-enabled/default
```

Look for lines with `127.0.0.1:18120` or similar bindings. **There should only be ONE listen block at line 59 in the default site (for main auth).**

**Comment out the extra listen blocks:**

```bash
sudo nano /etc/freeradius/3.0/sites-enabled/default
```

For each additional listen block (lines 205, 246, 259), add `#` at the start of each line:
```conf
#listen {
#    ipaddr = ...
#    port = ...
#}
```

Keep ONLY the listen block at line 59 uncommented. Save and exit.

---

## Step 6: Remove Duplicate MikroTik Client Configuration

### Option A: Edit clients.conf (Remove Static Entry)

```bash
sudo nano /etc/freeradius/3.0/clients.conf
```

Find and delete the entire block (search for `client mikrotik`):
```conf
client mikrotik {
    ...
}
```

Delete those lines completely, save and exit.

### Option B: Use SQL Clients Only (Better for Production)

```bash
sudo nano /etc/freeradius/3.0/radiusd.conf
```

Find the line `clients = /etc/freeradius/3.0/clients.conf` and comment it out:
```conf
# clients = /etc/freeradius/3.0/clients.conf
```

This tells FreeRADIUS to load clients ONLY from the `nas` table in Supabase.

---

## Step 7: Restart FreeRADIUS

```bash
# Stop FreeRADIUS
sudo systemctl stop freeradius

# Remove stale socket file if it exists
sudo rm -f /var/run/freeradius/freeradius.sock

# Start FreeRADIUS
sudo systemctl start freeradius

# Check status
sudo systemctl status freeradius

# View logs (Press Ctrl+C to exit)
sudo tail -f /var/log/freeradius/radius.log
```

If there are still errors, check the verbose output:
```bash
sudo freeradius -X
```

Press `Ctrl+C` to stop the debug server.

---

## Step 8: Add Your MikroTik Router to Supabase

Connect to Supabase PostgreSQL and insert your MikroTik router:

### Option A: Via Command Line

```bash
# Install psql if not already installed
sudo apt install postgresql-client -y

# Connect to Supabase
psql -h db.gvfbgxcetcamjdjvteji.supabase.co -U postgres -d postgres
```

At the `postgres=#` prompt, enter:

```sql
INSERT INTO nas (nasname, shortname, type, secret, description) 
VALUES ('YOUR_MIKROTIK_IP', 'mikrotik', 'other', 'YOUR_SHARED_SECRET', 'MikroTik Router');
```

Replace:
- `YOUR_MIKROTIK_IP` with your MikroTik's public IP (e.g., `192.168.1.1`)
- `YOUR_SHARED_SECRET` with a strong password (e.g., `Super$ecure123Pass`)

Then type:
```sql
\q
```

to exit psql.

### Option B: Via Supabase Dashboard

1. Go to https://app.supabase.com/
2. Select your project
3. Go to SQL Editor
4. Create a new query and paste:

```sql
INSERT INTO nas (nasname, shortname, type, secret, description) 
VALUES ('YOUR_MIKROTIK_IP', 'mikrotik', 'other', 'YOUR_SHARED_SECRET', 'MikroTik Router');
```

---

## Step 9: Verify FreeRADIUS is Working

Test RADIUS authentication from the command line:

```bash
# Install radtest if needed
sudo apt install freeradius-utils -y

# Test with a voucher code (after you've created one in Supabase)
# Format: radtest <username> <password> <server> <port> <secret>
radtest VOUCHER_CODE VOUCHER_CODE localhost 1812 testing123
```

Expected output if working:
```
Sent Access-Request Id 1 from 127.0.0.1:42824 to 127.0.0.1:1812
... (details)
Received Access-Accept Id 1 from 127.0.0.1:1812 to 127.0.0.1:42824
```

---

## Step 10: Configure MikroTik to Use RADIUS

In MikroTik WebFig or Terminal:

```
/radius settings set address=<YOUR_RADIUS_SERVER_IP> secret=<YOUR_SHARED_SECRET>
/user settings set default-group=wireguard
/ip hotspot user profile add name=default
```

---

## Step 11: Test the Full Flow

1. **From browser:** Connect to WiFi hotspot and open captive portal
2. **Enter voucher:** Use a voucher code from Supabase
3. **Should authenticate:** If everything works, you'll get internet access

---

## Troubleshooting

### FreeRADIUS Won't Start

```bash
# Check logs
sudo tail -50 /var/log/freeradius/radius.log

# Run in debug mode to see exact error
sudo freeradius -X
```

### Can't Connect to Supabase Database

```bash
# Test database connection
psql -h db.gvfbgxcetcamjdjvteji.supabase.co -U postgres -d postgres -c "SELECT 1;"
```

If it fails:
- Verify password is correct
- Check Supabase IP is whitelisted (if using network restrictions)
- Ensure PostgreSQL driver is installed: `sudo apt install libpq-dev postgresql-client`

### Duplicate Client Errors

```bash
# Check for duplicate entries
sudo grep -c "client mikrotik" /etc/freeradius/3.0/clients.conf
```

If output is > 1, editing to remove duplicates. If it's 1, that's correct.

---

## Security: Change Your Password

After everything is working:

```bash
sudo passwd
```

Enter your new password twice.

---

## Next Steps

Once FreeRADIUS is confirmed working:

1. ✅ Verify vouchers authenticate correctly
2. ✅ Test WiFi access from user device
3. ✅ Monitor logs for any errors: `sudo tail -f /var/log/freeradius/radius.log`
4. ✅ Set up log rotation to prevent disk full

---

**Report back once FreeRADIUS is running and the full payment-to-internet flow is working!**
