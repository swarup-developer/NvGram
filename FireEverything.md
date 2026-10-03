# FireEverything.md — NvGram Bloatware Removal & Modernization Plan

> **Goal:** Strip all unneeded, heavy, visual-only, and commercial bloat from the NvGram (Unigram fork) codebase. Transform it into a blazing-fast, lean, accessible client that preserves core Telegram messaging, voice notes, and calls while eliminating massive memory dumps, duplicate media players, and complex visual shaders.

---

## Executive Summary of Planned Cuts

| # | Target Subsystem | Lines of Code (LOC) | Disk / Binary Footprint | Screen Reader / User Benefit |
|---|---|---|---|---|
| **1** | **IV Web Editor & Dump** | 391,687 lines (web) | **~72.0 MB** disk space | Eliminates massive accidental profiling dump and unused web IDE. |
| **2** | **In-App Video Player & Editor (VLC)** | ~12,000 lines | **~20.0 MB** binary + plugins | Launches system media player (accessible & fast); removes LibVLC plugins. |
| **3** | **Telegram Stories** | 10,413 lines | High RAM / background load | Removes camera capture, story carousels, and background polling. |
| **4** | **Channel & Group Charts** | 8,510 lines | Rendering overhead | Strips inaccessible Direct2D vector graphing code. |
| **5** | **Stars & Monetization** | 8,473 lines | UI clutter | Cleans commercial menus, paywalls, and crypto dashboards. |
| **6** | **Telegram Business Suite** | 5,926 lines | UI clutter | Eliminates unused storefront settings (away notes, opening hours). |
| **7** | **Animated Stickers / Lottie** | ~3,500 lines C++ | **~8.8 MB** (7.2MB lib + 1.6MB JSON) | Halts continuous 60fps rendering loops; reduces CPU/RAM use. |
| **8** | **Animated Profile Gifts** | 3,442 lines | UI clutter | Drops NFT gift catalogs and profile display widgets. |
| **9** | **Particle & Shader Effects** | ~3,000 lines C++ | GPU shader overhead | Eliminates confetti particle bursts and liquid gradient wallpapers. |
| **10** | **AI / Image OCR Selection** | 2,701 lines | ~0.5 MB ML models | Eliminates mouse-selection bounding boxes (NVDA has built-in OCR). |
| **11** | **In-App Bot Payments** | 2,409 lines | Security & UI maintenance | Drops native credit card forms; delegates checkout to web browser. |
| **12** | **Legacy .NET Native Build** | ~4,800 lines XML | Toolchain fragmentation | Consolidates entirely on modern .NET 10 + NativeAOT. |
| **TOTAL** | **All 12 Bloat Targets** | **~455,000+ LOC** | **~100+ MB reclaimed** | **Massive speedup, light RAM, clean UIA accessibility tree.** |

---

## Detailed Breakdown & Execution Steps

### Target 1: Instant View Web Editor & WPA Memory Dump
* **Locations:**
  * `Libraries/unigram-iv-editor/memory.txt` (385,427 lines, **71.8 MB** accidental trace dump)
  * `Libraries/unigram-iv-editor/` (Entire folder: JS compiler, HTML shell, Node scripts)
* **Why Fire:** It was an in-app tool for web designers creating Instant View article previews. Never needed for chatting.
* **Removal Steps:**
  1. Delete `Libraries/unigram-iv-editor/` completely.
  2. Remove any references in `Directory.Build.targets` or build scripts.

---

### Target 2: In-App Video Player & Media Editor (Remove LibVLC)
* **Locations:**
  * Native wrapper: `Telegram.Native/Media/AsyncMediaPlayer*` and `AsyncMediaPlayerSwapChain*`
  * UI Player: `Telegram/Controls/NativeVideoPlayer.xaml` and `.xaml.cs`
  * Media Editor: `Telegram/Views/Popups/EditMediaPopup.xaml` and `.xaml.cs` (draw pencil, crop, video trim)
  * Gallery Controls: `Telegram/Views/Gallery/` and `Telegram/Controls/Gallery/`
  * Build targets: `Directory.Build.targets` (LibVLC link lines & plugin copying)
