import assert from 'node:assert/strict';
import { calcularItensNota, consolidarItensLancamentoPorFoto, consolidarItensDeFichasNota, agregarItensNotasCooperado, buildFichaFromNota, finalizarFichasConferenciaMultiFoto, getResumoPagamentoCooperado, dedupeFichaCorridaPorNota } from '../src/services/notaPedidoService';
import type { AppData, NotaPedido, NotaPedidoItem } from '../src/types';

function item(quantidade: number, precoUnitario: number, unidade = 'kg'): NotaPedidoItem {
  return { produtoInstituicaoId: 'mesmo-produto', produtoNome: 'Produto', unidade, quantidade, precoUnitario, valorBruto: 0 };
}
function conferir(fotos: NotaPedidoItem[][], percentual: number) {
  const originais = fotos.map(f => calcularItensNota(f, percentual));
  const itens = consolidarItensLancamentoPorFoto(originais.map(f => f.itens), percentual);
  const resultado = calcularItensNota(itens, percentual);
  for (const campo of ['valorBruto', 'valorDesconto', 'valorLiquido'] as const) {
    const centavos = originais.reduce((s, f) => s + Math.round(f[campo] * 100), 0);
    assert.equal(Math.round(resultado[campo] * 100), centavos, campo);
  }
  // Reabrir/recalcular não pode alterar os totais.
  assert.deepEqual(calcularItensNota(resultado.itens, percentual), resultado);
  return resultado;
}

assert.equal(conferir([[item(1, 5)], [item(1, 7)]], 10).valorBruto, 12);
assert.equal(conferir([[item(0.333, 3)], [item(0.333, 3)]], 5).itens.reduce((s, i) => s + i.quantidade, 0), 0.666);
assert.equal(conferir([[item(1, 0.05)], [item(1, 0.05)]], 10).valorDesconto, 0.02);
assert.equal(conferir([[item(0.5, 0.01)], [item(0.5, 0.01)]], 0).valorBruto, 0.02);
assert.equal(conferir([[item(1, 5, 'kg')], [item(1, 5, 'un')]], 5).itens.length, 2);
assert.equal(conferir([[item(2, 10)], [item(3, 10)]], 5).itens.length, 1);

let seed = 805;
const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let caso = 0; caso < 1500; caso++) {
  const percentual = [0, 5, 7.5, 10, 30][caso % 5];
  const fotos = Array.from({ length: 2 + caso % 7 }, () =>
    Array.from({ length: 1 + caso % 4 }, () => item(Math.ceil(next() * 10000) / 1000, Math.ceil(next() * 5000) / 100)));
  conferir(fotos, percentual);
}
console.log('PASS: 1500 cenários multi-foto preservam bruto/desconto/líquido, preço, unidade e milésimos de quantidade.');

// Fluxo real: cada foto é gravada, serializada/mesclada por ID, fechada e paga
// pelo resumo. A segunda foto não pode reutilizar o ID da primeira.
const fotos = [[item(1, 5)], [item(1, 7)], [item(0.333, 3)]];
const percentual = 5;
const calc = conferir(fotos, percentual);
const nota = { id:'nota',cooperativaId:'coop',cooperadoId:'c',instituicaoId:'inst',mesReferencia:'2026-11',numeroNota:'1',status:'conferida',fotosEnviadasCount:3,itens:calc.itens,valorBruto:calc.valorBruto,valorDesconto:calc.valorDesconto,valorLiquido:calc.valorLiquido,percentualDescontoCooperativa:percentual } as NotaPedido;
let data = { cooperativas:[{id:'coop'}],cooperados:[{id:'c',cooperativaId:'coop',nomeCompleto:'Teste'}],notasPedido:[nota],fichaCorrida:[],instituicoes:[],arquivosMensais:[],pagamentosCooperado:[],mensalidades:[],cotas:[],descontos:[],valoresAvulsosReceber:[],config:{descontoPadraoCooperativa:percentual} } as unknown as AppData;
for (let fotoIndex = 0; fotoIndex < fotos.length; fotoIndex++) {
  const foto = calcularItensNota(fotos[fotoIndex], percentual);
  const parcial = {...nota, ...foto};
  const f = buildFichaFromNota(parcial,data,'Teste','Teste',{fotoIndex,totalFotos:fotos.length});
  assert.ok(!data.fichaCorrida.some(old => old.id === f.id), 'nova foto precisa de novo ID');
  data = {...data,fichaCorrida:[...data.fichaCorrida,f]};
  assert.equal(buildFichaFromNota(parcial,data,'Teste','Teste',{fotoIndex,totalFotos:fotos.length}).id,f.id,'retry da mesma foto mantém ID');
}
data = {...data,fichaCorrida:[...new Map(JSON.parse(JSON.stringify(data.fichaCorrida)).map((f:any) => [f.id,f])).values()] as AppData['fichaCorrida']};
data = finalizarFichasConferenciaMultiFoto(data,nota);
assert.equal(data.fichaCorrida.length,3);
assert.equal(dedupeFichaCorridaPorNota(data.fichaCorrida,[nota]).length,3);
for (const [notaCampo,fichaCampo] of [['valorBruto','valorBruto'],['valorDesconto','descontos'],['valorLiquido','valorLiquido']] as const) {
  assert.equal(data.fichaCorrida.reduce((s,f)=>s+Math.round(f[fichaCampo]*100),0),Math.round(nota[notaCampo]*100));
}
const resumo = getResumoPagamentoCooperado(data,'c','2026-11','coop');
assert.equal(resumo.valorBruto,nota.valorBruto);
const reabertos = calcularItensNota(consolidarItensDeFichasNota(data.fichaCorrida,nota.id),percentual);
for (const campo of ['valorBruto','valorDesconto','valorLiquido'] as const) assert.equal(reabertos[campo],nota[campo],`reabertura: ${campo}`);
const extrato = agregarItensNotasCooperado(data,'c',[nota],'coop');
assert.equal(extrato.reduce((s,i)=>s+Math.round(i.valorBruto*100),0),Math.round(nota.valorBruto*100));
assert.equal(extrato.filter(i=>i.precoUnitario===5).reduce((s,i)=>s+i.quantidade,0),1);
assert.equal(extrato.filter(i=>i.precoUnitario===7).reduce((s,i)=>s+i.quantidade,0),1);
const original = JSON.stringify(data);
assert.throws(() => finalizarFichasConferenciaMultiFoto({...data,fichaCorrida:data.fichaCorrida.slice(1)},nota),/foto 1\/3/);
assert.throws(() => finalizarFichasConferenciaMultiFoto(data,{...nota,valorBruto:nota.valorBruto+0.01}),/somas das fotos/);
assert.throws(() => finalizarFichasConferenciaMultiFoto({...data,fichaCorrida:data.fichaCorrida.map(f=>({...f,id:'repetido'}))},nota),/somas das fotos/);
assert.equal(JSON.stringify(data),original,'recusa de totais incompatíveis não altera o estado');
console.log('PASS: fotos com IDs distintos, retry idempotente, serialização, ficha e resumo preservam o total.');
