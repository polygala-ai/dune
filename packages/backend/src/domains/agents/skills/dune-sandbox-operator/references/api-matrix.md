# Sandbox RPC Method Matrix

All methods called via `python3 $DUNE_RPC_SCRIPT <method> '<params_json>'`.

## Boxes

- `sandboxes.listBoxes {}`
- `sandboxes.createBox {name, image, ...}`
- `sandboxes.getBox {boxId}`
- `sandboxes.patchBox {boxId, ...}`
- `sandboxes.deleteBox {boxId, force?}`
- `sandboxes.startBox {boxId}`
- `sandboxes.stopBox {boxId}`
- `sandboxes.getBoxStatus {boxId}`

## Exec

- `sandboxes.createExec {boxId, command, args?, env?}`
- `sandboxes.listExecs {boxId}`
- `sandboxes.getExec {boxId, execId}`
- `sandboxes.getExecEvents {boxId, execId, afterSeq?, limit?}`

## Files

- `sandboxes.uploadFiles {boxId, path, contentBase64, overwrite?}`
- `sandboxes.downloadFile {boxId, path}`
- `sandboxes.importHostPath {boxId, hostPath, destPath}`
- `sandboxes.listFs {boxId, path, includeHidden?, limit?}`
- `sandboxes.readFs {boxId, path, maxBytes?}`
- `sandboxes.mkdirFs {boxId, path}`
- `sandboxes.moveFs {boxId, from, to}`
- `sandboxes.deleteFs {boxId, path, recursive?}`

## Attach

- Not available via RPC. Terminal WebSocket is a separate transport.