* **New Behavior:**
  * **Voice notes:** Kept intact inline using native audio streaming (`SoundPlayer` / `MediaSource`).
  * **Video & Media:** Clicking a video triggers `await Windows.System.Launcher.LaunchFileAsync(file);`. The operating system opens the file in Windows Media Player, VLC, MPC-HC, or whatever player the user configured.
* **Removal Steps:**
  1. In `Directory.Build.targets`, delete `libvlc.lib`, `libvlccore.lib`, and the `TelegramAddVlcPlugins` target.
  2. Remove `libvlc` from `vcpkg.json`.
  3. Delete `AsyncMediaPlayer.cpp`, `.h`, `.idl`, and swapchain files from `Telegram.Native/Media`.
  4. In `ChatView` / message click handlers, route video clicks directly to `Launcher.LaunchFileAsync`.
  5. Delete `EditMediaPopup.xaml` (file attachments send directly without popping up drawing/cropping tools).

---

### Target 3: Telegram Stories Subsystem
* **Locations:**
  * `Telegram/Views/Stories/` (all 12 files)
  * `Telegram/ViewModels/Stories/` (all 6 files)
  * `Telegram/Controls/Stories/` (all 7 files)
* **Why Fire:** Stories require video capture pipelines, dual camera feeds, full-screen gesture carousels, and persistent background status updates.
* **Removal Steps:**
  1. Delete `Views/Stories/`, `ViewModels/Stories/`, and `Controls/Stories/`.
  2. In `Telegram/Views/Chats/ChatsView.xaml`, remove the top `Stories` header/carousel bar.
  3. In `NavigationService.cs` and `ViewModelLocator.cs`, remove `OpenStory` and story view mappings.
  4. In `ProfileHeader.xaml`, remove the avatar story ring indicator.

---

### Target 4: Channel & Group Statistics Charts
* **Locations:**
  * `Telegram/Charts/` (33 files: line charts, pie charts, zoom sliders, Direct2D drawing)
  * `Telegram/Views/Supergroups/ChannelStatsPage.xaml`
  * `Telegram/ViewModels/Supergroups/ChannelStatsViewModel.cs`
* **Why Fire:** Purely visual vector charts for channel analytics. Completely inaccessible for screen readers.
* **Removal Steps:**
  1. Delete `Telegram/Charts/` directory.
  2. Delete `ChannelStatsPage` and `BoostStatsPage`.
  3. Remove "Statistics" navigation menu item from channel admin menus.

---

### Target 5: Telegram Stars, Monetization & Paid Media
* **Locations:**
  * `Telegram/Views/Stars/` (14 files)
  * `Telegram/ViewModels/Stars/` (11 files)
  * `Telegram/Controls/Stars/` (4 files)
  * `Telegram/Views/Monetization/` (4 files)
  * `Telegram/ViewModels/Monetization/` (4 files)
* **Why Fire:** Eliminates paywalls, star purchase dialogs, paid media unlock sheets, and crypto/monetization balance menus.
* **Removal Steps:**
  1. Delete `Views/Stars`, `ViewModels/Stars`, `Controls/Stars`.
  2. Delete `Views/Monetization`, `ViewModels/Monetization`.
  3. Remove Star balance and monetization entries from `SettingsView`.

---

### Target 6: Telegram Business Suite
* **Locations:**
  * `Telegram/Views/Business/` (24 files: greeting, away message, quick replies, chat links, hours)
  * `Telegram/ViewModels/Business/` (19 files)
* **Why Fire:** Commercial features for storefront accounts.
* **Removal Steps:**
  1. Delete `Views/Business` and `ViewModels/Business`.
  2. Remove the "Telegram Business" category from the Settings menu.

---

### Target 7: Animated Stickers & Lottie Engine
* **Locations:**
  * Native submodule/library: `Libraries/tlottie/` (7.2 MB)
  * Native interop: `Telegram.Native/LottieAnimation.{h,cpp,idl}`, `TlottieFrameProducer.h`
  * Assets: `Telegram/Assets/Animations/` (108 JSON files, 1.6 MB)
* **Why Fire:** Continuous 60fps vector animation loops that burn CPU/battery with zero screen-reader utility.
* **Removal Steps:**
  1. Remove `tlottie` build targets and library references.
  2. Fallback sticker rendering to static WebP thumbnails or static glyphs.
  3. Delete the 108 animation files in `Telegram/Assets/Animations/`.

