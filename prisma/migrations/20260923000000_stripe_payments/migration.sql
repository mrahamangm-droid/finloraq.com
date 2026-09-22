-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('POSTED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "providerSubscriptionId" TEXT,
ADD COLUMN "providerPriceId" TEXT,
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "payToken" TEXT;

-- CreateTable
CREATE TABLE "PaymentConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "accountId" TEXT NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "connectedByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlinePayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerPaymentId" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL,
    "journalEntryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlinePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_payToken_key" ON "Invoice"("payToken");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentConnection_companyId_key" ON "PaymentConnection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentConnection_accountId_key" ON "PaymentConnection"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "OnlinePayment_providerPaymentId_key" ON "OnlinePayment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "OnlinePayment_companyId_status_idx" ON "OnlinePayment"("companyId", "status");

-- CreateIndex
CREATE INDEX "OnlinePayment_invoiceId_idx" ON "OnlinePayment"("invoiceId");

-- AddForeignKey
ALTER TABLE "PaymentConnection" ADD CONSTRAINT "PaymentConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
