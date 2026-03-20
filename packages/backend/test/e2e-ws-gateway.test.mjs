/**
 * End-to-end tests for the WS gateway.
 * Requires a running backend (reads .port file for ports).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import WebSocket from 'ws'

const portConfig = JSON.parse(readFileSync('./packages/backend/.port', 'utf-8'))
const CLIENT_WS = `ws://127.0.0.1:${portConfig.clientPort}/ws/client`
const AGENT_WS = `ws://127.0.0.1:${portConfig.agentPort}/ws/agent?agentId=e2e-test`

let passed = 0
let failed = 0

function assert(condition, msg) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    failed++
  } else {
    console.log(`  PASS: ${msg}`)
    passed++
  }
}

function rpcCall(wsUrl, method, params = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const id = String(Math.random())
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error(`Timeout: ${method}`))
    }, timeoutMs)

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }))
    })
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      // Skip push events, wait for the RPC response with matching id
      if (msg.id !== id) return
      clearTimeout(timer)
      ws.close()
      resolve(msg)
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function run() {
  console.log(`\nE2E WS Gateway Tests`)
  console.log(`Client WS: ${CLIENT_WS}`)
  console.log(`Agent WS:  ${AGENT_WS}\n`)

  // ── Test 1: Client can list channels ──
  console.log('Test 1: Client can list channels')
  try {
    const res = await rpcCall(CLIENT_WS, 'channels.list')
    assert(typeof res.id === 'string', 'response has an id')
    assert(Array.isArray(res.result), 'result is an array')
    assert(!res.error, 'no error')
  } catch (err) {
    assert(false, `channels.list failed: ${err.message}`)
  }

  // ── Test 2: Client can list agents ──
  console.log('Test 2: Client can list agents')
  try {
    const res = await rpcCall(CLIENT_WS, 'agents.list')
    assert(Array.isArray(res.result), 'result is an array')
  } catch (err) {
    assert(false, `agents.list failed: ${err.message}`)
  }

  // ── Test 3: Client can get claude settings ──
  console.log('Test 3: Client can get claude settings')
  try {
    const res = await rpcCall(CLIENT_WS, 'settings.getClaude')
    assert(res.result !== null && typeof res.result === 'object', 'result is an object')
    assert(!res.error, 'no error')
  } catch (err) {
    assert(false, `settings.getClaude failed: ${err.message}`)
  }

  // ── Test 4: Client can get admin plane info ──
  console.log('Test 4: Client can get admin plane info')
  try {
    const res = await rpcCall(CLIENT_WS, 'settings.getAdminPlane')
    assert(typeof res.result?.hostOperatorAdminBaseUrl === 'string', 'has admin URL')
  } catch (err) {
    assert(false, `settings.getAdminPlane failed: ${err.message}`)
  }

  // ── Test 5: Unknown method returns error ──
  console.log('Test 5: Unknown method returns error')
  try {
    const res = await rpcCall(CLIENT_WS, 'nonexistent.method')
    assert(res.error, 'has error')
    assert(res.error.code === -32601, 'error code is METHOD_NOT_FOUND')
  } catch (err) {
    assert(false, `nonexistent.method failed: ${err.message}`)
  }

  // ── Test 6: Agent gateway allows channels.list ──
  console.log('Test 6: Agent gateway allows channels.list')
  try {
    const res = await rpcCall(AGENT_WS, 'channels.list')
    assert(Array.isArray(res.result), 'result is an array')
  } catch (err) {
    assert(false, `agent channels.list failed: ${err.message}`)
  }

  // ── Test 7: Agent gateway allows agents.submitHostOperator ──
  console.log('Test 7: Agent gateway allows agents.submitHostOperator')
  try {
    const res = await rpcCall(AGENT_WS, 'agents.submitHostOperator', { id: 'e2e-test', kind: 'status' })
    // Method is allowed — may return app-level error (e.g. agent not found), but not -32601
    assert(!res.error || res.error.code !== -32601, 'method is reachable (not METHOD_NOT_FOUND)')
  } catch (err) {
    assert(false, `agent agents.submitHostOperator failed: ${err.message}`)
  }

  // ── Test 8: Agent gateway allows agents.getHostOperator ──
  console.log('Test 8: Agent gateway allows agents.getHostOperator')
  try {
    const res = await rpcCall(AGENT_WS, 'agents.getHostOperator', { requestId: 'nonexistent' })
    assert(!res.error || res.error.code !== -32601, 'method is reachable (not METHOD_NOT_FOUND)')
  } catch (err) {
    assert(false, `agent agents.getHostOperator failed: ${err.message}`)
  }

  // ── Test 9: Agent gateway allows slack.getSettings ──
  console.log('Test 9: Agent gateway allows slack.getSettings')
  try {
    const res = await rpcCall(AGENT_WS, 'slack.getSettings')
    assert(!res.error || res.error.code !== -32601, 'method is reachable')
  } catch (err) {
    assert(false, `agent slack.getSettings failed: ${err.message}`)
  }

  // ── Test 10: Agent gateway allows sandboxes.listBoxes ──
  console.log('Test 10: Agent gateway allows sandboxes.listBoxes')
  try {
    const res = await rpcCall(AGENT_WS, 'sandboxes.listBoxes')
    assert(!res.error || res.error.code !== -32601, 'method is reachable')
  } catch (err) {
    assert(false, `agent sandboxes.listBoxes failed: ${err.message}`)
  }

  // ── Test 11: Agent gateway allows todos.list ──
  console.log('Test 11: Agent gateway allows todos.list')
  try {
    const res = await rpcCall(AGENT_WS, 'todos.list', { agentId: 'e2e-test' })
    assert(!res.error || res.error.code !== -32601, 'method is reachable')
  } catch (err) {
    assert(false, `agent todos.list failed: ${err.message}`)
  }

  // ── Test 12: media.uploadImage — valid upload ──
  console.log('Test 12: media.uploadImage valid upload')
  try {
    // 1x1 red PNG
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    const res = await rpcCall(AGENT_WS, 'media.uploadImage', { mimeType: 'image/png', contentBase64: pngBase64 })
    assert(!res.error, 'no error')
    assert(typeof res.result?.url === 'string', 'result has url')
    assert(res.result.url.startsWith('/media/'), 'url starts with /media/')
    assert(res.result.url.endsWith('.png'), 'url ends with .png')
  } catch (err) {
    assert(false, `media.uploadImage failed: ${err.message}`)
  }

  // ── Test 13: media.uploadImage — invalid mime type ──
  console.log('Test 13: media.uploadImage rejects invalid mime')
  try {
    const res = await rpcCall(AGENT_WS, 'media.uploadImage', { mimeType: 'application/pdf', contentBase64: 'AAAA' })
    assert(res.error, 'has error for invalid mime')
  } catch (err) {
    assert(false, `media.uploadImage mime test failed: ${err.message}`)
  }

  // ── Test 14–25: Agent gateway blocks methods NOT in allowlist ──
  const blockedMethods = [
    ['admin.listPendingHostOp', {}],
    ['admin.decideHostOp', { requestId: 'x', decision: 'reject' }],
    ['admin.listHostOpApps', {}],
    ['settings.getClaude', {}],
    ['settings.updateClaude', {}],
    ['settings.getAdminPlane', {}],
    ['agents.listGrants', { agentId: 'x' }],
    ['agents.upsertGrant', { agentId: 'x', kind: 'app', value: 'x' }],
    ['agents.deleteGrant', { agentId: 'x', kind: 'app', value: 'x' }],
    ['agents.update', { id: 'x' }],
    ['agents.delete', { id: 'x' }],
    ['agents.startAll', {}],
    ['agents.stopAll', {}],
    ['agents.redeployDaemons', {}],
    ['agents.exec', { id: 'x', cmd: 'echo' }],
    ['agents.listMounts', { id: 'x' }],
    ['agents.createMount', { id: 'x' }],
    ['agents.listMemory', { agentId: 'x' }],
    ['agents.listApps', { agentId: 'x' }],
    ['messages.get', { id: 'x' }],
  ]

  let testNum = 14
  for (const [method, params] of blockedMethods) {
    console.log(`Test ${testNum}: Agent gateway blocks ${method}`)
    try {
      const res = await rpcCall(AGENT_WS, method, params)
      assert(res.error?.code === -32601, `${method} returns METHOD_NOT_FOUND`)
    } catch (err) {
      assert(false, `${method} blocked test failed: ${err.message}`)
    }
    testNum++
  }

  // ── Test: Client gateway rejects /ws/agent path ──
  console.log(`Test ${testNum}: Client gateway rejects /ws/agent path`)
  try {
    const res = await rpcCall(`ws://127.0.0.1:${portConfig.clientPort}/ws/agent?agentId=test`, 'channels.list')
    assert(false, 'should have been rejected')
  } catch (err) {
    assert(true, `correctly rejected: ${err.message}`)
  }
  testNum++

  // ── Test: Agent gateway rejects /ws/client path ──
  console.log(`Test ${testNum}: Agent gateway rejects /ws/client path`)
  try {
    const res = await rpcCall(`ws://127.0.0.1:${portConfig.agentPort}/ws/client`, 'channels.list')
    assert(false, 'should have been rejected')
  } catch (err) {
    assert(true, `correctly rejected: ${err.message}`)
  }
  testNum++

  // ── Test: Create and delete a channel via RPC ──
  console.log(`Test ${testNum}: Create and delete a channel via RPC`)
  try {
    const createRes = await rpcCall(CLIENT_WS, 'channels.create', { name: `e2e-test-${Date.now()}` })
    assert(createRes.result?.id, 'channel created with id')
    const channelId = createRes.result.id

    const deleteRes = await rpcCall(CLIENT_WS, 'channels.delete', { id: channelId })
    assert(deleteRes.result?.ok === true, 'channel deleted')
  } catch (err) {
    assert(false, `channel create/delete failed: ${err.message}`)
  }
  testNum++

  // ── Test: Invalid JSON returns parse error ──
  console.log(`Test ${testNum}: Invalid JSON returns parse error`)
  try {
    const result = await new Promise((resolve, reject) => {
      const ws = new WebSocket(CLIENT_WS)
      const timer = setTimeout(() => { ws.close(); reject(new Error('Timeout')) }, 5000)
      ws.on('open', () => { ws.send('not json at all') })
      ws.on('message', (data) => {
        clearTimeout(timer)
        ws.close()
        resolve(JSON.parse(data.toString()))
      })
      ws.on('error', (err) => { clearTimeout(timer); reject(err) })
    })
    assert(result.error?.code === -32700, 'parse error code')
  } catch (err) {
    assert(false, `parse error test failed: ${err.message}`)
  }
  testNum++

  // ── Test: Health endpoint on both ports ──
  console.log(`Test ${testNum}: Health endpoint on both ports`)
  try {
    const agentHealth = await fetch(`http://127.0.0.1:${portConfig.agentPort}/health`).then(r => r.json())
    assert(agentHealth.status === 'ok', 'agent health ok')
    const clientHealth = await fetch(`http://127.0.0.1:${portConfig.clientPort}/health`).then(r => r.json())
    assert(clientHealth.status === 'ok', 'client health ok')
  } catch (err) {
    assert(false, `health check failed: ${err.message}`)
  }
  testNum++

  // ── Test: No DUNE_AGENT_URL in skill scripts ──
  console.log(`Test ${testNum}: No DUNE_AGENT_URL in skill scripts`)
  try {
    const skillsDir = './packages/backend/src/agent-skills'
    let found = []
    function scanDir(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) scanDir(full)
        else if (entry.name.endsWith('.sh')) {
          const content = readFileSync(full, 'utf-8')
          if (content.includes('DUNE_AGENT_URL')) found.push(full)
        }
      }
    }
    scanDir(skillsDir)
    assert(found.length === 0, `no DUNE_AGENT_URL refs (found: ${found.join(', ') || 'none'})`)
  } catch (err) {
    assert(false, `skill bundle check failed: ${err.message}`)
  }
  testNum++

  // ── Test: No curl calls to backend in skill scripts ──
  console.log(`Test ${testNum}: No curl calls to backend in skill scripts`)
  try {
    const skillsDir = './packages/backend/src/agent-skills'
    let found = []
    function scanDirCurl(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) scanDirCurl(full)
        else if (entry.name.endsWith('.sh')) {
          const content = readFileSync(full, 'utf-8')
          if (/\bcurl\b/.test(content)) found.push(full)
        }
      }
    }
    scanDirCurl(skillsDir)
    assert(found.length === 0, `no curl calls in skills (found: ${found.join(', ') || 'none'})`)
  } catch (err) {
    assert(false, `curl check failed: ${err.message}`)
  }

  // ── Summary ──
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
