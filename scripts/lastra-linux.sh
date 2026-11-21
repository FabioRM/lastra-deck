#!/bin/sh

program=$(dirname "$(readlink -f "$0")")/lastra-electron
if [ -n "${DISPLAY:-}" ] && [ -z "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
    if [ "${XDG_SESSION_TYPE:-}" = wayland ] || [ -n "${WAYLAND_DISPLAY:-}${WAYLAND_SOCKET:-}" ]; then
        desktops=$(printf '%s' "${XDG_CURRENT_DESKTOP:-}:${XDG_SESSION_DESKTOP:-}" | tr '[:upper:]' '[:lower:]')
        case ":$desktops:${KDE_FULL_SESSION:-}:" in
            *:gnome:*|*:kde:*|*:plasma:*|*:true:) exec "$program" "$@" --ozone-platform=x11 ;;
        esac
    fi
fi
exec "$program" "$@"
