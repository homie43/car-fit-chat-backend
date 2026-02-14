-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('RU', 'EN');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('OK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ProviderLogKind" AS ENUM ('LLM', 'AUTO_DEV', 'MODERATION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "language" "Language",
    "name" TEXT,
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialogs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dialogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "dialogId" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'OK',
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_brands" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_models" (
    "id" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_variants" (
    "id" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bodyType" TEXT,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "powerText" TEXT,
    "kppText" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_complectations" (
    "id" UUID NOT NULL,
    "extId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_complectations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_variant_complectations" (
    "variantId" UUID NOT NULL,
    "complectationId" UUID NOT NULL,

    CONSTRAINT "car_variant_complectations_pkey" PRIMARY KEY ("variantId","complectationId")
);

-- CreateTable
CREATE TABLE "tco_cache" (
    "id" UUID NOT NULL,
    "vin" TEXT NOT NULL,
    "tcoValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "vinDecoded" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tco_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_logs" (
    "id" UUID NOT NULL,
    "kind" "ProviderLogKind" NOT NULL,
    "userId" UUID,
    "dialogId" UUID,
    "request" JSONB,
    "response" JSONB,
    "status" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "dialogs_userId_key" ON "dialogs"("userId");

-- CreateIndex
CREATE INDEX "dialogs_userId_idx" ON "dialogs"("userId");

-- CreateIndex
CREATE INDEX "dialogs_updatedAt_idx" ON "dialogs"("updatedAt");

-- CreateIndex
CREATE INDEX "messages_dialogId_createdAt_idx" ON "messages"("dialogId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_moderationStatus_idx" ON "messages"("moderationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "car_brands_code_key" ON "car_brands"("code");

-- CreateIndex
CREATE INDEX "car_brands_name_idx" ON "car_brands"("name");

-- CreateIndex
CREATE INDEX "car_models_brandId_idx" ON "car_models"("brandId");

-- CreateIndex
CREATE INDEX "car_models_name_idx" ON "car_models"("name");

-- CreateIndex
CREATE UNIQUE INDEX "car_models_brandId_name_key" ON "car_models"("brandId", "name");

-- CreateIndex
CREATE INDEX "car_variants_modelId_idx" ON "car_variants"("modelId");

-- CreateIndex
CREATE INDEX "car_variants_yearFrom_yearTo_idx" ON "car_variants"("yearFrom", "yearTo");

-- CreateIndex
CREATE UNIQUE INDEX "car_variants_modelId_name_yearFrom_yearTo_key" ON "car_variants"("modelId", "name", "yearFrom", "yearTo");

-- CreateIndex
CREATE UNIQUE INDEX "car_complectations_extId_key" ON "car_complectations"("extId");

-- CreateIndex
CREATE INDEX "car_complectations_name_idx" ON "car_complectations"("name");

-- CreateIndex
CREATE INDEX "car_variant_complectations_variantId_idx" ON "car_variant_complectations"("variantId");

-- CreateIndex
CREATE INDEX "car_variant_complectations_complectationId_idx" ON "car_variant_complectations"("complectationId");

-- CreateIndex
CREATE UNIQUE INDEX "tco_cache_vin_key" ON "tco_cache"("vin");

-- CreateIndex
CREATE INDEX "tco_cache_vin_idx" ON "tco_cache"("vin");

-- CreateIndex
CREATE INDEX "tco_cache_expiresAt_idx" ON "tco_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "provider_logs_kind_createdAt_idx" ON "provider_logs"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "provider_logs_userId_createdAt_idx" ON "provider_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "provider_logs_dialogId_createdAt_idx" ON "provider_logs"("dialogId", "createdAt");

-- AddForeignKey
ALTER TABLE "dialogs" ADD CONSTRAINT "dialogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "dialogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "car_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_variants" ADD CONSTRAINT "car_variants_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "car_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_variant_complectations" ADD CONSTRAINT "car_variant_complectations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "car_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_variant_complectations" ADD CONSTRAINT "car_variant_complectations_complectationId_fkey" FOREIGN KEY ("complectationId") REFERENCES "car_complectations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_logs" ADD CONSTRAINT "provider_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_logs" ADD CONSTRAINT "provider_logs_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "dialogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
