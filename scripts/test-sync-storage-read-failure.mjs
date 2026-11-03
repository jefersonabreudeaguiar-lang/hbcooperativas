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
