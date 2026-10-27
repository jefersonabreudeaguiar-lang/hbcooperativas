import { brutoFichaPlanoCents } from "../src/lib/hb-credit/hbCreditFichaPlano";
import {
  creditosBaseMapV2FichaAlinhada,
  creditosBaseMapV2ManualOnly as mapV2,
} from "../src/lib/hb-credit/hbCreditV2LimiteBase";

const plano = {
  cooperadoId: "c1",
  entrega1Cents: 10000,
  entrega2Cents: 5000,
  entrega3Cents: 0,
  entrega4Cents: 0,
  entrega5Cents: 0,
  descontoPercent: 10,
  mensalidades: [],
  entregasConsumidas: 0,
};

const bruto = brutoFichaPlanoCents(plano);
if (bruto !== 13500) {
  console.error("bruto esperado 13500, got", bruto);
  process.exit(1);
}

const map = mapV2(["c1", "c2"], [
  { cooperadoId: "c1", manualValorBrutoCents: 20000 },
  { cooperadoId: "c2", manualValorBrutoCents: null },
]);
if (map.c1 !== 20000 || map.c2 !== 0) {
  console.error("map V2 manual", map);
  process.exit(1);
}

const mapFicha = creditosBaseMapV2FichaAlinhada(["c1", "c2"], [
  { cooperadoId: "c1", manualValorBrutoCents: 999 },
  { cooperadoId: "c2", manualValorBrutoCents: 5000 },
], { c1: 20000, c2: 0 });
if (mapFicha.c1 !== 20000 || mapFicha.c2 !== 0) {
  console.error("map V2 ficha alinhada", mapFicha);
  process.exit(1);
}

console.log("ok: hb ficha plano bruto");
