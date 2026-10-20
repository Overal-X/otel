#!/usr/bin/env bash
# Usage: release.sh <package version> <file>...
# Creates the GitHub release for the pushed <language>/v<version> tag with the given files. The
# notes and SHA256SUMS list each file's checksum, which Formatio pins for the files its builds
# download.
set -euo pipefail

version=$1
shift
tag=$GITHUB_REF_NAME
if [ "${tag#*/v}" != "$version" ]; then
	echo "tag $tag does not match the package version $version" >&2
	exit 1
fi

sums=$(mktemp -d)/SHA256SUMS
sha256sum "$@" | sed 's#  .*/#  #' >"$sums"

gh release create "$tag" "$@" "$sums" --verify-tag --title "$tag" --notes "SHA-256:

\`\`\`
$(cat "$sums")
\`\`\`"
