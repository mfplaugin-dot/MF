import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import sql from "mssql";
import { audit, db, plans, withinRateLimit } from "../store.js";
import { decryptSecret, encryptSecret, hashPassword, hashToken, randomToken, signSession, verifyScryptPassword, verifySession } from "../security.js";
import { createHash, randomUUID } from "node:crypto";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponseInit =>
  ({ status, jsonBody: body, headers: { "Cache-Control": "no-store", ...headers } });
const fail = (status: number, message: string) => json({ error: message }, status);
const cookieSecure = process.env.COOKIE_SECURE === "false" ? "" : " Secure;";
const getAdmin = (req: HttpRequest): string | null => {
  const token = (req.headers.get("cookie") ?? "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith("mf_admin="))?.slice("mf_admin=".length);
  const secret = process.env.SESSION_SIGNING_SECRET;
  return token && secret && verifySession(token, secret) ? process.env.ADMIN_USERNAME ?? null : null;
};
const orderBearer = (req: HttpRequest) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
const clientAddress = (req: HttpRequest) => (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 80);
const validOrderToken = async (req: HttpRequest, orderId: string) => {
  const token = orderBearer(req);
  if (token.length < 32) return false;
  const pool = await db();
  const found = await pool.request().input("id", sql.UniqueIdentifier, orderId)
    .input("tokenHash", sql.Char(64), hashToken(token))
    .query("SELECT id FROM dbo.Orders WHERE id=@id AND customerTokenHash=@tokenHash AND customerTokenExpiresAt > SYSUTCDATETIME()");
  return found.recordset.length === 1;
};

app.http("health", { methods: ["GET"], authLevel: "anonymous", route: "health", handler: async () => json({ status: "ok" }) });
app.http("catalog", { methods: ["GET"], authLevel: "anonymous", route: "catalog", handler: async () => json({
  plans: [{ id: "monthly", ...plans.monthly }, { id: "lifetime", ...plans.lifetime }],
  paymentMethods: ["InstaPay", "Vodafone Cash"], paymentNumber: "01016022870", currency: "EGP"
}) });

app.http("createOrder", { methods: ["POST"], authLevel: "anonymous", route: "orders", handler: async (req) => {
  try {
    if (!(await withinRateLimit(`order:${clientAddress(req)}`, 8, 3600))) return fail(429, "Too many orders. Try again later.");
    const body = await req.json() as Record<string, unknown>;
    const plan = body.plan === "monthly" || body.plan === "lifetime" ? body.plan : null;
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 160) : "";
    const locale = body.locale === "ar" ? "ar" : "en";
    if (!plan || contact.length < 5) return fail(400, "Choose a plan and enter a valid contact method.");
    const id = randomUUID();
    const accessToken = randomToken(32);
    const pool = await db();
    await pool.request()
      .input("id", sql.UniqueIdentifier, id).input("plan", sql.VarChar(16), plan)
      .input("contact", sql.NVarChar(160), contact).input("locale", sql.Char(2), locale)
      .input("price", sql.Int, plans[plan].price).input("tokenHash", sql.Char(64), hashToken(accessToken))
      .query(`INSERT dbo.Orders(id, plan, contact, locale, priceEgp, status, customerTokenHash, customerTokenExpiresAt)
        VALUES(@id,@plan,@contact,@locale,@price,'pending',@tokenHash,DATEADD(day,14,SYSUTCDATETIME()))`);
    await audit("customer", "order.created", id);
    return json({ orderId: id, accessToken, status: "pending" }, 201);
  } catch { return fail(503, "Order service is not configured."); }
} });

