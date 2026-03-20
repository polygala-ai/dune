import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

enum HelperError: Error {
    case message(String)
}

func fail(_ message: String, code: String = "host_operator_helper_failed") -> Never {
    let payload: [String: Any] = [
        "ok": false,
        "error": message,
        "code": code,
    ]
    writeJson(payload)
    exit(1)
}

func writeJson(_ value: Any) {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: []) else {
        let fallback = "{\"ok\":false,\"error\":\"invalid_json_output\",\"code\":\"host_operator_helper_invalid_output\"}"
        FileHandle.standardOutput.write(Data(fallback.utf8))
        return
    }
    FileHandle.standardOutput.write(data)
}

func readInput() -> [String: Any] {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty else { fail("missing_input", code: "host_operator_helper_missing_input") }
    do {
        let raw = try JSONSerialization.jsonObject(with: data)
        guard let dict = raw as? [String: Any] else {
            fail("input_must_be_object", code: "host_operator_helper_invalid_input")
        }
        return dict
    } catch {
        fail("invalid_json_input", code: "host_operator_helper_invalid_input")
    }
}

func readCommand(_ payload: [String: Any]) -> (String, [String: Any]) {
    let command = payload["command"] as? String ?? ""
    let input = payload["input"] as? [String: Any] ?? [:]
    return (command, input)
}

func success(result: Any? = nil, artifacts: [[String: Any]] = []) -> Never {
    var payload: [String: Any] = ["ok": true]
    payload["result"] = result ?? NSNull()
    if !artifacts.isEmpty {
        payload["artifacts"] = artifacts
    }
    writeJson(payload)
    exit(0)
}

func stringValue(_ dictionary: [String: Any], _ key: String) -> String? {
    guard let raw = dictionary[key] else { return nil }
    let value = String(describing: raw).trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
}

func intValue(_ dictionary: [String: Any], _ key: String) -> Int? {
    if let raw = dictionary[key] as? Int { return raw }
    if let raw = dictionary[key] as? NSNumber { return raw.intValue }
    if let raw = dictionary[key] as? String { return Int(raw) }
    return nil
}

func doubleValue(_ dictionary: [String: Any], _ key: String) -> Double? {
    if let raw = dictionary[key] as? Double { return raw }
    if let raw = dictionary[key] as? NSNumber { return raw.doubleValue }
    if let raw = dictionary[key] as? String { return Double(raw) }
    return nil
}

func pointValue(_ dictionary: [String: Any], _ key: String) -> CGPoint? {
    guard let raw = dictionary[key] as? [String: Any],
          let x = doubleValue(raw, "x"),
          let y = doubleValue(raw, "y") else {
        return nil
    }
    return CGPoint(x: x, y: y)
}

func appRecord(_ app: NSRunningApplication) -> [String: Any]? {
    guard let bundleId = app.bundleIdentifier, !bundleId.isEmpty else { return nil }
    return [
        "bundleId": bundleId,
        "appName": app.localizedName ?? bundleId,
        "pid": Int(app.processIdentifier),
        "active": app.isActive,
    ]
}

func appForBundleId(_ bundleId: String) -> NSRunningApplication? {
    return NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first
}

func activateApp(_ bundleId: String) throws {
    guard let app = appForBundleId(bundleId) else {
        throw HelperError.message("bundle_id_not_running")
    }
    app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
}

func listApps() -> [[String: Any]] {
    let apps = NSWorkspace.shared.runningApplications.compactMap(appRecord)
    return apps.sorted {
        let lhs = ($0["appName"] as? String ?? "", $0["bundleId"] as? String ?? "")
        let rhs = ($1["appName"] as? String ?? "", $1["bundleId"] as? String ?? "")
        return lhs < rhs
    }
}

func screenCaptureGranted() -> Bool {
    if #available(macOS 10.15, *) {
        return CGPreflightScreenCaptureAccess()
    }
    return true
}

