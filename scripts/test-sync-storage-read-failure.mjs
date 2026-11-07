import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const exports = {};
const env = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/supabase/cooperativaSyncStorage.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports, Buffer, console, crypto:webcrypto, process: {env}, require: name => {
  if (name.endsWith('hbCreditOperacionalFinancialProjection')) return {projectOperationalFinancialRecords: async (_s, _c, p) => p};
  if (name.endsWith('fichaCorridaPagamentoGuard')) return {aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional: (_b, p) => ({payload:p})};
  if (name.endsWith('livroCaixaPagamentoGuard')) return {aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional: (_b, p) => ({payload:p})};
  return new Proxy({}, {get: () => () => {throw Error(`Unexpected dependency execution: ${name}`);}});
}});

let writes = 0;
const readNonces = new Set();
const client = (download, buckets = {data: [{name:'hb-cooperativa-sync', file_size_limit: 52428800}], error:null}) => ({storage: {
  listBuckets: async () => buckets,
  from: () => ({download: async (_path, options, parameters) => {
    assert.equal(parameters.cache, 'no-store');
    assert.ok(options.cacheNonce, 'Leitura financeira precisa contornar cópias antigas do CDN');
    assert.equal(readNonces.has(options.cacheNonce), false, 'Cada leitura consulta uma referência nova');
    readNonces.add(options.cacheNonce);
    return download;
  }, upload: async (_path, _body, options) => {
    assert.equal(options.cacheControl, '0', 'Snapshot financeiro não deve receber cache de uma hora');
    writes++; return {error:null};
  }}),
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

env.HB_HOMOLOGATION_ONLY = env.HB_OPERACIONAL_VERSIONED_SYNC = 'true';
const cnpj = '12345678901234';
assert.equal(exports.isVersionedOperacionalSyncEnabled(cnpj), false, 'Exige CNPJ explícito para o teste');
env.HB_OPERACIONAL_VERSIONED_SYNC_CNPJ = cnpj;
assert.equal(exports.isVersionedOperacionalSyncEnabled(cnpj), true);
assert.equal(exports.isVersionedOperacionalSyncEnabled('12345678901235'), false);
let row = {revision:'00000000-0000-4000-8000-000000000001', payload};
const versioned = {
  from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data:row,error:null})})})}),
  rpc: async (_name, args) => {
    assert.equal(args.p_cnpj, cnpj);
    if (args.p_expected_revision !== row.revision) return {data:null,error:null};
    row = {revision:'00000000-0000-4000-8000-000000000002', payload:args.p_payload};
    return {data:row.revision,error:null};
  }
};
const first = await exports.fetchOperacionalSync(versioned, cnpj);
const second = await exports.fetchOperacionalSync(versioned, cnpj);
const options = {skipPagamentoConfirmadoProtection:true,skipCotaProtection:true};
assert.equal((await exports.uploadOperacionalSync(versioned, cnpj, {...payload, wipeNotas:true}, {...options,versionedBase:first})).code, 'OPERACIONAL_RESET_BLOCKED');
assert.equal((await exports.uploadOperacionalSync(versioned, cnpj, {...payload, winner:1}, {...options,versionedBase:first})).ok, true);
assert.equal((await exports.uploadOperacionalSync(versioned, cnpj, {...payload, winner:2}, {...options,versionedBase:second})).code, 'OPERACIONAL_CONFLICT');
assert.equal((await exports.uploadOperacionalSync(versioned, cnpj, payload, {...options,versionedBase:{...second}})).code, 'OPERACIONAL_BASE_REQUIRED');
assert.equal(row.payload.winner, 1);
console.log('PASS: gravação versionada exige a leitura original e recusa revisão antiga.');

env.HB_OPERACIONAL_VERSIONED_SYNC = undefined;
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

const notas = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/supabase/notasStorage.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports:notas, Buffer, console, crypto:webcrypto, require: () => ({})});
let statusAtual = 'conferida';
const nonceNotas = new Set();
const notasClient = {storage: {
  listBuckets: async () => ({data:[{name:'hb-entregas'}]}),
  from: () => ({
    list: async () => ({data:[{name:'fixture.json'}]}),
    download: async (_path, options, parameters) => {
      assert.equal(parameters.cache, 'no-store');
      assert.ok(options.cacheNonce);
      assert.equal(nonceNotas.has(options.cacheNonce), false);
      nonceNotas.add(options.cacheNonce);
      return {error:null, data:{text:async () => JSON.stringify({id:'fixture',status:statusAtual,updatedAt:new Date().toISOString()})}};
    },
  }),
}};
assert.equal((await notas.fetchNotaMetaFromStorage(notasClient,cnpj,'fixture')).status,'conferida');
statusAtual = 'paga';
assert.equal((await notas.fetchNotaMetaFromStorage(notasClient,cnpj,'fixture')).status,'paga');
assert.equal((await notas.fetchNotaFromStorage(notasClient,cnpj,'fixture')).status,'paga');
assert.equal((await notas.fetchNotasFromStorage(notasClient,cnpj))[0].status,'paga');
console.log('PASS: leituras individual e em lote de entrega paga não reutilizam a referência de cache antiga.');