app.http("uploadReceipt", { methods: ["POST"], authLevel: "anonymous", route: "orders/{id}/receipt", handler: async (req) => {
  const id = req.params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Invalid order.");
  try {
    if (!(await withinRateLimit(`receipt:${clientAddress(req)}`, 12, 3600))) return fail(429, "Receipt upload limit reached. Try later.");
    if (!(await validOrderToken(req, id))) return fail(401, "Order access expired or invalid.");
    const type = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return fail(415, "Only JPEG, PNG, or WebP receipts are accepted.");
    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length < 1 || bytes.length > 5 * 1024 * 1024) return fail(413, "Receipt must be at most 5 MB.");
    const magic = type === "image/png" ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
      : type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    if (!magic) return fail(415, "File contents do not match the image type.");
    const connection = process.env.RECEIPT_STORAGE_CONNECTION_STRING;
    if (!connection) return fail(503, "Private receipt storage is not configured.");
    const service = BlobServiceClient.fromConnectionString(connection);
    const container = service.getContainerClient(process.env.RECEIPT_CONTAINER || "private-order-receipts");
    await container.createIfNotExists();
    // Enforce private access even if the named container already existed.
    await container.setAccessPolicy(undefined);
    const blobName = `${id}/${randomUUID()}`;
    await container.getBlockBlobClient(blobName).uploadData(bytes, {
      blobHTTPHeaders: { blobContentType: type },
      metadata: { sha256: createHash("sha256").update(bytes).digest("hex") }
    });
    const pool = await db();
    await pool.request().input("id", sql.UniqueIdentifier, id).input("blob", sql.NVarChar(500), blobName)
      .input("type", sql.VarChar(40), type).input("size", sql.Int, bytes.length)
      .query("INSERT dbo.Receipts(orderId, blobName, contentType, sizeBytes, status) VALUES(@id,@blob,@type,@size,'pending')");
    return json({ status: "pending", message: "Receipt received for manual review." }, 201);
  } catch { return fail(503, "Receipt could not be stored securely."); }
} });

app.http("orderStatus", { methods: ["GET"], authLevel: "anonymous", route: "orders/{id}", handler: async (req) => {
  const id = req.params.id;
  if (!id) return fail(400, "Invalid order.");
  try {
    if (!(await validOrderToken(req, id))) return fail(401, "Order access expired or invalid.");
    const pool = await db();
    const result = await pool.request().input("id", sql.UniqueIdentifier, id)
      .query("SELECT id,plan,priceEgp,status,createdAt,reviewNote FROM dbo.Orders WHERE id=@id");
    if (!result.recordset.length) return fail(404, "Order not found.");
    const messages = await pool.request().input("id", sql.UniqueIdentifier, id)
      .query("SELECT sender,message,createdAt FROM dbo.OrderMessages WHERE orderId=@id ORDER BY createdAt");
    return json({ ...result.recordset[0], messages: messages.recordset });
  } catch { return fail(503, "Order service is not configured."); }
} });

app.http("adminLogin", { methods: ["POST"], authLevel: "anonymous", route: "admin/login", handler: async (req) => {
  try {
    if (!(await withinRateLimit(`admin-login:${clientAddress(req)}`, 8, 900))) return fail(429, "Too many sign-in attempts. Try later.");
    const body = await req.json() as Record<string, unknown>;
    const username = process.env.ADMIN_USERNAME ?? "";
    const encoded = process.env.ADMIN_PASSWORD_HASH ?? "";
    const secret = process.env.SESSION_SIGNING_SECRET ?? "";
    if (!username || !encoded || secret.length < 32 || body.username !== username ||
        typeof body.password !== "string" || !verifyScryptPassword(body.password, encoded)) return fail(401, "Invalid credentials.");
    const token = signSession(username, secret);
    return json({ authenticated: true }, 200, { "Set-Cookie": `mf_admin=${token}; HttpOnly;${cookieSecure} SameSite=Strict; Path=/api/admin; Max-Age=28800` });
  } catch { return fail(503, "Admin authentication is not configured."); }
} });
app.http("adminLogout", { methods: ["POST"], authLevel: "anonymous", route: "admin/logout", handler: async () =>
  json({ authenticated: false }, 200, { "Set-Cookie": `mf_admin=; HttpOnly;${cookieSecure} SameSite=Strict; Path=/api/admin; Max-Age=0` }) });