func overviewWindows(bundleId: String?) -> [[String: Any]] {
    guard let rawList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    return rawList.compactMap { info in
        guard let pid = info[kCGWindowOwnerPID as String] as? NSNumber else { return nil }
        let ownerApp = NSRunningApplication(processIdentifier: pid.int32Value)
        let ownerBundleId = ownerApp?.bundleIdentifier ?? ""
        if let bundleId, ownerBundleId != bundleId { return nil }

        let ownerName = info[kCGWindowOwnerName as String] as? String ?? ownerBundleId
        let title = info[kCGWindowName as String] as? String ?? ""
        let windowId = (info[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
        let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
        let boundsRaw = info[kCGWindowBounds as String] as? [String: Any]
        let bounds = boundsRaw.flatMap { raw -> CGRect? in
            guard let x = raw["X"] as? Double,
                  let y = raw["Y"] as? Double,
                  let width = raw["Width"] as? Double,
                  let height = raw["Height"] as? Double else {
                return nil
            }
            return CGRect(x: x, y: y, width: width, height: height)
        }
        return [
            "bundleId": ownerBundleId,
            "appName": ownerName,
            "windowId": windowId,
            "title": title,
            "layer": layer,
            "bounds": bounds.map {
                [
                    "x": $0.origin.x,
                    "y": $0.origin.y,
                    "width": $0.size.width,
                    "height": $0.size.height,
                ]
            } ?? NSNull(),
        ]
    }
}

func unionBounds(for bundleId: String) -> CGRect? {
    let windows = overviewWindows(bundleId: bundleId)
    let rects = windows.compactMap { window -> CGRect? in
        guard let bounds = window["bounds"] as? [String: Any],
              let x = bounds["x"] as? Double,
              let y = bounds["y"] as? Double,
              let width = bounds["width"] as? Double,
              let height = bounds["height"] as? Double else {
            return nil
        }
        return CGRect(x: x, y: y, width: width, height: height)
    }
    guard var union = rects.first else { return nil }
    for rect in rects.dropFirst() {
        union = union.union(rect)
    }
    return union
}

func pngData(for rect: CGRect?) throws -> Data {
    let imageRect = rect ?? .null
    guard let image = CGWindowListCreateImage(imageRect, [.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID, [.bestResolution]) else {
        throw HelperError.message("screenshot_capture_failed")
    }
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw HelperError.message("png_encoding_failed")
    }
    return data
}

func axValueToPoint(_ value: AXValue) -> CGPoint? {
    var point = CGPoint.zero
    guard AXValueGetType(value) == .cgPoint,
          AXValueGetValue(value, .cgPoint, &point) else {
        return nil
    }
    return point
}

func axValueToSize(_ value: AXValue) -> CGSize? {
    var size = CGSize.zero
    guard AXValueGetType(value) == .cgSize,
          AXValueGetValue(value, .cgSize, &size) else {
        return nil
    }
    return size
}

func copyAttribute(_ element: AXUIElement, _ attribute: CFString) -> Any? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute, &value)
    guard result == .success else { return nil }
    return value
}

func copyAXValue(_ element: AXUIElement, _ attribute: CFString) -> AXValue? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute, &value)
    guard result == .success, let value else { return nil }
    return unsafeBitCast(value, to: AXValue.self)
}

func frameForElement(_ element: AXUIElement) -> [String: Any]? {
    guard let positionValue = copyAXValue(element, kAXPositionAttribute as CFString),
          let sizeValue = copyAXValue(element, kAXSizeAttribute as CFString),
          let point = axValueToPoint(positionValue),
          let size = axValueToSize(sizeValue) else {
        return nil
    }
    return [
        "x": point.x,
        "y": point.y,
        "width": size.width,
        "height": size.height,
    ]
}

