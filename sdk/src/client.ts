import {OperationId,Operations,operations,RequestOptions} from './generated.js';

export type AccessToken=string|(()=>string|undefined|Promise<string|undefined>);
export type OperationMethods={ [K in OperationId]:(options:RequestOptions<K>)=>Promise<Operations[K]['response']> };
export type TonatiuhClientOptions={baseUrl:string;accessToken?:AccessToken;fetch?:typeof fetch;headers?:HeadersInit};

export class TonatiuhApiError extends Error{
  constructor(public readonly status:number,public readonly code:string,message:string,public readonly requestId?:string,public readonly details?:unknown){super(message);this.name='TonatiuhApiError';}
}

export class TonatiuhClient{
  private readonly baseUrl:string;private readonly token?:AccessToken;private readonly fetcher:typeof fetch;private readonly defaultHeaders?:HeadersInit;
  readonly operations:OperationMethods;
  constructor(options:TonatiuhClientOptions){this.baseUrl=options.baseUrl.replace(/\/$/,'');this.token=options.accessToken;this.fetcher=options.fetch??globalThis.fetch;this.defaultHeaders=options.headers;
    if(!this.fetcher)throw new Error('A Fetch API implementation is required.');
    this.operations=new Proxy({}, {get:(_target,key)=>{if(typeof key!=='string'||!(key in operations))return undefined;return(options:RequestOptions<OperationId>)=>this.request(key as OperationId,options);}}) as OperationMethods;
  }
  async request<K extends OperationId>(operationId:K,options:RequestOptions<K>):Promise<Operations[K]['response']>{const operation=operations[operationId];const input=options as {path?:Record<string,unknown>;query?:Record<string,unknown>;headers?:Record<string,string>;body?:unknown;signal?:AbortSignal};
    let path:string=operation.path;for(const [name,value]of Object.entries(input.path??{}))path=path.replace(`{${name}}`,encodeURIComponent(String(value)));
    if(/\{[^}]+\}/.test(path))throw new Error(`Missing path parameter for ${operationId}.`);const url=new URL(`${this.baseUrl}${path}`);
    for(const [name,value]of Object.entries(input.query??{})){if(value===undefined)continue;for(const item of Array.isArray(value)?value:[value])url.searchParams.append(name,String(item));}
    const headers=new Headers(this.defaultHeaders);headers.set('Accept','application/json');for(const [name,value]of Object.entries(input.headers??{}))headers.set(name,value);
    const token=typeof this.token==='function'?await this.token():this.token;if(token)headers.set('Authorization',`Bearer ${token}`);
    let body:BodyInit|undefined;if(input.body!==undefined){headers.set('Content-Type','application/json');body=JSON.stringify(input.body);}
    const response=await this.fetcher(url,{method:operation.method,headers,body,signal:input.signal});const contentType=response.headers.get('content-type')??'';
    const payload=response.status===204?undefined:contentType.includes('json')?await response.json():await response.text();if(!response.ok){const error=payload&&typeof payload==='object'&&'error'in payload?(payload as {error?:{code?:string;message?:string;requestId?:string;details?:unknown}}).error:undefined;
      throw new TonatiuhApiError(response.status,error?.code??'HTTP_ERROR',error?.message??response.statusText,error?.requestId,error?.details);}
    return payload as Operations[K]['response'];
  }
}
