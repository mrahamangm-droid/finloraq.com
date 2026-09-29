/**
 * Prisma enum re-exports for TypeScript type safety.
 *
 * Because `prisma generate` cannot run in the CI/development sandbox
 * (the engine download is blocked by egress policy), the generated
 * `.prisma/client` stub does not export the schema enums. This file
 * provides identical const-object + union-type equivalents so the rest
 * of the codebase has correct types at development time.
 *
 * At runtime these values are only ever used as strings (Prisma stores
 * them as strings in the DB) so the const-object approach is
 * behaviourally identical to a Prisma-generated enum.
 *
 * Once `prisma generate` can run in the real deployment pipeline the
 * imports in other files should switch back to `@prisma/client`, but
 * the code that uses these types does not need to change.
 */

// ─── Account ──────────────────────────────────────────────────────────────────

export const AccountType = {
  ASSET: "ASSET",
  LIABILITY: "LIABILITY",
  EQUITY: "EQUITY",
  REVENUE: "REVENUE",
  EXPENSE: "EXPENSE",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

// ─── Auth / roles ─────────────────────────────────────────────────────────────

export const CompanyRole = {
  COMPANY_ADMIN: "COMPANY_ADMIN",
  CFO: "CFO",
  FINANCE_MANAGER: "FINANCE_MANAGER",
  ACCOUNTANT: "ACCOUNTANT",
  STAFF: "STAFF",
  AUDITOR: "AUDITOR",
} as const;
export type CompanyRole = (typeof CompanyRole)[keyof typeof CompanyRole];

export const PermissionAction = {
  VIEW: "VIEW",
  CREATE: "CREATE",
  EDIT: "EDIT",
  APPROVE: "APPROVE",
  DELETE: "DELETE",
  EXPORT: "EXPORT",
} as const;
export type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

// ─── Journals ─────────────────────────────────────────────────────────────────

export const JournalSourceType = {
  MANUAL: "MANUAL",
  INVOICE: "INVOICE",
  BILL: "BILL",
  PAYMENT: "PAYMENT",
  RECEIPT: "RECEIPT",
  EXPENSE: "EXPENSE",
  BANK_IMPORT: "BANK_IMPORT",
  REVERSAL: "REVERSAL",
  ADJUSTMENT: "ADJUSTMENT",
  RECURRING: "RECURRING",
  AI_DRAFT: "AI_DRAFT",
} as const;
export type JournalSourceType = (typeof JournalSourceType)[keyof typeof JournalSourceType];

export const JournalStatus = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
} as const;
export type JournalStatus = (typeof JournalStatus)[keyof typeof JournalStatus];

// ─── Billing ──────────────────────────────────────────────────────────────────