func serializeAXElement(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 8, maxNodes: inout Int) -> [String: Any] {
    guard maxNodes > 0 else { return [:] }
    maxNodes -= 1
    var node: [String: Any] = [:]
    if let role = copyAttribute(element, kAXRoleAttribute as CFString) as? String {
        node["role"] = role
    }
    if let title = copyAttribute(element, kAXTitleAttribute as CFString) as? String, !title.isEmpty {
        node["title"] = title
    }
    if let description = copyAttribute(element, kAXDescriptionAttribute as CFString) as? String, !description.isEmpty {
        node["description"] = description
    }
    if let value = copyAttribute(element, kAXValueAttribute as CFString) {
        if let string = value as? String, !string.isEmpty {
            node["value"] = string
        } else if let number = value as? NSNumber {
            node["value"] = number
        }
    }
    if let identifier = copyAttribute(element, kAXIdentifierAttribute as CFString) as? String, !identifier.isEmpty {
        node["identifier"] = identifier
    }
    if let frame = frameForElement(element) {
        node["frame"] = frame
    }
    if depth < maxDepth,
       let children = copyAttribute(element, kAXChildrenAttribute as CFString) as? [AXUIElement],
       !children.isEmpty {
        node["children"] = Array(children.prefix(40)).map { serializeAXElement($0, depth: depth + 1, maxDepth: maxDepth, maxNodes: &maxNodes) }
    }
    return node
}

func accessibilityTree(bundleId: String, maxDepth: Int = 8, maxNodes: Int = 300) throws -> [String: Any] {
    guard let app = appForBundleId(bundleId) else {
        throw HelperError.message("bundle_id_not_running")
    }
    let element = AXUIElementCreateApplication(app.processIdentifier)
    var remaining = maxNodes
    let tree = serializeAXElement(element, maxDepth: maxDepth, maxNodes: &remaining)
    return [
        "bundleId": bundleId,
        "appName": app.localizedName ?? bundleId,
        "tree": tree,
    ]
}

func findNodes(_ node: [String: Any], query: String, matches: inout [[String: Any]]) {
    let haystackParts = [
        node["role"] as? String,
        node["title"] as? String,
        node["description"] as? String,
        node["value"] as? String,
        node["identifier"] as? String,
    ].compactMap { $0?.lowercased() }

    if haystackParts.contains(where: { $0.contains(query) }) {
        matches.append(node)
    }
    if let children = node["children"] as? [[String: Any]] {
        for child in children {
            findNodes(child, query: query, matches: &matches)
        }
    }
}

func screenshotArtifact(bundleId: String) throws -> [[String: Any]] {
    let rect = unionBounds(for: bundleId)
    let data = try pngData(for: rect)
    return [[
        "name": "\(bundleId.replacingOccurrences(of: ".", with: "-")).png",
        "contentBase64": data.base64EncodedString(),
    ]]
}

func perceive(_ input: [String: Any]) throws -> (Any, [[String: Any]]) {
    guard let mode = stringValue(input, "mode"),
          let bundleId = stringValue(input, "bundleId") else {
        throw HelperError.message("invalid_perceive_input")
    }

    let maxDepth = min(intValue(input, "maxDepth") ?? (mode == "find" ? 12 : 8), 20)
    let maxNodes = min(intValue(input, "maxNodes") ?? (mode == "find" ? 1000 : 300), 5000)
    let accessibility = try accessibilityTree(bundleId: bundleId, maxDepth: maxDepth, maxNodes: maxNodes)
    switch mode {
    case "accessibility":
        return (accessibility, [])
    case "find":
        let query = (stringValue(input, "query") ?? "").lowercased()
        if query.isEmpty { throw HelperError.message("query_required") }
        let root = accessibility["tree"] as? [String: Any] ?? [:]
        var matches: [[String: Any]] = []
        findNodes(root, query: query, matches: &matches)
        return ([
            "bundleId": bundleId,
            "matches": matches,
        ], [])
    case "screenshot":
        let artifacts = try screenshotArtifact(bundleId: bundleId)
        return ([
            "bundleId": bundleId,
            "artifactCount": artifacts.count,
        ], artifacts)
    case "composite":
        let artifacts = try screenshotArtifact(bundleId: bundleId)
        return ([
            "bundleId": bundleId,
            "accessibility": accessibility["tree"] as Any,
            "artifactCount": artifacts.count,
        ], artifacts)
    default:
        throw HelperError.message("unsupported_perceive_mode")
    }
}

