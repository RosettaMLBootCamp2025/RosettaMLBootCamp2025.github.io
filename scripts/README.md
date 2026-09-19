# Site checks

Render with `quarto render`, then serve `_site` with `python3 -m http.server 8000 --directory _site`. Set `A11Y_BASE_URL` if using another local port.

- `npm run test:accessibility` checks every rendered page at mobile and desktop widths. Two browser workers share each navigation between layout and Pa11y/axe checks. Each worker has an isolated browser context; the homepage is seeded with a returning learner, reduced motion is enabled, and fonts and finite animations settle before measurement; optional external requests are blocked. It also runs progress, concurrency, and accessibility-update regressions.
- `npm run test:responsive` runs the same layout/interaction checks without axe.
- `npm run test:performance` runs the targeted Python and browser regressions.
- `npm run test:integrations` separately checks the real Mol* bundle and structure download plus one YouTube embed document. It requires network access and reports startup time and a JS heap snapshot; it is not part of the deterministic pull-request gate. Software WebGL allows it to run without a physical GPU. A successful embed-document request does not establish playable video.
- `python3 scripts/validate_course_data.py --smoke-notebook` checks small CPU operations and benchmark samples with PyTorch installed. The default validator requires only Python's standard library.

The legacy `.pa11yci.cjs` configuration remains available for standalone Pa11y CLI use. The combined npm accessibility command reuses `.pa11yci.json` for the same rules and severity settings.

Progress now lives in one IndexedDB row. A read/write transaction serializes migration, edits, replacement imports, and resets across tabs. JSON exports remain version 2. Existing localStorage progress is imported only when the database row is absent; keeping an empty row on reset prevents stale tabs from resurrecting old progress. BroadcastChannel updates visible controls; returning focus also refreshes them. The concurrency test deliberately queues real application writers behind an active transaction to exercise overlap.
