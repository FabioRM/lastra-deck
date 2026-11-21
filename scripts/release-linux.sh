#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
version=$(node -p 'require("./package.json").version')
if [ "$version" != "$(node -p 'require("./package-lock.json").version')" ]; then
    printf '%s\n' 'The package and lockfile versions differ.' >&2
    exit 1
fi
if [ -n "${1:-}" ] && [ "$1" != "v$version" ]; then
    printf '%s\n' "Expected v$version, got $1" >&2
    exit 1
fi

npm run dist:linux
bsdtar -a -cf out/lastra-wayland@fabiorm.github.io.zip -C extensions/lastra-wayland/gnome metadata.json extension.js
cd out
for file in "Lastra-$version-linux-amd64.deb" "Lastra-$version-linux-x86_64.AppImage" lastra-wayland@fabiorm.github.io.zip; do
    test -s "$file"
    sha256sum "$file" > "$file.sha256"
done
