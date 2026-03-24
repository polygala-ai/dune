#!/usr/bin/env python3
"""MCP server that proxies rescreen tool calls to the Dune backend via WebSocket RPC.

Runs inside the agent container. Exposes rescreen's 5 MCP tools and routes all
requests through the backend gateway for approval/grant enforcement.

Environment variables:
  DUNE_WS_URL  — WebSocket URL to backend (e.g. ws://host:3100/ws/agent?agentId=XXX)
  AGENT_ID     — The agent's ID (used in RPC payloads)
"""
import json
import os
import sys
import uuid

# ── WebSocket RPC client (inlined from rpc.py) ──────────────────────────────

try:
    import websocket  # websocket-client
except ImportError:
    import asyncio
    try:
        import websockets
    except ImportError:
        websockets = None

    if websockets:
        async def _async_call(url, method, params):
            async with websockets.connect(url, max_size=None) as ws:
                msg = json.dumps({"id": str(uuid.uuid4()), "method": method, "params": params})
                await ws.send(msg)
                raw = await ws.recv()
                return json.loads(raw)

        def rpc_call(url, method, params):
            return asyncio.run(_async_call(url, method, params))
    else:
        def rpc_call(url, method, params):
            raise RuntimeError("No websocket library available (need websocket-client or websockets)")
else:
    def rpc_call(url, method, params):
        ws = websocket.create_connection(url, timeout=120)
        try:
            msg = json.dumps({"id": str(uuid.uuid4()), "method": method, "params": params})
            ws.send(msg)
            raw = ws.recv()
            return json.loads(raw)
        finally:
            ws.close()


# ── Tool definitions (matching rescreen's exact schemas) ─────────────────────

TOOLS = [
    {
        "name": "rescreen_perceive",
        "description": "Capture the accessibility tree or screenshot of a permitted application window. Returns structured UI elements with roles, names, values, and states.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["accessibility", "screenshot", "composite", "find"],
                    "description": "Perception type. 'accessibility' returns structured UI tree (preferred). 'screenshot' returns a PNG image. 'composite' returns both. 'find' searches for elements by name/role.",
                },
                "target": {
                    "type": "string",
                    "description": "App bundle ID, e.g. 'com.microsoft.VSCode'. If omitted, uses the default permitted app.",
                },
                "max_depth": {"type": "integer", "description": "Maximum tree depth (default: 8)"},
                "max_nodes": {"type": "integer", "description": "Maximum nodes to return (default: 300)"},
                "query": {"type": "string", "description": "Search query for 'find' type — matches element names and values"},
                "role": {"type": "string", "description": "Filter by element role for 'find' type (e.g. 'button', 'textField')"},
            },
            "required": ["type"],
        },
    },
    {
        "name": "rescreen_act",
        "description": "Perform an action on a permitted application. Supports click, double_click, right_click, hover, drag, type, press (keyboard shortcuts), scroll, navigate (go to URL in browser), focus, launch, close, clipboard_read, clipboard_write, and url. Use 'actions' array to batch multiple actions in one call. Prefer element-based targeting over coordinates.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["click", "double_click", "right_click", "hover", "drag", "type", "press", "scroll", "select", "navigate", "focus", "launch", "close", "clipboard_read", "clipboard_write", "url"],
                    "description": "Action type",
                },
                "target": {"type": "string", "description": "App bundle ID"},
                "element": {"type": "string", "description": "Element ID from the a11y tree (e.g. 'e14'). Preferred over coordinates."},
                "value": {"type": "string", "description": "Text to type (for 'type' action) or clipboard content (for 'clipboard_write')"},
                "keys": {"type": "string", "description": "Key combo (for 'press'), e.g. 'cmd+s'"},
                "position": {
                    "type": "object",
                    "description": "Window-relative coordinates {x, y} (fallback for click/double_click/right_click/hover)",
                    "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
                },
                "from": {
                    "type": "object",
                    "description": "Drag start position {x, y} (window-relative)",
                    "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
                },
                "to": {
                    "type": "object",
                    "description": "Drag end position {x, y} (window-relative)",
                    "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
                },
                "direction": {"type": "string", "enum": ["up", "down", "left", "right"]},
                "amount": {"type": "integer", "description": "Scroll lines (default: 3)"},
                "duration": {"type": "number", "description": "Drag duration in seconds (default: 0.3)"},
                "wait": {"type": "number", "description": "Seconds to wait after navigate (default: 2, max: 10)"},
                "actions": {
                    "type": "array",
                    "description": "Batch mode: array of action objects to execute sequentially (max 20).",
                    "items": {"type": "object"},
                },
            },
        },
    },
    {
        "name": "rescreen_overview",
        "description": "List all application windows the agent has permission to see.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "rescreen_status",
        "description": "Show current session info, active capability grants, and permitted applications.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "rescreen_filesystem",
        "description": "Perform scoped filesystem operations. Access is limited to allowed paths. Supports read, write, list, delete, metadata, and search.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["read", "write", "list", "delete", "metadata", "search"],
                    "description": "Filesystem operation",
                },
                "path": {"type": "string", "description": "File or directory path"},
                "content": {"type": "string", "description": "Content to write (for 'write' operation)"},
                "pattern": {"type": "string", "description": "Search pattern (for 'search' operation)"},
                "recursive": {"type": "boolean", "description": "Recurse into subdirectories (for 'list')"},
                "max_entries": {"type": "integer", "description": "Max entries to return (default: 200)"},
                "max_results": {"type": "integer", "description": "Max search results (default: 50)"},
            },
            "required": ["operation", "path"],
        },
    },
]

