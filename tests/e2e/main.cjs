// Test-only entry point: isolate Electron state, then start the real built main process.
//
// The production build is untouched: we point `userData` at a throw-away directory before
// loading the entry declared by `package.json.main`, so covers, caches, settings and Chromium
// profile data never leak into the developer's real profile.
const { app } = require('electron')
const path = require('node:path')

const userData = process.env.LYRIX_E2E_USER_DATA
if (!userData) throw new Error('LYRIX_E2E_USER_DATA is required')

app.setPath('userData', userData)

const repoRoot = path.resolve(__dirname, '..', '..')
const mainEntry = require(path.join(repoRoot, 'package.json')).main
require(path.resolve(repoRoot, mainEntry))
