"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { isLocalMediaRef } from "@/utils/fotoEntrega";
import { getLocalMediaBlobUrl } from "@/services/localMediaStore";
import { cn } from "@/utils/format";

interface NotaFotoImgProps {
  src?: string;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
}

/** Resolve fotos em IndexedDB (`idb:`) ou URLs inline para exibição. */
export function NotaFotoImg({ src, alt = "", className, placeholderClassName }: NotaFotoImgProps) {
  const [resolved, setResolved] = useState<string | undefined>(
    src && !isLocalMediaRef(src) ? src : undefined
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src) {
      setResolved(undefined);
      return;
    }
    if (!isLocalMediaRef(src)) {
      setResolved(src);
      return;
    }

    let cancelled = false;
    void getLocalMediaBlobUrl(src).then((url) => {
      if (!cancelled) setResolved(url ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          className,
          placeholderClassName,
          "bg-gray-100 text-gray-400 flex flex-col items-center justify-center gap-1 text-[10px] font-medium"
        )}
        aria-hidden={!alt}
      >
        <Camera size={20} />
        {failed ? "Foto indisponível" : null}
      </div>
    );
  }

  if (!resolved) {
    return <div className={cn(className, placeholderClassName, "bg-gray-100 animate-pulse")} aria-hidden />;
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
