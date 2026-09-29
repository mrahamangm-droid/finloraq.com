"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
} from "@/lib/time-tracking";

// ─── Log new time entry ────────────────────────────────────────────────────────

export async function logTimeAction(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { active, userId } = await requireTenantContext();

    const dateStr = formData.get("date") as string;
    const hoursStr = formData.get("hours") as string;
    const description = (formData.get("description") as string)?.trim();
    const hourlyRateStr = formData.get("hourlyRate") as string;
    const isBillable = formData.get("isBillable") === "on";

    if (!dateStr || !hoursStr || !description) {
      return { error: "Date, hours, and description are required." };
    }

    const hours = parseFloat(hoursStr);
    if (isNaN(hours) || hours <= 0) return { error: "Hours must be a positive number." };

    const hourlyRate = hourlyRateStr ? parseFloat(hourlyRateStr) : null;

    await createTimeEntry(active.companyId, active.id, {
      projectId,
      userId,
      date: new Date(dateStr),
      hours,
      description,
      hourlyRate,
      isBillable,
    });

    revalidatePath(`/projects/${projectId}/time`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ─── Update time entry ────────────────────────────────────────────────────────

export async function updateTimeEntryAction(
  projectId: string,
  entryId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { active } = await requireTenantContext();

    const dateStr = formData.get("date") as string;
    const hoursStr = formData.get("hours") as string;
    const description = (formData.get("description") as string)?.trim();
    const hourlyRateStr = formData.get("hourlyRate") as string;
    const isBillable = formData.get("isBillable") === "on";

    const hours = parseFloat(hoursStr);
    if (isNaN(hours) || hours <= 0) return { error: "Hours must be a positive number." };

    await updateTimeEntry(active.companyId, active.id, entryId, {
      date: new Date(dateStr),
      hours,
      description,
      hourlyRate: hourlyRateStr ? parseFloat(hourlyRateStr) : null,
      isBillable,
    });

    revalidatePath(`/projects/${projectId}/time`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ─── Delete time entry ────────────────────────────────────────────────────────

export async function deleteTimeEntryAction(
  projectId: string,
  entryId: string
): Promise<void> {
  const { active } = await requireTenantContext();
  await deleteTimeEntry(active.companyId, active.id, entryId);
  revalidatePath(`/projects/${projectId}/time`);
}
