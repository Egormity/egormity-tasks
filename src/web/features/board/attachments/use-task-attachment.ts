import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { TaskAttachment } from "@/features/board/data/task-data";
import { getTrackerCardAttachmentBlob } from "@/features/board/data/tracker-api";

export const useTaskAttachment = (
  attachment: TaskAttachment | undefined,
  cardId?: string,
  file?: File,
  enabled = true,
) => {
  const query = useQuery({
    queryKey: ["tracker-attachment", cardId, attachment?.id, attachment?.objectId],
    enabled: enabled && !file && Boolean(cardId && attachment?.objectId),
    queryFn: async ({ signal }) => {
      const blob = await getTrackerCardAttachmentBlob(cardId!, attachment!.id, signal);
      return attachment?.type ? new Blob([blob], { type: attachment.type }) : blob;
    },
    staleTime: Infinity,
    retry: false,
  });
  return { blob: file ?? query.data, loading: !file && query.isFetching, error: query.isError };
};

export const useAttachmentObjectUrl = (blob?: Blob) => {
  const [resource, setResource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // Publish the browser-owned URL after mount; cleanup releases it on replacement/unmount.
    setResource({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return resource?.blob === blob ? resource?.url : undefined;
};