# Map tool names to the 'kind' field for the RPC payload
TOOL_KIND_MAP = {
    "rescreen_perceive": "perceive",
    "rescreen_act": "act",
    "rescreen_overview": "overview",
    "rescreen_status": "status",
    "rescreen_filesystem": "filesystem",
}


# ── MCP protocol handling ────────────────────────────────────────────────────

def write_response(response):
    """Write a JSON-RPC response to stdout."""
    data = json.dumps(response, separators=(",", ":"))
    sys.stdout.write(data + "\n")
    sys.stdout.flush()


def handle_initialize(request):
    return {
        "jsonrpc": "2.0",
        "id": request.get("id"),
        "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "host-computer-use", "version": "0.1.0"},
        },
    }


def handle_tools_list(request):
    return {
        "jsonrpc": "2.0",
        "id": request.get("id"),
        "result": {"tools": TOOLS},
    }


def _translate_params(kind, args, agent_id):
    """Translate rescreen param names → current Dune helper format."""
    p = {"id": agent_id, "kind": kind}

    if kind == "perceive":
        # rescreen: type, target, max_depth, max_nodes, query, role
        # dune:     mode, bundleId, query, windowId
        if "type" in args:
            p["mode"] = args["type"]
        if "target" in args:
            p["bundleId"] = args["target"]
        for k in ("query", "windowId"):
            if k in args:
                p[k] = args[k]

    elif kind == "act":
        # rescreen: type, target, element, value, keys, position, from, to,
        #           direction, amount, duration, wait, actions
        # dune:     action, bundleId, point, toPoint, text, key, deltaX, deltaY, url
        if "type" in args:
            p["action"] = args["type"]
        if "target" in args:
            p["bundleId"] = args["target"]
        if "value" in args:
            p["text"] = args["value"]
        if "keys" in args:
            p["key"] = args["keys"]
        if "position" in args:
            p["point"] = args["position"]
        if "from" in args:
            p["point"] = args["from"]
        if "to" in args:
            p["toPoint"] = args["to"]
        if "direction" in args or "amount" in args:
            direction = args.get("direction", "down")
            amount = args.get("amount", 3)
            if direction in ("up", "down"):
                p["deltaY"] = -amount if direction == "up" else amount
            else:
                p["deltaX"] = -amount if direction == "left" else amount
            # scroll needs a point — use (0,0) as default if not given
            if "point" not in p:
                p["point"] = {"x": 0, "y": 0}
        for k in ("url", "duration", "wait", "windowId"):
            if k in args:
                p[k] = args[k]

    elif kind == "overview":
        if "target" in args:
            p["bundleId"] = args["target"]

    elif kind == "status":
        pass

    elif kind == "filesystem":
        # rescreen: operation, path, content, pattern, recursive, max_entries, max_results
        # dune:     op, path, content, query
        if "operation" in args:
            p["op"] = args["operation"]
        if "path" in args:
            p["path"] = args["path"]
        if "content" in args:
            p["content"] = args["content"]
        if "pattern" in args:
            p["query"] = args["pattern"]

    return p


