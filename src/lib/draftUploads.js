import { useEffect, useRef } from "react";
import { createDraftUploadTracker, flushDraftCleanups } from "./files.js";

/**
 * Discard cleanup for new-item modals. Unmount deletes uncommitted uploads; `keep`
 * after close still deletes so a completing upload cannot race past the close handler.
 * Call `markSaved` after the record is written so committed files are left alone.
 */
export function useDraftUploads() {
  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = createDraftUploadTracker();
  useEffect(() => {
    flushDraftCleanups();
    return () => { trackerRef.current.discard(); };
  }, []);
  return trackerRef.current;
}
