export function shouldConsumeScanQuota(
  user: { loginMethod: string | null },
  nodeEnv = process.env.NODE_ENV,
) {
  return !(nodeEnv === "development" && user.loginMethod === "development-mock");
}

export function scanQuotaMessage() {
  return "Scan limit reached. Please wait a minute before starting another scan.";
}
