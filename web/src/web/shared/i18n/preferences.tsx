import { internalTasksPolicy as policy } from "@contracts/policy.js";
import { type ReactNode, createContext, useContext, useState } from "react";

import { Select } from "@/shared/ui/Select";
import { type Copy, en } from "./copy";
import { ru } from "./copy.ru";
import { localizeError } from "@/shared/http/errors";

export type Locale = "ru" | "en";

type Theme = "dark" | "light";

type Preferences = { locale: Locale; theme: Theme };

export const resolvePreferences = (
  saved: unknown,
  language: string,
  dark: boolean,
): Preferences => {
  const value = saved as Partial<Preferences> | null;
  return {
    locale:
      value?.locale === "ru" || value?.locale === "en"
        ? value.locale
        : language.startsWith("en")
          ? "en"
          : policy.defaultLocale,
    theme:
      value?.theme === "light" || value?.theme === "dark"
        ? value.theme
        : dark
          ? "dark"
          : "light",
  };
};

const read = (): Preferences => {
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(policy.preferencesStorageKey) ?? "null");
  } catch {
    /* Preferences are optional. */
  }
  return resolvePreferences(
    saved,
    navigator.language,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
};

const apply = (value: Preferences) => {
  document.documentElement.dataset.theme = value.theme;
  document.documentElement.lang = value.locale;
  document.title = value.locale === "ru" ? "Задачи · Amazi" : "Tasks · Amazi";
};

export const initializePreferences = () => apply(read());

const Context = createContext<
  | (Preferences & {
      copy: Copy;
      setLocale: (locale: Locale) => void;
      setTheme: (theme: Theme) => void;
    })
  | null
>(null);

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [value, setValue] = useState(read);
  const update = (next: Preferences) => {
    apply(next);
    try {
      localStorage.setItem(policy.preferencesStorageKey, JSON.stringify(next));
    } catch {
      /* Keep in-memory preferences when storage is unavailable. */
    }
    setValue(next);
  };
  return (
    <Context
      value={{
        ...value,
        copy: value.locale === "ru" ? ru : en,
        setLocale: (locale) => update({ ...value, locale }),
        setTheme: (theme) => update({ ...value, theme }),
      }}
    >
      {children}
    </Context>
  );
};

export const usePreferences = () => {
  const value = useContext(Context);
  if (!value) throw new Error("Preferences provider is required");
  return { ...value, errorText: (message: string) => localizeError(message, value.locale) };
};

export const PreferenceControls = () => {
  const { locale, theme, setLocale, setTheme, copy } = usePreferences();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="w-14">
        <Select
          compact
          hideLabel
          label={copy.language}
          value={locale}
          onChange={setLocale}
          options={[
            { value: "ru", label: "RU" },
            { value: "en", label: "EN" },
          ]}
        />
      </div>
      <div className="w-24">
        <Select
          compact
          hideLabel
          label={copy.theme}
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: copy.light },
            { value: "dark", label: copy.dark },
          ]}
        />
      </div>
    </div>
  );
};
