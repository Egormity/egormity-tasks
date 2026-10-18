# Web application

This is the standalone Amazi browser application. It contains the React task board and login screen;
it has no server-side account or database code. The API owns administrator authentication and board
data. Web and API share an origin through the configured `/api` proxy.

`src/api/contracts/` is the Web copy of API-owned transport contracts; update it when the matching
API contract changes. The application Dockerfile and Vite configuration live in this source root.

The administrator signs in with the locally configured API account. No external identity-service
credentials are sent to the browser.
