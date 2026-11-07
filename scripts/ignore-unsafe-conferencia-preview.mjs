const env = process.env;
const allowed = env.VERCEL_ENV === "preview"
  ? env.VERCEL_PROJECT_ID === "prj_1dqke8xRjtzsCouFEczEB4ZgmF10" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "https://ocyfzramxvxqbtkorubn.supabase.co" &&
    env.HB_HOMOLOGATION_ONLY === "true"
  : env.VERCEL_ENV === "production" &&
    env.VERCEL_PROJECT_ID === "prj_LZM7D77Y8jXAWf6hTImOKhinAAUT" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "https://ifptyzikekrswippzmsf.supabase.co";

// Vercel treats exit code 0 as a skipped build.
process.exit(allowed ? 1 : 0);
