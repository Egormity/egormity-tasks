# Web application

This is the standalone Amazi source root for the React/Vite frontend. Its interface is copied
from `src/web`, and `src/api/contracts` is included as the frontend's transport-contract snapshot.
The original monorepo source remains in `src/` unchanged.

In Amazi preview, Vite proxies `/api` to `OPERATIONS_AGENT_WEB_API_TARGET`. In a production
container, the Nginx entrypoint proxies `/api` to `OPERATIONS_AGENT_PRODUCTION_API_TARGET`.
`OPERATIONS_AGENT_PUBLIC_URL` must be the Web production origin so the API can validate the
proxied request origin. These URLs are project settings, not source-code constants.

Run `npm ci` and `npm run build:web` from this directory to verify the frontend bundle.
