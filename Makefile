export PATH

dev:
	@nohup sh -c 'sleep 3 && pkill -9 -f electron-forge 2>/dev/null; pkill -9 -f Electron 2>/dev/null; pnpm install --force && tail -f /dev/null | pnpm dev' > /tmp/dune-dev.log 2>&1 & echo $$! > /tmp/dune-dev.pid
	@echo "Dune will restart in ~30s. Logs: tail -f /tmp/dune-dev.log"

.PHONY: dev
