/**
 * CRM business logic — Leads, Contacts, Deals, Pipelines, Activities.
 *
 * All functions take an already-resolved companyId (from requireTenantContext)
 * so the caller controls tenant isolation. No client-supplied companyId is
 * ever trusted.
 */

import { prisma } from "@/lib/db";
import type { LeadStatus, ActivityType, ActivityStatus } from "@prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { foreignReferenceProblem, type TenantRefKind } from "@/lib/tenantRefs";

/**
 * Ids taken from a request body (an assignee, a linked customer, contact,
 * lead or deal) must be the acting company's own records. Without this,
 * company A could link company B's records to its own leads/deals/activities
 * and then read their names and emails back through A's list endpoints.
 */
async function assertOwnedRefs(companyId: string, refs: Partial<Record<TenantRefKind, string | null | undefined>>) {
  for (const [kind, id] of Object.entries(refs)) {
    const problem = await foreignReferenceProblem(prisma, companyId, kind as TenantRefKind, [id]);
    if (problem) throw new ValidationError(problem);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Pipelines
// ─────────────────────────────────────────────────────────────────────────

export async function getOrCreateDefaultPipeline(companyId: string) {
  const existing = await prisma.pipeline.findFirst({
    where: { companyId, isDefault: true },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  if (existing) return existing;

  // Seed a default pipeline with canonical stages on first use
  return prisma.pipeline.create({
    data: {
      companyId,
      name: "Sales Pipeline",
      isDefault: true,
      stages: {
        create: [
          { companyId, name: "Prospecting",  position: 1, probability: 10 },
          { companyId, name: "Qualification", position: 2, probability: 25 },
          { companyId, name: "Proposal",     position: 3, probability: 50 },
          { companyId, name: "Negotiation",  position: 4, probability: 75 },
          { companyId, name: "Closed Won",   position: 5, probability: 100, isWon: true },
          { companyId, name: "Closed Lost",  position: 6, probability: 0,   isLost: true },
        ],
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });
}

export async function getPipelines(companyId: string) {
  return prisma.pipeline.findMany({
    where: { companyId, isActive: true },
    include: {
      stages: { orderBy: { position: "asc" } },
      _count: { select: { deals: true } },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────────────

export interface LeadInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  source?: string | null;
  notes?: string | null;
  assignedToId?: string | null;
}

export async function listLeads(
  companyId: string,
  opts: { status?: LeadStatus; assignedToId?: string; page?: number; limit?: number } = {}
) {
  const { status, assignedToId, page = 1, limit = 50 } = opts;
  const where = {
    companyId,
    ...(status ? { status } : {}),
    ...(assignedToId ? { assignedToId } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: {
        assignedTo: { include: { user: { select: { name: true, email: true } } } },
        convertedCustomer: { select: { id: true, name: true } },
        _count: { select: { activities: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items, total, page, limit };
}

export async function getLead(companyId: string, id: string) {
  return prisma.lead.findFirst({
    where: { id, companyId },
    include: {
      assignedTo: { include: { user: { select: { name: true, email: true } } } },
      createdBy:  { include: { user: { select: { name: true, email: true } } } },
      convertedCustomer: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}

export async function createLead(
  companyId: string,
  membershipId: string,
  data: LeadInput
) {
  await assertOwnedRefs(companyId, { membership: data.assignedToId });
  return prisma.lead.create({
    data: { companyId, createdById: membershipId, ...data },
  });
}

export async function updateLead(
  companyId: string,
  id: string,
  data: Partial<LeadInput> & { status?: LeadStatus }
) {
  const lead = await prisma.lead.findFirst({ where: { id, companyId } });
  if (!lead) return null;
  await assertOwnedRefs(companyId, { membership: data.assignedToId });
  return prisma.lead.update({ where: { id }, data });
}

/**
 * Convert a lead → Customer + (optionally) a Deal.
 * Creates the Customer if one doesn't already exist for the company with the
 * same name; links the converted lead back.
 */
export async function convertLead(
  companyId: string,
  membershipId: string,
  leadId: string,
  opts: {
    customerName: string;
    createDeal?: boolean;
    dealName?: string;
    dealValue?: number;
    pipelineId?: string;
  }
) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId } });
  if (!lead) throw new NotFoundError("Lead not found");
  if (lead.status === "CONVERTED") throw new ValidationError("Lead already converted");

  // Find or create the Customer record
  let customer = await prisma.customer.findFirst({
    where: { companyId, name: opts.customerName },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        companyId,
        name: opts.customerName,
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
      },
    });
  }

  // Mark lead as converted
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: "CONVERTED",
      convertedAt: new Date(),
      convertedCustomerId: customer.id,
    },
  });

  // Optionally create a deal in the pipeline
  let deal = null;
  if (opts.createDeal) {
    const pipeline = opts.pipelineId
      ? await prisma.pipeline.findFirst({ where: { id: opts.pipelineId, companyId } })
      : await getOrCreateDefaultPipeline(companyId);
    if (!pipeline) throw new ValidationError("Pipeline not found");

    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id },
      orderBy: { position: "asc" },
    });
    if (!firstStage) throw new ValidationError("Pipeline has no stages");

    deal = await prisma.deal.create({
      data: {
        companyId,
        name: opts.dealName ?? `${customer.name} — New Deal`,
        value: opts.dealValue ?? 0,
        currency: "USD",
        pipelineId: pipeline.id,
        stageId: firstStage.id,
        customerId: customer.id,
        assignedToId: membershipId,
        createdById: membershipId,
      },
    });
  }

  return { customer, deal };
}

// ─────────────────────────────────────────────────────────────────────────
// Contacts
// ─────────────────────────────────────────────────────────────────────────

export interface ContactInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  isPrimary?: boolean;
  customerId?: string | null;
}

export async function listContacts(
  companyId: string,
  opts: { customerId?: string; page?: number; limit?: number } = {}
) {
  const { customerId, page = 1, limit = 50 } = opts;
  const where = {
    companyId,
    ...(customerId ? { customerId } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.crmContact.count({ where }),
    prisma.crmContact.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items, total, page, limit };
}

export async function createContact(companyId: string, data: ContactInput) {
  await assertOwnedRefs(companyId, { customer: data.customerId });
  return prisma.crmContact.create({ data: { companyId, ...data } });
}

export async function updateContact(
  companyId: string,
  id: string,
  data: Partial<ContactInput>
) {
  const contact = await prisma.crmContact.findFirst({ where: { id, companyId } });
  if (!contact) return null;
  await assertOwnedRefs(companyId, { customer: data.customerId });
  return prisma.crmContact.update({ where: { id }, data });
}

// ─────────────────────────────────────────────────────────────────────────
// Deals
// ─────────────────────────────────────────────────────────────────────────

/** Deal.value is Decimal(18, 4): anything at or above 10^14 overflows the column (a 500 from Postgres). */
export const MAX_DEAL_VALUE = 1e13;

export interface DealInput {
  name: string;
  value: number;
  currency?: string;
  pipelineId: string;
  stageId: string;
  customerId?: string | null;
  contactId?: string | null;
  assignedToId?: string | null;
  expectedCloseDate?: Date | null;
  notes?: string | null;
}

export async function listDeals(
  companyId: string,
  opts: {
    pipelineId?: string;
    stageId?: string;
    assignedToId?: string;
    open?: boolean;
    page?: number;
    limit?: number;
  } = {}
) {
  const { pipelineId, stageId, assignedToId, open, page = 1, limit = 50 } = opts;
  const where = {
    companyId,
    ...(pipelineId ? { pipelineId } : {}),
    ...(stageId ? { stageId } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(open === true ? { closedAt: null } : {}),
    ...(open === false ? { NOT: { closedAt: null } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.deal.count({ where }),
    prisma.deal.findMany({
      where,
      include: {
        stage: true,
        customer: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { include: { user: { select: { name: true, email: true } } } },
        _count: { select: { activities: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items, total, page, limit };
}

export async function getDeal(companyId: string, id: string) {
  return prisma.deal.findFirst({
    where: { id, companyId },
    include: {
      pipeline: { include: { stages: { orderBy: { position: "asc" } } } },
      stage: true,
      customer: { select: { id: true, name: true, email: true } },
      contact: true,
      assignedTo: { include: { user: { select: { name: true, email: true } } } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}

export async function createDeal(
  companyId: string,
  membershipId: string,
  data: DealInput
) {
  // Verify pipeline + stage belong to this company
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: data.stageId, pipelineId: data.pipelineId, companyId },
  });
  if (!stage) throw new ValidationError("Stage not found in pipeline for this company");
  await assertOwnedRefs(companyId, { customer: data.customerId, crmContact: data.contactId, membership: data.assignedToId });

  return prisma.deal.create({
    data: {
      companyId,
      createdById: membershipId,
      ...data,
      value: data.value,
    },
  });
}

export async function moveDeal(
  companyId: string,
  dealId: string,
  stageId: string
) {
  const [deal, stage] = await Promise.all([
    prisma.deal.findFirst({ where: { id: dealId, companyId } }),
    prisma.pipelineStage.findFirst({ where: { id: stageId, companyId } }),
  ]);
  if (!deal) throw new NotFoundError("Deal not found");
  if (!stage) throw new ValidationError("Stage not found");
  if (stage.pipelineId !== deal.pipelineId) throw new ValidationError("Stage not in same pipeline");

  const updates: any = { stage: { connect: { id: stageId } } };
  if (stage.isWon) {
    updates.closedWon = true;
    updates.closedAt = new Date();
  } else if (stage.isLost) {
    updates.closedWon = false;
    updates.closedAt = new Date();
  } else {
    // Moving back to open stage clears a previous close
    updates.closedWon = null;
    updates.closedAt = null;
  }

  return prisma.deal.update({ where: { id: dealId }, data: updates });
}

export async function updateDeal(
  companyId: string,
  id: string,
  data: Partial<DealInput>
) {
  const deal = await prisma.deal.findFirst({ where: { id, companyId } });
  if (!deal) return null;
  if (data.pipelineId !== undefined || data.stageId !== undefined) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: data.stageId ?? deal.stageId, pipelineId: data.pipelineId ?? deal.pipelineId, companyId },
    });
    if (!stage) throw new ValidationError("Stage not found in pipeline for this company");
  }
  await assertOwnedRefs(companyId, { customer: data.customerId, crmContact: data.contactId, membership: data.assignedToId });
  return prisma.deal.update({ where: { id }, data });
}

// ─────────────────────────────────────────────────────────────────────────
// Activities
// ─────────────────────────────────────────────────────────────────────────

export interface ActivityInput {
  type: ActivityType;
  subject: string;
  notes?: string | null;
  dueAt?: Date | null;
  leadId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  customerId?: string | null;
  assignedToId?: string | null;
}

export async function listActivities(
  companyId: string,
  opts: {
    leadId?: string;
    dealId?: string;
    contactId?: string;
    customerId?: string;
    assignedToId?: string;
    status?: ActivityStatus;
    page?: number;
    limit?: number;
  } = {}
) {
  const { page = 1, limit = 50, ...filters } = opts;
  const where = { companyId, ...filters };
  const [total, items] = await Promise.all([
    prisma.crmActivity.count({ where }),
    prisma.crmActivity.findMany({
      where,
      include: {
        lead:    { select: { id: true, firstName: true, lastName: true } },
        deal:    { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items, total, page, limit };
}

export async function createActivity(
  companyId: string,
  membershipId: string,
  data: ActivityInput
) {
  await assertOwnedRefs(companyId, {
    lead: data.leadId,
    deal: data.dealId,
    crmContact: data.contactId,
    customer: data.customerId,
    membership: data.assignedToId,
  });
  return prisma.crmActivity.create({
    data: { companyId, createdById: membershipId, status: "PLANNED", ...data },
  });
}

export async function markActivityDone(companyId: string, id: string) {
  const activity = await prisma.crmActivity.findFirst({ where: { id, companyId } });
  if (!activity) return null;
  return prisma.crmActivity.update({
    where: { id },
    data: { status: "DONE", doneAt: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Pipeline summary for dashboard / reports
// ─────────────────────────────────────────────────────────────────────────

export async function getPipelineSummary(companyId: string, pipelineId?: string) {
  const pipeline = pipelineId
    ? await prisma.pipeline.findFirst({ where: { id: pipelineId, companyId }, include: { stages: { orderBy: { position: "asc" } } } })
    : await getOrCreateDefaultPipeline(companyId);
  if (!pipeline) return null;

  const stageStats = await prisma.deal.groupBy({
    by: ["stageId"],
    where: { companyId, pipelineId: pipeline.id, closedAt: null },
    _count: { id: true },
    _sum: { value: true },
  });

  const stages = pipeline.stages.map((s: any) => {
    const stat = stageStats.find((x: any) => x.stageId === s.id);
    return {
      id: s.id,
      name: s.name,
      position: s.position,
      probability: s.probability,
      isWon: s.isWon,
      isLost: s.isLost,
      dealCount: stat?._count.id ?? 0,
      totalValue: Number(stat?._sum.value ?? 0),
      weightedValue: Number(stat?._sum.value ?? 0) * (s.probability / 100),
    };
  });

  return {
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages,
    totals: {
      openDeals: stages.filter((s: any) => !s.isWon && !s.isLost).reduce((a: any, s: any) => a + s.dealCount, 0),
      openValue: stages.filter((s: any) => !s.isWon && !s.isLost).reduce((a: any, s: any) => a + s.totalValue, 0),
      weightedValue: stages.filter((s: any) => !s.isWon && !s.isLost).reduce((a: any, s: any) => a + s.weightedValue, 0),
    },
  };
}
