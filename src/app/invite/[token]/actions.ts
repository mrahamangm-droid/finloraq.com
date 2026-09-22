"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { acceptInvitation } from "@/lib/users";

export async function acceptInvitationAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    throw new Error("You must be signed in to accept an invitation.");
  }

  const token = String(formData.get("token"));
  await acceptInvitation({ token, userId: session.user.id, userEmail: session.user.email });

  redirect("/dashboard");
}
