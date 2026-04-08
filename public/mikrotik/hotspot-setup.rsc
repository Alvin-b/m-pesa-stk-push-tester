#########################################
# Njuwa WiFi — Full MikroTik Hotspot Setup
# Configures: Bridge, IP, DHCP, DNS, NAT,
# Hotspot, RADIUS, Firewall, Walled Garden
#
# INSTRUCTIONS:
# 1. Edit the variables below to match your setup
# 2. Upload this file to the router: /import hotspot-setup.rsc
# 3. The script is idempotent — safe to run multiple times
#########################################

# ═══════════════════════════════════════
# VARIABLES — EDIT THESE
# ═══════════════════════════════════════
:local bridgeName "bridge-hotspot"
:local bridgeIP "10.10.0.1"
:local bridgeNet "10.10.0.0/24"
:local dhcpPool "10.10.0.10-10.10.0.254"
:local dhcpLease "00:30:00"
:local dnsServers "8.8.8.8,8.8.4.4"

# Ports to add to the hotspot bridge (ethernet + wireless)
# Adjust these to match your router's interface names
:local etherPorts {"ether2";"ether3";"ether4";"ether5"}
:local wlanInterfaces {"wlan1"}

# RADIUS server (your FreeRADIUS)
:local radiusIP "YOUR_RADIUS_SERVER_IP"
:local radiusSecret "YOUR_RADIUS_SECRET"
:local radiusAuthPort 1812
:local radiusAcctPort 1813

# Portal URL — your Lovable app
:local portalDomain "stk-pay-magic.lovable.app"

# WiFi settings
:local ssidName "Njuwa WiFi"
:local wlanFrequency 2437
:local wlanBand "2ghz-b/g/n"

#########################################
# 1. CREATE BRIDGE
#########################################
:log info "=== Starting Njuwa WiFi Hotspot Setup ==="

:if ([:len [/interface bridge find name=$bridgeName]] = 0) do={
    /interface bridge add name=$bridgeName comment="Hotspot Bridge"
    :log info "Created bridge: $bridgeName"
} else={
    :log info "Bridge $bridgeName already exists"
}

#########################################
# 2. ADD ETHERNET PORTS TO BRIDGE
#########################################
:foreach port in=$etherPorts do={
    :if ([:len [/interface bridge port find interface=$port bridge=$bridgeName]] = 0) do={
        :do {
            /interface bridge port add interface=$port bridge=$bridgeName comment="Hotspot port"
            :log info "Added $port to $bridgeName"
        } on-error={
            :log warning "Could not add $port to bridge (may already be in another bridge)"
        }
    }
}

#########################################
# 3. ADD WIRELESS INTERFACES TO BRIDGE
#########################################
:foreach wlan in=$wlanInterfaces do={
    # Configure wireless
    :do {
        /interface wireless set [find name=$wlan] \
            mode=ap-bridge \
            ssid=$ssidName \
            frequency=$wlanFrequency \
            band=$wlanBand \
            disabled=no
        :log info "Configured wireless: $wlan with SSID=$ssidName"
    } on-error={
        :log warning "Could not configure $wlan (may not exist)"
    }

    # Add to bridge
    :if ([:len [/interface bridge port find interface=$wlan bridge=$bridgeName]] = 0) do={
        :do {
            /interface bridge port add interface=$wlan bridge=$bridgeName comment="Hotspot wireless"
            :log info "Added $wlan to $bridgeName"
        } on-error={
            :log warning "Could not add $wlan to bridge"
        }
    }
}

#########################################
# 4. ASSIGN IP ADDRESS TO BRIDGE
#########################################
:if ([:len [/ip address find interface=$bridgeName]] = 0) do={
    /ip address add address="$bridgeIP/24" interface=$bridgeName comment="Hotspot gateway"
    :log info "Assigned IP $bridgeIP to $bridgeName"
} else={
    :log info "IP already assigned to $bridgeName"
}

