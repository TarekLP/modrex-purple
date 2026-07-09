#!/usr/bin/env bash
# Installs via apt/dnf/zypper when available, so updates go through the normal
# package-manager upgrade path; otherwise falls back to a self-contained AppImage.
set -euo pipefail

REPO="modrexio/modrex"
BASE_URL="https://github.com/$REPO/releases/latest/download"

# $0 is just "bash" when piped via curl, so a literal "$0 uninstall" hint is useless there
if [ -f "$0" ]; then
    UNINSTALL_HINT="$0 uninstall"
else
    UNINSTALL_HINT="curl -fsSL https://raw.githubusercontent.com/$REPO/main/scripts/install.sh | bash -s -- uninstall"
fi

log() { printf '%s\n' "$*" >&2; }
die() {
    log "error: $*"
    exit 1
}

ACTION="install"
PURGE=0
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
    install) ACTION="install" ;;
    uninstall) ACTION="uninstall" ;;
    --purge) PURGE=1 ;;
    -y | --yes) ASSUME_YES=1 ;;
    -h | --help)
        printf 'Usage: %s [uninstall [--purge]] [-y]\n' "$0"
        exit 0
        ;;
    *) die "unknown argument: $arg (usage: $0 [uninstall [--purge]] [-y])" ;;
    esac
done
[ "$PURGE" -eq 1 ] && [ "$ACTION" != "uninstall" ] && die "--purge only applies to uninstall"

confirm() {
    [ "$ASSUME_YES" -eq 1 ] && return 0
    local reply=""
    if [ -t 0 ]; then
        read -r -p "$1 [y/N] " reply || reply=""
    elif { : </dev/tty; } 2>/dev/null; then
        read -r -p "$1 [y/N] " reply </dev/tty || reply=""
    else
        die "refusing to proceed without confirmation in a non-interactive shell — rerun with -y"
    fi
    case "$reply" in
    [Yy]*) return 0 ;;
    *) return 1 ;;
    esac
}

SUDO=""
require_sudo() {
    [ "$(id -u)" -eq 0 ] && return
    command -v sudo >/dev/null 2>&1 || die "sudo is required for this operation"
    SUDO="sudo"
}

[ "$(uname -s)" = "Linux" ] || die "this installer is for Linux only"
[ "$(uname -m)" = "x86_64" ] || die "unsupported architecture: $(uname -m) (only x86_64 builds are published)"
command -v curl >/dev/null 2>&1 || die "curl is required"

PKG_MANAGER=""
command -v apt-get >/dev/null 2>&1 && PKG_MANAGER="apt"
[ -z "$PKG_MANAGER" ] && command -v dnf >/dev/null 2>&1 && PKG_MANAGER="dnf"
[ -z "$PKG_MANAGER" ] && command -v zypper >/dev/null 2>&1 && PKG_MANAGER="zypper"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

resolve_version() {
    local url
    url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest") ||
        die "could not reach GitHub releases"
    printf '%s' "${url##*/}"
}

install_appimage() {
    local version="$1"
    log "No apt/dnf/zypper found — installing the portable AppImage"
    log "Downloading modrex_x86_64.AppImage ($version)..."

    local appimage="$tmpdir/modrex.AppImage"
    curl -fL --progress-bar -o "$appimage" "$BASE_URL/modrex_x86_64.AppImage"
    chmod +x "$appimage"

    log "Extracting desktop integration assets..."
    (cd "$tmpdir" && ./modrex.AppImage --appimage-extract >/dev/null)
    local extracted="$tmpdir/squashfs-root"
    [ -d "$extracted" ] || die "AppImage extraction failed"

    local desktop_src icon_src icon_ext
    desktop_src=$(find "$extracted" -maxdepth 1 -name "*.desktop" -print -quit)
    icon_src=$(find "$extracted" -maxdepth 1 \( -name "*.png" -o -name "*.svg" \) -print -quit)
    [ -n "$desktop_src" ] || die "no .desktop file found inside the AppImage"
    [ -n "$icon_src" ] || die "no icon found inside the AppImage"
    icon_ext="${icon_src##*.}"

    log "Installing to ~/.local/bin and registering the app launcher entry..."
    mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons"
    mv "$appimage" "$HOME/.local/bin/modrex"
    chmod +x "$HOME/.local/bin/modrex"
    cp "$icon_src" "$HOME/.local/share/icons/modrex.$icon_ext"

    sed -e "s|^Exec=.*|Exec=$HOME/.local/bin/modrex %U|" \
        -e "s|^Icon=.*|Icon=$HOME/.local/share/icons/modrex.$icon_ext|" \
        "$desktop_src" >"$HOME/.local/share/applications/modrex.desktop"

    command -v update-desktop-database >/dev/null 2>&1 &&
        update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1

    log ""
    log "Installed modrex $version."
    log "  Binary:    $HOME/.local/bin/modrex"
    log "  Desktop:   $HOME/.local/share/applications/modrex.desktop"
    log "  Icon:      $HOME/.local/share/icons/modrex.$icon_ext"
    log "  Uninstall: $UNINSTALL_HINT"
    case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) log "Note: ~/.local/bin is not on your PATH — add it to your shell profile to run 'modrex' from a terminal." ;;
    esac
}

