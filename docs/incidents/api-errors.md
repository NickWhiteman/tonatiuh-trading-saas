# Elevated API errors

1. Break down 5xx rate by normalized route and compare it with deployment and database events.
2. Inspect structured logs using `requestId`; never paste tokens or encrypted credentials into the incident channel.
3. Roll back the application image when the regression is release-related. Forward-fix schema changes.
4. Disable only the affected integration or feature when a provider is failing; preserve authentication and read paths.
5. Verify the error ratio for two evaluation windows before resolving.