#########################################
# 5. DHCP SERVER
#########################################
# Pool
:if ([:len [/ip pool find name="hotspot-pool"]] = 0) do={
    /ip pool add name="hotspot-pool" ranges=$dhcpPool
    :log info "Created DHCP pool: $dhcpPool"
}

# Network
:if ([:len [/ip dhcp-server network find address=$bridgeNet]] = 0) do={
    /ip dhcp-server network add address=$bridgeNet gateway=$bridgeIP dns-server=$dnsServers
    :log info "Created DHCP network for $bridgeNet"
}

# Server
:if ([:len [/ip dhcp-server find name="hotspot-dhcp"]] = 0) do={
    /ip dhcp-server add name="hotspot-dhcp" interface=$bridgeName address-pool="hotspot-pool" lease-time=$dhcpLease disabled=no
    :log info "Created DHCP server on $bridgeName"
}

#########################################
# 6. DNS
#########################################
/ip dns set allow-remote-requests=yes servers=$dnsServers
:log info "DNS configured: $dnsServers"

#########################################
# 7. NAT — MASQUERADE
#########################################
:if ([:len [/ip firewall nat find comment="Hotspot-Masquerade"]] = 0) do={
    /ip firewall nat add chain=srcnat src-address=$bridgeNet action=masquerade out-interface-list=WAN comment="Hotspot-Masquerade"
    :log info "NAT masquerade rule added"
}

# Fallback masquerade if no WAN list defined
:if ([:len [/interface list find name="WAN"]] = 0) do={
    :if ([:len [/ip firewall nat find comment="Hotspot-Masquerade-Fallback"]] = 0) do={
        /ip firewall nat add chain=srcnat src-address=$bridgeNet action=masquerade comment="Hotspot-Masquerade-Fallback"
        :log info "Fallback NAT masquerade added (no WAN list found)"
    }
}

#########################################
# 8. HOTSPOT SERVER PROFILE (RADIUS)
#########################################
:if ([:len [/ip hotspot profile find name="njuwa-profile"]] = 0) do={
    /ip hotspot profile add \
        name="njuwa-profile" \
        hotspot-address=$bridgeIP \
        dns-name="wifi.njuwa.local" \
        html-directory="hotspot" \
        login-by="http-chap,http-pap" \
        use-radius=yes \
        radius-accounting=yes \
        radius-interim-update=00:05:00 \
        nas-port-type=wireless-802.11
    :log info "Created hotspot profile: njuwa-profile"
} else={
    /ip hotspot profile set [find name="njuwa-profile"] \
        use-radius=yes \
        radius-accounting=yes \
        radius-interim-update=00:05:00
    :log info "Updated hotspot profile: njuwa-profile"
}

#########################################
# 9. HOTSPOT SERVER
#########################################
:if ([:len [/ip hotspot find name="njuwa-hotspot"]] = 0) do={
    /ip hotspot add \
        name="njuwa-hotspot" \
        interface=$bridgeName \
        address-pool="hotspot-pool" \
        profile="njuwa-profile" \
        disabled=no
    :log info "Created hotspot server: njuwa-hotspot"
} else={
    :log info "Hotspot server njuwa-hotspot already exists"
}

#########################################
# 10. RADIUS CLIENT
#########################################
:if ([:len [/radius find address=$radiusIP]] = 0) do={
    /radius add \
        service=hotspot \
        address=$radiusIP \
        secret=$radiusSecret \
        authentication-port=$radiusAuthPort \
        accounting-port=$radiusAcctPort \
        timeout=3s
    :log info "RADIUS server added: $radiusIP"
} else={
    /radius set [find address=$radiusIP] \
        secret=$radiusSecret \
        authentication-port=$radiusAuthPort \
        accounting-port=$radiusAcctPort
    :log info "RADIUS server updated: $radiusIP"
}

# Enable incoming RADIUS (for CoA / Disconnect-Request)
/radius incoming set accept=yes port=3799
:log info "RADIUS incoming (CoA/DM) enabled on port 3799"

