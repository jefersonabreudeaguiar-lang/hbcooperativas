import assert from "node:assert/strict";
import { sharePaymentReceipt } from "../src/lib/hb-credit/sharePaymentReceipt";

async function main() {
  const text = "Comprovante fictício — R$ 1,00 — TESTE";
  const downloads: Array<{ text: string; filename: string }> = [];
  const download = (value: string, filename: string) => { downloads.push({ text:value,filename }); };
  let copies = 0;
  assert.equal(await sharePaymentReceipt(text,"TESTE",{share:async()=>{},copy:async()=>{copies++;},download}),"shared");
  assert.equal(copies,0);
  assert.equal(await sharePaymentReceipt(text,"TESTE",{copy:async(value)=>{assert.equal(value,text);copies++;},download}),"copied");
  assert.equal(await sharePaymentReceipt(text,"../TESTE",{share:async()=>{throw new Error("Não permitido");},copy:async()=>{throw new Error("Sem permissão");},download}),"downloaded");
  assert.deepEqual(downloads,[{text,filename:"comprovante-hb-TESTE.txt"}]);
  assert.equal(await sharePaymentReceipt(text,"TESTE",{share:async()=>{const e=new Error("Cancelado");e.name="AbortError";throw e;},copy:async()=>{copies++;},download}),"cancelled");
  assert.equal(copies,1,"cancelamento não copia nem baixa sem solicitação");
  assert.equal(downloads.length,1);
  console.log("PASS: compartilhar, copiar e baixar preservam o comprovante; cancelamento respeitado e nome de arquivo seguro.");
}
void main();
