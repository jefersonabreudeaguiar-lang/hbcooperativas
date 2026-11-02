import assert from "node:assert/strict";
import { syncLimiteCooperadoFromCreditoBase, previewLimiteColetivoPercentual } from "../src/lib/supabase/contaCoopStorage";
import type { SupabaseClient } from "@supabase/supabase-js";
const contas=[{cooperado_id:"atual-a",limit_released_cents:20000,amount_used_cents:5000,status:"active"},{cooperado_id:"atual-b",limit_released_cents:20000,amount_used_cents:0,status:"active"},{cooperado_id:"antigo",limit_released_cents:0,amount_used_cents:0,status:"suspended",financial_limit_base_cents:0,financial_limit_cap_cents:0,financial_limit_ceiling_cents:0}];
let writes=0;
const sb={from(table:string){let id:string|undefined;const q={select(){return this},eq(k:string,v:string){if(k==='cooperado_id')id=v;return this},in(){return this},upsert(){writes++;throw Error('não deve gravar')},async maybeSingle(){return {data:table==='hb_credit_cooperative_caps'?{global_credit_cap_percent:70,cooperativa_liberacao_percent:20}:contas.find(c=>c.cooperado_id===id),error:null}},then: Promise.resolve({data:contas,error:null}).then.bind(Promise.resolve({data:contas,error:null}))};return q}} as unknown as SupabaseClient;
async function main(){const sync=await syncLimiteCooperadoFromCreditoBase(sb,"62351750000165","antigo",100000,"test",{"antigo":100000});assert.equal(sync.ok,true);if(sync.ok){assert.equal(sync.action,"unchanged");assert.equal(sync.limite.limiteLiberadoCents,0);}assert.equal(writes,0);
 const previa=await previewLimiteColetivoPercentual(sb,"62351750000165",["atual-a","atual-b"],70,{"atual-a":100000,"atual-b":100000});assert.equal(previa.ok,true);assert.equal(previa.totalApos,140000);assert.equal(previa.tetoGlobal,140000);console.log('OK: conta antiga suspensa não recupera crédito; liberação de 70% cabe no teto sem duplicação');}
void main();