def handle_tools_call(request, ws_url, agent_id):
    params = request.get("params", {})
    tool_name = params.get("name", "")
    arguments = params.get("arguments", {})

    kind = TOOL_KIND_MAP.get(tool_name)
    if not kind:
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "error": {"code": -32602, "message": f"Unknown tool: {tool_name}"},
        }

    # Translate rescreen params → current Dune helper format
    rpc_params = _translate_params(kind, arguments, agent_id)

    try:
        rpc_result = rpc_call(ws_url, "agents.executeHostComputerUse", rpc_params)
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "content": [{"type": "text", "text": f"Error: RPC call failed: {e}"}],
                "isError": True,
            },
        }

    if "error" in rpc_result:
        err = rpc_result["error"]
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "content": [{"type": "text", "text": f"Error: {msg}"}],
                "isError": True,
            },
        }

    # Extract the result — the RPC returns the full request object
    result_data = rpc_result.get("result", {})
    status = result_data.get("status", "")

    if status == "rejected":
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "content": [{"type": "text", "text": "Request was rejected by admin."}],
                "isError": True,
            },
        }

    if status == "failed":
        error_msg = result_data.get("errorMessage", "unknown error")
        return {
            "jsonrpc": "2.0",
            "id": request.get("id"),
            "result": {
                "content": [{"type": "text", "text": f"Error: {error_msg}"}],
                "isError": True,
            },
        }

    # Build MCP content from resultJson
    result_json = result_data.get("resultJson")
    content = []

    if isinstance(result_json, dict):
        # Check for Claude-style content blocks (perceive returns these)
        inner_content = result_json.get("content")
        if isinstance(inner_content, list):
            for item in inner_content:
                item_type = item.get("type", "")
                if item_type == "text":
                    content.append({"type": "text", "text": item.get("text", "")})
                elif item_type == "image":
                    source = item.get("source", {})
                    content.append({
                        "type": "image",
                        "data": source.get("data", ""),
                        "mimeType": source.get("media_type", "image/png"),
                    })
        else:
            content.append({"type": "text", "text": json.dumps(result_json, indent=2)})
    elif result_json is not None:
        content.append({"type": "text", "text": str(result_json)})

    # Append artifact paths if any
    artifact_paths = result_data.get("artifactPaths", [])
    if artifact_paths:
        content.append({"type": "text", "text": "Artifacts:\n" + "\n".join(artifact_paths)})

    if not content:
        content.append({"type": "text", "text": f"Completed ({status})"})

    return {
        "jsonrpc": "2.0",
        "id": request.get("id"),
        "result": {"content": content},
    }


def main():
    ws_url = os.environ.get("DUNE_WS_URL", "")
    agent_id = os.environ.get("AGENT_ID", "")

    if not ws_url:
        print("host_computer_mcp: DUNE_WS_URL not set", file=sys.stderr)
        sys.exit(1)
    if not agent_id:
        print("host_computer_mcp: AGENT_ID not set", file=sys.stderr)
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        method = request.get("method", "")
        request_id = request.get("id")

        if method == "initialize":
            write_response(handle_initialize(request))
        elif method == "notifications/initialized":
            pass  # no response needed
        elif method == "tools/list":
            write_response(handle_tools_list(request))
        elif method == "tools/call":
            write_response(handle_tools_call(request, ws_url, agent_id))
        elif method == "ping":
            write_response({"jsonrpc": "2.0", "id": request_id, "result": {}})
        elif request_id is not None:
            write_response({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            })


if __name__ == "__main__":
    main()
