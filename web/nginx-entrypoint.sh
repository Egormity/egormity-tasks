#!/bin/sh
set -eu

: "${OPERATIONS_AGENT_PRODUCTION_API_TARGET:?Set the API application address before starting Web}"
envsubst '${OPERATIONS_AGENT_PRODUCTION_API_TARGET}' \
  < /etc/nginx/nginx.conf.template \
  > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
