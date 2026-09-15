#!/usr/bin/env bash
# Fact inventory for the XAA kit. Every string below is load-bearing:
# a host, URN, scope, error code, env var, lifetime, or non-obvious gotcha.
# If one goes missing from the docs, a developer will guess it wrong.
# Usage: bash .claude/check-facts.sh
cd "$(dirname "$0")/.." || exit 1
DOCS="README.md AGENTS.md CLAUDE.md llms.txt hackathon-kit/SPEC.md hackathon-kit/BUILD.md hackathon-kit/DEBUG.md hackathon-kit/IGNITION.md"

FACTS=(
  # hosts + discovery
  'https://idp.xaa.dev' 'https://auth.resource.xaa.dev' 'https://api.resource.xaa.dev'
  'https://mcp.xaa.dev/mcp' 'openid-configuration' 'oauth-authorization-server'
  'oauth-protected-resource' 'authorization_grant_profiles_supported'
  'token_exchange_subject_token_types_supported'
  'identity_chaining_requested_token_types_supported'
  'authorization-server:5001' '/saml/metadata' '/saml/sso' '/saml/slo' '/session/end'
  'token/introspection' 'IdenX SAML IdP' 'https://idp.xaa.dev/saml'
  # URNs
  'urn:ietf:params:oauth:grant-type:token-exchange'
  'urn:ietf:params:oauth:grant-type:jwt-bearer'
  'urn:ietf:params:oauth:token-type:saml2'
  'urn:ietf:params:oauth:token-type:refresh_token'
  'urn:ietf:params:oauth:token-type:id-jag'
  'urn:ietf:params:oauth:grant-profile:id-jag'
  'urn:okta:params:oauth:token-type:id-jag'
  'urn:oasis:names:tc:SAML:2.0:status:Success'
  'nameid-format:emailAddress' 'oauth-id-jag+jwt' 'at+jwt'
  # scopes, params, values
  'offline_access' 'todos.read' 'mcp.access' 'todos.write' 'prompt=consent'
  'code_challenge_method=S256' 'client_secret_post' 'client_secret_basic'
  '2025-03-26' 'todo0://todos' 'application/json, text/event-stream'
  'resources/list' 'resources/read' 'StreamableHTTP' 'authProvider'
  '{CLIENT_ID}-at-{resource_id}' 'saml-nameid' 'sp_name_qualifier'
  'InResponseTo' 'RelayState' 'AudienceRestriction' 'NotOnOrAfter'
  # lifetimes / limits
  '30 s' '5 min' '~2 h' '~10 min' '7200' '200-entry' '4 KB' '10 minutes'
  # env vars
  'XAA_PROTOCOL' 'APP_TYPE' 'CLIENT_ID' 'CLIENT_SECRET' 'RESOURCE_CLIENT_ID'
  'RESOURCE_CLIENT_SECRET' 'RESOURCE_PATH' 'RESOURCE_SCOPES' 'RESOURCE_URL'
  'MCP_SERVER_URL' 'MCP_PROTOCOL_VERSION' 'REDIRECT_URI' 'SAML_ACS_URL'
  'SAML_NAMEID_FORMAT' 'SESSION_SECRET' 'APP_URL' 'IDP_URL' 'AUTH_SERVER_URL'
  'SAML_SP_ENTITY_ID' 'MCP_RESOURCE'
  # v4 review fixes — each of these closed a defect; losing one reopens it
  'Reference URI' 'McpSdkOAuthAttempt' 'iron-session' 'securecookie' 'Fernet'
  'Sec-Fetch-Site' 'SubjectConfirmationData' 'Recipient' 'signed only' 'replay'
  'Signed ≠ encrypted' 'SessionMiddleware' 'itsdangerous'
  'Any other 4xx' 'remintedAfterExpiry' 'tokenState' 'LogEntry'
  'D-24' 'D-27' 'D-28' 'T9.1' 'T7.2'
  # error taxonomy
  'unauthorized' 'invalid_token' 'expired_token' 'insufficient_scope'
  'resource_failure' 'token_exchange_failure' 'config_error' 'unknown'
  'invalid_grant' 'invalid_client' 'unsupported_grant_type' 'invalid_request'
  'invalid_target' 'invalid_scope' 'upstream_step' 'requiresReauth'
  '-32000' '-32601' '-32602' '-32600' '-32700' '406' 'WWW-Authenticate'
  # routes
  '/api/auth/callback' '/api/auth/saml/acs' '/api/auth/session' '/api/call' '/api/logs'
  # non-obvious gotchas that cost hours if lost
  'no revocation endpoint' 'SameSite' 'transient' 'signature-wrapping'
  'customer1' 'saml_id_jag' 'TODO(confirm)' 'FINAL_VALIDATION.md'
  # every D-entry and the pivotal test rows must remain addressable
  'D-16' 'D-19' 'D-20' 'D-23' 'T6.2' 'T8.2' 'E6' 'E8'
)

fail=0
for f in "${FACTS[@]}"; do
  if ! grep -qF -- "$f" $DOCS 2>/dev/null; then
    printf 'MISSING: %s\n' "$f"; fail=$((fail+1))
  fi
done
total=${#FACTS[@]}
echo "---"
if [ "$fail" -eq 0 ]; then
  echo "PASS — all $total load-bearing facts present."
else
  echo "FAIL — $fail of $total facts missing."; exit 1
fi
