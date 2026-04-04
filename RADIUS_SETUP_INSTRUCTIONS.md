# Fix RADIUS: Connect to Supabase (Step-by-Step)

## On RADIUS Server (oj12-1)

1. **Run Fix Script** (makes backup, installs PG driver):
```
wget -O RADIUS_FIX.sh https://your-pastebin-or-scp-this-file
chmod +x RADIUS_FIX.sh
./RADIUS_FIX.sh
```

2. **Edit SQL Config** (`nano /etc/freeradius/3.0/mods-available/sql`):
```
driver = "rlm_sql_postgresql"
server = "db.gvfbgxcetcamjdjvteji.supabase.co"  # YOUR Supabase
port = 5432
login = "postgres"
password = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # Service Role Key or DB pass
radius_db = "postgres"
```

3. **Verify radcheck Table** (Supabase SQL Editor):
```sql
CREATE TABLE IF NOT EXISTS radcheck (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op CHAR(2) NOT NULL DEFAULT '==',
  value VARCHAR(253) NOT NULL
);
-- Insert test
INSERT INTO radcheck (username, attribute, op, value) VALUES ('TEST123', 'Cleartext-Password', ':=', 'TEST123');
```

4. **Test**:
```
sudo freeradius -XC  # Config OK?
radtest TEST123 TEST123 127.0.0.1 0 testing123  # Access-Accept?
```

5. **Production**:
```
sudo systemctl restart freeradius
sudo tail -f /var/log/freeradius/radius.log
```

## Verify End-to-End
1. Generate voucher (Supabase → vouchers/packages).
2. Portal: Enter code → form POST.
3. MikroTik → RADIUS (207.126.167.78) → Supabase query → **Redirect!**

**Common Errors**:
- `psql: FATAL: password auth failed` → Wrong Supabase pass.
- `No such table` → Create `radcheck` in Supabase.
- `Client mikrotik duplicate` → OK, ignore.

**Done**: RADIUS now uses **Supabase** → vouchers auto-auth!
