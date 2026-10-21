#!/bin/sh
# Certificates for testing the static export on a tablet over Wi-Fi (Phase 4
# iPad baseline). Creates a private CA that can only vouch for this Mac's own
# Bonjour name and current LAN address (X.509 name constraints), and a server
# certificate signed by it. Valid 30 days. Output: .lan-https/ (git-ignored).
# Remove the CA from the tablet after testing.
set -eu
dir=.lan-https
name="$(scutil --get LocalHostName).local"
ip="$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)"
[ -n "$ip" ] || { echo "No Wi-Fi/Ethernet address found" >&2; exit 1; }
mkdir -p "$dir"
cd "$dir"
cat > ca.cnf <<CNF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = Porta Dysheme local test CA ($name)
[ext]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical, permitted;DNS:$name, permitted;IP:$ip/255.255.255.255
CNF
cat > server.cnf <<CNF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = $name
[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:$name, IP:$ip
authorityKeyIdentifier = keyid
CNF
# The CA names the address, so a new address needs a new CA (install it again).
if [ ! -f ca.key ] || [ "$(cat ca-host 2>/dev/null)" != "$name $ip" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 30 -keyout ca.key -out porta-dev-ca.crt \
    -config ca.cnf -extensions ext
  echo "$name $ip" > ca-host
  echo "NEW certificate authority: install porta-dev-ca.crt on the iPad again (docs/IPAD_BASELINE.md, A1-A3)."
fi
openssl req -newkey rsa:2048 -nodes -sha256 -keyout server.key -out server.csr -config server.cnf
openssl x509 -req -in server.csr -CA porta-dev-ca.crt -CAkey ca.key -CAcreateserial -sha256 -days 30 \
  -out server.crt -extfile server.cnf -extensions ext
openssl verify -CAfile porta-dev-ca.crt server.crt
echo "Host: $name ($ip)"
echo "Open on the iPad: https://$name:4443/sq/studio/?debug=1&baseline=1"
