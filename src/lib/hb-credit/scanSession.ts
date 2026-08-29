const SCAN_RESULT_KEY = "hb-credit-scan-v1";

export function storeHbCreditScanResult(payload: string) {
  sessionStorage.setItem(SCAN_RESULT_KEY, payload);
}

export function consumeHbCreditScanResult(): string | null {
  const payload = sessionStorage.getItem(SCAN_RESULT_KEY);
  if (payload) sessionStorage.removeItem(SCAN_RESULT_KEY);
  return payload;
}
