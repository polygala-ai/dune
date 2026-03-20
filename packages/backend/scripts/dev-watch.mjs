#!/usr/bin/env node
/**
 * Custom dev watch script that logs which file triggers each restart.
 * Replaces `tsx --watch` to diagnose spurious restart issues.
 */
import { spawn } from 'node:child_process'
import { watch, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = resolve(ROOT, 'src')
const ENV_FILE = resolve(ROOT, '..', '..', '.env')

let child = null
let restarting = false
let debounceTimer = null

function start() {
  console.log('[watch] Starting backend...')
  child = spawn(
    process.execPath,
    [
      '--require', resolve(ROOT, 'node_modules/tsx/dist/preflight.cjs'),
      '--import', `file://${resolve(ROOT, 'node_modules/tsx/dist/loader.mjs')}`,
      ...(existsSync(ENV_FILE) ? [`--env-file=${ENV_FILE}`] : []),
      'src/index.ts',
    ],
    { stdio: 'inherit', cwd: ROOT },
  )

  child.on('exit', (code, signal) => {
    child = null
    if (!restarting) {
      console.log(`[watch] Process exited (code=${code}, signal=${signal})`)
      process.exit(code ?? 1)
    }
  })
}

function restart(event, filename) {
  // Debounce 200ms so rapid changes don't spawn multiple restarts
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (restarting) return
    restarting = true
    console.log(`\n[watch] ★ File changed → ${event} src/${filename}`)
    console.log(`[watch]   Restarting...`)
    if (child) {
      child.once('exit', () => {
        restarting = false
        start()
      })
      child.kill('SIGTERM')
      // Force-kill after 5s if graceful shutdown stalls
      setTimeout(() => {
        if (child) {
          console.log('[watch] Force-killing stale process')
          child.kill('SIGKILL')
        }
      }, 5000)
    } else {
      restarting = false
      start()
    }
  }, 200)
}

// Watch src/ recursively — these trigger restarts
watch(SRC, { recursive: true }, (event, filename) => {
  if (!filename) return
  if (filename.includes('node_modules') || filename.startsWith('.')) return
  restart(event, filename)
})

// Spy on broader directories (log-only, no restart) to help diagnose tsx --watch issues
watch(ROOT, { recursive: false }, (event, filename) => {
  if (!filename || filename === 'node_modules' || filename.startsWith('.')) return
  console.log(`[watch] (spy) ${event} ${filename}  ← outside src/, NOT restarting`)
})

// Handle signals
process.on('SIGINT', () => { child?.kill('SIGTERM'); process.exit(0) })
process.on('SIGTERM', () => { child?.kill('SIGTERM'); process.exit(0) })

start()
