#!/bin/bash
# RADIUS Server Fix: Switch to Supabase PostgreSQL
# Run on Ubuntu RADIUS server (oj12-1)

echo "=== 1. Install PostgreSQL Driver ==="
sudo apt update
sudo apt install freeradius-postgresql postgresql-client -y

echo "=== 2. Stop FreeRADIUS ==="
sudo systemctl stop freeradius

echo "=== 3. Backup Current SQL Config ==="
sudo cp /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-available/sql_mysql.backup

echo "=== 4. Configure Supabase PostgreSQL ==="
# EDIT THIS FILE MANUALLY: /etc/freeradius/3.0/mods-available/sql
cat > /tmp/supabase_sql.conf << 'EOF'
sql {
    dialect = "postgresql"
    driver = "rlm_sql_postgresql"
    
    server = "db.YOUR_PROJECT_ID.supabase.co"  # ← REPLACE with your Supabase DB URL
    port = 5432
    login = "postgres"
    password = "YOUR_SUPABASE_DB_PASSWORD"      # ← REPLACE
    
    radius_db = "postgres"
    
    read_clients = yes
    client_table = "nas"
    
    pool {
        start = 5
        min = 4
        max = 10
        spare = 3
        uses = 0
        lifetime = 0
        idle_timeout = 60
    }
    
    accounting {
        reference = "%{tolower:type.%{%{Acct-Status-Type}:-unknown}.query}"
        # Add MySQL queries or adapt for PG
    }
}
EOF

echo "=== MANUAL STEP REQUIRED ==="
echo "1. nano /etc/freeradius/3.0/mods-available/sql"
echo "2. Paste config from /tmp/supabase_sql.conf"
echo "3. REPLACE: server, password with YOUR Supabase details"
echo "4. Save (Ctrl+X, Y, Enter)"

echo "=== 5. Enable PostgreSQL Module ==="
cd /etc/freeradius/3.0/mods-enabled
sudo rm -f sql  # Remove old MySQL
sudo ln -s ../mods-available/sql sql_postgresql

echo "=== 6. Test Config ==="
sudo freeradius -XC

echo "=== 7. Test Supabase Connection ==="
# Test PG connect
psql "host=db.YOUR_PROJECT_ID.supabase.co port=5432 dbname=postgres user=postgres password=YOUR_PASS" -c "\dt radcheck"

echo "=== 8. Test radtest with REAL VOUCHER ==="
# Generate test voucher in Supabase → use code
radtest YOUR_VOUCHER YOUR_VOUCHER 127.0.0.1 0 testing123

echo "=== 9. Restart & Ready! ==="
sudo systemctl start freeradius
sudo systemctl enable freeradius
sudo systemctl status freeradius

echo "=== DEBUG: Run during login ==="
echo "sudo systemctl stop freeradius && sudo freeradius -X"
echo "# Then test login on MikroTik → watch SQL queries"

