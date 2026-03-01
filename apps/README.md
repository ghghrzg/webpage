# Apps Workspace

Put source projects in `apps/<slug>/`.

Expected flow:
1. Add source app in `apps/<slug>/` (with its own `package.json`).
2. Configure that app's build to output to `contents/<slug>/`.
3. Run the app build.
4. The homepage auto-lists the generated content.

For `pop-a-lot-arcade`:
- source: `apps/pop-a-lot-arcade`
- output: `contents/pop_a_lot`

Root helper commands:
- `npm run install:all`
- `npm run build:all`
- `npm run build:changed`
- `npm run build:changed:all-if-none`

Windows clickable shortcut in repo root:
- `build-changed.cmd` (builds only changed apps under `apps/`)
