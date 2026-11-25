"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export function CameraEntrega({ onFoto, onGaleria, onFechar }: {
  onFoto: (file: File) => void;
  onGaleria: () => void;
  onFechar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const ativa = useRef(false);
  const capturando = useRef(false);
  const [pronta, setPronta] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelada = false;
    ativa.current = true;
    const elemento = video.current;
    async function abrir() {
      try {
        if (!elemento || !navigator.mediaDevices?.getUserMedia) throw new Error();
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 1280, max: 1280 },
          },
        });
        if (cancelada) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        elemento.srcObject = media;
        await elemento.play();
        if (!cancelada) setPronta(true);
      } catch {
        if (cancelada) return;
        stream.current?.getTracks().forEach((track) => track.stop());
        setErro("Não foi possível abrir a câmera no app. Você pode escolher uma foto da galeria.");
      }
    }
    void abrir();
    return () => {
      cancelada = true;
      ativa.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      if (elemento) elemento.srcObject = null;
    };
  }, []);

  async function capturar() {
    const frame = video.current;
    if (!frame?.videoWidth || !frame.videoHeight || capturando.current) return;
    capturando.current = true;
    setOcupada(true);
    const canvas = document.createElement("canvas");
    const escala = Math.min(1, 1280 / Math.max(frame.videoWidth, frame.videoHeight));
    canvas.width = Math.max(1, Math.round(frame.videoWidth * escala));
    canvas.height = Math.max(1, Math.round(frame.videoHeight * escala));
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error();
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      const foto = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
      if (!foto) throw new Error();
      if (!ativa.current) return;
      stream.current?.getTracks().forEach((track) => track.stop());
      onFoto(new File([foto], "entrega.jpg", { type: "image/jpeg" }));
    } catch {
      if (ativa.current) setErro("Não foi possível capturar a foto. Tente novamente ou escolha pela galeria.");
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      capturando.current = false;
      if (ativa.current) setOcupada(false);
    }
  }

  return (
    <div className="space-y-3">
      <video ref={video} muted playsInline autoPlay aria-label="Imagem da câmera" className="max-h-[50dvh] w-full rounded bg-black object-contain" />
      {erro ? <p role="alert">{erro}</p> : !pronta && <p role="status">Abrindo a câmera…</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!pronta || ocupada} onClick={() => void capturar()}>Capturar foto</Button>
        <Button type="button" variant="secondary" disabled={ocupada} onClick={onGaleria}>Escolher da galeria</Button>
        <Button type="button" variant="secondary" onClick={onFechar}>Voltar</Button>
      </div>
    </div>
  );
}
