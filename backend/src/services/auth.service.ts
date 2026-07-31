import { supabaseAdmin, createPasswordAuthClient } from "../config/supabase";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import { uploadUserAvatar } from "./storage.service";
import type { User } from "@prisma/client";

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phoneNumber?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface UpdateProfileInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  phoneNumber?: string | null;
}

function toProfile(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

export async function registerUser(input: RegisterInput) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new ApiError(400, error?.message ?? "Could not create account");
  }

  try {
    const user = await prisma.user.create({
      data: {
        authId: data.user.id,
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        email: input.email,
        phoneNumber: input.phoneNumber,
      },
    });

    // Throwaway client — see createPasswordAuthClient. Signing in on
    // supabaseAdmin would break every later Storage upload in this process.
    const { data: session, error: sessionError } = await createPasswordAuthClient().auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (sessionError || !session.session) {
      throw new ApiError(500, "Account created but sign-in failed — try logging in");
    }

    return { profile: toProfile(user), session: session.session };
  } catch (err) {
    // Roll back the Supabase Auth user so a failed profile insert doesn't
    // leave an orphaned auth account with no matching FinSight profile.
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw err;
  }
}

export async function loginUser(input: LoginInput) {
  const { data, error } = await createPasswordAuthClient().auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session) {
    throw new ApiError(401, "Invalid email or password");
  }

  const user = await prisma.user.findUnique({ where: { authId: data.user.id } });
  if (!user) {
    throw new ApiError(401, "No FinSight profile for this account");
  }

  return { profile: toProfile(user), session: data.session };
}

export async function logoutUser(accessToken: string) {
  await supabaseAdmin.auth.admin.signOut(accessToken, "global").catch(() => undefined);
}

export async function requestPasswordRecovery(email: string) {
  // Always succeeds from the caller's perspective — never reveal whether an
  // email is registered.
  await supabaseAdmin.auth.resetPasswordForEmail(email).catch(() => undefined);
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "Profile not found");
  }

  // Re-authenticate with the current password before allowing the change.
  // A valid access token alone isn't enough — a leaked/borrowed token
  // shouldn't be able to lock the real owner out of their own account.
  const { error: verifyError } = await createPasswordAuthClient().auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    throw new ApiError(400, "Current password is incorrect");
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.authId, { password: newPassword });
  if (error) {
    throw new ApiError(400, error.message);
  }
}

export async function getProfile(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "Profile not found");
  }
  return toProfile(user);
}

export async function updateProfile(userId: number, input: UpdateProfileInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: input,
  });
  return toProfile(user);
}

export async function updateAvatar(userId: number, buffer: Buffer, mimetype: string, originalname: string) {
  const avatarUrl = await uploadUserAvatar(userId, buffer, mimetype, originalname);
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
  return toProfile(user);
}
