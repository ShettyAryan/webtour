import type { Metadata } from "next";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminPanel from "@/components/admin/AdminPanel";
import { adminPassword, isAdmin } from "@/lib/server/auth";
import { readTour } from "@/lib/server/storage";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tour Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!adminPassword()) {
    return (
      <div className="admin admin-center">
        <div className="card login-card">
          <h1>Admin is locked</h1>
          <p className="muted">
            Set the <code>ADMIN_PASSWORD</code> environment variable on the server and restart to enable the admin
            panel.
          </p>
        </div>
      </div>
    );
  }

  if (!(await isAdmin())) {
    return <AdminLogin devHint={!process.env.ADMIN_PASSWORD} />;
  }

  return <AdminPanel initial={await readTour()} />;
}
