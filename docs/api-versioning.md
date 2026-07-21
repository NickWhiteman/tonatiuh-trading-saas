# API versioning and TypeScript SDK

The canonical public API is `/api/v1`. Health and Prometheus endpoints are
operational interfaces and remain at `/health/*` and `/metrics`.

The previous unversioned `/api/*` routes call the same handlers during the
migration window. Every legacy response includes:

- `Deprecation: @1784592000` (21 July 2026, RFC 9745 structured date);
- `Sunset: Wed, 21 Jul 2027 00:00:00 GMT`;
- `Link: </api/v1/...>; rel="successor-version"` for the matching v1 resource.

Clients must move to `/api/v1` before the sunset date. Deprecation does not
change legacy response behavior. Removing the alias requires a separately
reviewed release and customer communication.

## Compatibility policy

Within v1, changes must be backward compatible: add optional fields or new
operations, do not remove operations or parameters, narrow accepted input,
remove response fields, or add required input. A breaking change requires a new
major path such as `/api/v2` and an overlap period.

`npm run openapi:compat` compares the contract against
`docs/openapi.v1-baseline.json`. Update the baseline only after an explicit API
compatibility review. `npm run openapi:validate` also checks route inventory,
security and idempotency requirements.

## SDK workflow

The publishable package is in `sdk/` and targets Node.js 20+ and modern browsers
with Fetch API support.

```bash
npm run sdk:generate
npm run sdk:check
npm run sdk:build
```

Generation produces component types, typed operation inputs and immutable
method/path metadata from `docs/openapi.yaml`. Handwritten transport code adds
Bearer authentication, path/query encoding, JSON handling, abort signals and
stable `TonatiuhApiError` fields. CI fails when generated output is stale.

Release the SDK with the same major version as its API path. Additive API changes
increment the SDK minor version; fixes that do not change its public types
increment the patch version.
