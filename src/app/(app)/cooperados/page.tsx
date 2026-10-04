import { lazyAppRoute } from "@/lib/performance/appRouteLazy";

export default lazyAppRoute(() => import("./CooperadosContent"));
