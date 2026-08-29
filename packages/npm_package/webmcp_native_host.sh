#!/usr/bin/env bash
#
# The executable Chrome starts for the native messaging host, in a packaged release.
#
# Chrome reads the path of this file from the host manifest the installer writes, and starts it with
# a very small environment. So the script holds no absolute path of its own: it finds the bundled
# host beside itself, and it looks for a Node.js instead of naming one. The whole program is one
# `exec`, because Chrome talks to the process it starts over standard input and standard output, and
# any extra process in between would break that.

set -euo pipefail

scriptDir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
hostBundle="${scriptDir}/webmcp_native_host.mjs"

# Answers whether a Node.js can run the bundled host, which is an ECMAScript module.
runsTheHost() {
	local candidate="$1"
	local version major
	version="$("${candidate}" --version 2>/dev/null)" || return 1
	version="${version#v}"
	major="${version%%.*}"
	if [ "${major}" -ge 20 ]; then
		return 0
	fi
	return 1
}

# Prints the first usable Node.js, or fails when there is none.
findNode() {
	local candidate
	for candidate in \
		"$(command -v node 2>/dev/null || true)" \
		/opt/homebrew/bin/node \
		/usr/local/bin/node \
		/usr/bin/node; do
		if [ -n "${candidate}" ] && [ -x "${candidate}" ] && runsTheHost "${candidate}"; then
			echo "${candidate}"
			return 0
		fi
	done
	return 1
}

# The message goes to standard error, never to standard output, which belongs to Chrome alone.
nodeBinary="$(findNode)" || {
	echo "webmcp_native_host.sh: found no Node.js 20 or later" >&2
	exit 1
}

exec "${nodeBinary}" "${hostBundle}" "$@"
