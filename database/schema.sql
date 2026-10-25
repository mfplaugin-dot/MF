-- Azure SQL schema. Apply to a dedicated database; intentionally contains NO seed data.
CREATE TABLE dbo.Orders (
  id uniqueidentifier NOT NULL PRIMARY KEY,
  plan varchar(16) NOT NULL CHECK (plan IN ('monthly','lifetime')),
  contact nvarchar(160) NOT NULL,
  locale char(2) NOT NULL CHECK(locale IN ('ar','en')),
  priceEgp int NOT NULL CHECK(priceEgp IN (200,1500)),
  status varchar(16) NOT NULL CHECK(status IN ('pending','approved','rejected')),
  customerTokenHash char(64) NOT NULL,
  customerTokenExpiresAt datetime2 NOT NULL,
  reviewNote nvarchar(500) NULL,
  reviewedBy nvarchar(120) NULL,
  reviewedAt datetime2 NULL,
  encryptedFulfillment nvarchar(max) NULL,
  fulfillmentExpiresAt datetime2 NULL,
  createdAt datetime2 NOT NULL CONSTRAINT DF_Orders_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Orders_status_created ON dbo.Orders(status,createdAt DESC);
CREATE TABLE dbo.Receipts (
  id bigint IDENTITY PRIMARY KEY,
  orderId uniqueidentifier NOT NULL REFERENCES dbo.Orders(id),
  blobName nvarchar(500) NOT NULL,
  contentType varchar(40) NOT NULL,
  sizeBytes int NOT NULL,
  status varchar(16) NOT NULL CHECK(status IN ('pending','reviewed','deleted')),
  createdAt datetime2 NOT NULL CONSTRAINT DF_Receipts_created DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.OrderMessages (
  id bigint IDENTITY PRIMARY KEY,
  orderId uniqueidentifier NOT NULL REFERENCES dbo.Orders(id),
  sender varchar(16) NOT NULL CHECK(sender IN ('customer','admin')),
  message nvarchar(1000) NOT NULL,
  createdAt datetime2 NOT NULL CONSTRAINT DF_OrderMessages_created DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.CustomerAccounts (
  id bigint IDENTITY PRIMARY KEY,
  username nvarchar(120) NOT NULL UNIQUE,
  passwordHash varchar(200) NOT NULL,
  status varchar(16) NOT NULL CHECK(status IN ('active','suspended','revoked')),
  createdAt datetime2 NOT NULL CONSTRAINT DF_Accounts_created DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.Licenses (
  id uniqueidentifier NOT NULL PRIMARY KEY,
  orderId uniqueidentifier NOT NULL UNIQUE REFERENCES dbo.Orders(id),
  licenseHash char(64) NOT NULL UNIQUE,
  accountId bigint NULL REFERENCES dbo.CustomerAccounts(id),
  type varchar(16) NOT NULL CHECK(type IN ('monthly','lifetime')),
  deviceLimit int NOT NULL CHECK(deviceLimit IN (1,3)),
  expiresAt datetime2 NULL,
  revokedAt datetime2 NULL,
  createdAt datetime2 NOT NULL CONSTRAINT DF_Licenses_created DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.AccountSessions (
  tokenHash char(64) NOT NULL PRIMARY KEY,
  accountId bigint NOT NULL REFERENCES dbo.CustomerAccounts(id),
  expiresAt datetime2 NOT NULL,
  createdAt datetime2 NOT NULL CONSTRAINT DF_AccountSessions_created DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.DeviceActivations (
  id uniqueidentifier NOT NULL PRIMARY KEY,
  licenseId uniqueidentifier NOT NULL REFERENCES dbo.Licenses(id),
  deviceHash char(64) NOT NULL,
  activatedAt datetime2 NOT NULL CONSTRAINT DF_Activations_created DEFAULT SYSUTCDATETIME(),
  revokedAt datetime2 NULL,
  CONSTRAINT UQ_Activation_license_device UNIQUE(licenseId,deviceHash)
);
CREATE TABLE dbo.AuditEvents (
  id bigint IDENTITY PRIMARY KEY,
  actor nvarchar(120) NOT NULL,
  action nvarchar(80) NOT NULL,
  orderId uniqueidentifier NULL,
  createdAt datetime2 NOT NULL CONSTRAINT DF_Audit_created DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.RateLimits (
  bucketHash char(64) NOT NULL PRIMARY KEY,
  windowStartedAt datetime2 NOT NULL,
  requestCount int NOT NULL
);
