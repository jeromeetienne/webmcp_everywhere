#!/usr/bin/env bash
#
# The executable Chrome starts for the native messaging host.
#
# Chrome reads the path of this file from the host manifest that `tools/install_native_host.ts`
# writes, and starts it with a very small environment. So the script holds no absolute path of its
# own: it works the repository root out from its own location, and it looks for a Node.js instead of
# naming one. The whole program is one `exec`, because Chrome talks to the process it starts over
# standard input and standard output, and any extra process in between would break that.

set -euo pipefail

# The directory of this file, then the repository root one level above it, then the host program.
# `BASH_SOURCE` is used rather than `$0`, so the paths stay right when the file is sourced.
scriptDir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repoRoot="$(cd -- "${scriptDir}/.." && pwd)"
hostScript="${repoRoot}/packages/native_messaging_host/src/webmcp_native_host.ts"

# Answers whether a Node.js runs the host program, which is TypeScript.
#
# Node.js strips TypeScript types on its own from version 22.18.0, and always from version 23.0.0.
# An older Node.js refuses the host program with ERR_UNKNOWN_FILE_EXTENSION, so it is not usable.
#
# $1 - the path of the Node.js binary to test.
runsTypescript() {
	local candidate="$1"
	local version major minor
	version="$("${candidate}" --version 2>/dev/null)" || return 1
	version="${version#v}"
	major="${version%%.*}"
	version="${version#*.}"
	minor="${version%%.*}"
	if [ "${major}" -ge 23 ]; then
		return 0
	fi
	if [ "${major}" -eq 22 ] && [ "${minor}" -ge 18 ]; then
		return 0
	fi
	return 1
}

# Prints the first usable Node.js, or fails when there is none.
#
# The Node.js of the surrounding shell comes first, because that is the one the repository was
# installed with. The three fixed paths after it are the places Node.js is installed on macOS and on
# Linux, and they are what makes this work under the small environment Chrome gives the host.
findNode() {
	local candidate
	for candidate in \
		"$(command -v node 2>/dev/null || true)" \
		/opt/homebrew/bin/node \
		/usr/local/bin/node \
		/usr/bin/node; do
		if [ -n "${candidate}" ] && [ -x "${candidate}" ] && runsTypescript "${candidate}"; then
			echo "${candidate}"
			return 0
		fi
	done
	return 1
}

# The message goes to standard error, never to standard output, which belongs to Chrome alone.
nodeBinary="$(findNode)" || {
	echo "native_messaging_host.sh: found no Node.js 22.18.0 or later" >&2
	exit 1
}

exec "${nodeBinary}" "${hostScript}" "$@"