func postMouse(type: CGEventType, point: CGPoint, button: CGMouseButton = .left, clickState: Int64 = 1) throws {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
        throw HelperError.message("mouse_event_failed")
    }
    event.setIntegerValueField(.mouseEventClickState, value: clickState)
    event.post(tap: .cghidEventTap)
}

func postKeyboardText(_ text: String) throws {
    for scalar in text.utf16 {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
            throw HelperError.message("keyboard_event_failed")
        }
        var value = scalar
        down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }
}

func postKeyCode(_ keyCode: CGKeyCode) throws {
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
        throw HelperError.message("keyboard_event_failed")
    }
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}

func postKeyboardTextToPid(_ text: String, pid: pid_t) throws {
    for scalar in text.utf16 {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
            throw HelperError.message("keyboard_event_failed")
        }
        var value = scalar
        down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        down.postToPid(pid)
        up.postToPid(pid)
        usleep(5000)
    }
}

func postKeyCodeToPid(_ keyCode: CGKeyCode, flags: CGEventFlags = [], pid: pid_t) throws {
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
        throw HelperError.message("keyboard_event_failed")
    }
    down.flags = flags
    up.flags = flags
    down.postToPid(pid)
    up.postToPid(pid)
}

func pressKeyComboToPid(_ combo: String, pid: pid_t) throws {
    let parts = combo.lowercased().split(separator: "+").map(String.init)
    var flags: CGEventFlags = []
    var keyName = ""
    for part in parts {
        switch part {
        case "cmd", "command": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "ctrl", "control": flags.insert(.maskControl)
        case "opt", "option", "alt": flags.insert(.maskAlternate)
        default: keyName = part
        }
    }
    let keyCode: CGKeyCode
    if let special = specialKeyCode(keyName) {
        keyCode = special
    } else if keyName.count == 1 {
        keyCode = characterToKeyCode(keyName)
    } else {
        throw HelperError.message("unknown_key: \(keyName)")
    }
    try postKeyCodeToPid(keyCode, flags: flags, pid: pid)
}

func specialKeyCode(_ key: String) -> CGKeyCode? {
    switch key.lowercased() {
    case "enter", "return": return 36
    case "tab": return 48
    case "space": return 49
    case "escape", "esc": return 53
    case "left": return 123
    case "right": return 124
    case "down": return 125
    case "up": return 126
    case "delete", "backspace": return 51
    case "forwarddelete", "forward_delete": return 117
    case "home": return 115
    case "end": return 119
    case "pageup", "page_up": return 116
    case "pagedown", "page_down": return 121
    case "f1": return 122
    case "f2": return 120
    case "f3": return 99
    case "f4": return 118
    case "f5": return 96
    case "f6": return 97
    case "f7": return 98
    case "f8": return 100
    case "f9": return 101
    case "f10": return 109
    case "f11": return 103
    case "f12": return 111
    default: return nil
    }
}

func characterToKeyCode(_ char: String) -> CGKeyCode {
    switch char.lowercased() {
    case "a": return 0;  case "b": return 11; case "c": return 8;  case "d": return 2
    case "e": return 14; case "f": return 3;  case "g": return 5;  case "h": return 4
    case "i": return 34; case "j": return 38; case "k": return 40; case "l": return 37
    case "m": return 46; case "n": return 45; case "o": return 31; case "p": return 35
    case "q": return 12; case "r": return 15; case "s": return 1;  case "t": return 17
    case "u": return 32; case "v": return 9;  case "w": return 13; case "x": return 7
    case "y": return 16; case "z": return 6
    case "0": return 29; case "1": return 18; case "2": return 19; case "3": return 20
    case "4": return 21; case "5": return 23; case "6": return 22; case "7": return 26
    case "8": return 28; case "9": return 25
    case "-": return 27; case "=": return 24; case "[": return 33; case "]": return 30
    case "\\": return 42; case ";": return 41; case "'": return 39; case ",": return 43
    case ".": return 47; case "/": return 44; case "`": return 50
    default: return 0
    }
}