app.http("adminOverview", { methods: ["GET"], authLevel: "anonymous", route: "admin/overview", handler: async (req) => {
  const actor = getAdmin(req); if (!actor) return fail(401, "Authentication required.");
  try {
    const pool = await db();
    const metrics = await pool.request().query(`SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pendingOrders,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approvedOrders,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) rejectedOrders,
      SUM(CASE WHEN status='approved' AND plan='monthly' THEN priceEgp ELSE 0 END) monthlyRevenue,
      SUM(CASE WHEN status='approved' AND plan='lifetime' THEN priceEgp ELSE 0 END) lifetimeRevenue
      FROM dbo.Orders;
      SELECT TOP(100) id,plan,contact,priceEgp,status,createdAt FROM dbo.Orders ORDER BY createdAt DESC;
      SELECT COUNT(*) activeLicenses FROM dbo.Licenses WHERE revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt>SYSUTCDATETIME());
      SELECT COUNT(*) activeDevices FROM dbo.DeviceActivations d INNER JOIN dbo.Licenses l ON l.id=d.licenseId
        WHERE d.revokedAt IS NULL AND l.revokedAt IS NULL AND (l.expiresAt IS NULL OR l.expiresAt>SYSUTCDATETIME());
      SELECT
        SUM(CASE WHEN revokedAt IS NULL AND expiresAt>SYSUTCDATETIME() THEN 1 ELSE 0 END) activeMonthlySubscriptions,
        SUM(CASE WHEN revokedAt IS NULL AND expiresAt<=SYSUTCDATETIME() THEN 1 ELSE 0 END) expiredMonthlySubscriptions
      FROM dbo.Licenses WHERE type='monthly';
      SELECT TOP(100) id,orderId,type,deviceLimit,expiresAt,revokedAt,createdAt
        FROM dbo.Licenses ORDER BY createdAt DESC;`);
    const recordsets = metrics.recordsets as sql.IRecordSet<any>[];
    return json({ metrics: recordsets[0][0], orders: recordsets[1], activeLicenses: recordsets[2][0].activeLicenses, activeDevices: recordsets[3][0].activeDevices,
      activeMonthlySubscriptions: recordsets[4][0].activeMonthlySubscriptions ?? 0, expiredMonthlySubscriptions: recordsets[4][0].expiredMonthlySubscriptions ?? 0,
      licenses: recordsets[5], whatsappEnabled: false });
  } catch { return fail(503, "Admin data service is not configured."); }
} });
app.http("reviewOrder", { methods: ["POST"], authLevel: "anonymous", route: "admin/orders/{id}/review", handler: async (req) => {
  const actor = getAdmin(req); if (!actor) return fail(401, "Authentication required.");
  const id = req.params.id;
  try {
    const body = await req.json() as Record<string, unknown>;
    if (!id || !["approve", "reject", "not_received"].includes(String(body.decision))) return fail(400, "Invalid review decision.");
    if (body.decision === "approve" && body.paymentIndependentlyVerified !== true) return fail(400, "Independently verify the transfer before approval.");
    const pool = await db();
    const tx = new sql.Transaction(await db()); await tx.begin();
    try {
      const request = new sql.Request(tx);
      const selected = await request.input("id", sql.UniqueIdentifier, id).query("SELECT plan,status FROM dbo.Orders WITH(UPDLOCK,ROWLOCK) WHERE id=@id");
      if (!selected.recordset.length) { await tx.rollback(); return fail(404, "Order not found."); }
      if (selected.recordset[0].status !== "pending") { await tx.rollback(); return fail(409, "Order has already been reviewed."); }
      const accepted = body.decision === "approve";
      const status = accepted ? "approved" : body.decision === "reject" ? "rejected" : "pending";
      const note = body.decision === "not_received" ? "Payment not received yet" :
        typeof body.note === "string" ? body.note.slice(0, 500) : null;
      await new sql.Request(tx).input("id", sql.UniqueIdentifier, id).input("status", sql.VarChar(16), status)
        .input("note", sql.NVarChar(500), note).input("admin", sql.NVarChar(120), actor)
        .query("UPDATE dbo.Orders SET status=@status,reviewNote=@note,reviewedBy=@admin,reviewedAt=SYSUTCDATETIME() WHERE id=@id");
      let secretPayload: string | null = null;
      if (accepted) {
        const order = selected.recordset[0];
        const licenseKey = `MF-${randomToken(24)}`;
        const licenseId = randomUUID();
        const isMonthly = order.plan === "monthly";
        let username: string | null = null, password: string | null = null;
        let accountId: number | null = null;
        if (isMonthly) {
          username = `${randomToken(12).toLowerCase()}@.emf`;
          password = randomToken(24);
          const account = await new sql.Request(tx).input("username", sql.NVarChar(120), username)
            .input("passwordHash", sql.VarChar(200), hashPassword(password))
            .query("INSERT dbo.CustomerAccounts(username,passwordHash,status) OUTPUT INSERTED.id VALUES(@username,@passwordHash,'active')");
          accountId = account.recordset[0].id;
        }
        await new sql.Request(tx).input("id", sql.UniqueIdentifier, licenseId).input("orderId", sql.UniqueIdentifier, id)
          .input("licenseHash", sql.Char(64), hashToken(licenseKey)).input("type", sql.VarChar(16), order.plan)
          .input("limit", sql.Int, isMonthly ? 1 : 3).input("accountId", sql.BigInt, accountId)
          .query(`INSERT dbo.Licenses(id,orderId,licenseHash,type,deviceLimit,accountId,expiresAt)
            VALUES(@id,@orderId,@licenseHash,@type,@limit,@accountId,${isMonthly ? "DATEADD(day,30,SYSUTCDATETIME())" : "NULL"})`);
        secretPayload = JSON.stringify({ licenseKey, ...(username ? { username, password } : {}) });
        const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
        if (!encryptionKey) throw new Error("Credential encryption is not configured");
        const encrypted = encryptSecret(secretPayload, encryptionKey);
        await new sql.Request(tx).input("id", sql.UniqueIdentifier, id).input("payload", sql.NVarChar(sql.MAX), encrypted)
          .query("UPDATE dbo.Orders SET encryptedFulfillment=@payload, fulfillmentExpiresAt=DATEADD(day,7,SYSUTCDATETIME()) WHERE id=@id");
      }
      await tx.commit();
      await audit(actor, `order.${String(body.decision)}`, id);
      // Fulfillment is retrieved only from the customer's one-time order claim endpoint.
      return json({ status });
    } catch { await tx.rollback(); return fail(503, "Review could not be completed."); }
  } catch { return fail(503, "Review service is not configured."); }
} });

