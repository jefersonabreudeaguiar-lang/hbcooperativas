import assert from "node:assert/strict";
import vm from "node:vm";
import { buildInlineCooperadoBootShellScript } from "../src/lib/performance/cooperadoBootShell";
import { isHbCreditCooperadoNavEligible } from "../src/permissions";
import { isCooperadoMobileGaPromoted } from "../src/lib/cooperado/cooperadoMobilePilot";
import { gravarHbCreditAccountPersistido, lerHbCreditAccountPersistido, lerHbCreditAccountPersistidoFlex, type HbCreditAccountPersistido } from "../src/lib/hb-credit/hbCreditAccountPersistencia";
import type { User } from "../src/types";
const flag = process.env.NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC;
process.env.NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC = "1";
try {
 const profiles = [
  {id:"u_jeferson",name:"Jeferson",cooperadoId:"c_1781981564381_w67gg"},
  {id:"u_cleito",name:"Cleito",cooperadoId:"c_1787099452913_as4ha"},
  ...Array.from({length:24},(_,i)=>({id:`u_teste_${i}`,name:`Cooperado ${i}`,cooperadoId:`c_teste_${i}`})),
 ];
 for (const profile of profiles) {
  const user = {...profile,role:"cooperado",email:"teste@example.com",active:true} as Omit<User,"password">;
  assert.equal(isCooperadoMobileGaPromoted(user),true);
  for(const status of ["loading","enabled","disabled","error"] as const) assert.equal(isHbCreditCooperadoNavEligible(user,status,status==="enabled"),true);
  const el={innerHTML:"",style:{display:""},setAttribute(){}};
  vm.runInNewContext(buildInlineCooperadoBootShellScript(),{
   document:{getElementById:()=>el},location:{pathname:"/dashboard"},
   window:{matchMedia:()=>({matches:true})},localStorage:{getItem:()=>JSON.stringify(user)},
   sessionStorage:{getItem:()=>null,removeItem(){}},setTimeout(){},
  });
  assert.match(el.innerHTML,/HB Créditos/);assert.match(el.innerHTML,/href="\/minha-conta-coop"/);
  assert.match(el.innerHTML,/>Preços</);assert.doesNotMatch(el.innerHTML,/>Ficha</);
 }
 assert.equal(isHbCreditCooperadoNavEligible({role:"cooperado"},"loading",false),true,"atalho não depende do vínculo já estar carregado");
 assert.equal(isHbCreditCooperadoNavEligible({role:"parceiro"},"enabled",true),false);
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>null,setItem(){throw new DOMException("Quota","QuotaExceededError")},key:()=>null,length:0}});
 const payload={v:5,account:{id:"a",cooperadoId:"c_teste",limiteLiberadoCents:10000,valorUsadoCents:2000,valorDisponivelCents:8000},hasPin:true,pinResetPending:false,savedAt:new Date().toISOString(),updatedAt:null} as HbCreditAccountPersistido;
 gravarHbCreditAccountPersistido("62351750000165","c_teste",payload);
 assert.equal(lerHbCreditAccountPersistido("62351750000165","c_teste")?.account?.valorDisponivelCents,8000);
 assert.equal(lerHbCreditAccountPersistidoFlex("c_teste","00000000000000"),null,"não herda saldo de outra cooperativa");
 assert.equal(lerHbCreditAccountPersistido("62351750000165","outro"),null,"não herda saldo de outro cooperado");
 const vazio={...payload,account:{...payload.account!,limiteLiberadoCents:0,valorUsadoCents:0,valorDisponivelCents:0},hasPin:false};
 gravarHbCreditAccountPersistido("62351750000165","c_teste",vazio);
 assert.equal(lerHbCreditAccountPersistido("62351750000165","c_teste"),null,"base nova vazia não ressuscita saldo antigo");
 console.log("OK: 26 perfis com mesma navegação HB, abertura com Preços/HB, quota cheia e isolamento de saldos");
} finally { if(flag===undefined)delete process.env.NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC;else process.env.NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC=flag; }
