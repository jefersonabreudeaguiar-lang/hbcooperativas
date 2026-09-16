import type { MetadataRoute } from "next";
import { buildRobotsManifest } from "@/lib/security/crawlerPolicy";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsManifest();
}
