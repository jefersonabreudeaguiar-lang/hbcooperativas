import assert from 'node:assert/strict';
import { fetchCooperadosFromStorage } from '../src/lib/supabase/cooperadosStorage';
import type { SupabaseClient } from '@supabase/supabase-js';
async function main(){
 let active=0,max=0,pages=0,writes=0,listFail=false,downloadFail=false,corrupt=false;
 const client={storage:{listBuckets(){writes++;throw Error('Not a write/read bucket setup path')},from(bucket:string){assert.equal(bucket,'hb-cooperados');return {async list(_cnpj:string,opts:{offset:number}){pages++;if(listFail)return {error:Error('Offline'),data:null};return {error:null,data:Array.from({length:opts.offset===0?500:1},(_,i)=>({name:`member-${opts.offset+i}.json`}))};},async download(path:string){active++;max=Math.max(max,active);await Promise.resolve();active--;if(downloadFail)return {error:Error('Offline'),data:null};const id=path.split('/')[1];return {error:null,data:new Blob([corrupt?'bad-json':JSON.stringify({cooperado:{id,nomeCompleto:'Pessoa '+id,status:'ativo',cooperativaId:'fixture',cpfCnpj:''}})])};}}}}} as unknown as SupabaseClient;
 const rows=await fetchCooperadosFromStorage(client,'88888888000181',{complete:true});assert.equal(rows.length,501);assert.equal(pages,2);assert.ok(max>1&&max<=8);assert.equal(writes,0);
 listFail=true;await assert.rejects(fetchCooperadosFromStorage(client,'88888888000181',{complete:true}),/cadastros/);listFail=false;
 downloadFail=true;await assert.rejects(fetchCooperadosFromStorage(client,'88888888000181',{complete:true}),/cadastro/);downloadFail=false;await new Promise(resolve=>setImmediate(resolve));
 corrupt=true;await assert.rejects(fetchCooperadosFromStorage(client,'88888888000181',{complete:true}));assert.equal(writes,0);
 console.log('PASS: finance reads all 501 members with bounded parallel downloads; incomplete/list/download/JSON failures never become a zero balance.');
}
void main();
