import Image from "next/image";
import { cn } from "@/utils/format";

const SIZE_PX = {
  sm: 40,
  md: 48,
  lg: 64,
  xl: 80,
  "2xl": 96,
} as const;

type AppIconSize = keyof typeof SIZE_PX;

export function AppIcon({
  size = "md",
  className,
  priority = false,
}: {
  size?: AppIconSize;
  className?: string;
  priority?: boolean;
}) {
  const px = SIZE_PX[size];

  return (
    <Image
      src="/icons/icon-512.png"
      alt="HB Cooperativas"
      width={px}
      height={px}
      priority={priority}
      className={cn("rounded-[22%] shrink-0 object-cover", className)}
    />
  );
}
