import { createClient, type User } from "@supabase/supabase-js";

export type CatalogPlan = {
  id: string;
  code: string;
  displayName: string;
  price: number;
  currency: string;
  billingType: string;
  durationDays: number | null;
  deviceLimit: number;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  websiteUrl: string | null;
  supportWhatsapp: string | null;
  content: Record<string, unknown> | null;
  plans: CatalogPlan[];
};

export type Catalog = { products: CatalogProduct[] };
export type OrderHistoryItem = {
  id: string;
  plan: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  productId: string;
  planId: string;
  price: number;
  currency: string;
  receiptSubmitted: boolean;
};
export type OrderStatus = {
  status: string;
  reviewNote: string | null;
  plan: string;
  priceEgp: number;
  currency: string;
  productId: string;
  messages: { sender: string; message: string; createdAt: string }[];
};
export type AdminOrder = {
  id: string;
  accountId: string;
  email: string;
  plan: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  productId: string;
  planId: string;
  amountMinor: number;
  currency: string;
  receiptUrl: string | null;
};
export type AdminOrderMessage = {
  sender: "customer" | "admin";
  message: string;
  createdAt: string;
};
export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  websiteUrl: string | null;
  supportWhatsapp: string | null;
  content: Record<string, unknown> | null;
  status: "active" | "draft" | "archived";
  plans: (Omit<CatalogPlan, "price"> & { amountMinor: number; isActive: boolean })[];
};
export type AdminLead = {
  id: string;
  product_id: string;
  product_name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  locale: string;
  source: string;
  status: "new" | "contacted" | "checkout_started" | "converted" | "lost";
  marketing_consent: boolean;
  consent_at: string | null;
  created_at: string;
  updated_at: string;
};
export type AdminAccount = {
  id: string;
  email: string;
  createdAt: string;
  status: string;
  [key: string]: unknown;
};
export type AdminAccountInspection = {
  account: AdminAccount;
  entitlements: Record<string, unknown>[];
  devices: Record<string, unknown>[];
  audit: Record<string, unknown>[];
};
export type AdminSecurityEvent = {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  account_id: string | null;
  event_type: string;
  ip_address: string | null;
  device_hash: string | null;
  user_agent: string | null;
  risk_score: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
  expires_at: string | null;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);

