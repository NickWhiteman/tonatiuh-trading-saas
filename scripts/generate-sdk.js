const {readFile,writeFile}=require('node:fs/promises');
const {parse}=require('yaml');

const contractPath='docs/openapi.yaml';
const outputPath='sdk/src/generated.ts';
const methods=new Set(['get','post','put','patch','delete']);
const identifier=value=>String(value).replace(/[^A-Za-z0-9_$]/g,'_').replace(/^[0-9]/,'_$&');
const property=value=>/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)?value:JSON.stringify(value);
const refName=ref=>identifier(ref.split('/').at(-1));
const resolve=(document,value)=>{if(!value?.$ref)return value;return value.$ref.slice(2).split('/').reduce((current,key)=>current?.[key],document);};

function schemaType(schema){
  if(!schema)return'unknown';
  if(schema.$ref)return refName(schema.$ref);
  if(schema.const!==undefined)return JSON.stringify(schema.const);
  if(schema.enum)return schema.enum.map(value=>JSON.stringify(value)).join(' | ');
  if(schema.oneOf)return schema.oneOf.map(schemaType).join(' | ');
  if(schema.anyOf)return schema.anyOf.map(schemaType).join(' | ');
  if(schema.allOf)return schema.allOf.map(item=>`(${schemaType(item)})`).join(' & ');
  let result;
  if(schema.type==='string')result='string';
  else if(schema.type==='integer'||schema.type==='number')result='number';
  else if(schema.type==='boolean')result='boolean';
  else if(schema.type==='null')result='null';
  else if(schema.type==='array')result=`Array<${schemaType(schema.items)}>`;
  else if(schema.type==='object'||schema.properties){const required=new Set(schema.required??[]);const fields=Object.entries(schema.properties??{}).map(([name,value])=>
    `${property(name)}${required.has(name)?'':'?'}: ${schemaType(value)};`);
    if(schema.additionalProperties===true)fields.push('[key: string]: unknown;');
    else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')fields.push(`[key: string]: ${schemaType(schema.additionalProperties)};`);
    result=fields.length?`{ ${fields.join(' ')} }`:'Record<string, unknown>';
  }else result='unknown';
  return schema.nullable?`${result} | null`:result;
}

function parameterType(parameters){if(!parameters.length)return'never';const required=new Set(parameters.filter(item=>item.required).map(item=>item.name));
  return`{ ${parameters.map(item=>`${property(item.name)}${required.has(item.name)?'':'?'}: ${schemaType(item.schema)};`).join(' ')} }`;}

function operationEntries(document){const entries=[];for(const [path,pathItem]of Object.entries(document.paths??{}))for(const [method,operation]of Object.entries(pathItem)){
  if(!methods.has(method)||!operation.operationId)continue;const parameters=[...(pathItem.parameters??[]),...(operation.parameters??[])].map(value=>resolve(document,value));
  const requestBody=resolve(document,operation.requestBody);const bodySchema=requestBody?.content?.['application/json']?.schema;
  const success=Object.entries(operation.responses??{}).find(([status])=>/^2\d\d$/.test(status));const response=success?resolve(document,success[1]):undefined;
  entries.push({operationId:operation.operationId,path,method:method.toUpperCase(),pathType:parameterType(parameters.filter(item=>item.in==='path')),
    queryType:parameterType(parameters.filter(item=>item.in==='query')),headersType:parameterType(parameters.filter(item=>item.in==='header')),
    bodyType:bodySchema?schemaType(bodySchema):'never',bodyRequired:requestBody?.required===true,responseType:success?.[0]==='204'?'void':schemaType(response?.content?.['application/json']?.schema)});
  }return entries;}

async function generate(){const document=parse(await readFile(contractPath,'utf8'));const entries=operationEntries(document);const components=Object.entries(document.components?.schemas??{}).map(([name,schema])=>`export type ${identifier(name)} = ${schemaType(schema)};`).join('\n');
  const definitions=entries.map(item=>`  ${property(item.operationId)}: { path: ${item.pathType}; query: ${item.queryType}; headers: ${item.headersType}; body: ${item.bodyType}; bodyRequired: ${item.bodyRequired}; response: ${item.responseType}; };`).join('\n');
  const operations=entries.map(item=>`  ${property(item.operationId)}: {method:${JSON.stringify(item.method)},path:${JSON.stringify(item.path)}}`).join(',\n');
  return`/* Generated from docs/openapi.yaml. Do not edit manually. */\n\n${components}\n\nexport interface Operations {\n${definitions}\n}\nexport type OperationId=keyof Operations;\nexport type RequestOptions<K extends OperationId>={signal?:AbortSignal}&\n  ([Operations[K]['path']] extends [never]?{path?:never}:{path:Operations[K]['path']})&\n  ([Operations[K]['query']] extends [never]?{query?:never}:{query?:Operations[K]['query']})&\n  ([Operations[K]['headers']] extends [never]?{headers?:never}:{headers:Operations[K]['headers']})&\n  (Operations[K]['bodyRequired'] extends true?{body:Operations[K]['body']}:[Operations[K]['body']] extends [never]?{body?:never}:{body?:Operations[K]['body']});\n\nexport const operations={\n${operations}\n} as const satisfies Record<OperationId,{method:string;path:string}>;\n`;
}

async function main(){const generated=await generate();if(process.argv.includes('--check')){const current=await readFile(outputPath,'utf8').catch(()=>null);if(current!==generated)throw new Error(`${outputPath} is stale. Run npm run sdk:generate.`);return;}await writeFile(outputPath,generated);}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={generate,schemaType,operationEntries};
