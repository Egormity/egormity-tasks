const translations: Record<string, string> = {
  "Your session has expired. Sign in again.": "Сессия истекла. Войдите снова.",
  "Too many login attempts. Try again later.": "Слишком много попыток входа. Попробуйте позже.",
  "Enter a valid email and password.": "Введите корректную почту и пароль.",
  "Invalid email or password.": "Неверная почта или пароль.",
  "Unable to sign in. Try again later.": "Не удалось войти. Попробуйте позже.",
  "This request must come from the operations application.":
    "Отправьте запрос из приложения задач.",
  "Endpoint not found.": "Страница не найдена.",
  "Invalid request body.": "Некорректные данные запроса.",
  "The file or request is too large.": "Файл или запрос превышает допустимый размер.",
  "The request could not be completed.": "Не удалось выполнить запрос.",
  "Task not found.": "Задача не найдена.",
  "One or more tags do not exist.": "Один или несколько тегов больше не существуют.",
  "The board changed. Refresh and try again.":
    "Доска изменилась. Обновите её и попробуйте снова.",
  "The task changed. Reopen it before saving.":
    "Задача изменилась. Откройте её заново перед сохранением.",
  "A tag with this name already exists.": "Тег с таким названием уже существует.",
  "A task can have up to ten attachments.": "К задаче можно прикрепить до десяти файлов.",
  "Attachment not found.": "Вложение не найдено.",
  "Invalid task data.": "Проверьте данные задачи.",
  "Tag not found.": "Тег не найден.",
  "Choose a non-empty file.": "Выберите непустой файл.",
  "Invalid file name.": "Некорректное имя файла.",
  "Attachment file is unavailable.": "Файл вложения недоступен.",
  "User not found.": "Пользователь не найден.",
  "Invalid user data.": "Проверьте данные пользователя.",
  "You cannot change your own role.": "Нельзя изменить свою роль.",
  "You cannot delete your own account.": "Нельзя удалить свою учётную запись.",
  "At least one admin account must remain.": "Должен остаться хотя бы один администратор.",
  "A user with this username already exists.": "Пользователь с таким именем уже существует.",
};

export const localizeError = (message: string, locale: "en" | "ru") =>
  locale === "en"
    ? message
    : (translations[message] ??
      "Не удалось выполнить запрос. Проверьте соединение и попробуйте снова.");
