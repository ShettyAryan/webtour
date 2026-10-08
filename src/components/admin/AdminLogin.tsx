"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin({ devHint }: { devHint: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.refresh();
      return;
    }
    setError((await res.json().catch(() => ({}))).error || "Sign-in failed");
    setBusy(false);
  };

  return (
    <div className="admin admin-center">
      <form className="card login-card" onSubmit={submit}>
        <h1>Tour Admin</h1>
        <p className="muted">Sign in to manage rooms, photos and access points.</p>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="notice error small">{error}</p>}
        <button type="submit" className="primary-btn wide" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {devHint && (
          <p className="muted small">
            Development mode: the password is <code>admin</code>. Set <code>ADMIN_PASSWORD</code> in{" "}
            <code>.env.local</code> to change it.
          </p>
        )}
      </form>
    </div>
  );
}
