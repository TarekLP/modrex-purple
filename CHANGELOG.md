# Changelog

All notable changes to Modrex are documented in this file. Each version's section here becomes the GitHub release body and the in-app update notes — entries should read as user-facing release notes, not commit messages.

## Unreleased

### Added

- Added Discord Rich Presence showing the active game on profile.
- Added a Health Check on the Installed page, scans all mods and groups issues by category, with bulk actions to fix them:
  - Missing files
  - Broken archives
  - Outdated installs
  - Unrecognized mods
  - Missing dependencies
  - Available updates
- Added Settings access from the Game Picker Window.
- Added an "Outdated" badge in Manage Files for leftover duplicate files left behind when a mod's download switched between a plain file and an archive.

### Changed

- Settings is now organized into three tabs.

### Fixed

- Fixed updates not being detected for mods whose download switched between a plain file and an archive, which could leave an old copy installed alongside the new one.
- Fixed Settings remembering the wrong tab when switching between the game picker's global settings and per-game settings.
- Fixed ghost buttons and navigation tabs showing no hover feedback, making their click targets unclear.

## 0.11.1

### Added

- Added an Xbox PAYDAY 3 setting to remove BugSplat crash reporter files before launch.

### Fixed

- Fixed updating multi-pak mods unnecessarily re-prompting to pick files instead of reinstalling the previously selected ones, and fixed "Update All" stalling until manually resumed whenever that prompt did appear.

## 0.11.0

### Added

- Added an in-app News tab per game.
- Added Crime Boss: Rockay City support.
- Added search and an installed-only filter to the game picker.
- Added UE4SS support.

### Changed

- Improved modworkshop API request performance and pacing.

### Fixed

- Fixed empty Installed folders disappearing after their last mod was uninstalled.
- Fixed mods that ship separate .ucas/.utoc data files alongside their .pak.
- Fixed mods staying permanently unrecognized after a missed identification.
- Fixed a redundant leading "v" before mod versions in dependency and update lists.

## 0.10.0

### Added

- Added PAYDAY 2 support, including browsing, installing, enabling/disabling, and launching mods.
- Added PAYDAY: The Heist support, including DAHM and mod_overrides handling.
- Added a first-launch welcome screen for game selection.
- Added per-game settings, with migration from the previous single-game configuration.
- Added Discord and Documentation links in the UI.
- Added opt-in usage analytics with a first-run consent dialog and Settings toggle.
- Added one-click SuperBLT installation from dependency warnings.
- Added RAR archive support for mod installation.
- Added support for host-mod content packs.
- Added reinstall support for installed mods whose files are missing.
- Added Manage Files improvements, including search, batch enable/disable, cleaner filenames, and missing-file rows.

### Changed

- Renamed the app data identifier to `modrex` with migration support for existing installs.
- Replaced browser title hints with app tooltips throughout the UI.
- Improved dependency warnings for manual/offsite dependencies and SuperBLT.

### Fixed

- Fixed link-only mod dependencies opening as install errors instead of browser links.
- Fixed update badges appearing when an installed version could not be determined.
- Fixed modworkshop rate-limit issues during rapid browsing and refreshes.
- Fixed browse-page scroll reset behavior after filters, sorting, search, category, or page changes.
- Fixed swallowed install errors on the mod detail page.
- Fixed incorrect version formatting on the mod detail page.
- Fixed stale game state flashing during game switches.
- Fixed invalid game paths remaining after the game executable is removed.
- Fixed launcher selection being reset after game path validation.
- Fixed launch-without-mods behavior for BLT-based games.
- Fixed Manage Files filename display and toggle behavior.
- Fixed Settings dropdown scrolling.
- Fixed upgrade migration from the old `pd3-mod-manager` app identifier.

### Security

- Added a Content Security Policy for the app window.
- Added external URL scheme allowlisting before opening links.
- Hardened archive extraction against path traversal entries.

## 0.9.1

- Added a manual refresh button to the installed mods header
- Mod images are now cached on disk
- Added support for installing .7z and .tar.gz / .tar.xz archives
- Fixed the installed mods count showing the number of files instead of unique mods
- Performance improvements to the installed page and update detection

## 0.9.0

- **.zip mods now install directly**
- Mods with files spread across folders now appear as a single card
- Browse page is now instant when switching tabs — results are cached
- Installed page loads instantly on restart
- Sort order and sidebar state are remembered between sessions
- Launcher icons now shown in Settings
- Mods marked by their author as incompatible with mod managers can no longer be installed

## 0.8.0

- **The app has been renamed from PD3 Mod Manager to Modrex**
- Migrated from Electron to Tauri v2
- Fixed mod cards showing as permanent loading skeletons for manually placed or unrecognized pak files
- Fixed mods with multiple .pak files not accumulating correctly on install - each file now tracks independently
- Fixed installed pak files getting removed when updating a multi-file mod
- Fixed update detection incorrectly flagging mods with multiple installed versions
- Fixed folder assignment being lost when updating a mod
- Fixed missing mods appearing in the available updates list
- Fixed game path detection not accepting paths identified by launcher marker files
- Fixed launch options not showing for Steam and Epic launchers
- Added "N files" badge on Browse page mod cards when the mod is already installed with multiple files
- Added error state on mod cards when an update fails
- Removed the Reset button from the game path settings section

## 0.7.2

