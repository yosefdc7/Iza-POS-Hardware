"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPin, verifyPin, isValidPinFormat } from "@/lib/pin-auth";
import { createPosCashierSession } from "@/lib/session-auth";
import {
  createUserSchema,
  updateUserSchema,
  updateProfileSchema,
  changePasswordSchema,
  updatePinSchema,
} from "@/lib/user-schemas";

// ---- Helper: Check Admin Authorization ----

async function checkAdminAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Unauthorized: Please log in");
  }
  if (session.user.role !== "ADMIN") {
    throw new Error("Forbidden: Admin access required");
  }
  return session;
}

// ---- Actions ----

/**
 * Creates a new user (Admin only)
 */
export async function createUserAction(data: z.infer<typeof createUserSchema>) {
  await checkAdminAuth();

  const parsed = createUserSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, email, password, role, pin } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { error: "User with this email already exists" };
    }

    await auth.api.signUpEmail({
      body: { name, email, password },
    });

    const user = await prisma.user.update({
      where: { email },
      data: {
        role,
        pin: pin && pin.trim() !== "" ? hashPin(pin.trim()) : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    revalidatePath("/settings/users");
    return { success: true, user };
  } catch (err) {
    console.error("Create user error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create user" };
  }
}

/**
 * Updates an existing user's details (Admin only)
 */
export async function updateUserAction(id: string, data: z.infer<typeof updateUserSchema>) {
  const session = await checkAdminAuth();

  const parsed = updateUserSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Validation failed", details: parsed.error.issues };
  }

  const updates = parsed.data;

  try {
    if (updates.role && updates.role !== "ADMIN" && session.user.id === id) {
      return { error: "Cannot demote yourself from admin role" };
    }

    if (updates.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: updates.email,
          NOT: { id },
        },
      });

      if (existingUser) {
        return { error: "Email already in use" };
      }
    }

    const updateData: {
      name?: string;
      email?: string;
      role?: "ADMIN" | "CASHIER";
      pin?: string | null;
    } = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.email) updateData.email = updates.email;
    if (updates.role) updateData.role = updates.role;
    if (updates.pin !== undefined) {
      updateData.pin = updates.pin && updates.pin.trim() !== "" ? hashPin(updates.pin.trim()) : null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    revalidatePath("/settings/users");
    return { success: true, user };
  } catch (err) {
    console.error("Update user action error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update user" };
  }
}

/**
 * Deletes a user (Admin only).
 */
export async function deleteUserAction(id: string) {
  const session = await checkAdminAuth();

  try {
    if (id === session.user.id) {
      return { error: "Cannot delete your own account" };
    }

    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (targetUser?.role === "ADMIN" && adminCount === 1) {
      return { error: "Cannot delete the last admin account" };
    }

    const [salesCount, refundsCount, adjustmentsCount] = await Promise.all([
      prisma.sale.count({ where: { userId: id } }),
      prisma.refund.count({ where: { userId: id } }),
      prisma.stockAdjustment.count({ where: { userId: id } }),
    ]);

    if (salesCount > 0 || refundsCount > 0 || adjustmentsCount > 0) {
      return {
        error: "Cannot delete this user because they have historical sales, refunds, or stock adjustments in the system. You can update their name or change their role instead to preserve audit logs.",
      };
    }

    await prisma.user.delete({ where: { id } });

    revalidatePath("/settings/users");
    return { success: true };
  } catch (err) {
    console.error("Delete user action error:", err);
    return { error: err instanceof Error ? err.message : "Failed to delete user" };
  }
}

/**
 * Updates the current user's profile
 */
export async function updateProfileAction(data: z.infer<typeof updateProfileSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Validation failed", details: parsed.error.issues };
  }

  const { name, email } = parsed.data;

  try {
    await auth.api.updateUser({
      body: {
        ...(name && { name }),
        ...(email && { email }),
      },
      headers: await headers(),
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
      },
    });

    revalidatePath("/settings/profile");
    revalidatePath("/pos");
    return { success: true, user: updatedUser };
  } catch (err) {
    console.error("Update profile action error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update profile" };
  }
}

/**
 * Changes the current user's password
 */
