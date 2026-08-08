"use client";

import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { AudioRecorder } from "@/components/comunicado/AudioRecorder";
import type { Comunicado, ComunicadoCategoria } from "@/types";

export const CATEGORIA_LABELS: Record<ComunicadoCategoria, string> = {
  financeiro: "Financeiro",
  reuniao: "Reunião",
  entrega: "Entrega",
  documentacao: "Documentação",
  aviso_geral: "Aviso Geral",
};

export interface ComunicadoFormProps {
  form: Partial<Comunicado>;
  onFormChange: (patch: Partial<Comunicado>) => void;
  idPrefix?: string;
  /** Quantos cooperados marcados como diretoria existem na cooperativa. */
  qtdDiretoria?: number;
}

export function ComunicadoForm({
  form,
  onFormChange,
  idPrefix = "",
  qtdDiretoria,
}: ComunicadoFormProps) {
  const assuntoId = `${idPrefix}assunto`;
  const descricaoId = `${idPrefix}descricao`;

  return (
    <div className="space-y-4">
      <FormField label="Assunto" required hint="Título curto que aparece no mural e na notificação" htmlFor={assuntoId}>
        <Input
          id={assuntoId}
          name="assunto"
          autoComplete="off"
          value={form.assunto ?? form.titulo ?? ""}
          onChange={(e) =>
            onFormChange({
              assunto: e.target.value,
              titulo: e.target.value,
            })
          }
          placeholder="Ex: Reunião geral, prazo de entrega..."
        />
      </FormField>

      <FormField label="Aviso em áudio" hint="Grave o recado ou digite o texto abaixo (pelo menos um dos dois)">
        <AudioRecorder
          value={form.audioDataUrl}
          onChange={(audioDataUrl) => onFormChange({ audioDataUrl })}
        />
      </FormField>

      <FormField label="Texto do aviso" hint="Opcional se você gravou áudio" htmlFor={descricaoId}>
        <Textarea
          id={descricaoId}
          name="descricao"
          value={form.descricao ?? ""}
          onChange={(e) => onFormChange({ descricao: e.target.value })}
          rows={6}
          placeholder="Escreva aqui o comunicado para os cooperados..."
          className="min-h-[140px] text-base leading-relaxed"
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Categoria">
          <Select
            value={form.categoria ?? "aviso_geral"}
            onChange={(e) => onFormChange({ categoria: e.target.value as ComunicadoCategoria })}
          >
            {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FormField>
        {!form.recorrente && (
          <FormField label="Data">
            <Input
              type="date"
              value={form.data ?? ""}
              onChange={(e) => onFormChange({ data: e.target.value })}
            />
          </FormField>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.fixado ?? false}
            onChange={(e) => onFormChange({ fixado: e.target.checked })}
            className="rounded"
          />
          Fixar no topo do mural
        </label>
        <label className="flex items-start gap-2 text-sm p-3 rounded-xl border border-purple-200 bg-purple-50/70 cursor-pointer">
          <input
            type="checkbox"
            checked={form.somenteDiretoria ?? false}
            onChange={(e) =>
              onFormChange({
                somenteDiretoria: e.target.checked,
                visivelParaTodos: e.target.checked ? false : true,
              })
            }
            className="mt-0.5 rounded border-gray-300 text-purple-700 focus:ring-purple-500"
          />
          <span>
            <span className="block font-medium text-gray-900">
              Enviar apenas para cooperados da diretoria
            </span>
            <span className="block text-xs text-gray-600 mt-0.5">
              {form.somenteDiretoria
                ? qtdDiretoria === 0
                  ? "Nenhum cooperado marcado como diretoria ainda. Marque em Cooperados → Ver ficha."
                  : `Só ${qtdDiretoria} cooperado${qtdDiretoria === 1 ? "" : "s"} da diretoria verá este aviso. Os demais não recebem.`
                : "Desmarcado = todos os cooperados. Para restringir, marque cooperados em Cooperados → Ver ficha → Membro da diretoria."}
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.recorrente ?? false}
            onChange={(e) => onFormChange({ recorrente: e.target.checked })}
            className="rounded"
          />
          Repetir automaticamente todo mês
        </label>
      </div>

      {form.recorrente && (
        <FormField label="A partir de qual dia do mês?" hint="O aviso aparece todo mês a partir deste dia">
          <Input
            type="number"
            min={1}
            max={28}
            value={form.diaDoMes ?? 1}
            onChange={(e) => onFormChange({ diaDoMes: parseInt(e.target.value, 10) || 1 })}
          />
        </FormField>
      )}
    </div>
  );
}