let client: ReturnType<typeof createClient> | null = null;
export function getSupabaseClient() {
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (!client) {
    client = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

async function platformRequest<T>(
  route: string,
  options: { method?: "GET" | "POST"; body?: unknown; file?: File; authenticated?: boolean; admin?: boolean; keepalive?: boolean } = {},
): Promise<T> {
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  const headers: Record<string, string> = { apikey: publishableKey };
  let body: BodyInit | undefined;
  if (options.file) {
    const form = new FormData();
    form.set("orderId", String((options.body as { orderId?: string } | undefined)?.orderId ?? ""));
    form.set("receipt", options.file);
    body = form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (options.authenticated || options.admin) {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) throw new Error("Sign in to continue.");
    if (options.admin && session.user.app_metadata?.role !== "admin") {
      throw new Error("This account is not authorized for the admin workspace.");
    }
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/mf-platform/${route}`, {
    method: options.method ?? "POST",
    headers,
    body,
    keepalive: options.keepalive,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(typeof detail.error === "string" ? detail.error : `Platform request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  catalog: () => platformRequest<Catalog>("catalog", { method: "GET" }),
  createLead: (body: {
    productSlug: string;
    email?: string;
    phone?: string;
    fullName?: string;
    locale: "ar" | "en";
    marketingConsent: boolean;
    privacyAccepted: true;
    privacyNoticeVersion: string;
  }) => platformRequest<{ lead: { id: string } }>("lead", { body }),
  createCheckoutSession: (body: { productSlug: string; planCode: string; leadId?: string }) =>
    platformRequest<{ session: { id: string } }>("checkout/session", { body }),
  trackWhatsAppClick: (sessionId: string) =>
    platformRequest<{ updated: boolean }>("checkout/whatsapp-click", { body: { sessionId } }),
  abandonCheckout: (sessionId: string, keepalive = false) =>
    platformRequest<{ updated: boolean }>("checkout/abandon", { body: { sessionId }, keepalive }),
  signUp: (email: string, password: string, fullName: string, emailRedirectTo: string) =>
    getSupabaseClient().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo },
    }),
  signIn: (email: string, password: string) =>
    getSupabaseClient().auth.signInWithPassword({ email, password }),
  resetPassword: (email: string, redirectTo: string) =>
    getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo }),
  updatePassword: (password: string) =>
    getSupabaseClient().auth.updateUser({ password }),
  signOut: () => getSupabaseClient().auth.signOut(),
  currentUser: async (): Promise<User | null> => {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) throw error;
    return data.user;
  },
  onAuthStateChange: (listener: (user: User | null, event: string) => void) =>
    getSupabaseClient().auth.onAuthStateChange((event, session) => listener(session?.user ?? null, event)),
  createOrder: (productSlug: string, planCode: string, sessionId: string) =>
    platformRequest<{ orderId: string; status: string }>("order/create", {
      body: { productSlug, planCode, sessionId },
      authenticated: true,
    }),
  uploadReceipt: (orderId: string, file: File) =>
    platformRequest<{ orderId: string; status: string }>("order/receipt", {
      body: { orderId },
      file,
      authenticated: true,
    }),
  orderStatus: (orderId: string) =>
    platformRequest<OrderStatus>("order/status", { body: { orderId }, authenticated: true }),
  orderHistory: () =>
    platformRequest<{ orders: OrderHistoryItem[] }>("order/list", { authenticated: true }),
  customerMessage: (orderId: string, message: string) =>
    platformRequest<{ sent: boolean }>("order/message", {
      body: { orderId, message },
      authenticated: true,
    }),
  adminOverview: () =>
    platformRequest<Record<string, unknown>>("admin/overview", { body: {}, admin: true }),
  adminOrders: (status = "pending") =>
    platformRequest<{ orders: AdminOrder[] }>("admin/orders", { body: { status }, admin: true }),
  adminOrderMessages: (orderId: string) =>
    platformRequest<{ messages: AdminOrderMessage[] }>("admin/order-messages", { body: { orderId }, admin: true }),
  sendAdminOrderMessage: (orderId: string, message: string) =>
    platformRequest<{ sent: boolean }>("admin/send-order-message", { body: { orderId, message }, admin: true }),
  reviewOrder: (orderId: string, decision: "approve" | "reject", reason: string, paymentReference = "") =>
    platformRequest<{ result: unknown }>("admin/review-order", {
      body: { orderId, decision, reason, paymentReference },
      admin: true,
    }),
  adminProducts: () =>
    platformRequest<{ products: AdminProduct[] }>("admin/products", { body: {}, admin: true }),
  saveProduct: (body: {
    productId?: string;
    slug: string;
    name: string;
    description: string;
    websiteUrl: string;
    supportWhatsapp: string;
    content: Record<string, unknown>;
    status: "active" | "draft" | "archived";
  }) => platformRequest<{ product: AdminProduct | null }>("admin/save-product", { body, admin: true }),
  savePlan: (body: {
    planId?: string;
    productId: string;
    code: string;
    displayName: string;
    price: number;
    billingType: "monthly" | "lifetime";
    durationDays: number | null;
    deviceLimit: number;
    isActive: boolean;
  }) => platformRequest<{ plan: unknown }>("admin/save-plan", { body, admin: true }),
  adminLeads: (status = "", page = 1) =>
    platformRequest<{ leads: AdminLead[]; total: number; page: number; pageSize: number }>("admin/leads", {
      body: { status: status || undefined, page, pageSize: 25 },
      admin: true,
    }),
  updateLead: (leadId: string, status: Exclude<AdminLead["status"], "converted">) =>
    platformRequest<{ lead: AdminLead }>("admin/update-lead", { body: { leadId, status }, admin: true }),
  adminAccounts: (emailQuery: string, page = 1) =>
    platformRequest<{ accounts: AdminAccount[]; total: number; page: number; pageSize: number }>("admin/accounts", {
      body: { emailQuery, page, pageSize: 25 },
      admin: true,
    }),
  inspectAccount: (targetUserId: string) =>
    platformRequest<AdminAccountInspection>("admin/inspect", { body: { targetUserId }, admin: true }),
  adminSecurityEvents: (filters: { accountId?: string; productId?: string; eventType?: string; page?: number } = {}) =>
    platformRequest<{ events: AdminSecurityEvent[]; total: number; page: number; pageSize: number }>("admin/security-events", {
      body: { ...filters, page: filters.page ?? 1, pageSize: 50 },
      admin: true,
    }),
  grantEntitlement: (body: {
    targetUserId: string;
    productId: string;
    planId: string;
    plan: "monthly" | "lifetime";
    paymentReference: string;
    reason: string;
  }) => platformRequest<{ ok: boolean; entitlementId: string }>("admin/grant-entitlement", { body, admin: true }),
  revokeEntitlement: (targetUserId: string, entitlementId: string, reason: string) =>
    platformRequest<{ ok: boolean }>("admin/revoke-entitlement", { body: { targetUserId, entitlementId, reason }, admin: true }),
  revokeDevice: (targetUserId: string, productId: string, deviceHash: string) =>
    platformRequest<{ ok: boolean }>("admin/revoke-device", { body: { targetUserId, productId, deviceHash }, admin: true }),
  setAccountSuspended: (targetUserId: string, suspended: boolean, reason: string) =>
    platformRequest<{ ok: boolean }>(`admin/${suspended ? "suspend-account" : "reactivate-account"}`, { body: { targetUserId, reason }, admin: true }),
};