func postKeyWithModifiers(_ keyString: String) throws {
    let parts = keyString.split(separator: "+").map { String($0).trimmingCharacters(in: .whitespaces).lowercased() }
    guard parts.count >= 2, let keyName = parts.last else {
        throw HelperError.message("invalid_key_combo: \(keyString)")
    }
    let modifierNames = Set(parts.dropLast())

    var flags: CGEventFlags = []
    if modifierNames.contains("cmd") || modifierNames.contains("command") { flags.insert(.maskCommand) }
    if modifierNames.contains("shift") { flags.insert(.maskShift) }
    if modifierNames.contains("alt") || modifierNames.contains("option") { flags.insert(.maskAlternate) }
    if modifierNames.contains("ctrl") || modifierNames.contains("control") { flags.insert(.maskControl) }

    let keyCode: CGKeyCode
    if let special = specialKeyCode(keyName) {
        keyCode = special
    } else if keyName.count == 1 {
        keyCode = characterToKeyCode(keyName)
    } else {
        throw HelperError.message("unknown_key: \(keyName)")
    }

    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
        throw HelperError.message("keyboard_event_failed")
    }
    down.flags = flags
    up.flags = flags
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}

func act(_ input: [String: Any]) throws -> Any {
    guard let action = stringValue(input, "action") else {
        throw HelperError.message("action_required")
    }
    if let bundleId = stringValue(input, "bundleId"), !["launch", "navigate", "clipboard_read", "clipboard_write"].contains(action) {
        try activateApp(bundleId)
        usleep(150_000)
    }

    switch action {
    case "launch":
        guard let bundleId = stringValue(input, "bundleId") else { throw HelperError.message("bundle_id_required") }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-b", bundleId]
        try process.run()
        process.waitUntilExit()
        return ["ok": process.terminationStatus == 0, "text": "Launched \(bundleId)"]
    case "navigate":
        guard let bundleId = stringValue(input, "bundleId") else { throw HelperError.message("bundle_id_required") }
        guard let urlString = stringValue(input, "url") else { throw HelperError.message("url_required") }
        guard let app = appForBundleId(bundleId) else { throw HelperError.message("bundle_id_not_running") }
        let navPid = app.processIdentifier
        app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        usleep(200_000)
        try postKeyCodeToPid(37, flags: .maskCommand, pid: navPid) // Cmd+L
        usleep(150_000)
        try postKeyboardTextToPid(urlString, pid: navPid)
        usleep(100_000)
        try postKeyCodeToPid(36, pid: navPid) // Enter
        let waitSec = min(doubleValue(input, "wait") ?? 2.0, 10.0)
        usleep(UInt32(waitSec * 1_000_000))
        return ["ok": true, "text": "Navigated to \(urlString) in \(bundleId)"]
    case "close":
        guard let bundleId = stringValue(input, "bundleId"),
              let app = appForBundleId(bundleId) else { throw HelperError.message("bundle_id_not_running") }
        return ["ok": app.terminate(), "text": "Closed \(bundleId)"]
    case "focus":
        guard let bundleId = stringValue(input, "bundleId") else { throw HelperError.message("bundle_id_required") }
        try activateApp(bundleId)
        return ["ok": true, "text": "Focused \(bundleId)"]
    case "url":
        throw HelperError.message("url_read_not_supported")
    case "clipboard_read":
        let clipText = NSPasteboard.general.string(forType: .string) ?? ""
        return ["ok": true, "text": clipText]
    case "clipboard_write":
        let text = stringValue(input, "text") ?? ""
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        return ["ok": true, "text": "Wrote \(text.count) chars to clipboard"]
    case "type":
        let text = stringValue(input, "text") ?? ""
        guard text.count <= 10_000 else { throw HelperError.message("text_too_long") }
        let preview = text.count > 40 ? String(text.prefix(40)) + "..." : text
        if let bundleId = stringValue(input, "bundleId"), let app = appForBundleId(bundleId) {
            try postKeyboardTextToPid(text, pid: app.processIdentifier)
        } else {
            try postKeyboardText(text)
        }
        return ["ok": true, "text": "Typed \"\(preview)\""]
    case "press":
        let key = stringValue(input, "key") ?? ""
        if let bundleId = stringValue(input, "bundleId"), let app = appForBundleId(bundleId) {
            if key.contains("+") {
                try pressKeyComboToPid(key, pid: app.processIdentifier)
            } else if let code = specialKeyCode(key) {
                try postKeyCodeToPid(code, pid: app.processIdentifier)
            } else if key.count == 1 {
                try postKeyboardTextToPid(key, pid: app.processIdentifier)
            } else {
                throw HelperError.message("unknown_key: \(key)")
            }
        } else {
            if key.contains("+") {
                try postKeyWithModifiers(key)
            } else if let code = specialKeyCode(key) {
                try postKeyCode(code)
            } else if key.count == 1 {
                try postKeyboardText(key)
            } else {
                throw HelperError.message("unknown_key: \(key)")
            }
        }
        return ["ok": true, "text": "Pressed \(key)"]
    case "click", "select":
        guard let point = pointValue(input, "point") else { throw HelperError.message("point_required") }
        try postMouse(type: .mouseMoved, point: point)
        try postMouse(type: .leftMouseDown, point: point)
        try postMouse(type: .leftMouseUp, point: point)
        return ["ok": true, "text": "Clicked at (\(Int(point.x)), \(Int(point.y)))"]
    case "double_click":
        guard let point = pointValue(input, "point") else { throw HelperError.message("point_required") }
        try postMouse(type: .mouseMoved, point: point)
        try postMouse(type: .leftMouseDown, point: point, clickState: 1)
        try postMouse(type: .leftMouseUp, point: point, clickState: 1)
        try postMouse(type: .leftMouseDown, point: point, clickState: 2)
        try postMouse(type: .leftMouseUp, point: point, clickState: 2)
        return ["ok": true, "text": "Double-clicked at (\(Int(point.x)), \(Int(point.y)))"]
    case "right_click":
        guard let point = pointValue(input, "point") else { throw HelperError.message("point_required") }
        try postMouse(type: .mouseMoved, point: point, button: .right)
        try postMouse(type: .rightMouseDown, point: point, button: .right)
        try postMouse(type: .rightMouseUp, point: point, button: .right)
        return ["ok": true, "text": "Right-clicked at (\(Int(point.x)), \(Int(point.y)))"]
    case "hover":
        guard let point = pointValue(input, "point") else { throw HelperError.message("point_required") }
        try postMouse(type: .mouseMoved, point: point)
        return ["ok": true, "text": "Hovered at (\(Int(point.x)), \(Int(point.y)))"]
    case "drag":
        guard let from = pointValue(input, "point"),
              let to = pointValue(input, "toPoint") else { throw HelperError.message("point_required") }
        let duration = min(doubleValue(input, "duration") ?? 0.3, 5.0)
        let steps = max(Int(duration * 60), 2)
        try postMouse(type: .mouseMoved, point: from)
        try postMouse(type: .leftMouseDown, point: from)
        for i in 1...steps {
            let t = Double(i) / Double(steps)
            let intermediate = CGPoint(
                x: from.x + (to.x - from.x) * t,
                y: from.y + (to.y - from.y) * t
            )
            try postMouse(type: .leftMouseDragged, point: intermediate)
            usleep(UInt32(duration / Double(steps) * 1_000_000))
        }
        try postMouse(type: .leftMouseUp, point: to)
        return ["ok": true, "text": "Dragged from (\(Int(from.x)), \(Int(from.y))) to (\(Int(to.x)), \(Int(to.y)))"]
    case "scroll":
        guard let point = pointValue(input, "point") else { throw HelperError.message("point_required") }
        let deltaX = Int32(intValue(input, "deltaX") ?? 0)
        let deltaY = Int32(intValue(input, "deltaY") ?? 0)
        try postMouse(type: .mouseMoved, point: point)
        guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: deltaY, wheel2: deltaX, wheel3: 0) else {
            throw HelperError.message("scroll_event_failed")
        }
        event.post(tap: .cgSessionEventTap)
        return ["ok": true, "text": "Scrolled (\(deltaX), \(deltaY)) at (\(Int(point.x)), \(Int(point.y)))"]
    default:
        throw HelperError.message("unsupported_action")
    }
}

