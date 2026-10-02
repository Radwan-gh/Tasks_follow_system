import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A list of user ids that saves itself on every change — the people pickers
 * (card assignees, subtask assignees, restricted access) have no save button.
 *
 * Every endpoint behind them is a full replace, so each save sends the whole
 * latest set. Saves run one at a time and only the newest pending set is sent
 * next ("latest wins"): two quick adds can never land out of order and leave
 * the server holding the older set. The local list updates optimistically; a
 * failed save rolls it back to the last set the server confirmed.
 */
export function useAutoSavedIds(serverIds: string[], save: (ids: string[]) => Promise<unknown>) {
  const [ids, setIds] = useState<string[]>(serverIds);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const saveRef = useRef(save);
  saveRef.current = save;
  const confirmed = useRef<string[]>(serverIds);
  const queued = useRef<string[] | null>(null);
  const running = useRef(false);

  // Adopt fresh server state (a refetch, someone else's edit) — but never
  // while our own saves are still in flight, or it would clobber them.
  const serverKey = serverIds.join(",");
  useEffect(() => {
    if (running.current) return;
    confirmed.current = serverIds;
    setIds(serverIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not array identity
  }, [serverKey]);

  const change = useCallback((next: string[]) => {
    setIds(next);
    setFailed(false);
    queued.current = next;
    if (running.current) return;

    running.current = true;
    setSaving(true);
    void (async () => {
      while (queued.current) {
        const value = queued.current;
        queued.current = null;
        try {
          await saveRef.current(value);
          confirmed.current = value;
        } catch {
          queued.current = null;
          setIds(confirmed.current);
          setFailed(true);
        }
      }
      running.current = false;
      setSaving(false);
    })();
  }, []);

  return { ids, change, saving, failed };
}
