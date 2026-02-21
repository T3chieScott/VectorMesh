#!/bin/bash
#
# Signage Hub - Raspberry Pi Player Setup Script
#
# This script configures a Raspberry Pi to run as a digital signage player.
# It sets up Chromium in kiosk mode to connect to your Signage Hub.
#
# Usage:
#   curl -sSL https://your-hub-url/pi-setup.sh | bash -s -- YOUR_HUB_URL PAIRING_CODE
#
# Or download and run:
#   chmod +x setup.sh
#   ./setup.sh https://your-hub-url ABC123
#

set -e

HUB_URL="${1}"
PAIRING_CODE="${2}"
PLAYER_USER="pi"
CONFIG_DIR="/home/${PLAYER_USER}/.signage-hub"
LOG_FILE="/var/log/signage-player.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[Signage Hub]${NC} $1"; }
warn() { echo -e "${YELLOW}[Warning]${NC} $1"; }
error() { echo -e "${RED}[Error]${NC} $1"; exit 1; }

if [ -z "$HUB_URL" ]; then
  echo ""
  echo "=========================================="
  echo "  Signage Hub - Pi Player Setup"
  echo "=========================================="
  echo ""
  read -p "Enter your Signage Hub URL (e.g., https://your-app.replit.app): " HUB_URL
  read -p "Enter the screen pairing code: " PAIRING_CODE
fi

if [ -z "$HUB_URL" ]; then
  error "Hub URL is required"
fi

HUB_URL="${HUB_URL%/}"

log "Starting Signage Hub Player setup..."
log "Hub URL: $HUB_URL"

log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq chromium-browser unclutter xdotool > /dev/null 2>&1

mkdir -p "$CONFIG_DIR"

if [ -n "$PAIRING_CODE" ]; then
  log "Pairing with Signage Hub using code: $PAIRING_CODE"
  
  PAIR_RESPONSE=$(curl -s -X POST "${HUB_URL}/api/player/pair" \
    -H "Content-Type: application/json" \
    -d "{\"pairingCode\": \"${PAIRING_CODE}\", \"hardwareInfo\": {\"class\": \"raspberry_pi\", \"model\": \"$(cat /proc/device-tree/model 2>/dev/null || echo 'unknown')\"}}")
  
  SCREEN_ID=$(echo "$PAIR_RESPONSE" | grep -o '"screenId":"[^"]*"' | cut -d'"' -f4)
  SCREEN_NAME=$(echo "$PAIR_RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
  
  if [ -n "$SCREEN_ID" ]; then
    log "Paired successfully!"
    log "Screen: $SCREEN_NAME (ID: $SCREEN_ID)"
    echo "$SCREEN_ID" > "$CONFIG_DIR/screen_id"
  else
    warn "Pairing failed. You can pair manually later."
    warn "Response: $PAIR_RESPONSE"
    read -p "Enter the screen ID manually (from Signage Hub > Screens): " SCREEN_ID
    echo "$SCREEN_ID" > "$CONFIG_DIR/screen_id"
  fi
else
  if [ -f "$CONFIG_DIR/screen_id" ]; then
    SCREEN_ID=$(cat "$CONFIG_DIR/screen_id")
    log "Using existing screen ID: $SCREEN_ID"
  else
    read -p "Enter the screen ID (from Signage Hub > Screens): " SCREEN_ID
    echo "$SCREEN_ID" > "$CONFIG_DIR/screen_id"
  fi
fi

echo "$HUB_URL" > "$CONFIG_DIR/hub_url"

PLAYER_URL="${HUB_URL}/player/${SCREEN_ID}"
log "Player URL: $PLAYER_URL"

log "Creating kiosk launch script..."
cat > "$CONFIG_DIR/start-kiosk.sh" << 'KIOSK_EOF'
#!/bin/bash
CONFIG_DIR="$HOME/.signage-hub"
HUB_URL=$(cat "$CONFIG_DIR/hub_url" 2>/dev/null)
SCREEN_ID=$(cat "$CONFIG_DIR/screen_id" 2>/dev/null)

if [ -z "$HUB_URL" ] || [ -z "$SCREEN_ID" ]; then
  echo "Missing configuration. Run setup.sh again."
  exit 1
fi

PLAYER_URL="${HUB_URL}/player/${SCREEN_ID}"

xset s off
xset -dpms
xset s noblank

unclutter -idle 0.1 -root &

while true; do
  chromium-browser \
    --noerrdialogs \
    --disable-infobars \
    --kiosk \
    --disable-translate \
    --disable-features=TranslateUI \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --disable-background-networking \
    --disable-sync \
    --metrics-recording-only \
    --disable-default-apps \
    --no-first-run \
    --disable-breakpad \
    --disable-crash-reporter \
    --disable-gpu-sandbox \
    --ignore-certificate-errors \
    --window-size=1920,1080 \
    --window-position=0,0 \
    "$PLAYER_URL"
  
  sleep 5
done
KIOSK_EOF
chmod +x "$CONFIG_DIR/start-kiosk.sh"

log "Creating systemd service..."
sudo tee /etc/systemd/system/signage-player.service > /dev/null << EOF
[Unit]
Description=Signage Hub Player
After=graphical-session.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${PLAYER_USER}
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/${PLAYER_USER}/.Xauthority
ExecStart=${CONFIG_DIR}/start-kiosk.sh
Restart=always
RestartSec=10

[Install]
WantedBy=graphical-session.target
EOF

log "Configuring autostart..."
mkdir -p "/home/${PLAYER_USER}/.config/autostart"
cat > "/home/${PLAYER_USER}/.config/autostart/signage-player.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Signage Hub Player
Exec=${CONFIG_DIR}/start-kiosk.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

log "Creating management scripts..."

cat > "$CONFIG_DIR/restart.sh" << 'EOF'
#!/bin/bash
sudo systemctl restart signage-player
echo "Player restarted"
EOF
chmod +x "$CONFIG_DIR/restart.sh"

cat > "$CONFIG_DIR/stop.sh" << 'EOF'
#!/bin/bash
sudo systemctl stop signage-player
echo "Player stopped"
EOF
chmod +x "$CONFIG_DIR/stop.sh"

cat > "$CONFIG_DIR/status.sh" << 'EOF'
#!/bin/bash
echo "=== Signage Hub Player Status ==="
echo "Hub URL: $(cat ~/.signage-hub/hub_url 2>/dev/null || echo 'Not configured')"
echo "Screen ID: $(cat ~/.signage-hub/screen_id 2>/dev/null || echo 'Not configured')"
echo ""
systemctl status signage-player --no-pager 2>/dev/null || echo "Service not running"
echo ""
echo "IP Address: $(hostname -I | awk '{print $1}')"
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo "Temperature: $(vcgencmd measure_temp 2>/dev/null || echo 'N/A')"
echo "Memory: $(free -h | awk '/Mem:/{print $3 "/" $2}')"
EOF
chmod +x "$CONFIG_DIR/status.sh"

log ""
log "=========================================="
log "  Setup Complete!"
log "=========================================="
log ""
log "Player URL: $PLAYER_URL"
log "Screen ID: $SCREEN_ID"
log ""
log "Management commands:"
log "  ~/.signage-hub/status.sh   - Check player status"
log "  ~/.signage-hub/restart.sh  - Restart the player"
log "  ~/.signage-hub/stop.sh     - Stop the player"
log ""
log "The player will start automatically on next boot."
log "To start now, reboot or run:"
log "  ~/.signage-hub/start-kiosk.sh"
log ""
