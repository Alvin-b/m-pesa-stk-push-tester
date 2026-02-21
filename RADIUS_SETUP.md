# RADIUS Server Setup Guide

This WiFi billing system uses RADIUS (Remote Authentication Dial-In User Service) for authenticating users on the WiFi hotspot. This guide explains how to set up a RADIUS server that works with your Supabase database.

## Architecture Overview

```
User Device → MikroTik Router → RADIUS Server → Supabase Database
                (Hotspot)         (FreeRADIUS)    (radcheck/radreply tables)
```

## Option 1: Self-Hosted FreeRADIUS (Recommended for Production)

### Prerequisites
- A Linux server (Ubuntu 22.04 or similar)
- Public IP address or VPN connection to MikroTik
- PostgreSQL client libraries

### Installation Steps

#### 1. Install FreeRADIUS and PostgreSQL Support

```bash
sudo apt update
sudo apt install freeradius freeradius-postgresql postgresql-client
```

#### 2. Configure PostgreSQL Connection

Edit `/etc/freeradius/3.0/mods-available/sql`:

```conf
sql {
    dialect = "postgresql"
    
    driver = "rlm_sql_postgresql"
    
    server = "db.gvfbgxcetcamjdjvteji.supabase.co"
    port = 5432
    login = "postgres"
    password = "YOUR_SUPABASE_DB_PASSWORD"
    
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
    
    # Read SQL queries from default configuration
    read_clients = yes
    
    client_table = "nas"
}
```

#### 3. Enable SQL Module

```bash
cd /etc/freeradius/3.0/mods-enabled
sudo ln -s ../mods-available/sql sql
```

#### 4. Configure RADIUS Clients (MikroTik Routers)

Edit `/etc/freeradius/3.0/clients.conf`:

```conf
client mikrotik {
    ipaddr = YOUR_MIKROTIK_IP
    secret = YOUR_SHARED_SECRET
    require_message_authenticator = no
    nas_type = other
}
```

#### 5. Configure Authorization

Edit `/etc/freeradius/3.0/sites-available/default`:

In the `authorize` section, ensure SQL is enabled:
```conf
authorize {
    preprocess
    chap
    mschap
    suffix
    sql  # Make sure this is uncommented
    pap
}
```

#### 6. Start FreeRADIUS

```bash
sudo systemctl enable freeradius
sudo systemctl start freeradius
sudo systemctl status freeradius
```

#### 7. Test RADIUS Authentication

```bash
# Install radtest utility
sudo apt install freeradius-utils

# Test with a voucher code (replace ABCDE with actual code)
radtest ABCDE ABCDE localhost 0 testing123
```

Expected output:
```
Sent Access-Request Id 123 from 0.0.0.0:12345 to 127.0.0.1:1812
Received Access-Accept Id 123 from 127.0.0.1:1812
        Session-Timeout = 3600
```

### Firewall Configuration

```bash
# Allow RADIUS traffic
sudo ufw allow 1812/udp  # Authentication
sudo ufw allow 1813/udp  # Accounting
```

## Option 2: Docker FreeRADIUS (Easy Setup)

### Docker Compose Configuration

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  freeradius:
    image: freeradius/freeradius-server:latest
    container_name: wifi-radius
    ports:
      - "1812:1812/udp"
      - "1813:1813/udp"
    environment:
      - DB_HOST=db.gvfbgxcetcamjdjvteji.supabase.co
      - DB_PORT=5432
      - DB_USER=postgres
      - DB_PASS=YOUR_SUPABASE_DB_PASSWORD
      - DB_NAME=postgres
    volumes:
      - ./radius-config:/etc/raddb
    restart: unless-stopped
```

Run:
```bash
docker-compose up -d
```

## Option 3: Cloud RADIUS Service

Consider using managed RADIUS services:
- **RADIUSaaS** - https://radiusaas.com
- **AuthN by GARR** - https://www.authn.it
- **JumpCloud** - https://jumpcloud.com

## Database Configuration

Your Supabase database already has the required tables:

### `radcheck` Table
Stores user credentials (voucher codes):
```sql
username | attribute          | op | value
---------|-------------------|----|---------
ABCDE    | Cleartext-Password| := | ABCDE
```

### `radreply` Table
Stores session attributes (time limits):
```sql
username | attribute       | op | value
---------|----------------|----|---------
ABCDE    | Session-Timeout| := | 3600
```

### `radacct` Table
Stores accounting records (session tracking) - automatically populated by RADIUS.

## Configure in Admin Dashboard

1. Go to Admin → Router Setup
2. Fill in RADIUS Configuration:
   - **RADIUS Server IP**: Your RADIUS server's IP or hostname
   - **RADIUS Secret**: Shared secret (same as in FreeRADIUS clients.conf)
   - **Auth Port**: 1812 (default)
   - **Accounting Port**: 1813 (default)

3. Click "Save Settings"
4. Download the `hotspot-setup.rsc` file
5. Upload and run it on your MikroTik router

## Testing the Complete Setup

### 1. Generate a Test Voucher
- Go to Admin → Vouchers
- Select a package
- Click "Generate"
- Copy the voucher code

### 2. Test RADIUS Authentication
```bash
radtest VOUCHER_CODE VOUCHER_CODE YOUR_RADIUS_IP 0 YOUR_SECRET
```

### 3. Test on Real Device
- Connect to WiFi network
- Enter voucher code as username
- Enter same code as password
- Should get internet access

## Troubleshooting

### RADIUS Not Responding
```bash
# Check if RADIUS is running
sudo systemctl status freeradius

# Check logs
sudo tail -f /var/log/freeradius/radius.log

# Debug mode
sudo freeradius -X
```

### Database Connection Issues
```bash
# Test PostgreSQL connection
psql "postgresql://postgres:PASSWORD@db.gvfbgxcetcamjdjvteji.supabase.co:5432/postgres"

# Check if tables exist
\dt radcheck
\dt radreply
\dt radacct
```

### MikroTik Can't Reach RADIUS
- Check firewall rules on RADIUS server
- Verify MikroTik has route to RADIUS server
- Test with `ping` from MikroTik
- Verify shared secret matches on both sides

## Security Best Practices

1. **Use Strong Shared Secrets**: Generate random 32+ character secrets
2. **Restrict RADIUS Access**: Only allow your MikroTik IPs
3. **Enable TLS**: Use RadSec (RADIUS over TLS) for production
4. **Monitor Logs**: Set up alerts for failed authentication attempts
5. **Backup Database**: Regular Supabase backups

## Production Checklist

- [ ] RADIUS server deployed and running
- [ ] PostgreSQL connection tested
- [ ] MikroTik configured with correct RADIUS settings
- [ ] Test voucher authentication works
- [ ] Firewall rules configured
- [ ] Monitoring and logging set up
- [ ] Backup strategy in place
- [ ] Documentation updated with actual IPs and secrets

## Support

For issues with:
- **FreeRADIUS**: https://freeradius.org/support/
- **MikroTik**: https://forum.mikrotik.com/
- **Supabase**: https://supabase.com/docs/support

## Next Steps

After RADIUS is configured, you can:
1. Set up M-Pesa credentials in Supabase secrets
2. Create an admin user
3. Configure proper callback URL for M-Pesa
4. Deploy the frontend to production
