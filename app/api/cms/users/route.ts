import { NextResponse } from "next/server";
import { isCmsAuthenticated, getCurrentUser } from "../../../../lib/cms/auth";
import { getServerAuth } from "../../../../lib/cms/firebase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
  }

  try {
    const currentUser = await getCurrentUser();
    const currentUserRole = currentUser?.role || "superadmin";

    const listUsersResult = await auth.listUsers(100);
    const users = listUsersResult.users.map((user) => ({
      uid: user.uid,
      email: user.email,
      role: (user.customClaims?.role as string) || "superadmin",
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
    }));
    return NextResponse.json({ users, currentUserRole, currentUserEmail: currentUser?.email });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role && currentUser.role !== "superadmin") {
    return NextResponse.json({ error: "Only Super Admins can add new users." }, { status: 403 });
  }

  const auth = getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
  }

  const { email, password, role } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const assignedRole = role === "superadmin" ? "superadmin" : "admin";

  try {
    const userRecord = await auth.createUser({
      email,
      password,
    });

    await auth.setCustomUserClaims(userRecord.uid, { role: assignedRole });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role && currentUser.role !== "superadmin") {
    return NextResponse.json({ error: "Only Super Admins can change user roles." }, { status: 403 });
  }

  const auth = getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
  }

  const { uid, role, password } = await request.json();
  if (!uid) {
    return NextResponse.json({ error: "UID is required" }, { status: 400 });
  }

  try {
    if (role) {
      const assignedRole = role === "superadmin" ? "superadmin" : "admin";
      await auth.setCustomUserClaims(uid, { role: assignedRole });
    }

    if (password) {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters long." }, { status: 400 });
      }
      await auth.updateUser(uid, { password });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isCmsAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role && currentUser.role !== "superadmin") {
    return NextResponse.json({ error: "Only Super Admins can delete users." }, { status: 403 });
  }

  const auth = getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
  }

  const { uid } = await request.json();
  if (!uid) {
    return NextResponse.json({ error: "UID is required" }, { status: 400 });
  }

  if (currentUser?.uid === uid) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  try {
    await auth.deleteUser(uid);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
