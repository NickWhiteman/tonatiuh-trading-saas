import pino from 'pino';
import { optionalEnvConfig } from '../../plugins/Environment/environment';

export const logger=pino({
  level:optionalEnvConfig('LOG_LEVEL')??'info',
  base:{service:'tonatiuh-trading-saas',environment:optionalEnvConfig('ENV_RELEASE')??'prod'},
  redact:{paths:['password','token','refreshToken','accessToken','apiKey','secret','authorization','credentials','*.password','*.token','*.apiKey','*.secret'],censor:'[REDACTED]'},
  serializers:{err:pino.stdSerializers.err},
});
