import { ChevronDown, FileText, Trash2 } from "lucide-react";
import { useState } from "react";

import { asApiError, deleteMaterial, getPastedText } from "../api/client";
import type { ApiError, MaterialOut } from "../api/client";
import { formatCount, formatDay } from "../format";
import type { MeetingTasks } from "../hooks/useMeetingTasks";
import { useRequest } from "../hooks/useRequest";
import { Button, ErrorNote } from "./controls";

interface MaterialsListProps {
  meetingId: string;
  materials: MaterialOut[];
  /** True while this meeting holds the server's lock for something else. */
  busy: boolean;
  run: MeetingTasks["run"];
  onDeleted: () => void;
}

function PastedText({ material }: { material: MaterialOut }) {
  const { state, reload } = useRequest(
    (options) => getPastedText(material.meeting_id, material.id, options),
    [material.meeting_id, material.id],
  );

  if (state.status === "loading") {
    return <p role="status" className="text-sm text-muted">Loading note…</p>;
  }
  if (state.status === "failed") {
    return <ErrorNote error={state.error} onRetry={reload} />;
  }
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere text-ink">
      {state.data}
    </p>
  );
}

/**
 * The documents a brief is built from.
 *
 * A list rather than a table: at 375px a four-column table either scrolls
 * sideways or crushes the filename, and the filename is the only column anyone
 * scans by.
 */
export function MaterialsList({
  meetingId,
  materials,
  busy,
  run,
  onDeleted,
}: MaterialsListProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function remove(materialId: string) {
    setConfirming(null);
    setError(null);
    try {
      // Through `run` because deletion takes the same per-meeting lock as
      // ingestion: it drops the chunk rows and rewrites the vector index.
      await run(meetingId, () => deleteMaterial(materialId));
      onDeleted();
    } catch (cause) {
      setError(asApiError(cause));
    }
  }

  if (materials.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-panel px-4 py-6 text-sm leading-relaxed text-muted">
        Nothing added yet. A brief needs at least one document to read.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorNote error={error} /> : null}

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
        {materials.map((material) => {
          const pasted = material.media_type === "pasted";
          const expanded = openNote === material.id;
          const panelId = `note-${material.id}`;
          const label = (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{material.filename}</span>
              <span className="mt-0.5 block text-xs text-muted">
                {pasted ? "Text" : material.media_type} · {formatCount(material.char_count)}{" "}
                characters · {formatDay(material.created_at)}
              </span>
            </span>
          );

          return (
            <li key={material.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="shrink-0 text-faint"
                />
                {pasted ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpenNote(expanded ? null : material.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-line focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {label}
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={`shrink-0 text-muted ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : label}

                {confirming === material.id ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(material.id)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(material.id)}
                    disabled={busy}
                    aria-label={`Delete ${material.filename}`}
                    title="Delete"
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                )}
              </div>
              {pasted ? (
                <div
                  id={panelId}
                  hidden={!expanded}
                  className="mt-3 rounded-md border border-line bg-paper px-3 py-3"
                >
                  {expanded ? <PastedText material={material} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