app.http("claimFulfillment", { methods: ["POST"], authLevel: "anonymous", route: "orders/{id}/fulfillment", handler: async (req) => {
  const id = req.params.id;
  try {
    if (!id || !(await validOrderToken(req, id))) return fail(401, "Order access expired or invalid.");
    const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!key) return fail(503, "Credential service is not configured.");
    const pool = await db();
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await new sql.Request(tx).input("id", sql.UniqueIdentifier, id)
        .query(`SELECT status,encryptedFulfillment FROM dbo.Orders WITH(UPDLOCK,HOLDLOCK)
          WHERE id=@id AND status='approved' AND encryptedFulfillment IS NOT NULL
            AND fulfillmentExpiresAt>SYSUTCDATETIME()`);
      const order = result.recordset[0];
      if (!order) { await tx.rollback(); return fail(409, "Order is not approved, or its one-time fulfillment was already claimed or expired."); }
      const fulfillment = JSON.parse(decryptSecret(order.encryptedFulfillment, key));
      await new sql.Request(tx).input("id", sql.UniqueIdentifier, id)
        .query("UPDATE dbo.Orders SET encryptedFulfillment=NULL, fulfillmentExpiresAt=NULL WHERE id=@id");
      await tx.commit();
      return json({ fulfillment });
    } catch (error) { await tx.rollback(); throw error; }
  } catch { return fail(503, "Fulfillment could not be retrieved."); }
} });

app.http("receiptReview", { methods: ["GET"], authLevel: "anonymous", route: "admin/orders/{id}/receipt", handler: async (req) => {
  if (!getAdmin(req)) return fail(401, "Authentication required.");
  const id = req.params.id;
  try {
    const pool = await db();
    const record = await pool.request().input("id", sql.UniqueIdentifier, id)
      .query("SELECT TOP(1) blobName,contentType FROM dbo.Receipts WHERE orderId=@id ORDER BY createdAt DESC");
    if (!record.recordset.length) return fail(404, "Receipt not found.");
    const conn = process.env.RECEIPT_STORAGE_CONNECTION_STRING;
    if (!conn) return fail(503, "Private storage is not configured.");
    const blob = BlobServiceClient.fromConnectionString(conn).getContainerClient(process.env.RECEIPT_CONTAINER || "private-order-receipts").getBlobClient(record.recordset[0].blobName);
    const download = await blob.download();
    const chunks: Buffer[] = [];
    for await (const chunk of download.readableStreamBody!) chunks.push(Buffer.from(chunk));
    return { status: 200, body: Buffer.concat(chunks), headers: { "Content-Type": record.recordset[0].contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } };
  } catch { return fail(503, "Receipt cannot be retrieved."); }
} });

app.http("downloadInstaller", { methods: ["GET"], authLevel: "anonymous", route: "orders/{id}/download", handler: async (req) => {
  if (!getAdmin(req)) return fail(403, "Installer delivery is not enabled.");
  if (!process.env.INSTALLER_BLOB_NAME) return fail(503, "No verified installer release is configured.");
  return fail(503, "Configure a verified private installer artifact and short-lived download authorization before enabling release.");
} });