export const SubscriptionPlan = {
  STARTER: "STARTER",
  GROWTH: "GROWTH",
  PROFESSIONAL: "PROFESSIONAL",
  AI_CFO: "AI_CFO",
  ENTERPRISE: "ENTERPRISE",
} as const;
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const SubscriptionStatus = {
  TRIALING: "TRIALING",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELED: "CANCELED",
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

// ─── Custom fields ────────────────────────────────────────────────────────────

export const CustomFieldEntity = {
  CUSTOMER: "CUSTOMER",
  SUPPLIER: "SUPPLIER",
  INVOICE: "INVOICE",
} as const;
export type CustomFieldEntity = (typeof CustomFieldEntity)[keyof typeof CustomFieldEntity];

export const CustomFieldType = {
  TEXT: "TEXT",
  NUMBER: "NUMBER",
  DATE: "DATE",
  SELECT: "SELECT",
  CHECKBOX: "CHECKBOX",
} as const;
export type CustomFieldType = (typeof CustomFieldType)[keyof typeof CustomFieldType];

// ─── CRM ──────────────────────────────────────────────────────────────────────

export const LeadStatus = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  UNQUALIFIED: "UNQUALIFIED",
  CONVERTED: "CONVERTED",
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const ActivityType = {
  CALL: "CALL",
  EMAIL: "EMAIL",
  MEETING: "MEETING",
  TASK: "TASK",
  NOTE: "NOTE",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const ActivityStatus = {
  PLANNED: "PLANNED",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;
export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];

// ─── Model shape types (mirrors Prisma-generated model types) ─────────────────

/** Mirrors the Prisma Customer model. */
export interface Customer {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxRegNumber: string | null;
  currency: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  customFields: unknown;
  /** Secure token for the self-service customer portal URL (/portal/[token]). */
  portalToken: string | null;
  createdAt: Date;
}

/** Mirrors the Prisma Supplier model. */
export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxRegNumber: string | null;
  currency: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  customFields: unknown;
  createdAt: Date;
}

/** Mirrors the Prisma Account model. */
export interface Account {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  isSystem: boolean;
  isActive: boolean;
  currency: string | null;
  createdAt: Date;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export const ProductType = {
  PRODUCT: "PRODUCT",
  SERVICE: "SERVICE",
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

/** Mirrors the Prisma Product model. */
export interface Product {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  sku: string | null;
  type: ProductType;
  unitPrice: number | { toNumber: () => number };
  currency: string;
  unit: string | null;
  incomeAccountCode: string | null;
  expenseAccountCode: string | null;
  taxCodeId: string | null;
  trackInventory: boolean;
  quantityOnHand: number | { toNumber: () => number };
  reorderPoint: number | { toNumber: () => number } | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Mirrors the Prisma Pipeline model. */
export interface Pipeline {
  id: string;
  companyId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Mirrors the Prisma PipelineStage model. */
export interface PipelineStage {
  id: string;
  companyId: string;
  pipelineId: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

// ─── Banking ─────────────────────────────────────────────────────────────────

export const BankTxStatus = {
  UNMATCHED:    "UNMATCHED",
  MATCHED:      "MATCHED",
  RECONCILED:   "RECONCILED",
  IGNORED:      "IGNORED",
} as const;
export type BankTxStatus = (typeof BankTxStatus)[keyof typeof BankTxStatus];

export const ReconciliationStatus = {
  DRAFT:     "DRAFT",
  COMPLETED: "COMPLETED",
} as const;
export type ReconciliationStatus = (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];

/** Mirrors the Prisma BankReconciliation model. */
export interface BankReconciliation {
  id:              string;
  companyId:       string;
  bankAccountId:   string;
  statementDate:   Date;
  openingBalance:  number | { toNumber: () => number };
  closingBalance:  number | { toNumber: () => number };
  status:          ReconciliationStatus;
  completedAt:     Date | null;
  completedById:   string | null;
  createdAt:       Date;
  updatedAt:       Date;
}

// ─── Time Tracking ────────────────────────────────────────────────────────────

/** Mirrors the Prisma TimeEntry model. */
export interface TimeEntry {
  id:            string;
  companyId:     string;
  projectId:     string;
  userId:        string;
  date:          Date;
  hours:         number | { toNumber: () => number };
  description:   string;
  hourlyRate:    (number | { toNumber: () => number }) | null;
  isBillable:    boolean;
  invoiceLineId: string | null;
  createdAt:     Date;
  updatedAt:     Date;
}

// ─── Inventory ─────────────────────────────────────────────────────────────────

export const StockMovementType = {
  RECEIPT:    "RECEIPT",
  SHIPMENT:   "SHIPMENT",
  ADJUSTMENT: "ADJUSTMENT",
  OPENING:    "OPENING",
  RETURN_IN:  "RETURN_IN",
  RETURN_OUT: "RETURN_OUT",
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

/** Mirrors the Prisma StockMovement model. */
export interface StockMovement {
  id:            string;
  companyId:     string;
  productId:     string;
  type:          StockMovementType;
  quantity:      number | { toNumber: () => number };
  balanceAfter:  number | { toNumber: () => number };
  unitCost:      (number | { toNumber: () => number }) | null;
  notes:         string | null;
  referenceType: string | null;
  referenceId:   string | null;
  date:          Date;
  createdAt:     Date;
  createdBy:     string;
}

// ─── Workflow & Approvals ──────────────────────────────────────────────────────

export const ApprovalStatus = {
  PENDING:  "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

/** Mirrors the Prisma WorkflowRule model. */
export interface WorkflowRule {
  id:           string;
  companyId:    string;
  name:         string;
  entityType:   string;
  minAmount:    (number | { toNumber: () => number }) | null;
  maxAmount:    (number | { toNumber: () => number }) | null;
  requiredRole: CompanyRole;
  isActive:     boolean;
  createdAt:    Date;
  updatedAt:    Date;
}

/** Mirrors the Prisma Approval model. */
export interface Approval {
  id:             string;
  workflowRuleId: string;
  entityType:     string;
  entityId:       string;
  status:         ApprovalStatus;
  decidedBy:      string | null;
  decidedAt:      Date | null;
  comment:        string | null;
  createdAt:      Date;
}

// ─── Prisma utility types (missing from stub client) ─────────────────────────

/**
 * Matches Prisma.InputJsonValue — acceptable values for JSON fields.
 * The generated client stub omits this, so we re-declare it here.
 */
export type InputJsonValue =
  | string
  | number
  | boolean
  | null
  | InputJsonValue[]
  | { [key: string]: InputJsonValue };

/**
 * Minimal Prisma.CompanyUpdateInput for use without generated types.
 * Extend as new Company fields are added to the schema.
 */
export interface CompanyUpdateInput {
  name?:       string | null;
  currency?:   string | null;
  timezone?:   string | null;
  dateFormat?: string | null;
  logoUrl?:    string | null;
  // JSON fields accept any serialisable value
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
