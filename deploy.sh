#!/bin/bash
# ============================================================
# HR Pro — Cloudflare Worker + D1 Deploy Script
# ជំហានដំណើរការ: bash deploy.sh
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║    HR Pro — Cloudflare Deploy Script     ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

WORKER_DIR="$(dirname "$0")/worker"
cd "$WORKER_DIR" || { echo -e "${RED}❌ worker/ folder not found${NC}"; exit 1; }

# ── Step 1: Check wrangler ──────────────────────────────────
echo -e "${YELLOW}[1/5] Checking Wrangler CLI...${NC}"
if ! command -v wrangler &>/dev/null; then
  echo -e "Wrangler not found. Installing..."
  npm install -g wrangler
fi
echo -e "${GREEN}✅ Wrangler $(wrangler --version)${NC}"

# ── Step 2: Login ──────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/5] Cloudflare Login...${NC}"
if ! wrangler whoami &>/dev/null 2>&1; then
  echo "Opening browser for login..."
  wrangler login
else
  echo -e "${GREEN}✅ Already logged in: $(wrangler whoami 2>/dev/null | head -1)${NC}"
fi

# ── Step 3: Create D1 Database ────────────────────────────
echo ""
echo -e "${YELLOW}[3/5] Setting up D1 Database...${NC}"

if grep -q "YOUR_DATABASE_ID_HERE" wrangler.toml; then
  echo "Creating D1 database 'employee_db'..."
  DB_OUTPUT=$(wrangler d1 create employee_db 2>&1)
  echo "$DB_OUTPUT"

  # Extract database_id
  DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

  if [ -n "$DB_ID" ]; then
    # Inject into wrangler.toml
    sed -i "s/YOUR_DATABASE_ID_HERE/$DB_ID/" wrangler.toml
    echo -e "${GREEN}✅ Database ID set: $DB_ID${NC}"
  else
    echo -e "${YELLOW}⚠️  Could not auto-detect database_id.${NC}"
    echo "Please paste your database_id from the output above:"
    read -p "database_id: " DB_ID
    sed -i "s/YOUR_DATABASE_ID_HERE/$DB_ID/" wrangler.toml
    echo -e "${GREEN}✅ Database ID set manually.${NC}"
  fi
else
  echo -e "${GREEN}✅ Database ID already configured in wrangler.toml${NC}"
fi

# ── Step 4: Deploy Worker ─────────────────────────────────
echo ""
echo -e "${YELLOW}[4/5] Deploying Worker...${NC}"
DEPLOY_OUTPUT=$(wrangler deploy 2>&1)
echo "$DEPLOY_OUTPUT"

WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)

if [ -z "$WORKER_URL" ]; then
  echo -e "${YELLOW}⚠️  Could not auto-detect Worker URL.${NC}"
  echo "Please paste your Worker URL (from output above):"
  read -p "Worker URL: " WORKER_URL
fi

echo -e "${GREEN}✅ Worker deployed at: $WORKER_URL${NC}"

# ── Step 5: Initialize Database Tables ────────────────────
echo ""
echo -e "${YELLOW}[5/5] Initializing D1 Database Tables...${NC}"
HTTP_STATUS=$(curl -s -o /tmp/init_response.json -w "%{http_code}" \
  -X POST "$WORKER_URL/init" \
  -H "Content-Type: application/json")

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "${GREEN}✅ Database initialized successfully!${NC}"
  cat /tmp/init_response.json
else
  echo -e "${RED}❌ Init failed (HTTP $HTTP_STATUS)${NC}"
  cat /tmp/init_response.json 2>/dev/null
fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  🎉 Deploy Complete!                 ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Worker URL: $WORKER_URL"
echo "║"
echo "║  ជំហានបន្ទាប់:"
echo "║  1. បើក frontend/index.html"
echo "║  2. ចុច ⚙️ Settings → API/Database"
echo "║  3. ដាក់ URL: $WORKER_URL"
echo "║  4. ចុច 'Save & ភ្ជាប់'"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Save URL for reference
echo "$WORKER_URL" > .worker_url
echo "Worker URL saved to worker/.worker_url"
