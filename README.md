# Tonatiuh Trading SaaS

Trading backend used by Tonatiuh desktop and SaaS deployments.

## Development

```bash
npm ci
npm test
npm run start:dev
```

Desktop mode stores SQLite databases under `TONATIUH_DATA_DIR`. Production
desktop launches also provide `TONATIUH_API_TOKEN` and `ENCRYPTION_KEY`.
