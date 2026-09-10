export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionHobeliscoDisabled } = await import("@/lib/lab/hobeliscoLabBoundary");
    const prodCheck = assertProductionHobeliscoDisabled();
    if (!prodCheck.ok) {
      console.warn("[Hobelisco] TRIPWIRE produção:", prodCheck.violations.join(" | "));
    }

    const { initHobeliscoObservationBridge } = await import("@/lib/lab/hobeliscoObservationBridge");
    initHobeliscoObservationBridge();
    const { isHobeliscoV2ObserverEnabledServer } = await import("@/lib/lab/hobeliscoV2Gate");
    if (isHobeliscoV2ObserverEnabledServer()) {
      const { initHobeliscoObserver } = await import("@lab/hobelisco-hx/observer/ObserverSingleton");
      initHobeliscoObserver();
    }
  }
}
