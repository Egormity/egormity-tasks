const translations: Record<string, string> = {
  "This conversation is already linked to another task.":
    "Этот чат уже связан с другой задачей.",
  "Send the first message before linking this conversation.":
    "Сначала отправьте первое сообщение в этот чат.",
  "Invalid task chat request.": "Некорректный запрос обсуждения задачи.",
  "Invalid conversation selection.": "Некорректный адрес чата.",
  "This conversation is not linked to this task.": "Этот чат не связан с выбранной задачей.",
  "Invalid Codex session ID.": "Codex вернул некорректный ID чата.",
  "This CLI uses a separate Codex process. Reopen it through the Codex daemon to control it here.":
    "Этот CLI запущен отдельным процессом. Откройте его через общий демон Codex, чтобы управлять им здесь.",
  "These model settings are not available for your Codex account.":
    "Эти настройки модели недоступны для вашего аккаунта Codex.",
  "A message is being submitted. Try again shortly.":
    "Сообщение отправляется. Повторите через мгновение.",
  "The agent is paused for maintenance.": "Агент приостановлен для обслуживания.",
  "Codex request timed out. Check the conversation before retrying.":
    "Codex не ответил вовремя. Проверьте историю перед повторной отправкой.",
  "Too many incorrect confirmation attempts. Try again in 15 minutes.":
    "Слишком много неверных кодов. Повторите через 15 минут.",
  "Confirm this action with a Telegram code.": "Подтвердите действие кодом из Telegram.",
  "Invalid confirmation request.": "Некорректный запрос подтверждения.",
  "Telegram confirmation is not configured. Agent actions are blocked.":
    "Подтверждение через Telegram не настроено. Действия агента заблокированы.",
  "The confirmation code could not be delivered to Telegram.":
    "Не удалось доставить код в Telegram. Действие не выполнено.",
  "Wait 30 seconds before requesting another code.":
    "Подождите 30 секунд перед запросом нового кода.",
  "Too many confirmation requests. Try again later.":
    "Слишком много запросов подтверждения. Попробуйте позже.",
  "The confirmation expired or does not match this request. Request a new code.":
    "Подтверждение истекло или не соответствует запросу. Получите новый код.",
  "Too many incorrect codes. Request a new code.":
    "Слишком много неверных попыток. Получите новый код.",
  "Incorrect confirmation code.": "Неверный код подтверждения.",
  "A confirmation is already pending.": "Сначала завершите текущее подтверждение.",
  "Amazi authentication is temporarily unavailable.": "Сервис входа Amazi временно недоступен.",
  "Sign in with an Amazi administrator account.":
    "Войдите с учётной записью администратора Amazi.",
  "Your session has expired. Sign in again.": "Сессия истекла. Войдите снова.",
  "Administrator access is required.": "Нужны права администратора.",
  "Too many login attempts. Try again later.": "Слишком много попыток входа. Попробуйте позже.",
  "Enter a valid email and password.": "Введите корректную почту и пароль.",
  "Invalid email or password.": "Неверная почта или пароль.",
  "Unable to sign in. Try again later.": "Не удалось войти. Попробуйте позже.",
  "The agent is already working.": "Агент уже выполняет задачу.",
  "Wait for the current task to finish before sending another message.":
    "Дождитесь завершения текущей задачи агента перед отправкой сообщения.",
  "The agent is already working. Wait for the current task to finish.":
    "Дождитесь завершения текущей задачи агента.",
  "This request identifier has already been used.": "Этот запрос уже был отправлен.",
  "Connect the Codex account before sending a message.":
    "Подключите аккаунт Codex перед отправкой сообщения.",
  "The Codex worker is unavailable.": "Агент Codex временно недоступен.",
  "The Codex worker could not accept this request.":
    "Агент Codex не смог принять запрос. Попробуйте позже.",
  "This request must come from the operations application.":
    "Отправьте запрос из приложения задач.",
  "Conversation not found.": "Чат не найден.",
  "Enter a message within the supported length.": "Введите сообщение допустимой длины.",
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
};

export const localizeError = (message: string, locale: "en" | "ru") =>
  locale === "en"
    ? message
    : (translations[message] ??
      "Не удалось выполнить запрос. Проверьте соединение и попробуйте снова.");
