import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffDadosAtuaisGate } from "../src/components/layout/StaffDadosAtuaisGate";
import type { User } from "../src/types";

const user = { id: "responsavel", role: "responsavel", cooperativaId: "coop", name: "Responsável" } as Omit<User, "password">;
const html = renderToStaticMarkup(<StaffDadosAtuaisGate user={user}><span>VALOR_ANTIGO_DO_CACHE_R$999</span></StaffDadosAtuaisGate>);
assert.doesNotMatch(html, /VALOR_ANTIGO_DO_CACHE/);
assert.match(html, /Buscando dados atualizados/);
assert.match(html, /aria-busy="true"/);
console.log("OK: primeiro frame da gestão mostra atualização e não renderiza valores antigos.");
