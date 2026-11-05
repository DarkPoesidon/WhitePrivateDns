package web

import "embed"

// UIFS is the React panel built by `npm run build` in frontend/ (output: web/ui/).
// It is committed so the daemon builds with no Node toolchain, the same way the
// classic dashboard's generated files are. `all:` keeps dot-files Vite may emit.
//
//go:embed all:ui
var UIFS embed.FS