#########################################
# 11. WALLED GARDEN — ALLOW PORTAL ACCESS
#########################################
# Allow the portal domain (HTTPS)
:if ([:len [/ip hotspot walled-garden find dst-host=$portalDomain]] = 0) do={
    /ip hotspot walled-garden add dst-host=$portalDomain action=allow comment="Njuwa Portal"
    :log info "Walled garden: allowed $portalDomain"
}

# Allow wildcard subdomains (for Lovable preview URLs)
:if ([:len [/ip hotspot walled-garden find dst-host="*.lovable.app"]] = 0) do={
    /ip hotspot walled-garden add dst-host="*.lovable.app" action=allow comment="Lovable preview"
}

# Allow Supabase API (for edge functions)
:if ([:len [/ip hotspot walled-garden find dst-host="*.supabase.co"]] = 0) do={
    /ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="Supabase API"
}
:if ([:len [/ip hotspot walled-garden find dst-host="*.supabase.net"]] = 0) do={
    /ip hotspot walled-garden add dst-host="*.supabase.net" action=allow comment="Supabase functions"
}

# Allow Safaricom M-Pesa API
:if ([:len [/ip hotspot walled-garden find dst-host="*.safaricom.co.ke"]] = 0) do={
    /ip hotspot walled-garden add dst-host="*.safaricom.co.ke" action=allow comment="M-Pesa API"
}

# IP-level walled garden for HTTPS destinations
:if ([:len [/ip hotspot walled-garden ip find comment="Portal-HTTPS"]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-port=443 protocol=tcp comment="Portal-HTTPS"
    :log info "Walled garden IP: allowed HTTPS (443)"
}

#########################################
# 12. FIREWALL — ALLOW RADIUS TRAFFIC
#########################################
# Allow RADIUS auth (UDP 1812)
:if ([:len [/ip firewall filter find comment="Allow-RADIUS-Auth"]] = 0) do={
    /ip firewall filter add chain=input protocol=udp dst-port=1812 action=accept comment="Allow-RADIUS-Auth"
}

# Allow RADIUS accounting (UDP 1813)
:if ([:len [/ip firewall filter find comment="Allow-RADIUS-Acct"]] = 0) do={
    /ip firewall filter add chain=input protocol=udp dst-port=1813 action=accept comment="Allow-RADIUS-Acct"
}

# Allow RADIUS CoA/DM (UDP 3799)
:if ([:len [/ip firewall filter find comment="Allow-RADIUS-CoA"]] = 0) do={
    /ip firewall filter add chain=input protocol=udp dst-port=3799 action=accept comment="Allow-RADIUS-CoA"
}

# Allow established/related connections
:if ([:len [/ip firewall filter find comment="Hotspot-Established"]] = 0) do={
    /ip firewall filter add chain=input connection-state=established,related action=accept comment="Hotspot-Established"
}

# Allow DNS from hotspot clients
:if ([:len [/ip firewall filter find comment="Hotspot-DNS"]] = 0) do={
    /ip firewall filter add chain=input protocol=udp src-address=$bridgeNet dst-port=53 action=accept comment="Hotspot-DNS"
    /ip firewall filter add chain=input protocol=tcp src-address=$bridgeNet dst-port=53 action=accept comment="Hotspot-DNS-TCP"
}

#########################################
# 13. HOTSPOT LOGIN PAGE — REDIRECT TO PORTAL
#########################################
# The login.html in the hotspot directory should redirect
# users to the portal. Upload the login.html file separately:
#
#   /file print
#   Then upload login.html to the "hotspot" directory
#
# MikroTik will serve it at the captive portal intercept.

:log info "================================================"
:log info "  Njuwa WiFi Hotspot Setup Complete!"
:log info "  "
:log info "  Bridge:  $bridgeName ($bridgeIP)"
:log info "  DHCP:    $dhcpPool"
:log info "  RADIUS:  $radiusIP:$radiusAuthPort"
:log info "  Portal:  $portalDomain"
:log info "  "
:log info "  NEXT STEPS:"
:log info "  1. Upload login.html to /hotspot/ directory"
:log info "  2. Verify RADIUS connectivity"
:log info "  3. Test a client connection"
:log info "================================================"