- Fixed Xbox Game Pass: game now launches correctly instead of opening the Xbox app
- Fixed Xbox Game Pass: game is now detected in non-default install locations
- Fixed modworkshop API errors (429) when browsing mods or opening the app with many mods installed
- Xbox: launch options field is now disabled with a note explaining how to set `-fileopenlog` in the Xbox app instead

## 0.7.1

- Fixed Xbox / Game Pass support (game now launches correctly, custom install locations are detected)
- Fixed update banner reappearing after updating mods
- Fixed Browse Mods failing to load when many mods are installed

## 0.7.0

- **Added support for Epic Games Store and Xbox Game Pass versions of PAYDAY 3**
    - The Settings page now shows a launcher selector when PAYDAY 3 is detected on multiple platforms
    - Fixed a bug where updating a mod that received a new file ID would leave the old .pak on disk and reset the mod's load order position
    - Fixed the app making failed API requests for unrecognized mods, which could cause slowdowns on the Installed tab
    - Fixed rate limiting errors when loading metadata for large mod libraries
    - Lightened the app background color

## 0.6.0

- Mod description, changelog, and downloads pages now support YouTube and Streamable video embeds — click the thumbnail to play inline
- Collapsible sections in mod descriptions now render correctly and can be expanded
- Tables and other rich formatting in mod descriptions now display properly
- Changelog is now a separate tab; Dependencies & Instructions tab is hidden when there is nothing to show
- Code blocks in mod descriptions now have syntax highlighting matching modworkshop's style
- Colored text in mod descriptions (modworkshop color tags) now renders correctly
- Downloads tab redesigned to match modworkshop's layout with per-file thumbnails
- File format and size are now shown in the install button; the file label badge moved to the file name area
- Install Files dialog redesigned to match the downloads tab style

## 0.5.1

- Added skeleton loading screens on Browse and Installed pages
- Added enable/disable toggle directly on folder headers to bulk-toggle all mods inside a folder
- Replaced the browser's default delete confirmation popup with a proper in-app dialog
- Fixed mod reorder drag-and-drop not registering on the first hover in list mode
- Fixed inconsistent gaps between mod cards and folders in grid view
- Fixed folder header buttons and toggles being misaligned
- Fixed the game running indicator getting stuck when the game exits before the first poll
- Softened the file open log warning — it's a recommendation, not a requirement

## 0.5.0

- Added subfolder support — folders can now contain other folders at any depth
- Mods with multiple installed files are now grouped as a single card with a file count badge in list view
- File labels (Main, Optional) now appear as colored badges in the install dialog
- Fixed renaming a folder in the app not renaming the actual directory on disk
- Folder names now preserve spaces and uppercase letters on disk
- Fixed mod drag indicator not appearing over button areas in list view
- Fixed folders appearing interleaved with mods after drag-and-drop reordering
- Fixed new mod installs sometimes getting a priority that conflicts with a sibling folder

## 0.4.0

- The app now shows a loading screen on startup instead of a white flash while the window initialises.
- When auto-detection can't find your PAYDAY 3 installation, the Browse page now shows a Configure in Settings link so you can set the path in one click.
- Manually selecting a game folder now validates that it is a real PAYDAY 3 installation and shows an inline error if it isn't.
- Mod identification is more reliable: the app falls back to a name-based lookup when a .pak file's SHA256 hash isn't in the index, and correctly uses the mod's version when the index entry has an empty version field.
- Fixed an edge case where manually-placed mods could be assigned no version instead of the correct one from modworkshop.
- Added an Open log file button in Settings to make it easier to attach logs to bug reports.

## 0.3.0

- Untracked .pak files dropped manually into the mods folder are now matched against a remote SHA256 index of all modworkshop PD3 mods — matched mods
  appear with their real name, cover image, and version
    - SHA256 is stored on install so mods renamed or moved on disk are re-identified automatically
    - Clicking a launch button now immediately shows a spinner and disables both buttons until the game process is detected
    - Fixed .pak files in the disabled folder not being ignored by the game — they are now renamed to .pak.disabled so UE5 skips them correctly
    - Fixed mod state being read from the wrong location during a vanilla (no-mods) session
    - Fixed game path not refreshing when the app window regains focus
    - Fixed "Launch modded" being enabled when no game path is set
    - Fixed the update modal not reopening after a manual installer is launched
    - Added a "Check for updates" button in Settings

## 0.2.3

- Update notifications now appear as a pop-up window with patch notes and an Update button
- Clicking "Later" closes the pop-up without doing anything
- While downloading an update, a thin progress bar appears at the bottom of the title bar instead of a banner
- When the update is ready to install, a "Restart & Install" button appears in the title bar

## 0.2.2

test data

## 0.2.1

- In-app update notifications — a banner appears when a new version is available
- Patch notes are shown directly in the app before you update
- Update banner can be dismissed if you don't want to update right now

## 0.2.0

- App version is now shown in the title bar
- Browse page shows stats (likes, downloads, views, last updated) for installed mods instead of just the version number
- Drag ghost image is now a mini card with the mod's thumbnail and name
- List auto-scrolls when dragging a mod near the top or bottom edge
- Fixed mod cards in the grid stretching to inconsistent heights
- Fixed User-Agent header sending a static version instead of the real one
- Added a 15-second timeout to modworkshop API requests
- Fixed window focus triggering multiple rapid refresh calls

## 0.1.1

Add updater

## 0.1.0

Initial release