app.http("whatsappStatus", { methods: ["GET"], authLevel: "anonymous", route: "admin/integrations/whatsapp", handler: async (req) =>
  getAdmin(req) ? json({ enabled: false, reason: "Official API access and number compatibility are not verified." }) : fail(401, "Authentication required.") });

app.http("customerMessage", { methods: ["POST"], authLevel: "anonymous", route: "orders/{id}/messages", handler: async (req) => {
  const id = req.params.id;
  try {
    if (!(await withinRateLimit(`customer-message:${id}:${clientAddress(req)}`, 20, 60))) return fail(429, "Please wait before sending more messages.");
    if (!id || !(await validOrderToken(req, id))) return fail(401, "Order access expired or invalid.");
    const body = await req.json() as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1000) return fail(400, "Message must be between 1 and 1000 characters.");
    const pool = await db();
    await pool.request().input("id", sql.UniqueIdentifier, id).input("message", sql.NVarChar(1000), message)
      .query("INSERT dbo.OrderMessages(orderId,sender,message) VALUES(@id,'customer',@message)");
    return json({ sent: true }, 201);
  } catch { return fail(503, "Order messaging is not configured."); }
} });

app.http("adminMessages", { methods: ["GET", "POST"], authLevel: "anonymous", route: "admin/orders/{id}/messages", handler: async (req) => {
  const actor = getAdmin(req); if (!actor) return fail(401, "Authentication required.");
  const id = req.params.id;
  try {
    const pool = await db();
    if (req.method === "GET") {
      const records = await pool.request().input("id", sql.UniqueIdentifier, id)
        .query("SELECT sender,message,createdAt FROM dbo.OrderMessages WHERE orderId=@id ORDER BY createdAt");
      return json({ messages: records.recordset });
    }
    const body = await req.json() as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1000) return fail(400, "Message must be between 1 and 1000 characters.");
    await pool.request().input("id", sql.UniqueIdentifier, id).input("message", sql.NVarChar(1000), message)
      .query("INSERT dbo.OrderMessages(orderId,sender,message) VALUES(@id,'admin',@message)");
    await audit(actor, "order.message.sent", id);
    return json({ sent: true }, 201);
  } catch { return fail(503, "Order messaging is not configured."); }
} });

app.http("accountLogin", { methods: ["POST"], authLevel: "anonymous", route: "account/login", handler: async (req) => {
  try {
    if (!(await withinRateLimit(`account-login:${clientAddress(req)}`, 8, 900))) return fail(429, "Too many sign-in attempts. Try later.");
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.username !== "string" || !body.username.endsWith("@.emf") || typeof body.password !== "string") return fail(401, "Invalid account credentials.");
    const pool = await db();
    const result = await pool.request().input("username", sql.NVarChar(120), body.username)
      .query("SELECT id,passwordHash FROM dbo.CustomerAccounts WHERE username=@username AND status='active'");
    if (!result.recordset.length || !verifyScryptPassword(body.password, result.recordset[0].passwordHash)) return fail(401, "Invalid account credentials.");
    const token = randomToken(32);
    await pool.request().input("hash", sql.Char(64), hashToken(token)).input("accountId", sql.BigInt, result.recordset[0].id)
      .query("INSERT dbo.AccountSessions(tokenHash,accountId,expiresAt) VALUES(@hash,@accountId,DATEADD(day,30,SYSUTCDATETIME()))");
    return json({ accessToken: token, expiresIn: 30 * 86400 });
  } catch { return fail(503, "Account service is not configured."); }
} });

