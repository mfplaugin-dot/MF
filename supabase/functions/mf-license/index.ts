const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function b64url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new ArrayBuffer(binary.length);
  const view = new Uint8Array(bytes);
  for (let index = 0; index < binary.length; index++) {
    view[index] = binary.charCodeAt(index);
  }
  return bytes;
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing required server configuration.");
  return value;
}
function serviceHeaders(serviceKey: string): HeadersInit {
  return { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" };
}
function storageObjectPath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}
async function rest(base: string, key: string, resource: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(base + "/rest/v1/" + resource, {
    ...init,
    headers: { ...serviceHeaders(key), ...(init.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw Object.assign(new Error("Backend data operation failed."), {
      backendCode: detail && detail.code || "",
      backendMessage: detail && detail.message || "",
    });
  }
  if (response.status === 204) return null;
  return response.json();
}
async function currentUser(base: string, key: string, authorization: string): Promise<any> {
  const response = await fetch(base + "/auth/v1/user", {
    headers: { apikey: key, Authorization: authorization },
  });
  if (!response.ok) throw Object.assign(new Error("Sign-in required."), { status: 401 });
  return response.json();
}
async function limited(base: string, key: string, userId: string, action: string): Promise<void> {
  // Rate-limit by authenticated account, not by a client-controlled device hash.
  const scopeHash = await sha256(userId + ":" + action);
  const result = await rest(base, key, "rpc/mf_consume_license_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_scope_hash: scopeHash, p_limit: 20, p_window_seconds: 60 }),
  });
  if (result !== true) throw Object.assign(new Error("Too many requests."), { status: 429 });
}
function clientIp(request: Request): string | null {
  const raw = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  return raw.length <= 45 && /^[0-9a-f:.]+$/i.test(raw) ? raw : null;
}
async function recordSecurityEvent(
  request: Request, base: string, key: string, eventType: string,
  productId: string, userId: string, deviceHash: string | null, details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await rest(base,key,"mf_security_events",{
      method:"POST",headers:{Prefer:"return=minimal"},
      body:JSON.stringify({
        product_id:productId,account_id:userId,event_type:eventType,ip_address:clientIp(request),
        device_hash:deviceHash,user_agent:(request.headers.get("user-agent")||"").slice(0,1024)||null,
        request_id:(request.headers.get("x-request-id")||request.headers.get("cf-ray")||"").slice(0,128)||null,
        details,
      }),
    });
  } catch {
    // Telemetry failures must not block a valid license response.
  }
}
async function signClaims(claims: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    fromB64(env("MF_ENTITLEMENT_PRIVATE_KEY")),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const payload = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(payload));
  return payload + "." + b64url(new Uint8Array(signature));
}
function isAdmin(user: any): boolean {
  return !!(user && user.app_metadata && user.app_metadata.role === "admin");
}
async function adminInspect(base: string, key: string, actor: any, body: any): Promise<Response> {
  if (!isAdmin(actor)) return json(403, { error: "Administrator approval is required." });
  const targetId = String(body.targetUserId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
    return json(400, { error: "A valid account is required." });
  }
  const userResponse = await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(targetId), {
    headers: serviceHeaders(key),
  });
  if (userResponse.status === 404) return json(404, { error: "Account not found." });
  if (!userResponse.ok) throw new Error("Account inspection is temporarily unavailable.");
  const account = await userResponse.json();
  const entitlementsQuery = new URLSearchParams({
    user_id: "eq." + targetId,
    select: "id,plan,status,starts_at,ends_at,created_at",
    order: "created_at.desc",
    limit: "100",
  });
  const devicesQuery = new URLSearchParams({
    user_id: "eq." + targetId,
    select: "device_hash,first_seen_at,last_seen_at,revoked_at",
    order: "last_seen_at.desc",
    limit: "20",
  });
  const auditQuery = new URLSearchParams({
    target_user_id: "eq." + targetId,
    select: "action,entitlement_id,order_id,actor_user_id,payment_reference,grant_reason,reason,created_at",
    order: "created_at.desc",
    limit: "50",
  });
  const controlsQuery = new URLSearchParams({
    user_id: "eq." + targetId,
    select: "status",
    limit: "1",
  });
  const [entitlements, devices, audit, controls] = await Promise.all([
    rest(base, key, "mf_entitlements?" + entitlementsQuery.toString()),
    rest(base, key, "mf_license_devices?" + devicesQuery.toString()),
    rest(base, key, "mf_license_admin_audit?" + auditQuery.toString()),
    rest(base, key, "mf_account_controls?" + controlsQuery.toString()),
  ]);
  return json(200, {
    account: {
      id: account.id, email: account.email || "", createdAt: account.created_at || "",
      status: controls[0] && controls[0].status === "suspended" ? "suspended" : "active",
    },
    entitlements: entitlements,
    devices: devices,
    audit: audit,
  });
}
async function createRenewalOrder(
  request: Request,
  base: string,
  key: string,
  user: any,
): Promise<Response> {
  const maxRequestBytes = 5 * 1024 * 1024 + 64 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxRequestBytes) return json(413, { error: "Receipt files must be 5 MB or smaller." });
  let form: FormData;
  try {
    const reader = request.body && request.body.getReader();
    if (!reader) return json(400, { error: "Upload one PDF, JPEG, or PNG receipt." });
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxRequestBytes) {
        await reader.cancel();
        return json(413, { error: "Receipt files must be 5 MB or smaller." });
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    chunks.forEach((chunk) => {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    });
    const contentType = request.headers.get("content-type") || "";
    form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch (_error) {
    return json(400, { error: "Upload one PDF, JPEG, or PNG receipt." });
  }
  const receipt = form.get("receipt");
  if (!(receipt instanceof File) || receipt.size < 1 || receipt.size > 5 * 1024 * 1024) {
    return json(400, { error: "Upload one PDF, JPEG, or PNG receipt no larger than 5 MB." });
  }
  const bytes = new Uint8Array(await receipt.arrayBuffer());
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d &&
    bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPdf = bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  const extension = isPng && receipt.type === "image/png" ? "png" :
    isJpeg && receipt.type === "image/jpeg" ? "jpg" :
    isPdf && receipt.type === "application/pdf" ? "pdf" : "";
  if (!extension) return json(400, { error: "Receipt content must match its PDF, JPEG, or PNG file type." });

  let orderId: string;
  try {
    orderId = await rest(base, key, "rpc/create_renewal_order", {
      method: "POST",
      body: JSON.stringify({ p_account_id: user.id }),
    });
  } catch (error) {
    if ((error as any).backendCode === "23505") {
      return json(409, { error: "A Monthly receipt is already awaiting review for this account." });
    }
    if ((error as any).backendMessage === "Lifetime accounts do not need a Monthly renewal.") {
      return json(409, { error: "A Lifetime account does not need a Monthly renewal." });
    }
    throw error;
  }
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new Error("The renewal order could not be created.");
  }

  const receiptPath = user.id + "/" + orderId + "." + extension;
  let uploaded = false;
  try {
    const upload = await fetch(
      base + "/storage/v1/object/mf-license-receipts/" + storageObjectPath(receiptPath),
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          "Content-Type": receipt.type,
          "x-upsert": "false",
        },
        body: bytes,
      },
    );
    if (!upload.ok) throw new Error("Receipt upload failed.");
    uploaded = true;
    const attached = await rest(base, key, "rpc/mf_attach_license_order_receipt", {
      method: "POST",
      body: JSON.stringify({
        p_account_id: user.id,
        p_order_id: orderId,
        p_receipt_path: receiptPath,
      }),
    });
    if (attached !== true) throw new Error("Receipt could not be attached to the renewal order.");
  } catch (error) {
    if (uploaded) {
      await fetch(base + "/storage/v1/object/mf-license-receipts/" + storageObjectPath(receiptPath), {
        method: "DELETE",
        headers: { apikey: key, Authorization: "Bearer " + key },
      }).catch(() => undefined);
    }
    await rest(base, key, "rpc/mf_fail_license_order", {
      method: "POST",
      body: JSON.stringify({ p_account_id: user.id, p_order_id: orderId }),
    }).catch(() => undefined);
    throw error;
  }
  return json(201, { orderId: orderId, status: "pending" });
}
async function adminOrders(base: string, key: string, actor: any): Promise<Response> {
  if (!isAdmin(actor)) return json(403, { error: "Administrator approval is required." });
  const query = new URLSearchParams({
    select: "id,account_id,plan,status,created_at,receipt_path",
    status: "eq.pending",
    order: "created_at.asc",
    limit: "100",
  });
  const orders = await rest(base, key, "mf_license_orders?" + query.toString());
  const result = await Promise.all(orders.map(async (order: any) => {
    const signed = await fetch(
      base + "/storage/v1/object/sign/mf-license-receipts/" + storageObjectPath(order.receipt_path),
      {
        method: "POST",
        headers: serviceHeaders(key),
        body: JSON.stringify({ expiresIn: 300 }),
      },
    );
    if (!signed.ok) throw new Error("Private receipt access is temporarily unavailable.");
    const signedBody = await signed.json();
    const signedPath = String(signedBody.signedURL || signedBody.signedUrl || "");
    if (!signedPath) throw new Error("Private receipt access is temporarily unavailable.");
    return {
      id: order.id,
      accountId: order.account_id,
      plan: order.plan,
      status: order.status,
      createdAt: order.created_at,
      receiptUrl: /^https:\/\//i.test(signedPath)
        ? signedPath
        : base + "/storage/v1" + (signedPath.startsWith("/") ? signedPath : "/" + signedPath),
    };
  }));
  return json(200, { orders: result });
}
async function adminListAccounts(base: string, key: string, actor: any, body: any): Promise<Response> {
  if (!isAdmin(actor)) return json(403, { error: "Administrator approval is required." });
  const emailQuery = String(body.emailQuery || "").trim();
  const page = body.page == null ? 1 : Number(body.page);
  const pageSize = body.pageSize == null ? 25 : Number(body.pageSize);
  if (emailQuery.length > 100 || !Number.isInteger(page) || page < 1 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return json(400, { error: "Invalid account listing request." });
  }
  const result = await rest(base, key, "rpc/mf_admin_list_accounts", {
    method: "POST",
    body: JSON.stringify({ p_email_query: emailQuery, p_page: page, p_page_size: pageSize }),
  });
  return json(200, result || { accounts: [], total: 0, page: page, pageSize: pageSize });
}
async function adminOperation(base: string, key: string, actor: any, action: string, body: any): Promise<Response> {
  if (!isAdmin(actor)) return json(403, { error: "Administrator approval is required." });
  if (action === "review-order") {
    const orderId = String(body.orderId || "");
    const decision = String(body.decision || "");
    const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
    const reviewReason = typeof body.reviewReason === "string" ? body.reviewReason.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId) ||
        (decision !== "approve" && decision !== "reject") ||
        !reviewReason || reviewReason.length > 500 ||
        (decision === "approve" && !paymentReference) || paymentReference.length > 200) {
      return json(400, { error: "A valid decision and review reason are required; approvals also need a payment reference." });
    }
    try {
      const result = await rest(base, key, "rpc/mf_admin_review_license_order", {
        method: "POST",
        body: JSON.stringify({
          p_actor_user_id: actor.id,
          p_order_id: orderId,
          p_decision: decision,
          p_payment_reference: paymentReference || null,
          p_review_reason: reviewReason,
        }),
      });
      return json(200, result || { ok: true });
    } catch (error) {
      if ((error as any).backendMessage === "MF_LIFETIME_ACTIVE") {
        return json(409, { error: "This account already has an active Lifetime entitlement; no Monthly time was added." });
      }
      if ((error as any).backendMessage === "MF_MONTHLY_PENDING_ACTIVATION") {
        return json(409, { error: "This account already has an approved Monthly term waiting for first activation." });
      }
      if ((error as any).backendCode === "23505" &&
          String((error as any).backendMessage || "").indexOf("mf_license_admin_audit_payment_reference_uidx") >= 0) {
        return json(409, { error: "This payment review reference has already been used." });
      }
      if ((error as any).backendCode === "P0001") {
        return json(409, { error: "This order is no longer pending review." });
      }
      throw error;
    }
  }
  const targetId = String(body.targetUserId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) return json(400, { error: "A valid account is required." });
  if (action === "grant-monthly" || action === "grant-lifetime") {
    const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
    const grantReason = typeof body.grantReason === "string" ? body.grantReason.trim() : "";
    if ((action === "grant-monthly" && !paymentReference) ||
        !grantReason || paymentReference.length > 200 || grantReason.length > 500) {
      return json(400, { error: "A valid payment review reference (Monthly) and grant reason are required." });
    }
    let granted;
    try {
      granted = await rest(base, key, "rpc/mf_admin_grant_entitlement", {
        method: "POST",
        body: JSON.stringify({
          p_actor_user_id: actor.id,
          p_target_user_id: targetId,
          p_plan: action.slice("grant-".length),
          p_payment_reference: paymentReference || null,
          p_grant_reason: grantReason,
        }),
      });
    } catch (error) {
      if ((error as any).backendMessage === "MF_LIFETIME_ACTIVE" ||
          (error as any).backendMessage === "MF_LIFETIME_ALREADY_ACTIVE") {
        return json(409, { error: action === "grant-monthly"
          ? "This account already has an active Lifetime entitlement; no Monthly entitlement was added."
          : "This account already has an active Lifetime entitlement; no duplicate was added." });
      }
      if ((error as any).backendMessage === "MF_MONTHLY_PENDING_ACTIVATION") {
        return json(409, { error: "This account already has a Monthly entitlement waiting for first activation." });
      }
      if ((error as any).backendCode === "23505" &&
          String((error as any).backendMessage || "").indexOf("mf_license_admin_audit_payment_reference_uidx") >= 0) {
        return json(409, { error: "This payment review reference has already been used." });
      }
      throw error;
    }
    if (typeof granted !== "string") throw new Error("The entitlement grant could not be recorded.");
  } else if (action === "revoke-device") {
    const deviceHash = String(body.deviceHash || "");
    if (!/^[0-9a-f]{64}$/.test(deviceHash)) return json(400, { error: "A valid device hash is required." });
    const revoked = await rest(base, key, "rpc/mf_admin_revoke_device", {
      method: "POST",
      body: JSON.stringify({ p_actor_user_id: actor.id, p_target_user_id: targetId, p_device_hash: deviceHash }),
    });
    if (revoked !== true) return json(404, { error: "The active device was not found." });
  } else if (action === "revoke-entitlement") {
    const entitlementId = String(body.entitlementId || "");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entitlementId)) return json(400, { error: "A valid entitlement is required." });
    if (!reason || reason.length > 500) return json(400, { error: "An administrator reason is required for immediate cancellation." });
    const revoked = await rest(base, key, "rpc/mf_admin_revoke_entitlement", {
      method: "POST",
      body: JSON.stringify({ p_actor_user_id: actor.id, p_target_user_id: targetId, p_entitlement_id: entitlementId, p_reason: reason }),
    });
    if (revoked !== true) return json(404, { error: "The active entitlement was not found." });
  } else if (action === "suspend-account" || action === "reactivate-account") {
    const result = await rest(base, key, "rpc/mf_admin_set_account_status", {
      method: "POST",
      body: JSON.stringify({
        p_actor_user_id: actor.id,
        p_target_user_id: targetId,
        p_status: action === "suspend-account" ? "suspended" : "active",
      }),
    });
    if (result !== true) return json(404, { error: "The account was not found or the status could not be changed." });
  } else {
    return json(404, { error: "Unknown administrator operation." });
  }
  return json(200, { ok: true });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  let action = "";
  try {
    const url = new URL(request.url);
    action = url.pathname.split("/").filter(Boolean).pop() || "";
    const base = env("SUPABASE_URL").replace(/\/+$/, "");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("authorization") || "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) return json(401, { error: "Sign-in required." });
    const user = await currentUser(base, serviceKey, authorization);
    if (action === "order-create") {
      await limited(base, serviceKey, user.id, action);
      return await createRenewalOrder(request, base, serviceKey, user);
    }
    const requestBody = await request.json().catch(() => ({}));
    const body = requestBody && typeof requestBody === "object" && !Array.isArray(requestBody) ? requestBody : {};
    if (action === "admin-list") {
      await limited(base, serviceKey, user.id, action);
      return await adminListAccounts(base, serviceKey, user, body);
    }
    if (action === "admin-inspect") {
      await limited(base, serviceKey, user.id, action);
      return await adminInspect(base, serviceKey, user, body);
    }
    if (action === "admin-orders") {
      await limited(base, serviceKey, user.id, action);
      return await adminOrders(base, serviceKey, user);
    }
    if (action === "grant-lifetime" || action === "grant-monthly" ||
        action === "revoke-device" || action === "revoke-entitlement" ||
        action === "suspend-account" || action === "reactivate-account" ||
        action === "review-order") {
      await limited(base, serviceKey, user.id, action);
      return await adminOperation(base, serviceKey, user, action, body);
    }
    if (action !== "validate") return json(404, { error: "Unknown licensing operation." });
    const deviceHash = String(body.deviceHash || "");
    if (!/^[0-9a-f]{64}$/.test(deviceHash)) return json(400, { error: "Invalid device identifier." });
    const productSlug = typeof body.productSlug === "string" ? body.productSlug.trim() : "mf-plugin";
    const productRows = await rest(base, serviceKey, "mf_products?select=id,slug&slug=eq." + encodeURIComponent(productSlug) + "&status=eq.active&limit=1");
    if (!productRows.length) return json(404, { error: "This plugin is not currently available." });
    const productId = productRows[0].id;
    await limited(base, serviceKey, user.id + ":" + productId, action);

    const now = new Date();
    const accountControlsQuery = new URLSearchParams({
      user_id: "eq." + user.id,
      select: "status",
      limit: "1",
    });
    const accountControls = await rest(base, serviceKey, "mf_account_controls?" + accountControlsQuery.toString());
    if (accountControls.some((item: any) => item.status === "suspended")) {
      await recordSecurityEvent(request,base,serviceKey,"account_suspended",productId,user.id,deviceHash,{productSlug});
      return json(403, { error: "This MF account is suspended. Contact support for assistance." });
    }

    const expiredQuery = new URLSearchParams({
      user_id: "eq." + user.id,
      product_id: "eq." + productId,
      plan: "eq.monthly",
      status: "eq.active",
      ends_at: "lte." + now.toISOString(),
    });
    await rest(base, serviceKey, "mf_entitlements?" + expiredQuery.toString(), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "expired", updated_at: now.toISOString() }),
    });

    const activated = await rest(base, serviceKey, "rpc/mf_activate_and_register_product_device", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: user.id,
        p_product_id: productId,
        p_device_hash: deviceHash,
      }),
    });
    if (!activated || typeof activated !== "object" || typeof activated.id !== "string") {
      await recordSecurityEvent(request,base,serviceKey,"device_limit_hit",productId,user.id,deviceHash,{productSlug});
      return json(403, { error: "No active subscription is available for this plugin and device." });
    }

    const issuanceTime = new Date();
    const issuanceQuery = new URLSearchParams({
      user_id: "eq." + user.id,
      product_id: "eq." + productId,
      id: "eq." + activated.id,
      status: "eq.active",
      starts_at: "lte." + issuanceTime.toISOString(),
      select: "id,product_id,plan_id,plan,status,starts_at,ends_at,created_at",
    });
    const issuanceEntitlements = await rest(base, serviceKey, "mf_entitlements?" + issuanceQuery.toString());
    const issuanceEntitlement = issuanceEntitlements.find((item: any) =>
      (item.plan === "lifetime" && item.ends_at === null) ||
      (item.plan === "monthly" && item.ends_at && new Date(item.ends_at).getTime() > issuanceTime.getTime())
    );
    if (!issuanceEntitlement) {
      await recordSecurityEvent(request,base,serviceKey,"license_denied",productId,user.id,deviceHash,{productSlug,reason:"entitlement_not_active"});
      return json(403, { error: "No active subscription is attached to this plugin account." });
    }

    const issuedAt = Math.floor(issuanceTime.getTime() / 1000);
    const planExpiresAt = issuanceEntitlement.plan === "monthly"
      ? Math.floor(new Date(issuanceEntitlement.ends_at).getTime() / 1000)
      : null;
    const claims = {
      sub: user.id,
      product: productSlug,
      product_id: productId,
      entitlement_id: issuanceEntitlement.id,
      type: issuanceEntitlement.plan,
      status: "active",
      device: deviceHash,
      iat: issuedAt,
      exp: planExpiresAt === null ? issuedAt + 7 * 86400 : planExpiresAt,
      plan_expires_at: planExpiresAt,
    };
    if (planExpiresAt !== null && planExpiresAt <= issuedAt) {
      await recordSecurityEvent(request,base,serviceKey,"license_denied",productId,user.id,deviceHash,{productSlug,reason:"expired"});
      return json(403, { error: "The monthly subscription has expired." });
    }
    await recordSecurityEvent(request,base,serviceKey,"license_validate",productId,user.id,deviceHash,{productSlug,plan:issuanceEntitlement.plan});
    return json(200, { entitlement: await signClaims(claims) });
  } catch (error) {
    const status = (error as any).status;
    if (status === 429) return json(429, { error: "Too many verification attempts. Try again shortly." });
    if (status === 401) return json(401, { error: "Sign-in required." });
    if (status === 403) return json(403, { error: (error as Error).message });
    // Do not return or log provider credentials, tokens, SQL, or signing material.
    return json(500, { error: "License verification is temporarily unavailable." });
  }
});
