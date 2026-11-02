import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setFinancialPin, setPartnerFinancialPin } from "../src/lib/supabase/contaCoopStorage";
import { ensureCreatorAdminAccount } from "../src/services/creatorAdminPasswordReset";
import { emptyInitialData } from "../src/mock/data";
async function main(){let writes=0;const sb={from(){const q={select(){return this},eq(){return this},is(){return this},update(){writes++;return this},async maybeSingle(){return {data:{id:'a',pin_hash:'existing-hash'},error:null}}};return q}} as unknown as SupabaseClient;
 const coop=await setFinancialPin(sb,'62351750000165','c','1234');assert.equal(coop.ok,false);assert.equal(writes,0);
 let guarded=false;const partner={from(){const q={update(){return this},eq(){return this},is(k:string,v:unknown){guarded=k==='pin_hash'&&v===null;return this},select(){return this},async maybeSingle(){return {data:null,error:null}}};return q}}as unknown as SupabaseClient;
 const mercado=await setPartnerFinancialPin(partner,'m','1234');assert.equal(mercado.ok,false);assert.equal(guarded,true);
 const data=structuredClone(emptyInitialData);const ensured=ensureCreatorAdminAccount(data);assert.equal(ensured.data,data);assert.equal(ensured.changed,false);assert.equal(data.users.some(u=>u.email==='invisium3@gmail.com'),false);
 console.log('OK: PIN existente protegido contra sobrescrita e navegador não cria conta/senha administrativa');}
void main();
