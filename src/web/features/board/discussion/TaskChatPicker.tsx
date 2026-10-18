import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Thread } from "@contracts/agent.js";
import { request } from "@/shared/http/api";
import { usePreferences } from "@/shared/i18n/preferences";
import { writeTaskLocation } from "@/app/navigation";
import {
  Modal,
  ModalContent,
  ModalTitle,
  ModalDescription,
} from "@/features/board/components/modal";
import { refreshTrackerBoard, trackerBoardQuery } from "@/features/board/data/tracker-query";
import { linkTaskChat } from "./api";

export const TaskChatPicker = ({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) => {
  const { copy, errorText } = usePreferences();
  const client = useQueryClient();
  const board = useQuery(trackerBoardQuery);
  const chats = useQuery({
    queryKey: ["native-chat-picker"],
    queryFn: ({ signal }) => request<Thread[]>("/chats", undefined, signal),
    staleTime: 0,
  });
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const select = async (chatId: string) => {
    setPending(true);
    setError("");
    try {
      await linkTaskChat(taskId, chatId);
      await refreshTrackerBoard(client);
      writeTaskLocation(taskId, chatId);
      onClose();
    } catch (cause) {
      setError(errorText(cause instanceof Error ? cause.message : String(cause)));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <ModalContent nested className="flex max-h-[80dvh] flex-col overflow-hidden p-5">
        <ModalTitle>{copy.chooseExistingChat}</ModalTitle>
        <ModalDescription className="mt-2">{copy.oneTaskChat}</ModalDescription>
        <input
          type="search"
          aria-label={copy.searchChats}
          placeholder={copy.searchChats}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="border-line bg-canvas my-4 w-full rounded-lg border px-3 py-2 text-sm"
        />
        <div className="scroll-area min-h-0 overflow-y-auto">
          {chats.isPending ? (
            <p className="text-muted p-3 text-sm">{copy.loading}</p>
          ) : chats.isError ? (
            <button onClick={() => void chats.refetch()}>{copy.refresh}</button>
          ) : (
            <ul className="space-y-1">
              {chats.data
                .filter((chat) =>
                  `${chat.name} ${chat.preview} ${chat.id}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((chat) => {
                  const link = board.data?.taskChats?.find((item) => item.chatId === chat.id);
                  return (
                    <li key={chat.id}>
                      <button
                        disabled={pending || (!!link && link.taskId !== taskId)}
                        onClick={() => void select(chat.id)}
                        className="hover:bg-selected w-full rounded-lg px-3 py-3 text-left text-sm wrap-anywhere disabled:opacity-50"
                      >
                        {chat.name || chat.preview || copy.newChat}
                        {link && (
                          <span className="text-muted mt-1 block text-xs">
                            {copy.linkedTask}: {link.taskTitle}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              {!chats.data.length && (
                <li className="text-muted p-3 text-sm">{copy.emptyChats}</li>
              )}
            </ul>
          )}
        </div>
        {error && (
          <p role="alert" className="text-danger mt-3 text-sm">
            {error}
          </p>
        )}
        <button
          disabled={pending}
          onClick={onClose}
          className="text-accent mt-4 self-end text-sm"
        >
          {copy.cancel}
        </button>
      </ModalContent>
    </Modal>
  );
};
