import { useState } from "react";
import { Plus, Trash2, UserCheck, LogOut, ShieldCheck, Upload, Users } from "lucide-react";
import { useStore } from "../lib/store";
import { useAccount, useSignOut } from "../lib/auth";
import { uid } from "../lib/format";
import { ModalShell, Field, Section, Avatar, InlineText, ConfirmButton, Badge } from "../ui/kit";

export default function SettingsModal({ onClose }) {
  const { data, patch, updateSettings, currentUser, shared, pendingLocal, publishLocal } = useStore();
  const [publishing, setPublishing] = useState(false);
  const { enabled: authEnabled, account: signedIn } = useAccount();
  const signOut = useSignOut();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState("");

  const accounts = data.settings.emailAccounts || [];

  const addMember = () => {
    if (!name.trim()) return;
    patch((current) => ({
      team: [...current.team, { id: uid(), name: name.trim(), email: email.trim().toLowerCase(), role: "" }],
    }));
    setName("");
    setEmail("");
  };

  const removeMember = (id) => {
    patch((current) => ({
      team: current.team.filter((m) => m.id !== id),
      settings: current.settings.currentUserId === id
        ? { ...current.settings, currentUserId: (current.team.find((m) => m.id !== id) || {}).id || null }
        : current.settings,
    }));
  };

  const addAccount = () => {
    const address = account.trim().toLowerCase();
    if (!address.includes("@") || accounts.some((a) => a.address === address)) return;
    updateSettings({ emailAccounts: [...accounts, { id: `acct-${Date.now()}`, address, label: address }] });
    setAccount("");
  };

  return (
    <ModalShell title="Workspace Settings" onClose={onClose}>
      {authEnabled && signedIn && (
        <Section title="SIGNED IN">
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", border: "1px solid var(--rule)", borderRadius: 10, background: "var(--panel-raised)", flexWrap: "wrap" }}>
            <Avatar name={signedIn.name} size={34} />
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bone)" }}>{signedIn.name}</div>
              <div className="md-mono" style={{ fontSize: 10.5, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis" }}>{signedIn.email}</div>
            </div>
            <Badge label="SSO" color="var(--accent)" icon={<ShieldCheck size={10} />} />
            {signOut && (
              <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)", fontSize: 12 }} onClick={() => signOut()}>
                <LogOut size={13} /> Sign out
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 9, lineHeight: 1.55 }}>
            The same session covers <strong style={{ color: "var(--bone)" }}>production tracking</strong> — both apps sit on one domain, so signing in here signs you in there.
          </div>
        </Section>
      )}

      {shared && pendingLocal && (
        <Section title="RECORDS ONLY ON THIS DEVICE">
          <div style={{ padding: "12px 14px", border: "1px solid var(--warn)", borderRadius: 10, background: "var(--panel-raised)" }}>
            <div style={{ fontSize: 13, color: "var(--bone)", marginBottom: 8, lineHeight: 1.55 }}>
              You have <strong>{pendingLocal.total}</strong> record{pendingLocal.total === 1 ? "" : "s"} from before the board was
              shared. Nobody else can see them yet.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {Object.entries(pendingLocal.counts).map(([name, count]) => (
                <Badge key={name} label={`${count} ${name}`} subtle />
              ))}
            </div>
            <button className="md-btn md-btn-primary" disabled={publishing}
              onClick={async () => {
                setPublishing(true);
                try { await publishLocal(); } finally { setPublishing(false); }
              }}>
              <Upload size={13} /> {publishing ? "Sharing…" : "Share these with the team"}
            </button>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 9, lineHeight: 1.5 }}>
              Adds them to the shared board. Anything already there is left untouched, so this cannot
              overwrite a colleague's work.
            </div>
          </div>
        </Section>
      )}

      {shared && !pendingLocal && (
        <Section title="SHARED BOARD">
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--dim)" }}>
            <Users size={14} color="var(--sage)" />
            Everything on this device is on the shared board. {data.team.length} member{data.team.length === 1 ? "" : "s"} can see it.
          </div>
        </Section>
      )}

      <Section title={authEnabled ? "TEAM" : "WHO ARE YOU"}>
        <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10 }}>
          {authEnabled
            ? "Everyone who can be assigned work. Your own row is set by whoever you signed in as."
            : "This drives \"My Projects\", \"My Tasks\" and who new records are assigned to."}
        </div>
        {data.team.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
            <Avatar name={m.name} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineText value={m.name} style={{ fontWeight: 600 }}
                onCommit={(v) => v.trim() && patch((c) => ({ team: c.team.map((x) => (x.id === m.id ? { ...x, name: v.trim() } : x)) }))} />
              <InlineText value={m.email} mono placeholder="Add email" style={{ fontSize: 11, color: "var(--dim)" }}
                onCommit={(v) => patch((c) => ({ team: c.team.map((x) => (x.id === m.id ? { ...x, email: v.trim().toLowerCase() } : x)) }))} />
            </div>
            {currentUser && currentUser.id === m.id ? (
              <Badge label="THIS IS ME" color="var(--accent)" />
            ) : authEnabled ? null : (
              <button className="md-btn md-btn-ghost" style={{ fontSize: 11, border: "1px solid var(--rule)" }}
                onClick={() => updateSettings({ currentUserId: m.id })}>
                <UserCheck size={12} /> This is me
              </button>
            )}
            {data.team.length > 1 && <ConfirmButton label="" confirmLabel="Remove?" icon={<Trash2 size={13} />} onConfirm={() => removeMember(m.id)} />}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input className="md-input" style={{ flex: "1 1 130px" }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="md-input" style={{ flex: "1 1 160px" }} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addMember(); }} />
          <button className="md-btn" onClick={addMember}><Plus size={13} /> Add</button>
        </div>
      </Section>

      <Section title="GMAIL ACCOUNTS">
        <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10 }}>
          Mail from these addresses counts as sent by us. Everything else is treated as received.
        </div>
        {accounts.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
            <span className="md-mono" style={{ flex: 1, fontSize: 12 }}>{a.address}</span>
            <ConfirmButton label="" confirmLabel="Remove?" icon={<Trash2 size={13} />}
              onConfirm={() => updateSettings({ emailAccounts: accounts.filter((x) => x.id !== a.id) })} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="md-input" placeholder="you@company.com" value={account} onChange={(e) => setAccount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addAccount(); }} />
          <button className="md-btn" onClick={addAccount}><Plus size={13} /> Add</button>
        </div>
      </Section>

      <Section title="FOLLOW-UP ALERTS">
        <Field label="FLAG A RELATIONSHIP AFTER THIS MANY QUIET DAYS">
          <input type="number" min="1" max="365" className="md-input" style={{ width: 120 }}
            value={data.settings.followUpDays} onChange={(e) => updateSettings({ followUpDays: Math.max(1, Number(e.target.value) || 14) })} />
        </Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--bone)", cursor: "pointer" }}>
          <input type="checkbox" checked={!!data.settings.autoArmRecording} onChange={(e) => updateSettings({ autoArmRecording: e.target.checked })} />
          Prompt me to record when a calendar call is starting
        </label>
      </Section>
    </ModalShell>
  );
}
