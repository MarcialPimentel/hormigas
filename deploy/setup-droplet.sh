#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 droplet. Run as root:
#   bash setup-droplet.sh
# Installs Docker, adds swap, turns on the firewall, and creates a "deploy"
# user that GitHub Actions and you will use from now on.
set -euo pipefail

echo "==> Updating packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl ufw unattended-upgrades

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Adding 2 GB of swap (a safety net on a small droplet)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "==> Firewall: allow SSH, HTTP and HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Creating the deploy user"
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> Creating /opt/hub"
mkdir -p /opt/hub/backups
chown -R deploy:deploy /opt/hub

echo "==> Turning on automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Done. From now on, connect as:  ssh deploy@$(curl -s https://ipinfo.io/ip || hostname -I | awk '{print $1}')"
