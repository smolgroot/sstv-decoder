#!/bin/bash

# Google Play Store Deployment Setup Script
# This script automates the initial setup for deploying your PWA to the Play Store

set -e  # Exit on error

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  SSTV Decoder - Google Play Store Deployment Setup${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"

# Check if running in the correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check Node.js
echo -e "${CYAN}[1/7] Checking Node.js installation...${NC}"
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js $NODE_VERSION installed${NC}"
else
    echo -e "${RED}✗ Node.js not found. Please install Node.js 18+ from https://nodejs.org${NC}"
    exit 1
fi

# Step 2: Check Java
echo -e "\n${CYAN}[2/7] Checking Java (JDK) installation...${NC}"
if command_exists java; then
    JAVA_VERSION=$(java -version 2>&1 | head -n 1)
    echo -e "${GREEN}✓ $JAVA_VERSION installed${NC}"
    
    if [ -z "$JAVA_HOME" ]; then
        echo -e "${YELLOW}⚠ Warning: JAVA_HOME not set${NC}"
        echo -e "${YELLOW}  Please add to ~/.zshrc:${NC}"
        echo -e "${YELLOW}  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64${NC}"
    else
        echo -e "${GREEN}✓ JAVA_HOME=$JAVA_HOME${NC}"
    fi
else
    echo -e "${RED}✗ Java not found. Please install OpenJDK 17:${NC}"
    echo -e "${RED}  Ubuntu/Debian: sudo apt-get install openjdk-17-jdk${NC}"
    echo -e "${RED}  macOS: brew install openjdk@17${NC}"
    exit 1
fi

# Step 3: Check Android SDK
echo -e "\n${CYAN}[3/7] Checking Android SDK installation...${NC}"
if [ -z "$ANDROID_HOME" ]; then
    echo -e "${YELLOW}⚠ Warning: ANDROID_HOME not set${NC}"
    echo -e "${YELLOW}  Please install Android SDK and add to ~/.zshrc:${NC}"
    echo -e "${YELLOW}  export ANDROID_HOME=\$HOME/Android/Sdk${NC}"
    echo -e "${YELLOW}  export PATH=\$PATH:\$ANDROID_HOME/tools:\$ANDROID_HOME/platform-tools${NC}"
    
    # Check common Android SDK locations
    if [ -d "$HOME/Android/Sdk" ]; then
        echo -e "${YELLOW}  Found Android SDK at: $HOME/Android/Sdk${NC}"
        export ANDROID_HOME="$HOME/Android/Sdk"
        export PATH="$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools"
    elif [ -d "$HOME/Library/Android/sdk" ]; then
        echo -e "${YELLOW}  Found Android SDK at: $HOME/Library/Android/sdk${NC}"
        export ANDROID_HOME="$HOME/Library/Android/sdk"
        export PATH="$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools"
    else
        echo -e "${RED}  Android SDK not found. Please install Android Studio or command-line tools.${NC}"
    fi
else
    echo -e "${GREEN}✓ ANDROID_HOME=$ANDROID_HOME${NC}"
fi

if command_exists adb; then
    ADB_VERSION=$(adb --version | head -n 1)
    echo -e "${GREEN}✓ $ADB_VERSION installed${NC}"
else
    echo -e "${YELLOW}⚠ Warning: adb not found in PATH${NC}"
fi

# Step 4: Install Bubblewrap CLI
echo -e "\n${CYAN}[4/7] Installing Bubblewrap CLI...${NC}"
if command_exists bubblewrap; then
    BUBBLEWRAP_VERSION=$(bubblewrap --version 2>&1 || echo "unknown")
    echo -e "${GREEN}✓ Bubblewrap already installed: $BUBBLEWRAP_VERSION${NC}"
    read -p "Reinstall? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm install -g @bubblewrap/cli
    fi
else
    echo -e "${YELLOW}Installing @bubblewrap/cli globally...${NC}"
    npm install -g @bubblewrap/cli
    echo -e "${GREEN}✓ Bubblewrap CLI installed${NC}"
fi

# Step 5: Create playstore-assets directory
echo -e "\n${CYAN}[5/7] Creating playstore-assets directory...${NC}"
mkdir -p playstore-assets/{screenshots/{phone,tablet-7,tablet-10},graphics}
echo -e "${GREEN}✓ Created directory structure:${NC}"
echo "  playstore-assets/"
echo "  ├── screenshots/"
echo "  │   ├── phone/      (Add 1080x1920 or 1920x1080 screenshots)"
echo "  │   ├── tablet-7/   (Add 1024x600 or 600x1024 screenshots)"
echo "  │   └── tablet-10/  (Add 2048x1536 or 1536x2048 screenshots)"
echo "  └── graphics/"
echo "      └── (Add 1024x500 feature graphic)"

# Step 6: Check if manifest.json exists
echo -e "\n${CYAN}[6/7] Checking PWA manifest...${NC}"
if [ -f "public/manifest.json" ]; then
    echo -e "${GREEN}✓ manifest.json found${NC}"
    
    # Check if icons exist
    if [ -f "public/icon-192.png" ] && [ -f "public/icon-512.png" ]; then
        echo -e "${GREEN}✓ PWA icons found${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Icon files not found (icon-192.png, icon-512.png)${NC}"
    fi
else
    echo -e "${RED}✗ manifest.json not found in public/ directory${NC}"
    exit 1
fi

# Step 7: Next steps information
echo -e "\n${CYAN}[7/7] Setup complete!${NC}\n"

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Next Steps:${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}1. Initialize Bubblewrap project:${NC}"
echo -e "   ${CYAN}npm run playstore:init${NC}\n"

echo -e "${YELLOW}2. Generate signing key:${NC}"
echo -e "   ${CYAN}npm run playstore:keygen${NC}\n"

echo -e "${YELLOW}3. Build Android App Bundle:${NC}"
echo -e "   ${CYAN}npm run playstore:build${NC}\n"

echo -e "${YELLOW}4. Test on device (optional):${NC}"
echo -e "   ${CYAN}npm run playstore:install${NC}\n"

echo -e "${YELLOW}5. Create Play Store assets:${NC}"
echo "   • Screenshots (phone + tablets)"
echo "   • Feature graphic (1024×500)"
echo "   • Privacy policy\n"

echo -e "${YELLOW}6. Upload to Play Console:${NC}"
echo "   • Go to https://play.google.com/console"
echo "   • Create new app"
echo "   • Upload app-release-bundle.aab"
echo "   • Fill in store listing"
echo "   • Submit for review\n"

echo -e "${GREEN}For detailed instructions, see: ${CYAN}PLAYSTORE_DEPLOYMENT.md${NC}\n"

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}\n"
