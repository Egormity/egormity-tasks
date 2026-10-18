"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";

import { classNames } from "./class-names";

export const Modal = Dialog.Root;

export const ModalClose = Dialog.Close;

type ModalContentProps = ComponentProps<typeof Dialog.Content> & {
  readonly nested?: boolean | undefined;
};

export const ModalContent = ({
  className,
  children,
  nested = false,
  ...props
}: ModalContentProps) => (
  <Dialog.Portal>
    <Dialog.Overlay
      className={classNames(
        "bg-board-overlay fixed inset-0 backdrop-blur-xs",
        nested ? "z-[60]" : "z-40",
      )}
    />
    <Dialog.Content
      className={classNames(
        "border-board-modal-border bg-board-surface text-board-heading fixed top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border shadow-xl focus:outline-none",
        nested ? "z-[70]" : "z-50",
        className,
      )}
      {...props}
    >
      {children}
    </Dialog.Content>
  </Dialog.Portal>
);

export const ModalHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={classNames("space-y-1.5", className)} {...props} />
);

export const ModalFooter = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={classNames("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);

export const ModalTitle = ({ className, ...props }: ComponentProps<typeof Dialog.Title>) => (
  <Dialog.Title className={classNames("text-lg font-semibold", className)} {...props} />
);

export const ModalDescription = ({
  className,
  ...props
}: ComponentProps<typeof Dialog.Description>) => (
  <Dialog.Description
    className={classNames("text-board-muted text-sm", className)}
    {...props}
  />
);
