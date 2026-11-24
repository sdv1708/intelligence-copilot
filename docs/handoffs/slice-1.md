# Slice 1 handoff

## Behavior delivered

- Each paste creates its own searchable material, including two unnamed notes or notes with the same title. A title such as `Board notes` works without a file extension. Unnamed notes show as `Pasted note`.
- Open a pasted note in Documents to read its saved text. The disclosure supports keyboard activation, preserves paragraph breaks, and wraps text at narrow widths. Notes load by material ID when opened.
- A rejected paste leaves both fields editable and shows the failure in the form. A failed embedding leaves no material row. Retrying adds one note, clears the fields, and closes the form.

## Code entry points

- [`Uploader.tsx`](../../web/src/components/Uploader.tsx) submits the form and clears it after an ingest outcome with `success: true`. [`MaterialsList.tsx`](../../web/src/components/MaterialsList.tsx) opens notes inline.
- [`api/routes/materials.py`](../../api/routes/materials.py) handles `POST /api/meetings/{id}/materials/text` and the meeting-scoped `GET /api/meetings/{id}/materials/{material_id}/text`. The request still uses `filename` for the optional display title.
- [`CopilotOrchestrator`](../../agents/copilot_orchestrator.py) appends pasted notes and keeps them out of the upload-by-filename replacement lookup. Both paths use [`core/indexing.py`](../../core/indexing.py) for chunking and indexing. [`tests/test_api.py`](../../tests/test_api.py) covers distinct IDs, a shared label with an upload, and retry after an embedding failure.

## Verification

Run these from the repo root in PowerShell.

```powershell
$env:OMP_NUM_THREADS='1'
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check core/ tests/ agents/ scripts/ api/
npm.cmd run typecheck --prefix web
npm.cmd run build --prefix web
git diff --check
```

The full suite passed with **440 tests** and the two existing dependency warnings. Ruff, the TypeScript check, the production build, and the whitespace check passed. In the managed Windows sandbox, the FAISS native import reported `0xc0000008`. The suite and local server ran successfully outside that sandbox with the installed FAISS wheel.

**Manual browser result.** Served `web/dist` through FastAPI with temporary SQLite storage, a real FAISS index, a deterministic test embedder, and a scripted chat model. Created a meeting in the browser, added two unnamed notes and `Board notes`, and opened all three with the keyboard. Submitted `Decision follow-up` with the failure marker below. The original three notes remained, the inline alert appeared, and both draft fields stayed populated. Clicking **Add text** again saved exactly one copy with the original text. Reopened the meeting after refreshing and confirmed all four rows and the saved Board notes text. The desktop and 375 px viewport checks showed readable text and visible keyboard focus, with no horizontal scroll at the narrow width.

To reproduce the forced failure, save the following as `.pytest_cache/slice1_browser.py` after building the frontend.

```python
import tempfile
from pathlib import Path

import uvicorn

from agents.copilot_orchestrator import CopilotOrchestrator
from api import deps
from api.main import app
from core.config import Settings
from core.db import Database
from core.exceptions import RetrievalError
from tests.agentworld import World, runtime_for
from tests.fakes import HashingEmbedder


class FailOnceEmbedder(HashingEmbedder):
    failed = False

    def encode(self, texts):
        if not self.failed and any("slice one retry marker" in text for text in texts):
            self.failed = True
            raise RetrievalError("Embedding temporarily unavailable.")
        return super().encode(texts)


with tempfile.TemporaryDirectory(prefix="copilot-slice1-") as storage:
    settings = Settings(_env_file=None, data_dir=Path(storage))
    settings.prepare_storage()
    db = Database(settings.db_path, settings=settings)
    embedder = FailOnceEmbedder(dim=settings.embedding_dim)
    world = World(db, settings, embedder, "", "")
    deps._settings = settings
    deps._database = db
    deps._orchestrator = CopilotOrchestrator(runtime=runtime_for(world))
    deps.startup = lambda: None
    uvicorn.run(app, host="127.0.0.1", port=8171)
```

```powershell
$env:OMP_NUM_THREADS='1'
.venv/Scripts/python.exe -c "from runpy import run_path; run_path('.pytest_cache/slice1_browser.py')"
```

Open `http://127.0.0.1:8171`, create a meeting, and add the three notes. For the fourth paste, enter any title and include `slice one retry marker` in the body. The first submission containing the marker fails in the server. Click **Add text** again and open the resulting row.

## Next slice

Start with the multipart `POST /materials` handler, `_store_upload`, and `index_material`. The upload path currently deletes the old material before embedding its replacement. Reproduce the defect on a disposable meeting with two uploaded files. Upload changed text under one existing filename and force `encode` to raise. Check both files with retrieval. Slice 2 passes when the previous version still answers the same query, the second file is searchable, the UI reports the failure, and a successful retry exposes the replacement. Follow the plan for SQLite-backed exact search, legacy readability, bounded upload reads, and moving blocking work off the web event loop.
