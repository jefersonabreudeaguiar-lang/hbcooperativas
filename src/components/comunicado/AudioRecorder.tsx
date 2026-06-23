"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

const MAX_AUDIO_BYTES = 450_000;
const MAX_SECONDS = 90;

interface AudioRecorderProps {
  value?: string;
  onChange: (value?: string) => void;
  disabled?: boolean;
}

export function AudioRecorder({ value, onChange, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [erro, setErro] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const pararGravacao = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRef.current?.stop();
    setRecording(false);
  };

  const iniciarGravacao = async () => {
    setErro("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro("Seu navegador não permite gravar áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > MAX_AUDIO_BYTES) {
          setErro("Áudio muito longo. Grave no máximo cerca de 1 minuto.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => onChange(String(reader.result ?? ""));
        reader.readAsDataURL(blob);
      };

      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) pararGravacao();
          return s + 1;
        });
      }, 1000);
    } catch {
      setErro("Permita o microfone para gravar o aviso em áudio.");
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <audio controls src={value} className="w-full" preload="metadata" />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            <Trash2 size={16} /> Remover áudio
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant={recording ? "danger" : "secondary"}
          disabled={disabled}
          onClick={() => (recording ? pararGravacao() : void iniciarGravacao())}
        >
          {recording ? <Square size={16} /> : <Mic size={16} />}
          {recording ? `Parar gravação (${seconds}s)` : "Gravar aviso em áudio"}
        </Button>
      )}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {!value && !recording && (
        <p className="text-xs text-gray-500">Opcional se você digitar o texto do aviso abaixo.</p>
      )}
    </div>
  );
}
