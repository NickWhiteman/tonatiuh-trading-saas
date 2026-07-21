import { EmailLocale, EmailTemplate } from './delivery';

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const copy={
  ru:{VERIFY_EMAIL:['Подтвердите email Tonatiuh','Подтвердить email'],RESET_PASSWORD:['Сброс пароля Tonatiuh','Сбросить пароль'],INVITE_MEMBER:['Приглашение в Tonatiuh','Принять приглашение']},
  en:{VERIFY_EMAIL:['Verify your Tonatiuh email','Verify email'],RESET_PASSWORD:['Reset your Tonatiuh password','Reset password'],INVITE_MEMBER:['Tonatiuh workspace invitation','Accept invitation']},
} as const;
export function renderEmail(template:EmailTemplate,locale:EmailLocale,url:string){const [subject,action]=copy[locale][template];const safeUrl=escapeHtml(url);const text=`${subject}\n\n${action}: ${url}\n\n${locale==='ru'?'Если вы не запрашивали это действие, проигнорируйте письмо.':'If you did not request this action, ignore this email.'}`;
  const html=`<!doctype html><html lang="${locale}"><body><main><h1>${escapeHtml(subject)}</h1><p><a href="${safeUrl}">${escapeHtml(action)}</a></p><p>${locale==='ru'?'Если вы не запрашивали это действие, проигнорируйте письмо.':'If you did not request this action, ignore this email.'}</p></main></body></html>`;
  return{subject,text,html};}