func fileAttributes(at url: URL) -> [String: Any] {
    let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey])
    return [
        "path": url.path,
        "name": url.lastPathComponent,
        "isDirectory": values?.isDirectory ?? false,
        "size": values?.fileSize ?? 0,
        "modifiedAt": values?.contentModificationDate?.timeIntervalSince1970 ?? 0,
    ]
}

func filesystem(_ input: [String: Any]) throws -> Any {
    guard let op = stringValue(input, "op"),
          let path = stringValue(input, "path") else {
        throw HelperError.message("invalid_filesystem_input")
    }
    let url = URL(fileURLWithPath: path)
    let fm = FileManager.default
    switch op {
    case "list":
        let items = try fm.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey], options: [.skipsHiddenFiles])
        return ["entries": items.map(fileAttributes)]
    case "read":
        let data = try Data(contentsOf: url)
        if let text = String(data: data, encoding: .utf8) {
            return ["content": text]
        }
        return ["contentBase64": data.base64EncodedString()]
    case "write":
        let content = stringValue(input, "content") ?? ""
        try content.data(using: .utf8)?.write(to: url, options: .atomic)
        return ["ok": true]
    case "delete":
        try fm.removeItem(at: url)
        return ["ok": true]
    case "search":
        let query = (stringValue(input, "query") ?? "").lowercased()
        let enumerator = fm.enumerator(at: url, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey], options: [.skipsHiddenFiles])
        var results: [[String: Any]] = []
        while let next = enumerator?.nextObject() as? URL, results.count < 100 {
            let pathLower = next.path.lowercased()
            if pathLower.contains(query) {
                results.append(["path": next.path, "match": "path"])
                continue
            }
            let values = try? next.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            if values?.isRegularFile == true, (values?.fileSize ?? 0) < 256_000,
               let text = try? String(contentsOf: next, encoding: .utf8),
               text.lowercased().contains(query) {
                results.append(["path": next.path, "match": "content"])
            }
        }
        return ["results": results]
    case "metadata":
        guard fm.fileExists(atPath: path) else { throw HelperError.message("file_not_found") }
        let attrs = try fm.attributesOfItem(atPath: path)
        var meta: [String: Any] = ["path": path, "type": (attrs[.type] as? FileAttributeType) == .typeDirectory ? "directory" : "file"]
        if let size = attrs[.size] as? Int { meta["size"] = size }
        if let modified = attrs[.modificationDate] as? Date { meta["modified"] = ISO8601DateFormatter().string(from: modified) }
        if let created = attrs[.creationDate] as? Date { meta["created"] = ISO8601DateFormatter().string(from: created) }
        if let perms = attrs[.posixPermissions] as? Int { meta["permissions"] = String(perms, radix: 8) }
        return meta
    default:
        throw HelperError.message("unsupported_filesystem_op")
    }
}

let payload = readInput()
let (command, input) = readCommand(payload)

do {
    switch command {
    case "list_apps":
        success(result: listApps())
    case "status":
        success(result: [
            "available": true,
            "platform": "darwin",
            "provider": "darwin-helper",
            "accessibilityGranted": AXIsProcessTrusted(),
            "screenCaptureGranted": screenCaptureGranted(),
        ])
    case "overview":
        success(result: [
            "windows": overviewWindows(bundleId: stringValue(input, "bundleId")),
        ])
    case "perceive":
        let (result, artifacts) = try perceive(input)
        success(result: result, artifacts: artifacts)
    case "act":
        success(result: try act(input))
    case "filesystem":
        success(result: try filesystem(input))
    default:
        fail("unsupported_command", code: "unsupported_command")
    }
} catch let error as HelperError {
    switch error {
    case .message(let message):
        fail(message)
    }
} catch {
    fail(error.localizedDescription)
}
