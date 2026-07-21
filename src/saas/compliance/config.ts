import {optionalEnvConfig} from '../../plugins/Environment/environment';
import {getSaasConfig} from '../config';

export type LegalDocument={type:'TERMS'|'PRIVACY';version:string;url:string;sha256:string};
export type ComplianceConfig={documents:{terms:LegalDocument;privacy:LegalDocument};evidenceSecret:string;evidenceKeyId:string};

const version=(name:string,fallback:string)=>{const value=optionalEnvConfig(name)??fallback;if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)||value==='legacy')throw new Error(`${name} must be an immutable non-legacy version.`);return value;};
const digest=(name:string,fallback:string,production:boolean)=>{const value=(optionalEnvConfig(name)??fallback).toLowerCase();if(!/^[0-9a-f]{64}$/.test(value)||(production&&/^0+$/.test(value)))throw new Error(`${name} must be a non-placeholder SHA-256 digest.`);return value;};
const url=(name:string,fallback:string,production:boolean)=>{const value=optionalEnvConfig(name)??fallback;let parsed:URL;try{parsed=new URL(value);}catch{throw new Error(`${name} must be an absolute URL.`);}if(production&&parsed.protocol!=='https:')throw new Error(`${name} must use HTTPS in production.`);return value;};

export function getComplianceConfig():ComplianceConfig{const production=optionalEnvConfig('ENV_RELEASE')==='prod';const placeholder='0'.repeat(64);const evidenceSecret=optionalEnvConfig('CONSENT_EVIDENCE_SECRET')??(production?'':getSaasConfig().jwtSecret);
  if(Buffer.byteLength(evidenceSecret)<32)throw new Error('CONSENT_EVIDENCE_SECRET must contain at least 32 bytes in production.');
  const evidenceKeyId=version('CONSENT_EVIDENCE_KEY_ID',production?'':'development-v1');
  return{documents:{terms:{type:'TERMS',version:version('TERMS_VERSION','2026-01'),url:url('TERMS_URL','http://localhost/legal/terms',production),sha256:digest('TERMS_SHA256',placeholder,production)},
    privacy:{type:'PRIVACY',version:version('PRIVACY_VERSION','2026-01'),url:url('PRIVACY_URL','http://localhost/legal/privacy',production),sha256:digest('PRIVACY_SHA256',placeholder,production)}},evidenceSecret,evidenceKeyId};}
