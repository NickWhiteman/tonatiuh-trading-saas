const {readFile,writeFile}=require('node:fs/promises');
const {parse}=require('yaml');
const contractPath='docs/openapi.yaml';
const baselinePath='docs/openapi.v1-baseline.json';
const methods=new Set(['get','post','put','patch','delete']);
const resolve=(document,value)=>{if(!value?.$ref)return value;return value.$ref.slice(2).split('/').reduce((current,key)=>current?.[key],document);};

function snapshot(document){const operations={};for(const [path,pathItem]of Object.entries(document.paths??{}))for(const [method,operation]of Object.entries(pathItem)){
  if(!methods.has(method)||!operation.operationId)continue;const parameters=[...(pathItem.parameters??[]),...(operation.parameters??[])].map(value=>resolve(document,value)).map(item=>({name:item.name,in:item.in,required:item.required===true,schema:item.schema}));
  const requestBody=resolve(document,operation.requestBody);const responses={};for(const [status,value]of Object.entries(operation.responses??{})){const response=resolve(document,value);responses[status]=response?.content?.['application/json']?.schema;}
  operations[operation.operationId]={method,path,parameters,requestBody:requestBody?{required:requestBody.required===true,schema:requestBody.content?.['application/json']?.schema}:undefined,responses};
  }return{version:document.info.version,operations,schemas:document.components?.schemas??{}};}

function resolvedSchema(schema,root){let current=schema;const seen=new Set();while(current?.$ref&&!seen.has(current.$ref)){seen.add(current.$ref);current=root.schemas[current.$ref.split('/').at(-1)];}return current;}
function compareSchema(oldValue,newValue,oldRoot,newRoot,mode,path,issues){const oldSchema=resolvedSchema(oldValue,oldRoot);const newSchema=resolvedSchema(newValue,newRoot);
  if(!oldSchema&&!newSchema)return;if(!newSchema){issues.push(`${path}: schema was removed`);return;}if(!oldSchema)return;
  const oldType=oldSchema.type??(oldSchema.properties?'object':undefined);const newType=newSchema.type??(newSchema.properties?'object':undefined);if(oldType!==newType){issues.push(`${path}: type changed from ${oldType??'unknown'} to ${newType??'unknown'}`);return;}
  const oldEnum=oldSchema.enum?new Set(oldSchema.enum.map(JSON.stringify)):undefined;const newEnum=newSchema.enum?new Set(newSchema.enum.map(JSON.stringify)):undefined;
  if(mode==='input'&&newEnum){if(!oldEnum)issues.push(`${path}: input enum constraint was added`);else for(const value of oldEnum)if(!newEnum.has(value))issues.push(`${path}: enum compatibility removed ${value}`);}
  if(mode==='output'&&oldEnum){if(!newEnum)issues.push(`${path}: response enum constraint was removed`);else for(const value of newEnum)if(!oldEnum.has(value))issues.push(`${path}: response enum added ${value}`);}
  if(mode==='input'){if(oldSchema.nullable===true&&newSchema.nullable!==true)issues.push(`${path}: nullable input was narrowed`);
    for(const [minimum,maximum]of [['minLength','maxLength'],['minimum','maximum']]){if(newSchema[minimum]!==undefined&&(oldSchema[minimum]===undefined||newSchema[minimum]>oldSchema[minimum]))issues.push(`${path}: ${minimum} was increased`);
      if(newSchema[maximum]!==undefined&&(oldSchema[maximum]===undefined||newSchema[maximum]<oldSchema[maximum]))issues.push(`${path}: ${maximum} was decreased`);}
    if(newSchema.pattern&&newSchema.pattern!==oldSchema.pattern)issues.push(`${path}: input pattern changed`);
  }else if(oldSchema.nullable!==true&&newSchema.nullable===true)issues.push(`${path}: response became nullable`);
  if(oldType==='array')compareSchema(oldSchema.items,newSchema.items,oldRoot,newRoot,mode,`${path}[]`,issues);
  if(oldType==='object'){const oldProperties=oldSchema.properties??{};const newProperties=newSchema.properties??{};for(const [name,schema]of Object.entries(oldProperties)){
      if(!(name in newProperties)){issues.push(`${path}.${name}: property was removed`);continue;}compareSchema(schema,newProperties[name],oldRoot,newRoot,mode,`${path}.${name}`,issues);}
    const oldRequired=new Set(oldSchema.required??[]);const newRequired=new Set(newSchema.required??[]);const requiredToKeep=mode==='input'?newRequired:oldRequired;const requiredBefore=mode==='input'?oldRequired:newRequired;
    for(const name of requiredToKeep)if(!requiredBefore.has(name))issues.push(`${path}.${name}: ${mode==='input'?'new required input':'required response'} is incompatible`);
    if(mode==='input'&&oldSchema.additionalProperties!==false&&newSchema.additionalProperties===false)issues.push(`${path}: additional input properties are no longer accepted`);
  }
}

function compatibilityIssues(baseline,current){const issues=[];for(const [id,oldOperation]of Object.entries(baseline.operations)){const next=current.operations[id];if(!next){issues.push(`${id}: operation was removed`);continue;}
    if(next.method!==oldOperation.method||next.path!==oldOperation.path)issues.push(`${id}: ${oldOperation.method.toUpperCase()} ${oldOperation.path} changed to ${next.method.toUpperCase()} ${next.path}`);
    const nextParameters=new Map(next.parameters.map(item=>[`${item.in}:${item.name}`,item]));const oldParameters=new Map(oldOperation.parameters.map(item=>[`${item.in}:${item.name}`,item]));
    for(const [key,parameter]of oldParameters){const replacement=nextParameters.get(key);if(!replacement)issues.push(`${id}: parameter ${key} was removed`);else compareSchema(parameter.schema,replacement.schema,baseline,current,'input',`${id}.${key}`,issues);}
    for(const [key,parameter]of nextParameters)if(parameter.required&&!oldParameters.get(key)?.required)issues.push(`${id}: parameter ${key} became required`);
    if(next.requestBody?.required&&!oldOperation.requestBody?.required)issues.push(`${id}: request body became required`);
    if(oldOperation.requestBody?.schema)compareSchema(oldOperation.requestBody.schema,next.requestBody?.schema,baseline,current,'input',`${id}.body`,issues);
    for(const [status,schema]of Object.entries(oldOperation.responses)){if(!(status in next.responses)){issues.push(`${id}: response ${status} was removed`);continue;}compareSchema(schema,next.responses[status],baseline,current,'output',`${id}.response.${status}`,issues);}
  }return issues;}

async function currentSnapshot(){return snapshot(parse(await readFile(contractPath,'utf8')));}
async function main(){const current=await currentSnapshot();if(process.argv.includes('--write')){await writeFile(baselinePath,`${JSON.stringify(current,null,2)}\n`);return;}const baseline=JSON.parse(await readFile(baselinePath,'utf8'));const issues=compatibilityIssues(baseline,current);if(issues.length)throw new Error(`Breaking OpenAPI changes detected:\n- ${issues.join('\n- ')}`);}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={snapshot,compatibilityIssues};
