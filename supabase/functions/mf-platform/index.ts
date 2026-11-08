const PRIMARY_ORIGIN = "https://mf.mahmoudmostafa.online";
const ALLOWED_ORIGINS = new Set([PRIMARY_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"]);
const MAX_JSON_BYTES = 64 * 1024;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
function json(request: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request.headers.get("origin")) });
}
function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Required server configuration is missing.");
  return value;
}
function serviceHeaders(key: string): HeadersInit {
  return { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function storageObjectPath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clientIp(request: Request): string | null {
  const raw = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  return raw.length <= 45 && /^[0-9a-f:.]+$/i.test(raw) ? raw : null;
}
function requestId(request: Request): string | null {
  const value = request.headers.get("x-request-id") || request.headers.get("cf-ray") || "";
  return value && value.length <= 128 ? value : null;
}
async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_JSON_BYTES) throw Object.assign(new Error("Request is too large."), { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("A valid JSON object is required."), { status: 400 });
  }
  return body as Record<string, unknown>;
}
async function rest(base: string, key: string, resource: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(base + "/rest/v1/" + resource, {
    ...init,
    headers: { ...serviceHeaders(key), ...(init.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw Object.assign(new Error("Backend operation failed."), {
      backendCode: detail?.code || "",
      backendMessage: detail?.message || "",
      status: response.status,
    });
  }
  if (response.status === 204) return null;
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
async function rpc(base: string, key: string, name: string, args: Record<string, unknown>): Promise<any> {
  return await rest(base, key, "rpc/" + name, { method: "POST", body: JSON.stringify(args) });
}
async function currentUser(base: string, key: string, authorization: string): Promise<any> {
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw Object.assign(new Error("Sign-in required."), { status: 401 });
  const response = await fetch(base + "/auth/v1/user", { headers: { apikey: key, Authorization: authorization } });
  if (!response.ok) throw Object.assign(new Error("Sign-in required."), { status: 401 });
  return await response.json();
}
async function requireAdmin(request: Request, base: string, key: string): Promise<any> {
  const user = await currentUser(base, key, request.headers.get("authorization") || "");
  if (user?.app_metadata?.role !== "admin") throw Object.assign(new Error("Administrator approval is required."), { status: 403 });
  return user;
}
async function limited(base: string, key: string, scope: string, maximum: number, windowSeconds: number): Promise<void> {
  const scopeHash = await sha256(scope);
  const result = await rpc(base, key, "mf_consume_license_rate_limit", {
    p_scope_hash: scopeHash, p_limit: maximum, p_window_seconds: windowSeconds,
  });
  if (result !== true) throw Object.assign(new Error("Too many requests. Try again shortly."), { status: 429 });
}
async function recordEvent(
  request: Request, base: string, key: string, eventType: string,
  productId: string | null, accountId: string | null, details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await rest(base, key, "mf_security_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        product_id: productId, account_id: accountId, event_type: eventType,
        ip_address: clientIp(request), user_agent: (request.headers.get("user-agent") || "").slice(0, 1024) || null,
        request_id: requestId(request), details,
      }),
    });
  } catch {
    // Security telemetry must not break a successful customer action.
  }
}
async function productAndPlan(base: string, key: string, slug: string, code: string): Promise<{ product: any; plan: any }> {
  const products = await rest(base, key, "mf_products?select=id,slug,name,description,website_url,status&slug=eq." + encodeURIComponent(slug) + "&status=eq.active&limit=1");
  if (!products?.length) throw Object.assign(new Error("This product is not currently available."), { status: 404 });
  const product = products[0];
  const plans = await rest(base, key, "mf_product_plans?select=id,product_id,code,display_name,amount_minor,currency,billing_type,duration_days,device_limit&product_id=eq." + product.id + "&code=eq." + encodeURIComponent(code) + "&is_active=eq.true&limit=1");
  if (!plans?.length) throw Object.assign(new Error("This plan is not currently available."), { status: 404 });
  return { product, plan: plans[0] };
}
async function catalog(base: string, key: string): Promise<any> {
  const products = await rest(base, key, "mf_products?select=id,slug,name,description,website_url&status=eq.active&order=created_at.desc");
  const plans = await rest(base, key, "mf_product_plans?select=id,product_id,code,display_name,amount_minor,currency,billing_type,duration_days,device_limit&is_active=eq.true&order=amount_minor.asc");
  return {
    products: products.map((p: any) => ({
      id: p.id, slug: p.slug, name: p.name, description: p.description, websiteUrl: p.website_url,
      plans: plans.filter((plan: any) => plan.product_id === p.id).map((plan: any) => ({
        id: plan.id, code: plan.code, displayName: plan.display_name,
        price: Number(plan.amount_minor) / 100, currency: plan.currency,
        billingType: plan.billing_type, durationDays: plan.duration_days, deviceLimit: plan.device_limit,
      })),
    })),
  };
}
async function createLead(request: Request, base: string, key: string, body: Record<string, unknown>): Promise<Response> {
  const slug = typeof body.productSlug === "string" ? body.productSlug : "mf-plugin";
  const products = await rest(base, key, "mf_products?select=id&slug=eq." + encodeURIComponent(slug) + "&status=eq.active&limit=1");
  if (!products?.length) return json(request, 404, { error: "Product not found." });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if ((!email && !phone) || email.length > 254 || phone.length > 32 || fullName.length > 120 ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      (phone && !/^\+?[0-9 ()-]{7,32}$/.test(phone))) {
    return json(request, 400, { error: "Enter a valid email address or phone number." });
  }
  const consent = body.marketingConsent === true;
  const payload = {
    product_id: products[0].id, full_name: fullName || null, email: email || null, phone: phone || null,
    locale: body.locale === "en" ? "en" : "ar",
    source: typeof body.source === "string" ? body.source.slice(0, 80) : "website",
    status: "new", marketing_consent: consent, consent_at: consent ? new Date().toISOString() : null,
    privacy_notice_version: typeof body.privacyNoticeVersion === "string" ? body.privacyNoticeVersion.slice(0, 40) : null,
  };
  const created = await rest(base, key, "mf_checkout_leads?select=id,product_id,status,created_at", {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload),
  });
  await recordEvent(request, base, key, "checkout_started", products[0].id, null, { leadId: created?.[0]?.id || null });
  return json(request, 201, { lead: created?.[0] || null });
}
async function createCheckoutSession(request: Request, base: string, key: string, body: Record<string, unknown>): Promise<Response> {
  const slug = typeof body.productSlug === "string" ? body.productSlug : "mf-plugin";
  const code = typeof body.planCode === "string" ? body.planCode : "monthly";
  const { product, plan } = await productAndPlan(base, key, slug, code);
  const leadId = isUuid(body.leadId) ? body.leadId : null;
  if (leadId) {
    const leads = await rest(base, key, "mf_checkout_leads?select=id&id=eq." + leadId + "&product_id=eq." + product.id + "&limit=1");
    if (!leads?.length) return json(request, 400, { error: "The checkout contact could not be verified." });
  }
  const rows = await rest(base, key, "mf_checkout_sessions?select=id,product_id,plan_id,status,created_at", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ product_id: product.id, plan_id: plan.id, lead_id: leadId, status: "started", source: "website" }),
  });
  await recordEvent(request, base, key, "checkout_started", product.id, null, { sessionId: rows?.[0]?.id || null, planCode: code });
  return json(request, 201, { session: rows?.[0] || null });
}
async function updateCheckoutSession(request: Request, base: string, key: string, body: Record<string, unknown>, nextStatus: "whatsapp_opened" | "abandoned"): Promise<Response> {
  if (!isUuid(body.sessionId)) return json(request, 400, { error: "A valid checkout session is required." });
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: nextStatus, last_seen_at: now, updated_at: now };
  if (nextStatus === "whatsapp_opened") patch.whatsapp_clicked_at = now;
  else patch.abandoned_at = now;
  const rows = await rest(base, key, "mf_checkout_sessions?id=eq." + body.sessionId + "&status=in.(started,contact_submitted,whatsapp_opened)&select=id,product_id,status", {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
  });
  if (!rows?.length) return json(request, 404, { error: "Checkout session not found." });
  await recordEvent(request, base, key, nextStatus, rows[0].product_id, null, { sessionId: body.sessionId });
  return json(request, 200, { updated: true });
}
async function createOrder(request: Request, base: string, key: string, user: any, body: Record<string, unknown>): Promise<Response> {
  const slug = typeof body.productSlug === "string" ? body.productSlug : "mf-plugin";
  const code = typeof body.planCode === "string" ? body.planCode : "monthly";
  const { product, plan } = await productAndPlan(base, key, slug, code);
  const orderId = await rpc(base, key, "mf_create_product_order", {
    p_account_id: user.id, p_product_id: product.id, p_plan_id: plan.id,
  });
  if (!isUuid(orderId)) throw new Error("The order could not be created.");
  if (isUuid(body.sessionId)) {
    await rest(base, key, "mf_checkout_sessions?id=eq." + body.sessionId + "&product_id=eq." + product.id, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ account_id: user.id, order_id: orderId, status: "order_pending", updated_at: new Date().toISOString() }),
    });
  }
  await recordEvent(request, base, key, "checkout_started", product.id, user.id, { orderId, planCode: code });
  return json(request, 201, { orderId, status: "uploading" });
}
async function uploadReceipt(request: Request, base: string, key: string, user: any): Promise<Response> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_RECEIPT_BYTES + 64 * 1024) return json(request, 413, { error: "Receipt files must be 5 MB or smaller." });
  const form = await request.formData().catch(() => null);
  if (!form) return json(request, 400, { error: "Upload one PDF, JPEG, or PNG receipt." });
  const orderId = String(form.get("orderId") || "");
  const receipt = form.get("receipt");
  if (!isUuid(orderId) || !(receipt instanceof File) || receipt.size < 1 || receipt.size > MAX_RECEIPT_BYTES) {
    return json(request, 400, { error: "Upload one PDF, JPEG, or PNG receipt no larger than 5 MB." });
  }
  const orders = await rest(base, key, "mf_license_orders?select=id,account_id,status,product_id&id=eq." + orderId + "&account_id=eq." + user.id + "&limit=1");
  if (!orders?.length || orders[0].status !== "uploading") return json(request, 404, { error: "An uploadable order was not found." });
  const bytes = new Uint8Array(await receipt.arrayBuffer());
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPdf = bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  const extension = isPng && receipt.type === "image/png" ? "png" : isJpeg && receipt.type === "image/jpeg" ? "jpg" : isPdf && receipt.type === "application/pdf" ? "pdf" : "";
  if (!extension) return json(request, 400, { error: "Receipt content must match its PDF, JPEG, or PNG file type." });
  const path = user.id + "/" + orderId + "." + extension;
  const upload = await fetch(base + "/storage/v1/object/mf-license-receipts/" + storageObjectPath(path), {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": receipt.type, "x-upsert": "false" },
    body: bytes,
  });
  if (!upload.ok) return json(request, 502, { error: "Receipt upload failed. Please try again." });
  try {
    const attached = await rpc(base, key, "mf_attach_license_order_receipt", {
      p_account_id: user.id, p_order_id: orderId, p_receipt_path: path,
    });
    if (attached !== true) throw new Error("Receipt could not be attached.");
  } catch {
    await fetch(base + "/storage/v1/object/mf-license-receipts/" + storageObjectPath(path), {
      method: "DELETE", headers: { apikey: key, Authorization: "Bearer " + key },
    }).catch(() => undefined);
    throw new Error("Receipt could not be attached to the order.");
  }
  await recordEvent(request, base, key, "checkout_started", orders[0].product_id, user.id, { orderId, receiptUploaded: true });
  return json(request, 201, { orderId, status: "pending" });
}
async function orderStatus(request: Request, base: string, key: string, user: any, body: Record<string, unknown>): Promise<Response> {
  if (!isUuid(body.orderId)) return json(request, 400, { error: "A valid order is required." });
  const rows = await rest(base, key, "mf_license_orders?select=id,plan,status,created_at,reviewed_at,product_id&id=eq." + body.orderId + "&account_id=eq." + user.id + "&limit=1");
  if (!rows?.length) return json(request, 404, { error: "Order not found." });
  return json(request, 200, { order: rows[0] });
}
async function adminOrders(base: string, key: string, body: Record<string, unknown>): Promise<any> {
  const status = typeof body.status === "string" ? body.status : "";
  const allowed = ["uploading","pending","approved","rejected","upload_failed"];
  if (status && !allowed.includes(status)) throw Object.assign(new Error("Invalid order status filter."), { status: 400 });
  const query = new URLSearchParams({
    select: "id,account_id,plan,status,created_at,reviewed_at,reviewed_by,receipt_path,product_id,plan_id",
    order: "created_at.desc", limit: "100",
  });
  if (status) query.set("status", "eq." + status);
  const orders = await rest(base, key, "mf_license_orders?" + query.toString());
  const result = await Promise.all(orders.map(async (order: any) => {
    let email = "";
    try {
      const response = await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(order.account_id), { headers: serviceHeaders(key) });
      if (response.ok) email = (await response.json()).email || "";
    } catch { /* Keep admin order list available if one account lookup fails. */ }
    let receiptUrl: string | null = null;
    if (order.receipt_path) {
      const signed = await fetch(base + "/storage/v1/object/sign/mf-license-receipts/" + storageObjectPath(order.receipt_path), {
        method: "POST", headers: serviceHeaders(key), body: JSON.stringify({ expiresIn: 300 }),
      });
      if (signed.ok) {
        const data = await signed.json();
        const path = String(data.signedURL || data.signedUrl || "");
        receiptUrl = /^https:\/\//i.test(path) ? path : path ? base + "/storage/v1" + (path.startsWith("/") ? path : "/" + path) : null;
      }
    }
    return { id: order.id, accountId: order.account_id, email, plan: order.plan, status: order.status,
      createdAt: order.created_at, reviewedAt: order.reviewed_at, productId: order.product_id, planId: order.plan_id, receiptUrl };
  }));
  return { orders: result };
}
async function adminInspect(base: string, key: string, targetId: string): Promise<any> {
  if (!isUuid(targetId)) throw Object.assign(new Error("A valid account is required."), { status: 400 });
  const userResponse = await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(targetId), { headers: serviceHeaders(key) });
  if (!userResponse.ok) throw Object.assign(new Error("Account not found."), { status: userResponse.status === 404 ? 404 : 503 });
  const account = await userResponse.json();
  const [entitlements, devices, audit, controls] = await Promise.all([
    rest(base,key,"mf_entitlements?user_id=eq."+targetId+"&select=id,product_id,plan,status,starts_at,ends_at,created_at&order=created_at.desc&limit=100"),
    rest(base,key,"mf_license_devices?user_id=eq."+targetId+"&select=product_id,device_hash,first_seen_at,last_seen_at,revoked_at&order=last_seen_at.desc&limit=50"),
    rest(base,key,"mf_license_admin_audit?target_user_id=eq."+targetId+"&select=product_id,action,entitlement_id,order_id,actor_user_id,payment_reference,grant_reason,reason,created_at&order=created_at.desc&limit=50"),
    rest(base,key,"mf_account_controls?user_id=eq."+targetId+"&select=status&limit=1"),
  ]);
  return { account: { id:account.id,email:account.email||"",createdAt:account.created_at||"",status:controls[0]?.status||"active" }, entitlements, devices, audit };
}
async function adminAction(request: Request, base: string, key: string, actor: any, route: string, body: Record<string, unknown>): Promise<Response> {
  await limited(base,key,actor.id+":"+route,30,60);
  if (route === "admin/overview") return json(request,200,await rpc(base,key,"mf_admin_platform_overview",{}));
  if (route === "admin/products") return json(request,200,{products:await rpc(base,key,"mf_admin_list_products",{})});
  if (route === "admin/leads") {
    const productId = isUuid(body.productId) ? body.productId : null;
    const status = typeof body.status === "string" && body.status ? body.status : null;
    const page = Number(body.page || 1), pageSize = Number(body.pageSize || 25);
    return json(request,200,await rpc(base,key,"mf_admin_list_checkout_leads",{p_product_id:productId,p_status:status,p_page:page,p_page_size:pageSize}));
  }
  if (route === "admin/security-events") {
    return json(request,200,await rpc(base,key,"mf_admin_list_security_events",{
      p_product_id:isUuid(body.productId)?body.productId:null,
      p_account_id:isUuid(body.accountId)?body.accountId:null,
      p_event_type:typeof body.eventType==="string"&&body.eventType?body.eventType:null,
      p_page:Number(body.page||1),p_page_size:Number(body.pageSize||50),
    }));
  }
  if (route === "admin/accounts") {
    const emailQuery=typeof body.emailQuery==="string"?body.emailQuery.trim():"";
    return json(request,200,await rpc(base,key,"mf_admin_list_accounts",{
      p_email_query:emailQuery,p_page:Number(body.page||1),p_page_size:Number(body.pageSize||25),
    }));
  }
  if (route === "admin/save-product") {
    const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"";
    const name=typeof body.name==="string"?body.name.trim():"";
    const description=typeof body.description==="string"?body.description.trim():"";
    const websiteUrl=typeof body.websiteUrl==="string"?body.websiteUrl.trim():"";
    const status=body.status==="draft"||body.status==="archived"?String(body.status):"active";
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!name||name.length>120||description.length>4000||(websiteUrl&&!/^https:\/\//i.test(websiteUrl))) {
      return json(request,400,{error:"Enter a valid product slug, name, description, and HTTPS website URL."});
    }
    const payload={slug,name,description,website_url:websiteUrl||null,status,updated_at:new Date().toISOString()};
    const rows=isUuid(body.productId)
      ? await rest(base,key,"mf_products?id=eq."+body.productId,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)})
      : await rest(base,key,"mf_products",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)});
    return json(request,200,{product:rows?.[0]||null});
  }
  if (route === "admin/save-plan") {
    const productId=String(body.productId||"");
    const code=typeof body.code==="string"?body.code.trim().toLowerCase():"";
    const displayName=typeof body.displayName==="string"?body.displayName.trim():"";
    const price=Number(body.price);
    const billingType=body.billingType==="lifetime"?"lifetime":"monthly";
    const durationDays=billingType==="monthly"?Number(body.durationDays||30):null;
    const deviceLimit=Number(body.deviceLimit||1);
    if(!isUuid(productId)||! /^[a-z0-9][a-z0-9_-]{0,39}$/.test(code)||!displayName||displayName.length>120||
      !Number.isFinite(price)||price<0||price>10000000||!Number.isInteger(deviceLimit)||deviceLimit<1||deviceLimit>20||
      (billingType==="monthly"&&(!Number.isInteger(durationDays)||durationDays<1||durationDays>366))) {
      return json(request,400,{error:"Invalid product plan details."});
    }
    const payload={product_id:productId,code,display_name:displayName,amount_minor:Math.round(price*100),currency:"EGP",
      billing_type:billingType,duration_days:durationDays,device_limit:deviceLimit,is_active:body.isActive!==false,updated_at:new Date().toISOString()};
    const rows=isUuid(body.planId)
      ? await rest(base,key,"mf_product_plans?id=eq."+body.planId+"&product_id=eq."+productId,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)})
      : await rest(base,key,"mf_product_plans?on_conflict=product_id,code",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(payload)});
    return json(request,200,{plan:rows?.[0]||null});
  }
  if (route === "admin/update-lead") {
    if(!isUuid(body.leadId)||!["new","contacted","checkout_started","converted","lost"].includes(String(body.status||""))) {
      return json(request,400,{error:"A valid lead and status are required."});
    }
    const now=new Date().toISOString();
    const rows=await rest(base,key,"mf_checkout_leads?id=eq."+body.leadId,{
      method:"PATCH",headers:{Prefer:"return=representation"},
      body:JSON.stringify({status:body.status,converted_at:body.status==="converted"?now:null,updated_at:now,last_seen_at:now}),
    });
    if(!rows?.length) return json(request,404,{error:"Lead not found."});
    return json(request,200,{lead:rows[0]});
  }
  if (route === "admin/orders") return json(request,200,await adminOrders(base,key,body));
  if (route === "admin/inspect") return json(request,200,await adminInspect(base,key,String(body.targetUserId||"")));
  if (route === "admin/review-order") {
    if (!isUuid(body.orderId) || (body.decision!=="approve"&&body.decision!=="reject")) return json(request,400,{error:"A valid order and decision are required."});
    const paymentReference=typeof body.paymentReference==="string"?body.paymentReference.trim():"";
    const reason=typeof body.reason==="string"?body.reason.trim():"";
    if (!reason||reason.length>500||paymentReference.length>200||(body.decision==="approve"&&!paymentReference)) return json(request,400,{error:"A review reason is required; approval also requires a verified payment reference."});
    const result=await rpc(base,key,"mf_admin_review_product_order",{
      p_actor_user_id:actor.id,p_order_id:body.orderId,p_decision:body.decision,
      p_payment_reference:paymentReference||null,p_review_reason:reason,
    });
    const sessionStatus=body.decision==="approve"?"converted":"expired";
    const now=new Date().toISOString();
    await rest(base,key,"mf_checkout_sessions?order_id=eq."+body.orderId,{
      method:"PATCH",headers:{Prefer:"return=minimal"},
      body:JSON.stringify({status:sessionStatus,converted_at:body.decision==="approve"?now:null,updated_at:now}),
    });
    return json(request,200,{result});
  }
  const targetId=String(body.targetUserId||"");
  if (!isUuid(targetId)) return json(request,400,{error:"A valid account is required."});
  if (route==="admin/grant-entitlement") {
    const plan=body.plan==="lifetime"?"lifetime":body.plan==="monthly"?"monthly":"";
    const paymentReference=typeof body.paymentReference==="string"?body.paymentReference.trim():"";
    const reason=typeof body.reason==="string"?body.reason.trim():"";
    if (!plan||!reason||reason.length>500||(plan==="monthly"&&!paymentReference)||paymentReference.length>200) return json(request,400,{error:"A plan, reason, and verified payment reference for Monthly are required."});
    let productId=isUuid(body.productId)?body.productId:"";
    let planId=isUuid(body.planId)?body.planId:"";
    if(!productId||!planId){
      const selected=await productAndPlan(base,key,typeof body.productSlug==="string"?body.productSlug:"mf-plugin",plan);
      productId=selected.product.id;
      planId=selected.plan.id;
    }
    const result=await rpc(base,key,"mf_admin_grant_product_entitlement",{
      p_actor_user_id:actor.id,p_target_user_id:targetId,p_product_id:productId,p_plan_id:planId,
      p_payment_reference:paymentReference||null,p_grant_reason:reason,
    });
    return json(request,200,{ok:true,entitlementId:result});
  }
  if (route==="admin/revoke-entitlement") {
    if (!isUuid(body.entitlementId)||typeof body.reason!=="string"||!body.reason.trim()) return json(request,400,{error:"An entitlement and reason are required."});
    const result=await rpc(base,key,"mf_admin_revoke_entitlement",{
      p_actor_user_id:actor.id,p_target_user_id:targetId,p_entitlement_id:body.entitlementId,p_reason:body.reason.trim(),
    });
    return json(request,result===true?200:404,{ok:result===true});
  }
  if (route==="admin/revoke-device") {
    if (typeof body.deviceHash!=="string"||! /^[0-9a-f]{64}$/.test(body.deviceHash)) return json(request,400,{error:"A valid device hash is required."});
    const productId=isUuid(body.productId)?body.productId:(await productAndPlan(base,key,"mf-plugin","monthly")).product.id;
    const result=await rpc(base,key,"mf_admin_revoke_product_device",{
      p_actor_user_id:actor.id,p_target_user_id:targetId,p_product_id:productId,p_device_hash:body.deviceHash,
    });
    return json(request,result===true?200:404,{ok:result===true});
  }
  if (route==="admin/suspend-account"||route==="admin/reactivate-account") {
    const result=await rpc(base,key,"mf_admin_set_account_status",{
      p_actor_user_id:actor.id,p_target_user_id:targetId,p_status:route.endsWith("suspend-account")?"suspended":"active",
    });
    return json(request,result===true?200:404,{ok:result===true});
  }
  return json(request,404,{error:"Unknown platform operation."});
}

