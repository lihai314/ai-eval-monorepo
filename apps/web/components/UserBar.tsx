"use client";

export default function UserBar({ email }: { email: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  }
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid #eee",
        marginBottom: 12,
        fontSize: 14,
      }}
    >
      <span>👤 {email}</span>
      <button type="button" onClick={logout}>
        sign out
      </button>
    </div>
  );
}
