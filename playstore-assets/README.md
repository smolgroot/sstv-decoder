# Play Store Assets Checklist

This directory contains assets required for the Google Play Store listing.

## Required Assets

### 📱 Screenshots (Required)

#### Phone Screenshots
- **Location**: `screenshots/phone/`
- **Required**: 2-8 screenshots
- **Size**: 1080×1920 (portrait) or 1920×1080 (landscape)
- **Format**: PNG or JPG
- **Purpose**: Show main features and UI

**Suggested screenshots:**
1. Main decoder screen (idle state)
2. Active decoding with spectrum analyzer
3. Decoded Robot36 image example
4. Decoded PD120 high-res image
5. Settings panel showing mode selection
6. Stats display with SNR measurement

#### 7-inch Tablet Screenshots (Optional but recommended)
- **Location**: `screenshots/tablet-7/`
- **Required**: 1-8 screenshots
- **Size**: 1024×600 (landscape) or 600×1024 (portrait)
- **Format**: PNG or JPG

#### 10-inch Tablet Screenshots (Optional but recommended)
- **Location**: `screenshots/tablet-10/`
- **Required**: 1-8 screenshots
- **Size**: 2048×1536 (landscape) or 1536×2048 (portrait)
- **Format**: PNG or JPG

### 🎨 Feature Graphic (Required)
- **Location**: `graphics/feature-graphic.png`
- **Size**: 1024×500 pixels
- **Format**: PNG or JPG (PNG preferred)
- **Purpose**: Prominent banner in Play Store listing
- **Content**: App name, key features, visually appealing design

**Design tips:**
- Include "SSTV Decoder" text prominently
- Show spectrum analyzer or decoded image
- Use app's theme colors (#238636 green, #0d1117 dark)
- Avoid too much text (visual > text)
- Must be legible at small sizes

### 📐 App Icon (Already exists)
- **Location**: `../public/icon-512.png`
- **Size**: 512×512 pixels
- **Format**: PNG (32-bit)
- **Status**: ✅ Already created for PWA

### 🎥 Promo Video (Optional)
- **Platform**: YouTube
- **Length**: 30 seconds - 2 minutes
- **Content**: Demo of decoding SSTV signals
- **Purpose**: Showcase app in action

## Creating Screenshots

### Method 1: From Android Device/Emulator
```bash
# Connect device or start emulator
adb devices

# Take screenshot
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png ./screenshots/phone/

# Or use Android Studio Device Manager
```

### Method 2: From PWA in Browser (Desktop)
1. Open https://sstv-decoder.vercel.app
2. Open DevTools (F12)
3. Toggle device toolbar (Ctrl+Shift+M)
4. Set device: Pixel 7 (1080×2400)
5. Take screenshots at different states
6. Resize to 1080×1920 if needed

### Method 3: Screenshot Editing
Use tools like:
- **Figma**: Create frames with device mockups
- **Canva**: Use templates for app screenshots
- **GIMP/Photoshop**: Manual editing and composition

## Design Tool for Feature Graphic

### Using Figma (Recommended)
1. Create new file: 1024×500 frame
2. Add background (app's dark theme #0d1117)
3. Add app name "SSTV Decoder" (large, bold)
4. Add screenshot or UI element
5. Add key features text:
   - "Robot36 & PD120 Support"
   - "Real-time Decoding"
   - "Signal Analysis"
6. Export as PNG

### Using Canva
1. Custom dimensions: 1024×500
2. Use "App Store Feature Graphic" templates
3. Customize with app branding
4. Download as PNG

## Store Listing Text Assets

### Short Description (80 characters max)
```
Real-time SSTV decoder for amateur radio. Decode Robot36 & PD120 signals.
```

### Full Description (4000 characters max)
See `PLAYSTORE_DEPLOYMENT.md` for complete store listing description.

### Release Notes (500 characters recommended)
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

## Checklist

- [ ] Phone screenshots (2-8) created and added to `screenshots/phone/`
- [ ] Tablet screenshots (optional) created and added to appropriate folders
- [ ] Feature graphic (1024×500) created and added to `graphics/`
- [ ] App icon verified at `../public/icon-512.png`
- [ ] Short description written (≤80 chars)
- [ ] Full description written (≤4000 chars)
- [ ] Release notes written (≤500 chars recommended)
- [ ] Privacy policy created and hosted (see `../PRIVACY_POLICY.md`)
- [ ] All images optimized for size (use TinyPNG or similar)
- [ ] All images reviewed for quality and accuracy

## Tools

### Image Optimization
- [TinyPNG](https://tinypng.com/) - Compress PNG/JPG
- [Squoosh](https://squoosh.app/) - Image compression and format conversion

### Design Tools
- [Figma](https://figma.com) - Professional design tool
- [Canva](https://canva.com) - Easy-to-use templates
- [GIMP](https://gimp.org) - Free Photoshop alternative

### Screenshot Tools
- [Android Studio](https://developer.android.com/studio) - Emulator with built-in screenshot tool
- [Screely](https://screely.com/) - Add device frames to screenshots
- [MockUPhone](https://mockuphone.com/) - Device mockup generator

## Reference

- [Play Console Asset Guidelines](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Screenshot Best Practices](https://developer.android.com/distribute/marketing-tools/device-art-generator)
- [Feature Graphic Guidelines](https://support.google.com/googleplay/android-developer/answer/9866151#feature_graphic)

## Notes

- Screenshots should show actual app functionality, not marketing materials
- Avoid including device frames (Play Store adds them automatically)
- Use high-quality, clear images
- Show variety of app features across screenshots
- Localize screenshots for different languages if targeting international markets
- Update screenshots with each major UI change
