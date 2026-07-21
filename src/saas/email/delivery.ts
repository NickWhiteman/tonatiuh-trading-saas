import { createHmac } from 'crypto';
import { getSaasConfig } from '../config';
import { optionalEnvConfig } from '../../plugins/Environment/environment';

export type EmailTemplate='VERIFY_EMAIL'|'RESET_PASSWORD'|'INVITE_MEMBER';
export type EmailLocale='ru'|'en';
export const emailHash=(email:string):string=>createHmac('sha256',getSaasConfig().jwtSecret).update(email.trim().toLowerCase()).digest('hex');
export function defaultEmailLocale():EmailLocale{const locale=optionalEnvConfig('DEFAULT_EMAIL_LOCALE')??'ru';if(locale!=='ru'&&locale!=='en')throw new Error('DEFAULT_EMAIL_LOCALE must be ru or en.');return locale;}
