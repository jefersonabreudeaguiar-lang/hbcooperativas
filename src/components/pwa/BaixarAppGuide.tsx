"use client";

import { Share, MoreVertical, PlusSquare, Smartphone } from "lucide-react";

export type DevicePlatform = "ios" | "android" | "other";

export function detectDevicePlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

/** Chrome/Firefox no iPhone — instalação só funciona no Safari. */
export function isIosNonSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /(crios|fxios|edgios)/i.test(ua);
}

interface BaixarAppGuideProps {
  /** Destaca a plataforma do aparelho atual. */
  highlight?: DevicePlatform;
  compact?: boolean;
}

export function BaixarAppGuide({ highlight, compact }: BaixarAppGuideProps) {
  const platform = highlight ?? "other";

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <section
        className={`rounded-2xl border-2 p-4 sm:p-5 ${
          platform === "ios" ? "border-green-600 bg-green-50/80" : "border-gray-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-white text-xs font-bold">
            iOS
          </span>
          <div>
            <h2 className="font-bold text-gray-900">iPhone / iPad</h2>
            <p className="text-xs text-gray-500">Use o Safari (navegador da Apple)</p>
          </div>
        </div>

        {isIosNonSafari() && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
            Você está em outro navegador. Abra este site no <strong>Safari</strong> para poder baixar o app.
          </p>
        )}

        <ol className="space-y-3 text-sm text-gray-800">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              1
            </span>
            <span>
              Abra o site no <strong>Safari</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              2
            </span>
            <span className="flex items-start gap-2">
              <span>
                Toque em <strong>Compartilhar</strong>
              </span>
              <Share size={18} className="shrink-0 text-blue-600 mt-0.5" aria-hidden />
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              3
            </span>
            <span className="flex items-start gap-2">
              <span>
                Role e toque em <strong>Adicionar à Tela de Início</strong>
              </span>
              <PlusSquare size={18} className="shrink-0 text-gray-700 mt-0.5" aria-hidden />
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              4
            </span>
            <span>
              Confirme em <strong>Adicionar</strong> — o ícone HB Cooperativas aparece na tela inicial
            </span>
          </li>
        </ol>
      </section>

      <section
        className={`rounded-2xl border-2 p-4 sm:p-5 ${
          platform === "android" ? "border-green-600 bg-green-50/80" : "border-gray-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-700 text-white text-xs font-bold">
            AND
          </span>
          <div>
            <h2 className="font-bold text-gray-900">Android</h2>
            <p className="text-xs text-gray-500">Chrome ou navegador do celular</p>
          </div>
        </div>

        <ol className="space-y-3 text-sm text-gray-800">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              1
            </span>
            <span>
              Abra o site no <strong>Chrome</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              2
            </span>
            <span className="flex items-start gap-2">
              <span>
                Toque no menu <strong>⋮</strong> (três pontinhos)
              </span>
              <MoreVertical size={18} className="shrink-0 text-gray-700 mt-0.5" aria-hidden />
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              3
            </span>
            <span>
              Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-700 text-white text-xs font-bold">
              4
            </span>
            <span>
              Confirme — o app abre como atalho, sem barra do navegador
            </span>
          </li>
        </ol>
      </section>

      {!compact && (
        <p className="text-xs text-gray-500 flex items-start gap-2">
          <Smartphone size={14} className="shrink-0 mt-0.5" />
          Não precisa da App Store nem da Play Store. O aplicativo é instalado direto pelo navegador do celular.
        </p>
      )}
    </div>
  );
}
