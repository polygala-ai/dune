# Host Operator Workflows

## 1) Inspect an allowed app

```bash
scripts/host-status.sh
scripts/host-overview.sh com.apple.Safari
scripts/host-perceive.sh accessibility com.apple.Safari
```

## 2) Capture UI + screenshot

```bash
scripts/host-perceive.sh composite com.apple.Safari
```

Composite results may include artifact paths under `/config/.dune/system/host-operator/`.

## 3) Perform a host action

```bash
scripts/host-act.sh '{"action":"focus","bundleId":"com.apple.Safari"}'
scripts/host-act.sh '{"action":"click","bundleId":"com.apple.Safari","point":{"x":320,"y":240}}'
scripts/host-act.sh '{"action":"type","bundleId":"com.apple.Safari","text":"hello world"}'
```

## 4) Navigate a browser to a URL

```bash
scripts/host-act.sh '{"action":"navigate","bundleId":"com.apple.Safari","url":"https://example.com"}'
scripts/host-act.sh '{"action":"navigate","bundleId":"com.apple.Safari","url":"https://example.com","wait":5}'
```

Navigate sends Cmd+L to focus the address bar, types the URL, then presses Enter. The optional `wait` parameter (default 2s, max 10s) controls how long to wait for the page to load before returning.

## 5) Use allowed filesystem paths

```bash
scripts/host-fs.sh '{"op":"list","path":"/Users/admin/Documents"}'
scripts/host-fs.sh '{"op":"search","path":"/Users/admin/Documents","query":"roadmap"}'
scripts/host-fs.sh '{"op":"write","path":"/Users/admin/Documents/note.txt","content":"updated by dune"}'
```

All host-operator requests block until they reach a terminal state. In the default approval-required mode that means waiting for human admin approval; agents configured to dangerously skip permissions run immediately after backend allowlist validation.
