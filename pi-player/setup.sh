#!/bin/bash
#
# VectorMesh - Raspberry Pi Player Setup Script
#
# This script configures a Raspberry Pi to run as a display player.
# It sets up Chromium in kiosk mode to connect to your VectorMesh instance.
# Pairing is done through the on-screen interface using a pairing code.
#
# Usage:
#   curl -sSL https://your-hub-url/pi-setup.sh | bash -s -- YOUR_HUB_URL
#
# Or download and run:
#   chmod +x setup.sh
#   ./setup.sh https://your-hub-url
#

set -e

HUB_URL="${1}"
PLAYER_USER="pi"
CONFIG_DIR="/home/${PLAYER_USER}/.vectormesh"
LOG_FILE="/var/log/signage-player.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[VectorMesh]${NC} $1"; }
warn() { echo -e "${YELLOW}[Warning]${NC} $1"; }
error() { echo -e "${RED}[Error]${NC} $1"; exit 1; }

if [ -z "$HUB_URL" ]; then
  echo ""
  echo "=========================================="
  echo "  VectorMesh - Pi Player Setup"
  echo "=========================================="
  echo ""
  read -p "Enter your VectorMesh URL (e.g., https://your-app.replit.app): " HUB_URL
fi

if [ -z "$HUB_URL" ]; then
  error "Hub URL is required"
fi

HUB_URL="${HUB_URL%/}"

log "Starting VectorMesh Player setup..."
log "Hub URL: $HUB_URL"

log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq chromium-browser unclutter xdotool > /dev/null 2>&1

mkdir -p "$CONFIG_DIR"

echo "$HUB_URL" > "$CONFIG_DIR/hub_url"

PLAYER_URL="${HUB_URL}/player"
log "Player URL: $PLAYER_URL"
log ""
log "The display will show a pairing screen on first launch."
log "Enter the pairing code from VectorMesh > Screens to connect."

log "Creating kiosk launch script..."
cat > "$CONFIG_DIR/start-kiosk.sh" << 'KIOSK_EOF'
#!/bin/bash
CONFIG_DIR="$HOME/.vectormesh"
HUB_URL=$(cat "$CONFIG_DIR/hub_url" 2>/dev/null)

if [ -z "$HUB_URL" ]; then
  echo "Missing configuration. Run setup.sh again."
  exit 1
fi

PLAYER_URL="${HUB_URL}/player"

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
Description=VectorMesh Player
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
Name=VectorMesh Player
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

cat > "$CONFIG_DIR/unpair.sh" << 'EOF'
#!/bin/bash
echo "Clearing pairing data..."
rm -f ~/.vectormesh/screen_id
echo "Display unpaired. Restart the player to see the pairing screen."
echo "Run: ~/.vectormesh/restart.sh"
EOF
chmod +x "$CONFIG_DIR/unpair.sh"

cat > "$CONFIG_DIR/status.sh" << 'EOF'
#!/bin/bash
echo "=== VectorMesh Player Status ==="
echo "Hub URL: $(cat ~/.vectormesh/hub_url 2>/dev/null || echo 'Not configured')"
echo ""
systemctl status signage-player --no-pager 2>/dev/null || echo "Service not running"
echo ""
echo "IP Address: $(hostname -I | awk '{print $1}')"
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo "Temperature: $(vcgencmd measure_temp 2>/dev/null || echo 'N/A')"
echo "Memory: $(free -h | awk '/Mem:/{print $3 "/" $2}')"
echo ""
echo "Pairing is managed through the on-screen interface."
echo "To unpair: ~/.vectormesh/unpair.sh"
EOF
chmod +x "$CONFIG_DIR/status.sh"

log ""
log "=========================================="
log "  Setup Complete!"
log "=========================================="
log ""
log "Player URL: $PLAYER_URL"
log ""
log "Management commands:"
log "  ~/.vectormesh/status.sh   - Check player status"
log "  ~/.vectormesh/restart.sh  - Restart the player"
log "  ~/.vectormesh/stop.sh     - Stop the player"
log "  ~/.vectormesh/unpair.sh   - Unpair this display"
log ""
log "On first launch, the display will show a pairing screen."
log "Enter the pairing code from your VectorMesh to connect."
log ""
log "The player will start automatically on next boot."
log "To start now, reboot or run:"
log "  ~/.vectormesh/start-kiosk.sh"
log ""