export async function changePasswordAction(data: z.infer<typeof changePasswordSchema>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: "Unauthorized: Please log in" };
  }

  const parsed = changePasswordSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Validation failed", details: parsed.error.issues };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      },
      headers: await headers(),
    });

    return { success: true, message: "Password changed successfully" };
  } catch (err) {
    console.error("Change password action error:", err);
    return { error: err instanceof Error ? err.message : "Failed to change password" };
  }
}

/**
 * Updates the current user's 4-digit PIN
 */
export async function updateOwnPinAction(pin: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized: Please log in" };
  }

  const parsed = updatePinSchema.safeParse({ pin });
  if (!parsed.success) {
    return { error: "PIN must be exactly 4 numeric digits" };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { pin: hashPin(parsed.data.pin) },
    });

    revalidatePath("/settings/profile");
    return { success: true, message: "4-Digit PIN updated successfully" };
  } catch (err) {
    console.error("Update PIN error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update PIN" };
  }
}

/**
 * Returns the list of active cashiers and admins for POS lock/unlock switching.
 */
export async function getPosCashiersAction() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        pin: true,
      },
      orderBy: { name: "asc" },
    });

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        hasPin: Boolean(u.pin),
      })),
      currentUserId: session?.user?.id ?? null,
    };
  } catch (err) {
    console.error("Get POS cashiers error:", err);
    return { error: "Failed to fetch cashiers" };
  }
}

/**
 * Verifies a 4-digit PIN for the chosen cashier and switches the active session to that user.
 */
export async function verifyAndSwitchCashierPinAction(userId: string, pin: string) {
  if (!isValidPinFormat(pin)) {
    return { error: "PIN must be exactly 4 numeric digits" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, pin: true },
    });

    if (!user) {
      return { error: "User not found" };
    }

    if (!user.pin) {
      return { error: "No PIN is set for this cashier. Please log in with password." };
    }

    const isMatch = verifyPin(pin, user.pin);
    if (!isMatch) {
      return { error: "Incorrect PIN. Please try again." };
    }

    const newSession = await createPosCashierSession(user.id);

    revalidatePath("/pos");
    revalidatePath("/(app)", "layout");
    return {
      success: true,
      token: newSession.signedToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  } catch (err) {
    console.error("Verify and switch cashier PIN error:", err);
    return { error: err instanceof Error ? err.message : "Failed to switch cashier" };
  }
}

/**
 * Returns available staff members for the PIN login screen.
 */
export async function getStaffForPinLoginAction() {
  try {

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        pin: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        role: u.role,
        hasPin: Boolean(u.pin),
      })),
    };
  } catch (err) {
    console.error("Get staff for PIN login error:", err);
    return { users: [] };
  }
}

/**
 * Logs in a user using their 4-digit PIN.
 * If userId is provided, validates that specific user.
 * If userId is omitted, matches against any user whose PIN matches.
 */
export async function loginWithPinAction(pin: string, userId?: string) {
  if (!isValidPinFormat(pin)) {
    return { error: "PIN must be exactly 4 digits" };
  }

  try {

    let matchedUser: { id: string; name: string; email: string; role: string } | null = null;

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, pin: true },
      });

      if (user && user.pin && verifyPin(pin, user.pin)) {
        matchedUser = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      }
    }

    // Fallback: If no match for selected user or no userId provided, check all users
    if (!matchedUser) {
      const users = await prisma.user.findMany({
        where: { pin: { not: null } },
        select: { id: true, name: true, email: true, role: true, pin: true },
      });

      for (const user of users) {
        if (user.pin && verifyPin(pin, user.pin)) {
          matchedUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };
          break;
        }
      }
    }

    if (!matchedUser) {
      return { error: "Incorrect PIN. Please try again." };
    }

    const { signedToken } = await createPosCashierSession(matchedUser.id);

    revalidatePath("/pos");
    revalidatePath("/(app)", "layout");

    return {
      success: true,
      token: signedToken,
      user: matchedUser,
      redirectTo: `/pos?session_token=${encodeURIComponent(signedToken)}`,
    };
  } catch (err) {
    console.error("PIN login error:", err);
    return { error: err instanceof Error ? err.message : "Failed to sign in with PIN" };
  }
}
