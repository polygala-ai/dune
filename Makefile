DUNE_FORGE_MATCH := $(CURDIR)/node_modules/\.bin/electron-forge start
DUNE_ELECTRON_MATCH := $(CURDIR)/node_modules/electron/dist/Electron\.app/Contents/MacOS/Electron

dev:
	@nohup sh -c 'sleep 3 && \
		pkill -f "$(DUNE_FORGE_MATCH)" 2>/dev/null || true && \
		pkill -f "$(DUNE_ELECTRON_MATCH)" 2>/dev/null || true && \
		pnpm install --force && \
		tail -f /dev/null | pnpm dev' > /tmp/dune-dev.log 2>&1 &
	@echo "Dune will restart in ~30s. Log: tail -f /tmp/dune-dev.log"