---

### Target 8: Animated Profile Gifts & Collectibles
* **Locations:**
  * `Telegram/Views/Gifts/` (4 files)
  * `Telegram/Controls/Gifts/` (4 files)
* **Why Fire:** Cosmetic NFT-style gift boxes sent to profiles.
* **Removal Steps:**
  1. Delete `Views/Gifts` and `Controls/Gifts`.
  2. Remove "Send a Gift" buttons from user profile pages.

---

### Target 9: GPU Particle Emitters & Liquid Gradient Shaders
* **Locations:**
  * `Telegram.Native/ParticlesAnimation.{h,cpp,idl}` (confetti and heart particle bursts)
  * `Telegram.Native/FreeformGradientSurface.{h,cpp,idl}` (animated mesh gradient wallpapers)
* **Why Fire:** GPU shaders running continuously behind chats for purely visual eye-candy.
* **Removal Steps:**
  1. Delete particle and freeform gradient files from `Telegram.Native`.
  2. Replace background rendering with solid or clean standard static theme brushes.

---

### Target 10: AI Optical Character Recognition on Images
* **Locations:**
  * `Telegram/AI/` (8 files)
  * `Telegram.Native/AI/`
  * `Telegram/Assets/langid_model.smfb.jpg` (machine learning model)
* **Why Fire:** Mouse-drag text selection on photos. NVDA already provides universal screen OCR (`NVDA + R`).
* **Removal Steps:**
  1. Delete `Telegram/AI/` and `Telegram.Native/AI/`.
  2. Delete `langid_model.smfb.jpg`.
  3. Remove image text selection overlays from the image viewer.

---

### Target 11: In-App Bot Credit Card Checkout
* **Locations:**
  * `Telegram/Views/Payments/` (8 files)
  * `Telegram/ViewModels/Payments/` (3 files)
  * `Telegram/Controls/Payments/` (1 file)
* **Why Fire:** Custom native credit card and shipping forms. Modern bots handle payment via web checkout URLs.
* **Removal Steps:**
  1. Delete `Views/Payments`, `ViewModels/Payments`, and `Controls/Payments`.
  2. When a bot sends a payment invoice, open the payment checkout URL in the user's default browser.

---

### Target 12: Toolchain & Legacy Build Consolidation
* **Locations:**
  * `Telegram/Telegram.csproj` (4,800 lines of legacy XML, obsolete .NET Native toolchain)
  * `Telegram.slnx`
* **Why Fire:** Maintaining dual/triple project files creates build fragility and prevents modern C# features.
* **Removal Steps:**
  1. Consolidate development strictly onto `Telegram.Modern.csproj` (.NET 10 + CsWinRT + NativeAOT) and `Telegram.Win32.csproj`.
  2. Remove legacy .NET Native shims and MSBuild 14 targets.

---

## Preserved Core Architecture (What Stays 100% Intact)

```
[NvGram Core System]
├── 1. TDLib Interop (tdjson.dll + Telegram.Generators)
├── 2. Voice & Video Calls (Telegram.Native.Calls + WebRTC WASAPI engine)
├── 3. Inline Voice Notes (Native Opus recorder + lightweight audio player)
├── 4. Messaging Engine (Chats, Groups, Channels, Topics, Search, History)
├── 5. Bot Interactions (Inline bots, custom keyboards, mini-apps via Webview)
├── 6. File & Media Transfer (Photos, documents, audio send/receive)
├── 7. Security & Core Settings (2FA, sessions, proxies, privacy)
└── 8. Screen Reader & Accessibility (Keyboard navigation, UIA automation peers)
```

---

## Execution Order

1. **Step 1 (Zero-Risk File Purge):** Delete `memory.txt` and `Libraries/unigram-iv-editor`.
2. **Step 2 (Commercial & Social Cleanup):** Strip Stories, Stars, Monetization, Gifts, Business, and Payments.
3. **Step 3 (Graphics & Media Player Trim):** Remove `libvlc`, strip in-app video editor, route video playback to system player, delete particle/mesh shaders.
4. **Step 4 (Sticker & Chart Engine Purge):** Remove `tlottie` and `Telegram/Charts`.
5. **Step 5 (Build Modernization):** Consolidate to .NET 10.
