import { contextBridge } from 'electron';

import { createDesktopBridge } from '../../shared/electron/desktop-bridge';

const desktopBridge = Object.freeze(createDesktopBridge(process.platform));

contextBridge.exposeInMainWorld('duneDesktop', desktopBridge);
