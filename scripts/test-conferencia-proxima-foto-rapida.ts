import assert from "node:assert/strict";
import { primeiraFotoConferenciaDisponivel, fetchConferenciaFotoPartCached } from "../src/services/conferenciaFotoPrefetch";
import { setSecureApiFetchTestOverrideForTests } from "../src/lib/security/clientSession";
async function main() {
 const nunca = new Promise<string | null>(() => {});
 assert.equal(await primeiraFotoConferenciaDisponivel(nunca, Promise.resolve("https://foto/nuvem"), () => true), "https://foto/nuvem");
 assert.equal(await primeiraFotoConferenciaDisponivel(Promise.resolve("https://foto/local"), nunca, () => true), "https://foto/local");
 assert.equal(await primeiraFotoConferenciaDisponivel(Promise.resolve("miniatura"), Promise.resolve("https://foto/legivel"), () => false), "https://foto/legivel");
 assert.equal(await primeiraFotoConferenciaDisponivel(Promise.reject(Error("IDB")), Promise.resolve(null), () => true), null);
 let chamadas=0;
 setSecureApiFetchTestOverrideForTests(async () => { chamadas++; return new Response(new Blob(["foto"])); });
 try {
  const args = ["62351750000165", "nota-prefetch-teste", 0, 1] as const;
  const [a,b] = await Promise.all([fetchConferenciaFotoPartCached(...args),fetchConferenciaFotoPartCached(...args)]);
  assert.equal(a,b);assert.equal(chamadas,1);
  assert.equal(await fetchConferenciaFotoPartCached(...args), a); assert.equal(chamadas,1);
 } finally {setSecureApiFetchTestOverrideForTests(null);}
 console.log("OK: foto disponível não espera fonte lenta, miniatura rejeitada, falhas e prefetch sem download duplicado");
}
void main();
