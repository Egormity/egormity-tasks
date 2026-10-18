# API application

This is the standalone Amazi source root for the Node/Express API. Its implementation and shared
transport contracts are copied from `src/api`; the original monorepo source remains in `src/`
unchanged.

The application uses SQLite at `OPERATIONS_AGENT_DATA_DIRECTORY` (default `/data`). Configure a
persistent data volume before production use. Runtime setup also requires the external identity
service URL and the Gateway bridge URL/token. `OPERATIONS_AGENT_PUBLIC_URL` is the Web production
origin used for request-origin checks and secure cookies.

Run `npm ci` and `npm run build:api` from this directory to verify the API bundle.
