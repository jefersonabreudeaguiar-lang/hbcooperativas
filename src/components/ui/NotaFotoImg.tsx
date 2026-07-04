"use client";

import { useEffect, useState } from "react";
import { isLocalMediaRef } from "@/utils/fotoEntrega";
import { getLocalMediaBlobUrl } from "@/services/localMediaStore";
import { cn } from "@/utils/format";

interface NotaFotoImgProps {
  src?: string;
  alt?: string;
  className?: string;
}

/** Resolve fotos em IndexedDB (`idb:`) ou URLs inline para exibição. */
export function NotaFotoImg({ src, alt = "", className }: NotaFotoImgProps) {
  const [resolved, setResolved] = useState<string | undefined>(
    src && !isLocalMediaRef(src) ? src : undefined
  );

  useEffect(() => {
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

  if (!resolved) {
    return <div className={cn(className, "bg-gray-100 animate-pulse")} aria-hidden />;
  }

  return <img src={resolved} alt={alt} className={className} loading="lazy" decoding="async" />;
}
