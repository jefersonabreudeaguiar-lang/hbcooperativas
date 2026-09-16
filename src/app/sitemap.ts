import type { MetadataRoute } from "next";
import { buildEmptySitemap } from "@/lib/security/crawlerPolicy";

/** SaaS privado — sem URLs públicas para indexação na leva 1. */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildEmptySitemap();
}
