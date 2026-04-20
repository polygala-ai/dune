# World's Simplest Electron App With IPC

This is the smallest useful Electron app that also demonstrates IPC between the
renderer and the main process.

Electron already includes Chromium, the browser engine that loads HTML and
draws the page inside the app window.

## Simple Architecture

This version has two processes. `preload.js` is not a separate process: it runs
inside the renderer process and acts as the bridge for `index.html`.

Why it is split this way:

- `main` exists because something has to talk to the OS and create app windows
- `renderer` exists because the UI runs like a web page inside Chromium
- `preload` exists because the page should not get full Electron access directly
- `preload` exposes a small safe bridge from the page to the main process

```text
+------------------------------------------------------+
| Main Process                                         |
|                                                      |
| main.js // main-process code                         |
|   new BrowserWindow({ preload: ... }) // window      |
|   win.loadFile('index.html') // loads the page       |
|   ipcMain.handle('ping') // answers ping requests    |
+------------------------------------------------------+
                  ▲ 'pong from main' // reply
                  │
                  │ Electron IPC // Mojo IPC under the hood
                  │
                  │ ipcRenderer.invoke('ping') // request
                  ▼
+------------------------------------------------------+
| Renderer Process                                     |
|                                                      |
| preload.js // renderer-side bridge                   |
|   contextBridge.exposeInMainWorld(...) // safe API   |
|   ipcRenderer.invoke('ping') // sends request        |
|                                                      |
| index.html // page code                              |
|   window.demo.ping() // called on button click       |
+------------------------------------------------------+
```

## Process Lifecycle

```text
npm start // runs electron .
  -> electron . // launches the Electron app
    -> main.js // runs as the main-process entry file
```

Then window creation happens:

```text
main.js // main-process code
  -> new BrowserWindow({ preload: ... }) // creates the native app window
    -> webPreferences.preload // tells Electron to run preload.js for this window
```

Then page loading happens:

```text
main.js // main-process code
  -> win.loadFile('index.html') // tells Electron to load the page into the window
    -> Chromium // loads the page for that window
      -> renderer process // starts for that page
        -> preload.js // runs on the renderer side first
        -> index.html // loads in the renderer
          -> browser engine // draws the UI
```

After startup, IPC looks like this:

```text
index.html // page code
  -> window.demo.ping() // calls the safe bridge API
    -> preload.js // bridge code runs
      -> ipcRenderer.invoke('ping') // sends a request to the main process
        -> main.js // handles it with ipcMain.handle('ping')
          -> output.textContent = ... // index.html updates the page
```

## `package.json`

```json
{
  "name": "tiny-electron-ipc",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  }
}
```

## `main.js`

```js
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

app.whenReady().then(() => {
  ipcMain.handle('ping', () => 'pong from main');

  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
});
```

## `preload.js`

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('demo', {
  ping: () => ipcRenderer.invoke('ping')
});
```

## `index.html`

```html
<!doctype html>
<html>
  <body>
    <button id="ping">Ping Main Process</button>
    <pre id="output"></pre>

    <script>
      const button = document.getElementById('ping');
      const output = document.getElementById('output');

      button.addEventListener('click', async () => {
        output.textContent = await window.demo.ping();
      });
    </script>
  </body>
</html>
```

## Install And Run

```bash
npm install --save-dev electron
npm start
```

Clicking the button sends an IPC request from the renderer to the main process,
and the main process sends the response back.