const licenseValidationHandler = async (req: HttpRequest): Promise<HttpResponseInit> => {
  try {
    const body = await req.json() as Record<string, unknown>;
    const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey : "";
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    if (licenseKey.length < 20 || deviceId.length < 8 || deviceId.length > 256) return fail(400, "Valid license and device identifiers are required.");
    const pool = await db();
    const session = orderBearer(req);
    const result = await pool.request().input("licenseHash", sql.Char(64), hashToken(licenseKey))
      .query(`SELECT l.id,l.type,l.deviceLimit,l.expiresAt,l.accountId FROM dbo.Licenses l
        WHERE l.licenseHash=@licenseHash AND l.revokedAt IS NULL AND (l.expiresAt IS NULL OR l.expiresAt>SYSUTCDATETIME())`);
    if (!result.recordset.length) return fail(401, "License is invalid, revoked, or expired.");
    const license = result.recordset[0];
    if (license.type === "monthly") {
      if (!session) return fail(401, "Monthly account sign-in required.");
      const signedIn = await pool.request().input("hash", sql.Char(64), hashToken(session)).input("accountId", sql.BigInt, license.accountId)
        .query("SELECT 1 ok FROM dbo.AccountSessions WHERE tokenHash=@hash AND accountId=@accountId AND expiresAt>SYSUTCDATETIME()");
      if (!signedIn.recordset.length) return fail(401, "Monthly account sign-in required.");
    }
    const deviceHash = hashToken(deviceId);
    const transaction = new sql.Transaction(pool); await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const existing = await new sql.Request(transaction).input("licenseId", sql.UniqueIdentifier, license.id)
        .input("deviceHash", sql.Char(64), deviceHash)
        .query("SELECT id FROM dbo.DeviceActivations WITH(UPDLOCK,HOLDLOCK) WHERE licenseId=@licenseId AND deviceHash=@deviceHash AND revokedAt IS NULL");
      if (!existing.recordset.length) {
        const counts = await new sql.Request(transaction).input("licenseId", sql.UniqueIdentifier, license.id)
          .query("SELECT COUNT(*) activeCount FROM dbo.DeviceActivations WITH(UPDLOCK,HOLDLOCK) WHERE licenseId=@licenseId AND revokedAt IS NULL");
        if (counts.recordset[0].activeCount >= license.deviceLimit) { await transaction.rollback(); return fail(409, "Device limit reached. Contact support for a device transfer."); }
        await new sql.Request(transaction).input("id", sql.UniqueIdentifier, randomUUID()).input("licenseId", sql.UniqueIdentifier, license.id).input("deviceHash", sql.Char(64), deviceHash)
          .query("INSERT dbo.DeviceActivations(id,licenseId,deviceHash) VALUES(@id,@licenseId,@deviceHash)");
      }
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; }
    const signingKey = process.env.ENTITLEMENT_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!signingKey) return fail(503, "Entitlement signing is not configured.");
    const now = Math.floor(Date.now() / 1000);
    const expiry = Math.min(now + 30 * 86400, license.expiresAt ? Math.floor(new Date(license.expiresAt).getTime() / 1000) : Number.MAX_SAFE_INTEGER);
    const entitlement = Buffer.from(JSON.stringify({
      sub: license.id, device: deviceHash, type: license.type, iat: now,
      exp: expiry
    })).toString("base64url");
    const signature = cryptoSign(null, Buffer.from(entitlement), createPrivateKey(signingKey)).toString("base64url");
    return json({ entitlement: `${entitlement}.${signature}`, expiresIn: expiry - now });
  } catch { return fail(503, "License service is not configured."); }
};
app.http("licenseActivate", { methods: ["POST"], authLevel: "anonymous", route: "license/activate", handler: licenseValidationHandler });
app.http("licenseValidate", { methods: ["POST"], authLevel: "anonymous", route: "license/validate", handler: licenseValidationHandler });

app.http("licenseRevokeDevice", { methods: ["DELETE"], authLevel: "anonymous", route: "admin/licenses/{licenseId}/devices/{deviceId}", handler: async (req) => {
  const actor = getAdmin(req); if (!actor) return fail(401, "Authentication required.");
  try {
    const pool = await db();
    const result = await pool.request().input("licenseId", sql.UniqueIdentifier, req.params.licenseId)
      .input("deviceId", sql.UniqueIdentifier, req.params.deviceId)
      .query("UPDATE dbo.DeviceActivations SET revokedAt=SYSUTCDATETIME() WHERE licenseId=@licenseId AND id=@deviceId AND revokedAt IS NULL");
    if (!result.rowsAffected[0]) return fail(404, "Active device not found.");
    await audit(actor, "device.revoked");
    return json({ revoked: true });
  } catch { return fail(503, "Device management is not configured."); }
} });

app.http("revokeLicense", { methods: ["DELETE"], authLevel: "anonymous", route: "admin/licenses/{licenseId}", handler: async (req) => {
  const actor = getAdmin(req); if (!actor) return fail(401, "Authentication required.");
  try {
    const pool = await db();
    const result = await pool.request().input("licenseId", sql.UniqueIdentifier, req.params.licenseId)
      .query("UPDATE dbo.Licenses SET revokedAt=SYSUTCDATETIME() WHERE id=@licenseId AND revokedAt IS NULL");
    if (!result.rowsAffected[0]) return fail(404, "Active license not found.");
    await audit(actor, "license.revoked");
    return json({ revoked: true });
  } catch { return fail(503, "License management is not configured."); }
} });