Deno.serve(async (request: Request) => {
  const origin=request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(request,403,{error:"Origin is not allowed."});
  if (request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(origin)});
  const base=env("SUPABASE_URL").replace(/\/+$/,"");
  const key=env("SUPABASE_SERVICE_ROLE_KEY");
  const segments=new URL(request.url).pathname.split("/").filter(Boolean);
  const functionIndex=segments.indexOf("mf-platform");
  const route=segments.slice(functionIndex+1).join("/");
  try {
    if (request.method==="GET" && route==="catalog") return json(request,200,await catalog(base,key));
    if (request.method!=="POST") return json(request,405,{error:"Method not allowed."});

    if (route==="lead") {
      const ip=clientIp(request)||"unknown";
      await limited(base,key,"public-lead:"+ip,8,60);
      return await createLead(request,base,key,await readJson(request));
    }
    if (route==="checkout/session") {
      const ip=clientIp(request)||"unknown";
      await limited(base,key,"public-checkout:"+ip,12,60);
      return await createCheckoutSession(request,base,key,await readJson(request));
    }
    if (route==="checkout/whatsapp-click"||route==="checkout/abandon") {
      const ip=clientIp(request)||"unknown";
      await limited(base,key,"public-checkout-event:"+ip,30,60);
      return await updateCheckoutSession(request,base,key,await readJson(request),route.endsWith("whatsapp-click")?"whatsapp_opened":"abandoned");
    }

    if (route.startsWith("admin/")) {
      const actor=await requireAdmin(request,base,key);
      return await adminAction(request,base,key,actor,route,await readJson(request));
    }

    if (route==="order/create") {
      const user=await currentUser(base,key,request.headers.get("authorization")||"");
      await limited(base,key,user.id+":order-create",10,60);
      return await createOrder(request,base,key,user,await readJson(request));
    }
    if (route==="order/receipt") {
      const user=await currentUser(base,key,request.headers.get("authorization")||"");
      await limited(base,key,user.id+":order-receipt",5,300);
      return await uploadReceipt(request,base,key,user);
    }
    if (route==="order/status") {
      const user=await currentUser(base,key,request.headers.get("authorization")||"");
      return await orderStatus(request,base,key,user,await readJson(request));
    }
    return json(request,404,{error:"Unknown platform operation."});
  } catch (error) {
    const status=Number((error as any)?.status)||(
      (error as any)?.backendCode==="23505"?409:
      (error as any)?.backendCode==="P0001"?409:500
    );
    const message=status>=500?"The platform service is temporarily unavailable.":(error as Error).message;
    return json(request,status,{error:message});
  }
});