do_install() {
    log "Resolving latest release..."
    local version
    version=$(resolve_version)
    log "Latest release: $version"

    case "$PKG_MANAGER" in
    apt)
        log "Detected apt — installing the .deb package"
        log "Downloading modrex_x86_64.deb ($version)..."
        curl -fL --progress-bar -o "$tmpdir/modrex.deb" "$BASE_URL/modrex_x86_64.deb"
        require_sudo
        log "Installing via apt-get..."
        $SUDO apt-get install -y "$tmpdir/modrex.deb"
        log ""
        log "Installed modrex $version via apt."
        log "  Uninstall: sudo apt remove modrex"
        ;;
    dnf)
        log "Detected dnf — installing the .rpm package"
        log "Downloading modrex_x86_64.rpm ($version)..."
        curl -fL --progress-bar -o "$tmpdir/modrex.rpm" "$BASE_URL/modrex_x86_64.rpm"
        require_sudo
        log "Installing via dnf..."
        $SUDO dnf install -y "$tmpdir/modrex.rpm"
        log ""
        log "Installed modrex $version via dnf."
        log "  Uninstall: sudo dnf remove modrex"
        ;;
    zypper)
        log "Detected zypper — installing the .rpm package"
        log "Downloading modrex_x86_64.rpm ($version)..."
        curl -fL --progress-bar -o "$tmpdir/modrex.rpm" "$BASE_URL/modrex_x86_64.rpm"
        require_sudo
        log "Installing via zypper..."
        $SUDO zypper --non-interactive install "$tmpdir/modrex.rpm"
        log ""
        log "Installed modrex $version via zypper."
        log "  Uninstall: sudo zypper remove modrex"
        ;;
    *)
        install_appimage "$version"
        ;;
    esac

    log ""
    log "Launch Modrex from your app menu, or run 'modrex'."
}

do_uninstall() {
    if command -v dpkg >/dev/null 2>&1 && dpkg -s modrex >/dev/null 2>&1; then
        confirm "Remove the modrex apt package?" || die "aborted"
        require_sudo
        $SUDO apt-get remove -y modrex
        log "Removed the modrex apt package."
    elif command -v rpm >/dev/null 2>&1 && rpm -q modrex >/dev/null 2>&1; then
        confirm "Remove the modrex rpm package?" || die "aborted"
        require_sudo
        if command -v dnf >/dev/null 2>&1; then
            $SUDO dnf remove -y modrex
        elif command -v zypper >/dev/null 2>&1; then
            $SUDO zypper --non-interactive remove modrex
        else
            $SUDO rpm -e modrex
        fi
        log "Removed the modrex rpm package."
    elif [ -e "$HOME/.local/bin/modrex" ]; then
        confirm "Remove modrex from ~/.local/bin and its app launcher entry?" || die "aborted"
        rm -f "$HOME/.local/bin/modrex"
        rm -f "$HOME/.local/share/applications/modrex.desktop"
        rm -f "$HOME"/.local/share/icons/modrex.*
        command -v update-desktop-database >/dev/null 2>&1 &&
            update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1
        log "Removed modrex from ~/.local/bin."
    else
        die "modrex does not appear to be installed"
    fi

    if [ "$PURGE" -eq 1 ]; then
        confirm "Also remove settings, mod index, and cache (~/.config/modrex, ~/.cache/modrex)?" || die "aborted"
        for dir in "$HOME/.config/modrex" "$HOME/.cache/modrex" "$HOME/.local/share/modrex"; do
            [ -d "$dir" ] || continue
            rm -rf "$dir"
            log "Removed $dir"
        done
    fi

    log "Uninstall complete."
}

case "$ACTION" in
install) do_install ;;
uninstall) do_uninstall ;;
esac
