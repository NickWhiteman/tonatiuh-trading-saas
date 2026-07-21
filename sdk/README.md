# @tonatiuh/trading-sdk

TypeScript client generated from the versioned Tonatiuh OpenAPI contract.

```ts
import {TonatiuhClient} from '@tonatiuh/trading-sdk';

const client=new TonatiuhClient({
  baseUrl:'https://api.example.com',
  accessToken:()=>session.accessToken,
});

const account=await client.operations.currentAccount({});
const bot=await client.operations.getBot({path:{id:'bot-uuid'}});
```

Errors are thrown as `TonatiuhApiError` and preserve the HTTP status, stable API
error code, request ID and safe error details. Run `npm run sdk:generate` from the
repository root after changing `docs/openapi.yaml`; CI rejects stale output.
