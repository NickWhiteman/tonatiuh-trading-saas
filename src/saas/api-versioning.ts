import { RequestHandler } from 'express';

export const API_V1_PREFIX='/api/v1';
export const LEGACY_API_PREFIX='/api';
export const LEGACY_API_DEPRECATED_AT='@1784592000';
export const LEGACY_API_SUNSET='Wed, 21 Jul 2027 00:00:00 GMT';

export const legacyApiDeprecation:RequestHandler=(req,res,next)=>{
  const current=new URL(req.originalUrl,'http://localhost');const successor=`${API_V1_PREFIX}${current.pathname.slice(LEGACY_API_PREFIX.length)}${current.search}`;
  res.setHeader('Deprecation',LEGACY_API_DEPRECATED_AT);
  res.setHeader('Sunset',LEGACY_API_SUNSET);
  res.setHeader('Link',`<${successor}>; rel="successor-version"`);
  next();
};
