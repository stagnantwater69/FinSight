import { Alert, alertKindFromType } from "./Alert";
import { EmptyState } from "./EmptyState";
import type { Notification } from "../lib/types";

/**
 * The dashboard's alert list.
 *
 * Rendered through the shared <Alert> family rather than styled locally, so a
 * "possible duplicate" looks the same here as it does on a record row and in
 * the review queue — Law of Similarity.
 */
export function AlertsPanel({
  alerts,
  onMarkRead,
}: {
  alerts: Notification[];
  onMarkRead: (id: number) => void;
}) {
  if (alerts.length === 0) {
    return (
      <EmptyState compact title="Nothing needs your attention" icon="✓">
        FinSight will flag possible duplicates and unusually large expenses here as you record them.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <li key={a.id} className={a.readStatus ? "opacity-60" : undefined}>
          <Alert
            kind={alertKindFromType(a.type)}
            label={a.type}
            meta={new Date(a.dateCreated).toLocaleDateString()}
            action={
              !a.readStatus ? (
                <button
                  type="button"
                  onClick={() => onMarkRead(a.id)}
                  className="tap rounded-lg px-2 text-xs font-medium text-ink-500 hover:bg-paper hover:text-ink-800"
                >
                  Mark read
                </button>
              ) : null
            }
          >
            {a.message}
          </Alert>
        </li>
      ))}
    </ul>
  );
}
