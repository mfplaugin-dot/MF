const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/+$/, "");
const base = apiOrigin ? `${apiOrigin}/api` : "/api";

export const apiUrl = (path: string) => `${base}${path.startsWith("/") ? path : `/${path}`}`;

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: "include", ...options });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export type Catalog = {
  plans: { id: "monthly" | "lifetime"; price: number; deviceLimit: number; durationDays: number | null }[];
  paymentMethods: string[];
  paymentNumber: string;
  currency: string;
};
export const api = {
  catalog: () => call<Catalog>("/catalog"),
  createOrder: (body: { plan: string; contact: string; locale: string }) =>
    call<{ orderId: string; accessToken: string; status: string }>("/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  uploadReceipt: (id: string, token: string, file: File) =>
    call(`/orders/${id}/receipt`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type }, body: file }),
  order: (id: string, token: string) => call<{ status: string; reviewNote: string | null; plan: string; priceEgp: number; messages: { sender: string; message: string; createdAt: string }[] }>(`/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
  customerMessage: (id: string, token: string, message: string) => call(`/orders/${id}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message }) }),
  adminMessages: (id: string) => call<{ messages: { sender: string; message: string; createdAt: string }[] }>(`/admin/orders/${id}/messages`),
  adminMessage: (id: string, message: string) => call(`/admin/orders/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) }),
  claim: (id: string, token: string) => call<{ fulfillment: { licenseKey: string; username?: string; password?: string } }>(`/orders/${id}/fulfillment`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  login: (username: string, password: string) => call("/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }),
  overview: () => call<any>("/admin/overview"),
  review: (id: string, decision: string, paymentIndependentlyVerified = false) => call(`/admin/orders/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, paymentIndependentlyVerified }) }),
  revokeLicense: (id: string) => call(`/admin/licenses/${id}`, { method: "DELETE" }),
  logout: () => call("/admin/logout", { method: "POST" })
};
