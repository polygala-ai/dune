# World's Simplest Electron App

This is about the smallest useful Electron app you can build: one main-process
file that opens a native window, and one HTML file for the UI.

Electron already includes Chromium, the browser engine that loads HTML and
draws the page inside the app window.

## Simple Architecture

There are two processes:

- the Electron main process
- the renderer process for the page loaded into the window

Why two processes:

- `main` exists because something has to talk to the OS and create app windows
- `renderer` exists because the UI runs like a web page inside Chromium
- they are split so the UI is isolated from privileged desktop APIs

```text
+------------------------------------------------------+
| Main Process                                         |
|                                                      |
| main.js // main-process code                         |
|   new BrowserWindow() // creates native app window   |
|   win.loadFile('index.html') // loads the page       |
+------------------------------------------------------+
                  │ win.loadFile('index.html') // load
                  ▼
+------------------------------------------------------+
| Renderer Process                                     |
|                                                      |
| index.html // page code                              |
|   <h1>Hello from Electron</h1> // simple UI          |
+------------------------------------------------------+
```

`main.js` is the desktop entrypoint. It creates the native window.

`index.html` runs inside the renderer process and draws the UI in that window.

There is no preload script and no IPC in this version.

## Process Lifecycle

Very simply, the app starts like this:

```text
npm start // runs electron .
  -> electron . // launches the Electron app
    -> main.js // runs as the main-process entry file
```

Then window creation happens:

```text
main.js // main-process code
  -> new BrowserWindow() // creates the native app window
```

Then page loading happens:

```text
main.js // main-process code
  -> win.loadFile('index.html') // tells Electron to load the page into the window
    -> Chromium // loads the page for that window
      -> renderer process // starts for that page
        -> index.html // loads in the renderer
          -> browser engine // draws the UI
```

So `main.js` does not draw the page itself. It creates the window, then the
renderer process renders the page inside it.

## `package.json`

```json
{
  "name": "tiny-electron",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  }
}
```

## `main.js`

```js
const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow();
  win.loadFile('index.html');
});
```

## `index.html`

```html
<!doctype html>
<html>
  <body>
    <h1>Hello from Electron</h1>
  </body>
</html>
```

## Install And Run

```bash
npm install --save-dev electron
npm start
```

That is basically the smallest useful Electron app.
