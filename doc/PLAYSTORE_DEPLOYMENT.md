# Google Play Store Deployment Guide

## Prerequisites

### 1. Install Bubblewrap CLI

```bash
npm install -g @bubblewrap/cli
```

### 2. Install Android SDK and JDK

**Option A: Using Android Studio (Recommended)**
1. Download and install [Android Studio](https://developer.android.com/studio)
2. Open Android Studio → SDK Manager
3. Install:
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Android SDK Command-line Tools

**Option B: Manual Installation**
```bash
# Install OpenJDK 17 (required for Android SDK)
# On Ubuntu/Debian:
sudo apt-get install openjdk-17-jdk

# On macOS:
brew install openjdk@17

# Download Android SDK command-line tools from:
# https://developer.android.com/studio#command-tools
```

### 3. Set Environment Variables

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/build-tools/34.0.0
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64  # Adjust path for your system
```

Reload:
```bash
source ~/.zshrc
```

### 4. Google Play Developer Account

1. Sign up at [Google Play Console](https://play.google.com/console)
2. Pay one-time $25 registration fee
3. Complete account verification

## Step 1: Initialize Bubblewrap Project

```bash
cd /home/leaf/repos/sstv-decoder
bubblewrap init --manifest https://sstv-decoder.vercel.app/manifest.json
```

You'll be prompted for:
- **Domain**: sstv-decoder.vercel.app (or your custom domain)
- **Package Name**: `com.smolgroot.sstvdecoder` (use reverse domain format)
- **App Name**: SSTV Decoder
- **Icon URL**: Leave as default (from manifest)
- **Theme Color**: #238636 (from manifest)
- **Background Color**: #0d1117 (from manifest)
- **Display Mode**: standalone
- **Launcher Name**: SSTV Decoder
- **Status Bar Color**: #238636

This creates `twa-manifest.json` in your project root.

## Step 2: Update TWA Manifest

Edit the generated `twa-manifest.json`:

```json
{
  "packageId": "com.smolgroot.sstvdecoder",
  "host": "sstv-decoder.vercel.app",
  "name": "SSTV Decoder",
  "launcherName": "SSTV Decoder",
  "display": "standalone",
  "backgroundColor": "#0d1117",
  "themeColor": "#238636",
  "statusBarColor": "#238636",
  "navigationColor": "#0d1117",
  "navigationColorDark": "#0d1117",
  "enableNotifications": true,
  "startUrl": "/",
  "iconUrl": "https://sstv-decoder.vercel.app/icon-512.png",
  "maskableIconUrl": "https://sstv-decoder.vercel.app/icon-512.png",
  "monochromeIconUrl": "https://sstv-decoder.vercel.app/icon-512.png",
  "splashScreenFadeOutDuration": 300,
  "signingKey": {
    "path": "./android.keystore",
    "alias": "android"
  },
  "appVersionName": "1.0.0",
  "appVersionCode": 1,
  "shortcuts": [],
  "generatorApp": "bubblewrap-cli",
  "webManifestUrl": "https://sstv-decoder.vercel.app/manifest.json",
  "fallbackType": "customtabs",
  "features": {
    "playBilling": {
      "enabled": false
    },
    "locationDelegation": {
      "enabled": false
    }
  },
  "alphaDependencies": {
    "enabled": false
  },
  "minSdkVersion": 24,
  "targetSdkVersion": 34
}
```

## Step 3: Create Signing Key

```bash
# Generate a keystore for signing your app
bubblewrap keygen

# Or manually:
keytool -genkey -v -keystore android.keystore -alias android \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass YOUR_STORE_PASSWORD -keypass YOUR_KEY_PASSWORD
```

**IMPORTANT**: 
- Store the keystore file (`android.keystore`) safely
- Keep the passwords secure (use a password manager)
- You'll need the same keystore for all future updates
- Losing this keystore means you cannot update your app!

## Step 4: Build the APK/AAB

```bash
# Build Android App Bundle (AAB) - Required for Play Store
bubblewrap build

# This creates:
# - app-release-bundle.aab (for Play Store upload)
# - app-release-signed.apk (for testing)
```

## Step 5: Test Locally

```bash
# Install the APK on a connected Android device or emulator
bubblewrap install

# Or manually:
adb install app-release-signed.apk
```

Test thoroughly:
- [ ] App launches correctly
- [ ] Microphone permissions work
- [ ] Audio processing functions properly
- [ ] PWA offline features work
- [ ] UI scales correctly on different screen sizes
- [ ] Orientation changes work smoothly

## Step 6: Prepare Play Store Assets

Create these assets in `playstore-assets/`:

### Screenshots (Required)
- **Phone**: 2-8 screenshots, 16:9 or 9:16 aspect ratio
  - Minimum: 320px
  - Maximum: 3840px
  - Recommended: 1080 x 1920px (portrait) or 1920 x 1080px (landscape)

- **7-inch Tablet**: 1-8 screenshots
  - Recommended: 1024 x 600px (landscape) or 600 x 1024px (portrait)

- **10-inch Tablet**: 1-8 screenshots
  - Recommended: 2048 x 1536px (landscape) or 1536 x 2048px (portrait)

### Feature Graphic (Required)
- Size: 1024 x 500px
- Format: PNG or JPG
- Shows app name and key features

### App Icon (Already have from PWA)
- Size: 512 x 512px
- Format: PNG (32-bit)
- No transparency

### Promo Video (Optional)
- YouTube video showcasing your app

## Step 7: Create Play Store Listing

1. Go to [Google Play Console](https://play.google.com/console)
2. Click "Create app"
3. Fill in basic information:
   - **App name**: SSTV Decoder
   - **Default language**: English (US)
   - **App/Game**: App
   - **Free/Paid**: Free
   - **Category**: Tools (or Education)
   - **Content rating**: Everyone
   - **Privacy policy URL**: (required - create one)

### Store Listing Content

**Short description** (80 characters max):
```
Real-time SSTV decoder for amateur radio. Decode Robot36 & PD120 signals.
```

**Full description** (4000 characters max):
```
SSTV Decoder - Professional Slow Scan Television Decoder

Decode amateur radio SSTV (Slow Scan Television) signals in real-time directly from your Android device's microphone! Perfect for ham radio enthusiasts and radio amateurs.

FEATURES:
✓ Multi-Mode Support: Robot36 Color (320×240) and PD120 (640×496)
✓ Real-time Decoding: Watch images appear line-by-line as they're decoded
✓ Professional DSP: FM demodulation, sync detection, and color space processing
✓ Audio Analysis: Live spectrum analyzer and signal strength indicator
✓ SNR Measurement: Real-time Signal-to-Noise Ratio in dB
✓ Save Images: Export decoded images as PNG files
✓ Works Offline: No internet connection required after installation

SUPPORTED MODES:
• Robot36 Color: 320×240 resolution, ~36 seconds transmission
• PD120: 640×496 high resolution, ~2 minutes, used for ISS SSTV events

PERFECT FOR:
• Amateur radio operators (ham radio)
• ISS SSTV event reception
• Radio experimentation and learning
• SSTV signal decoding from radios, computers, or audio files

HOW TO USE:
1. Select SSTV mode (Robot36 or PD120)
2. Tap "Start Decoding" to enable microphone
3. Play an SSTV signal near your device
4. Watch the image decode in real-time
5. Save your decoded image

TECHNICAL DETAILS:
• Web Audio API for real-time processing
• Complex baseband FM demodulation
• Schmitt trigger sync pulse detection
• Bidirectional filtering for clean output
• ITU-R BT.601 YUV color space
• Supports 44.1kHz and 48kHz sample rates

PRIVACY:
All audio processing happens locally on your device. No audio data or images are ever transmitted to any server.

Based on the professional DSP algorithms from the Robot36 Android app by xdsopl.

For more information, visit: https://sstv-decoder.vercel.app
```

## Step 8: Upload to Play Console

1. In Play Console, go to **Release → Production**
2. Click "Create new release"
3. Upload `app-release-bundle.aab`
4. Fill in release notes:

```
Version 1.0.0 (Initial Release)

Features:
• Robot36 Color mode (320×240, fast decoding)
• PD120 mode (640×496, high resolution for ISS SSTV)
• Real-time audio processing with spectrum analyzer
• Signal-to-Noise Ratio (SNR) measurement in dB
• Progressive image rendering
• Save decoded images as PNG
• Offline functionality

Requirements:
• Microphone permission for audio capture
• Android 7.0 (API 24) or higher
```

5. Set rollout percentage (start with 5-20% for testing, then 100%)
6. Review and click "Start rollout to Production"

## Step 9: Content Rating

Complete the content rating questionnaire:
- App contains no violence, sexual content, drugs, etc.
- Educational/informational app
- Will receive "Everyone" rating

## Step 10: Review and Publish

1. Complete all required sections (marked with ⚠️)
2. Submit for review
3. Review typically takes 1-3 days
4. You'll receive email notification when approved

## Step 11: Post-Launch

### Update the App

When you need to release updates:

```bash
# Update version in twa-manifest.json
# Increment appVersionCode and update appVersionName

# Rebuild
bubblewrap build

# Upload new AAB to Play Console
```

### Monitor

- **Play Console Dashboard**: Track installs, ratings, crashes
- **User Reviews**: Respond to user feedback
- **Crash Reports**: Monitor and fix issues
- **Android Vitals**: Performance metrics

## Important Notes

### Digital Asset Links

Bubblewrap automatically handles Digital Asset Links verification. Make sure your PWA's `/.well-known/assetlinks.json` file is accessible:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.smolgroot.sstvdecoder",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
  }
}]
```

Get your SHA256 fingerprint:
```bash
keytool -list -v -keystore android.keystore -alias android
```

### Permissions

The app will request:
- **MICROPHONE**: For audio capture
- **INTERNET**: To load PWA content
- **WAKE_LOCK**: To keep screen on during decoding

### Store Policies

Ensure compliance with:
- [Google Play Developer Policy](https://play.google.com/about/developer-content-policy/)
- [User Data Policy](https://support.google.com/googleplay/android-developer/answer/10787469)
- Privacy policy is required (even for apps that don't collect data)

## Troubleshooting

### Build Errors

```bash
# Check Android SDK installation
sdkmanager --list

# Install required components
sdkmanager "build-tools;34.0.0" "platforms;android-34"

# Verify JDK
java -version
```

### Keystore Issues

```bash
# List keystore contents
keytool -list -v -keystore android.keystore

# If you forget the password, you must create a new keystore
# (and will need to publish as a new app)
```

### APK Installation Failed

```bash
# Check connected devices
adb devices

# Uninstall old version first
adb uninstall com.smolgroot.sstvdecoder

# Check logs
adb logcat | grep "sstv"
```

## Quick Command Reference

```bash
# Initialize
bubblewrap init --manifest https://sstv-decoder.vercel.app/manifest.json

# Generate key
bubblewrap keygen

# Build
bubblewrap build

# Install to device
bubblewrap install

# Update
bubblewrap update

# Full rebuild
bubblewrap build --skipPwaValidation
```

## Resources

- [Bubblewrap Documentation](https://github.com/GoogleChromeLabs/bubblewrap)
- [TWA Documentation](https://developer.chrome.com/docs/android/trusted-web-activity/)
- [Play Console Help](https://support.google.com/googleplay/android-developer)
- [Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started)

## Next Steps

1. [ ] Install Bubblewrap CLI and dependencies
2. [ ] Initialize TWA project
3. [ ] Generate signing key
4. [ ] Build and test APK locally
5. [ ] Create Play Store assets (screenshots, feature graphic)
6. [ ] Create privacy policy
7. [ ] Set up Play Console account
8. [ ] Upload and submit for review
