import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/supabase/cooperativaSyncStorage.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports, Buffer, console, require: name => {
  if (name.endsWith('hbCreditOperacionalFinancialProjection')) return {projectOperationalFinancialRecords: async (_s, _c, p) => p};
  return new Proxy({}, {get: () => () => {throw Error(`Unexpected dependency execution: ${name}`);}});
}});

let writes = 0;
const client = (download, buckets = {data: [{name:'hb-cooperativa-sync', file_size_limit: 52428800}], error:null}) => ({storage: {
  listBuckets: async () => buckets,
  from: () => ({download: async () => download, upload: async () => {writes++; return {error:null};}}),
}});
for (const response of [
  {data:null, error:{statusCode:503, message:'offline'}},
  {data:null, error:{statusCode:403, message:'denied'}},
  {data:null, error:null},
  {data:{text:async () => '{broken'}, error:null},
  {data:{text:async () => 'null'}, error:null},
]) {
  await assert.rejects(() => exports.fetchOperacionalSync(client(response), '12345678901234'));
  await assert.rejects(() => exports.uploadOperacionalSync(client(response), '12345678901234', {}));
}
await assert.rejects(() => exports.fetchContratosSync(client({}, {data:null,error:{message:'offline'}}), '12345678901234'));
assert.equal(writes, 0, 'Falha de leitura não pode gerar gravação');
assert.equal(await exports.fetchOperacionalSync(client({data:null,error:{statusCode:'404'}}), '12345678901234'), null);
const payload = {updatedAt:'2026-11-03T00:00:00Z', arquivosMensais:[]};
assert.equal(JSON.stringify(await exports.fetchOperacionalSync(client({data:{text:async () => JSON.stringify(payload)},error:null}), '12345678901234')), JSON.stringify(payload));
console.log('PASS: leitura indisponível/corrompida bloqueia gravação; somente 404 explícito representa arquivo ausente.');

let activeClient = client({data:null,error:{statusCode:503,message:'unavailable'}});
const route = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/cooperativa-sync/route.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports:route, URL, require: name => {
  if (name === 'next/server') return {NextResponse:Response};
  if (name.endsWith('/cooperativaSyncStorage')) return exports;
  if (name.endsWith('/admin')) return {getSupabaseAdmin:() => activeClient,isSupabaseConfigured:() => true};
  if (name.endsWith('/apiGuard')) return {guardCooperativaApi:async () => ({ok:true,session:null})};
  if (name.endsWith('/cooperativa')) return {normalizeCnpj:value => value};
  if (name.endsWith('/contratosPublicacaoGuard')) return {publicacaoContratosApagariaItens:() => false};
  return new Proxy({}, {get: () => () => {throw Error(`Unexpected dependency execution: ${name}`);}});
}});
const url = 'https://fixture.invalid/api/cooperativa-sync?cnpj=12345678901234&section=contratos';
const request = section => new Request(url, {method:'POST',body:JSON.stringify({
  cnpj:'12345678901234',section,payload:{updatedAt:'2026-11-04T00:00:00Z',instituicoes:[],produtosInstituicao:[]}
})});
for (const res of [await route.GET(new Request(url)), await route.POST(request('contratos')), await route.POST(request('operacional'))]) {
  assert.equal(res.status,503);
  assert.equal((await res.json()).code,'SYNC_STORAGE_UNAVAILABLE');
}
assert.equal(writes,0);
activeClient = client({data:{text:async () => JSON.stringify(payload)},error:null});
assert.equal((await route.POST(request('contratos'))).status,201);
assert.equal(writes,1);
console.log('PASS: API devolve erro recuperável, preserva dados e permite nova tentativa após recuperação.');
