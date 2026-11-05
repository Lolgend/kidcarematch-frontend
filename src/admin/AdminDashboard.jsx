import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, sendPasswordResetEmail, signOut, updateEmail, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import {
  Activity, AlertTriangle, Baby, Check, ChevronDown, CircleHelp, Database, FileText,
  Heart, LayoutDashboard, LoaderCircle, LogOut, RefreshCw, Search, ShieldCheck,
  SlidersHorizontal, Trash2, Users, X, LockKeyhole, Pencil, Save, Star, CloudDownload, Ban, UserCheck
} from "lucide-react";
import { auth } from "../firebase";
import { adminApi } from "./adminApi";
import "./AdminDashboard.css";

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "User management", icon: Users },
  { id: "reviews", label: "Manage reviews", icon: Star },
  { id: "data", label: "Manage data", icon: Database },
  { id: "subsidies", label: "Subsidy rules", icon: SlidersHorizontal },
  { id: "settings", label: "My profile & security", icon: LockKeyhole },
];

const fmtDate = (value) => value ? new Date(value).toLocaleString() : "Not available";
const normList = (value) => Array.isArray(value) ? value : (value?.items || []);

export default function AdminDashboard() {
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [section, setSection] = useState("overview");
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userQuery, setUserQuery] = useState("");
  const [userRole, setUserRole] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [sources, setSources] = useState([]);
  const [subsidies, setSubsidies] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [ruleDraft, setRuleDraft] = useState(null);
  const [userDraft, setUserDraft] = useState(null);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setFirebaseUser(user);
    setProfileName(user?.displayName || "");
    setProfileEmail(user?.email || "");
  }), []);

  const request = useCallback(async (path, options) => adminApi(path, options), []);

  const verifyAdmin = useCallback(async () => {
    setChecking(true);
    setError("");
    if (!auth.currentUser) {
      setAuthorized(false);
      setChecking(false);
      return;
    }
    try {
      // This endpoint is admin-protected on the server. A 403 means the account is not an administrator.
      await request("/admin/users?limit=1&offset=0");
      setAuthorized(true);
    } catch (e) {
      setAuthorized(false);
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }, [request]);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (userQuery.trim()) params.set("query", userQuery.trim());
    if (userRole) params.set("role", userRole);
    const data = await request(`/admin/users?${params.toString()}`);
    setUsers(normList(data));
    setUserTotal(data?.total ?? normList(data).length);
  }, [request, userQuery, userRole]);

  const loadReviews = useCallback(async () => {
  const params = new URLSearchParams({
    limit: "50",
    offset: "0"
  });

  const data = await request(`/admin/reviews?${params.toString()}`);

  setReviews(normList(data));
  setReviewTotal(data?.total ?? normList(data).length);
}, [request]);

  const loadSources = useCallback(async () => {
    const data = await request("/admin/status");
    setSources(normList(data));
  }, [request]);

  const loadSubsidies = useCallback(async () => {
    const data = await request("/admin/subsidy-rules");
    setSubsidies(normList(data));
  }, [request]);

  const refreshSection = useCallback(async () => {
    if (!authorized) return;
    setLoading(true); setError(""); setNotice("");
    try {
      if (section === "overview" || section === "users") await loadUsers();
      if (section === "overview" || section === "reviews") await loadReviews();
      if (section === "overview" || section === "data") await loadSources();
      if (section === "overview" || section === "subsidies") await loadSubsidies();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [authorized, section, loadUsers, loadReviews, loadSources, loadSubsidies]);

  useEffect(() => { verifyAdmin(); }, [verifyAdmin]);
  useEffect(() => { if (authorized) refreshSection(); }, [authorized, refreshSection]);

  const stats = useMemo(() => ({
    users: userTotal,
    reviews: reviewTotal,
    pending: reviews.filter(r => r.moderation_status === "PENDING").length,
    sources: sources.length,
  }), [userTotal, reviewTotal, reviews, sources]);

  

  async function deleteReview(review) {
    if (!window.confirm(`Permanently delete this review by ${review.full_name || review.email || "this user"}? This cannot be undone.`)) return;
    setLoading(true); setError(""); setNotice("");
    try {
      await request(`/admin/reviews/${encodeURIComponent(review.review_id)}`, { method: "DELETE" });
      setNotice("Review deleted.");
      await loadReviews();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function refreshDataSources() {
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await request("/admin/status/refresh", { method: "POST" });
      setSources(normList(result));
      setNotice("External data-source checks refreshed.");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function syncEcda() {
    if (!window.confirm("Start ECDA data synchronization now?")) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await request("/admin/sync/ecda", { method: "POST" });
      setNotice(result?.message || "ECDA synchronization started.");
      await loadSources();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (!auth.currentUser) return;
    setProfileSaving(true); setError(""); setNotice("");
    try {
      const current = auth.currentUser;
      if (profileName.trim() && profileName.trim() !== (current.displayName || "")) {
        await updateProfile(current, { displayName: profileName.trim() });
      }
      if (profileEmail.trim() && profileEmail.trim() !== (current.email || "")) {
        await updateEmail(current, profileEmail.trim());
        setNotice("Profile saved. Firebase may require you to sign in again after changing your email.");
      } else setNotice("Profile saved.");
    } catch (e) {
      setError(e.code === "auth/requires-recent-login"
        ? "For security, sign out and sign in again before changing your email."
        : e.message);
    } finally { setProfileSaving(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError(""); setNotice("");
    if (!auth.currentUser?.email) return setError("This account does not have an email/password sign-in.");
    if (newPassword.length < 8) return setError("Use at least 8 characters for the new password.");
    if (newPassword !== confirmPassword) return setError("The new passwords do not match.");
    setPasswordBusy(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
      setNotice("Your password has been changed.");
    } catch (e) {
      setError(e.code === "auth/wrong-password" || e.code === "auth/invalid-credential"
        ? "The current password is incorrect."
        : e.message);
    } finally { setPasswordBusy(false); }
  }

  async function sendResetEmail() {
    if (!firebaseUser?.email) return setError("Your account does not have an email address.");
    setError(""); setNotice("");
    try {
      await sendPasswordResetEmail(auth, firebaseUser.email);
      setNotice(`Password reset email sent to ${firebaseUser.email}.`);
    } catch (e) { setError(e.message); }
  }

  const isSelf = (u) => Boolean(firebaseUser?.uid && u.firebase_uid === firebaseUser.uid);

  async function saveUser(e) {
    e.preventDefault();
    const name = userDraft.full_name.trim();
    if (!name) return setError("Full name cannot be blank.");
    setLoading(true); setError(""); setNotice("");
    try {
      const body = { full_name: name, role: userDraft.role };
      if (userDraft.role === "ADMIN") body.admin_level = userDraft.admin_level ? Number(userDraft.admin_level) : null;
      await request(`/admin/users/${encodeURIComponent(userDraft.user_id)}`, { method: "PUT", body: JSON.stringify(body) });
      setUserDraft(null); setNotice("User updated."); await loadUsers();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function toggleUserStatus(u) {
    const suspend = u.account_status !== "SUSPENDED";
    const who = u.full_name || u.email || u.user_id;
    if (!window.confirm(suspend ? `Suspend ${who}?` : `Reactivate ${who}?`)) return;
    setLoading(true); setError(""); setNotice("");
    try {
      await request(`/admin/users/${encodeURIComponent(u.user_id)}/${suspend ? "deactivate" : "reactivate"}`, { method: "PATCH" });
      setNotice(suspend ? "User suspended." : "User reactivated."); await loadUsers();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function deleteUser(u) {
    const who = u.full_name || u.email || u.user_id;
    if (!window.confirm(`Permanently delete ${who}? This also removes their sign-in and cannot be undone.`)) return;
    setLoading(true); setError(""); setNotice("");
    try {
      await request(`/admin/users/${encodeURIComponent(u.user_id)}`, { method: "DELETE" });
      setNotice("User deleted."); await loadUsers();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function saveSubsidyRule(e) {
    e.preventDefault();
    if (!ruleDraft) return;
    setLoading(true); setError(""); setNotice("");
    const isEdit = Boolean(ruleDraft.rule_id && subsidies.some(r => r.rule_id === ruleDraft.rule_id));
    const payload = { ...ruleDraft, income_min: Number(ruleDraft.income_min), income_max: Number(ruleDraft.income_max), subsidy_amount: Number(ruleDraft.subsidy_amount) };
    try {
      await request(isEdit ? `/admin/subsidy-rules/${encodeURIComponent(ruleDraft.rule_id)}` : "/admin/subsidy-rules", {
        method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload),
      });
      setRuleDraft(null); setNotice(isEdit ? "Subsidy rule updated." : "Subsidy rule created.");
      await loadSubsidies();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function deleteSubsidy(rule) {
    if (!window.confirm(`Delete subsidy rule "${rule.subsidy_name}"? This cannot be undone.`)) return;
    setLoading(true); setError(""); setNotice("");
    try {
      await request(`/admin/subsidy-rules/${encodeURIComponent(rule.rule_id)}`, { method: "DELETE" });
      setNotice("Subsidy rule deleted."); await loadSubsidies();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function logout() {
    try { await request("/admin/auth/logout", { method: "POST" }); } catch {}
    await signOut(auth);
    setAuthorized(false);
  }

  if (checking) return <div className="kc-admin-center"><LoaderCircle className="kc-spin" /> Checking administrator access…</div>;
  if (!firebaseUser) return <div className="kc-admin-center"><ShieldCheck size={42}/><h2>Administrator sign-in required</h2><p>Sign in with your administrator account, then open this page again.</p></div>;
  if (!authorized) return <div className="kc-admin-center"><ShieldCheck size={42}/><h2>Admin access not available</h2><p>{error || "Your account does not have administrator access."}</p><button className="kc-btn" onClick={verifyAdmin}><RefreshCw size={16}/> Try again</button><button className="kc-btn kc-btn-light" onClick={logout}>Sign out</button></div>;

  return <div className="kc-admin-shell">
    <aside className="kc-admin-sidebar">
      <div className="kc-brand"><span className="kc-brand-icon"><Baby size={23}/></span><span><b>KidCare Match</b><small>ADMIN CONSOLE</small></span></div>
      <div className="kc-side-label">WORKSPACE</div>
      <nav>{sections.map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={`kc-nav-item ${section === item.id ? "active" : ""}`} onClick={() => {setSection(item.id); setError(""); setNotice("");}}>
          <Icon size={18}/><span>{item.label}</span>{section === item.id && <span className="kc-nav-dot"/>}
        </button>;
      })}</nav>
      <div className="kc-sidebar-bottom"><div className="kc-security-note"><ShieldCheck size={18}/><span><b>Protected area</b><small>Administrator access only</small></span></div>
        <button className="kc-nav-item kc-signout" onClick={logout}><LogOut size={18}/> Sign out</button>
      </div>
    </aside>

    <main className="kc-admin-main">
      <header className="kc-topbar"><div><span className="kc-breadcrumb">Workspace /</span> <b>{sections.find(s => s.id === section)?.label}</b></div>
        <div className="kc-admin-identity"><div className="kc-avatar">{(firebaseUser.displayName || firebaseUser.email || "A").slice(0,1).toUpperCase()}</div><span><b>{firebaseUser.displayName || "Administrator"}</b><small>{firebaseUser.email}</small></span><span className="kc-admin-pill">ADMIN</span></div>
      </header>

      <div className="kc-content">
        <div className="kc-page-heading"><div><p className="kc-eyebrow">KIDCARE MATCH SG</p><h1>{sections.find(s => s.id === section)?.label}</h1><p className="kc-subtitle">{({
          overview: "A quick view of users, reviews, and connected data sources.",
          users: "Search registered accounts and review their current roles and access status.",
          reviews: "Review community feedback and moderate published reviews.",
          data: "Monitor external data health and run ECDA synchronization.",
          subsidies: "Maintain the subsidy configuration used by fee estimates.",
          settings: "Update your own profile and secure your account.",
        })[section]}</p></div>
          <button className="kc-btn kc-btn-light" onClick={refreshSection} disabled={loading}><RefreshCw size={16} className={loading ? "kc-spin" : ""}/> Refresh</button>
        </div>

        {error && <div className="kc-alert kc-alert-error"><AlertTriangle size={18}/><span>{error}</span><button onClick={() => setError("")}><X size={16}/></button></div>}
        {notice && <div className="kc-alert kc-alert-success"><Check size={18}/><span>{notice}</span><button onClick={() => setNotice("")}><X size={16}/></button></div>}

        {section === "overview" && <section>
          <div className="kc-stat-grid">
            <Stat icon={Users} label="Registered users" value={stats.users} tint="mint" detail="Accounts in the directory"/>
            <Stat icon={FileText} label="Reviews found" value={stats.reviews} tint="blue" detail="Based on current review query"/>
            <Stat icon={Star} label="Pending reviews" value={stats.pending} tint="peach" detail="Awaiting moderation in loaded results"/>
            <Stat icon={Database} label="Data sources" value={stats.sources} tint="purple" detail="Sources reported by backend"/>
          </div>
          <div className="kc-overview-grid">
            <div className="kc-panel"><div className="kc-panel-heading"><div><h3>External data health</h3><p>Latest backend-reported source status</p></div><button className="kc-icon-btn" onClick={refreshDataSources} disabled={loading} aria-label="Refresh data health" title="Re-check data sources"><RefreshCw size={17} className={loading ? "kc-spin" : ""}/></button></div>
              {sources.length ? <div className="kc-mini-list">{sources.slice(0,5).map(s => <div className="kc-mini-row" key={s.source_id}><div className="kc-source-icon"><Database size={17}/></div><div className="kc-mini-main"><b>{s.source_name || s.source_id}</b><small>Last success: {fmtDate(s.last_successful_sync)}</small><small>Last checked: {fmtDate(s.last_attempted_sync)}</small></div><StatusPill status={s.sync_state}/></div>)}</div> : <Empty text="No source status has been returned yet."/>}
              <button className="kc-text-link" onClick={() => setSection("data")}>Open data management →</button>
            </div>
            <div className="kc-panel"><div className="kc-panel-heading"><div><h3>Admin quick actions</h3><p>Shortcuts to common tasks</p></div><Activity size={20} className="kc-muted"/></div>
              <QuickAction icon={Users} title="Review user accounts" description="Search parent and administrator records" onClick={() => setSection("users")}/>
              <QuickAction icon={Star} title="Moderate reviews" description="Approve, reject, or remove reviews" onClick={() => setSection("reviews")}/>
              <QuickAction icon={CloudDownload} title="Synchronize ECDA data" description="Start a refresh of centres and vacancies" onClick={() => setSection("data")}/>
              <QuickAction icon={SlidersHorizontal} title="Edit subsidy rules" description="Maintain fee-estimation configuration" onClick={() => setSection("subsidies")}/>
            </div>
          </div>
          <div className="kc-panel kc-note-panel"><CircleHelp size={20}/><div><b>Important access note</b><p>Administrator access is checked by the backend API. If this page says access is denied, the backend must verify your Firebase ID token and the ADMIN role for your account.</p></div></div>
        </section>}

        {section === "users" && <section className="kc-panel">
          <div className="kc-panel-heading"><div><h3>User management</h3><p>{userTotal} account(s) matched. User details come from the backend, not sample data.</p></div></div>
          <div className="kc-toolbar"><div className="kc-search"><Search size={17}/><input value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="Search name, email, or user ID" onKeyDown={e => e.key === "Enter" && loadUsers()}/></div>
            <select value={userRole} onChange={e => setUserRole(e.target.value)}><option value="">All roles</option><option value="PARENT">Parent</option><option value="ADMIN">Admin</option></select><button className="kc-btn" onClick={loadUsers} disabled={loading}><Search size={16}/> Search</button></div>
          <div className="kc-table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th><th>Account actions</th></tr></thead><tbody>
            {users.map(u => <tr key={u.user_id}><td><div className="kc-person"><div className="kc-person-avatar">{(u.full_name || u.email || "?").slice(0,1).toUpperCase()}</div><div><b>{u.full_name || "Name not provided"}</b><small>{u.email}</small><small className="kc-id">ID: {u.user_id}</small></div></div></td><td><span className="kc-role">{u.role || "Unknown"}</span></td><td><StatusPill status={u.account_status}/></td><td>{fmtDate(u.created_at)}</td><td><div className="kc-inline-actions">
              <button className="kc-icon-btn" title="Edit user" aria-label="Edit user" disabled={loading} onClick={() => setUserDraft({ user_id: u.user_id, full_name: u.full_name || "", role: u.role || "PARENT", admin_level: u.admin_level ?? "", self: isSelf(u) })}><Pencil size={15}/></button>
              <button className="kc-icon-btn" title={isSelf(u) ? "You cannot suspend your own account" : u.account_status === "SUSPENDED" ? "Reactivate user" : "Suspend user"} aria-label="Suspend or reactivate user" disabled={loading || isSelf(u)} onClick={() => toggleUserStatus(u)}>{u.account_status === "SUSPENDED" ? <UserCheck size={15}/> : <Ban size={15}/>}</button>
              <button className="kc-icon-btn kc-icon-danger" title={isSelf(u) ? "You cannot delete your own account" : "Delete user"} aria-label="Delete user" disabled={loading || isSelf(u)} onClick={() => deleteUser(u)}><Trash2 size={15}/></button>
            </div></td></tr>)}
          </tbody></table>{!users.length && <Empty text="No users found. Try a different search or refresh."/>}</div>
          <p className="kc-footnote"><LockKeyhole size={14}/> Deleting a user also removes their Firebase sign-in and cannot be undone. You cannot suspend or delete your own account here.</p>
          {userDraft && <div className="kc-modal-backdrop" role="presentation"><form className="kc-modal" onSubmit={saveUser}>
            <div className="kc-modal-head"><div><h3>Edit user</h3><p>Changes are saved to the backend.</p></div><button type="button" className="kc-icon-btn" aria-label="Close" onClick={() => setUserDraft(null)}><X size={18}/></button></div>
            <div className="kc-form-grid">
              <label>Full name<input value={userDraft.full_name} maxLength={100} onChange={e => setUserDraft({ ...userDraft, full_name: e.target.value })}/></label>
              <label>Role<select value={userDraft.role} disabled={userDraft.self} onChange={e => setUserDraft({ ...userDraft, role: e.target.value })}><option value="PARENT">Parent</option><option value="ADMIN">Admin</option></select></label>
              {userDraft.role === "ADMIN" && <label>Admin level<input type="number" min="1" value={userDraft.admin_level} onChange={e => setUserDraft({ ...userDraft, admin_level: e.target.value })}/></label>}
            </div>
            {userDraft.self && <p className="kc-footnote">Your own role is locked so you cannot remove your own admin access.</p>}
            <div className="kc-modal-actions"><button type="button" className="kc-btn kc-btn-light" onClick={() => setUserDraft(null)}>Cancel</button><button className="kc-btn" disabled={loading}><Save size={15}/> Save changes</button></div>
          </form></div>}
        </section>}

        {section === "reviews" && <section className="kc-panel">

  <div className="kc-panel-heading">
    <div>
      <h3>Review management</h3>
      <p>{reviewTotal} reviews submitted by parents.</p>
    </div>
  </div>

  <div className="kc-review-list">

    {reviews.map(r => (
      <article className="kc-review-card" key={r.review_id}>

        <div className="kc-review-top">
          <div>
            <div className="kc-review-author">
              <b>{r.full_name || "Unknown user"}</b>
              <span>·</span>
              <span>{r.email || r.user_id}</span>
            </div>

            <small>
              {r.centre_name || `Centre #${r.centre_id}`}
              {" · "}
              {fmtDate(r.created_at)}
            </small>
          </div>
        </div>

        <div className="kc-stars">
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              size={15}
              fill={i < (r.rating || 0) ? "currentColor" : "none"}
            />
          ))}
          <b>{r.rating ?? "—"}/5</b>
        </div>

        <p className="kc-review-body">
          {r.review_description || "No written comment."}
        </p>

        <div className="kc-review-actions">
          <button
            className="kc-btn kc-btn-small kc-btn-danger-outline"
            onClick={() => deleteReview(r)}
            disabled={loading}
          >
            <Trash2 size={14} />
            Delete review
          </button>
        </div>

      </article>
    ))}

    {!reviews.length && (
      <Empty text="No reviews submitted yet." />
    )}

  </div>
</section>}

        {section === "data" && <section>
          <div className="kc-action-banner"><div className="kc-banner-icon"><CloudDownload size={25}/></div><div><h3>External data synchronization</h3><p>Run an ECDA sync or refresh the source health probes. Syncs run on the backend.</p></div><div className="kc-banner-actions"><button className="kc-btn kc-btn-light" onClick={refreshDataSources} disabled={loading}><RefreshCw size={16}/> Check sources</button><button className="kc-btn" onClick={syncEcda} disabled={loading}><CloudDownload size={16}/> Sync ECDA now</button></div></div>
          <div className="kc-panel"><div className="kc-panel-heading"><div><h3>Connected data sources</h3><p>Statuses and timestamps supplied by the backend</p></div></div>
            <div className="kc-table-wrap"><table><thead><tr><th>Data source</th><th>Status</th><th>Last successful sync</th><th>Last attempt</th><th>Records processed</th></tr></thead><tbody>{sources.map(s => <tr key={s.source_id}><td><div className="kc-source-name"><span className="kc-source-icon"><Database size={17}/></span><div><b>{s.source_name || s.source_id}</b><small>{s.source_id}</small></div></div></td><td><StatusPill status={s.sync_state}/></td><td>{fmtDate(s.last_successful_sync)}</td><td>{fmtDate(s.last_attempted_sync)}</td><td>{s.records_processed ?? "—"}</td></tr>)}</tbody></table>{!sources.length && <Empty text="The backend has not returned any source health records."/>}</div>
            {sources.some(s => s.error_message) && <div className="kc-source-errors"><b><AlertTriangle size={16}/> Reported source errors</b>{sources.filter(s=>s.error_message).map(s=><p key={s.source_id}><strong>{s.source_name || s.source_id}:</strong> {s.error_message}</p>)}</div>}
          </div>
        </section>}

        {section === "subsidies" && <section className="kc-panel">
          <div className="kc-panel-heading"><div><h3>Subsidy rule configuration</h3><p>{subsidies.length} rule(s) returned by the backend.</p></div><button className="kc-btn" onClick={() => setRuleDraft({rule_id:"", subsidy_name:"", tier_name:"", care_type:"INFANT_CARE", metric:"FIXED", applicant_status:"WORKING_APPLICANT", citizenship:"SC", income_min:0, income_max:0, subsidy_amount:0, effective_date:new Date().toISOString()})}><span>＋</span> Add rule</button></div>
          <div className="kc-table-wrap"><table><thead><tr><th>Subsidy / tier</th><th>Care type</th><th>Applicant</th><th>Citizenship</th><th>Income range</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{subsidies.map(r=><tr key={r.rule_id}><td><b>{r.subsidy_name}</b><small className="kc-table-sub">{r.tier_name} · {r.rule_id}</small></td><td>{r.care_type}</td><td>{r.applicant_status}</td><td>{r.citizenship}</td><td>${r.income_min} – ${r.income_max}</td><td><b>${r.subsidy_amount}</b><small>{r.metric}</small></td><td><div className="kc-inline-actions"><button className="kc-icon-btn" title="Edit rule" onClick={() => setRuleDraft({...r})}><Pencil size={16}/></button><button className="kc-icon-btn kc-icon-danger" title="Delete rule" onClick={() => deleteSubsidy(r)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!subsidies.length && <Empty text="No subsidy rules were returned by the backend."/>}</div>
          {ruleDraft && <div className="kc-modal-backdrop" role="presentation"><form className="kc-modal" onSubmit={saveSubsidyRule}><div className="kc-modal-head"><div><h3>{subsidies.some(r=>r.rule_id===ruleDraft.rule_id) ? "Edit subsidy rule" : "Add subsidy rule"}</h3><p>Save to the backend configuration.</p></div><button type="button" className="kc-icon-btn" onClick={()=>setRuleDraft(null)}><X size={18}/></button></div>
            <div className="kc-form-grid">{[
              ["rule_id","Rule ID","text"],["subsidy_name","Subsidy name","text"],["tier_name","Tier name","text"],["care_type","Care type","text"],["metric","Metric","text"],["applicant_status","Applicant status","text"],["citizenship","Citizenship","text"],["income_min","Minimum income","number"],["income_max","Maximum income","number"],["subsidy_amount","Subsidy amount","number"],["effective_date","Effective date (ISO)","text"]
            ].map(([key,label,type])=><label key={key}>{label}<input required={key!=="tier_name"} type={type} step={type==="number"?"any":undefined} value={ruleDraft[key] ?? ""} disabled={key==="rule_id" && subsidies.some(r=>r.rule_id===ruleDraft.rule_id)} onChange={e=>setRuleDraft({...ruleDraft,[key]:e.target.value})}/></label>)}</div>
            <div className="kc-modal-actions"><button type="button" className="kc-btn kc-btn-light" onClick={()=>setRuleDraft(null)}>Cancel</button><button type="submit" className="kc-btn" disabled={loading}><Save size={16}/> Save rule</button></div>
          </form></div>}
        </section>}

        {section === "settings" && <section className="kc-settings-grid">
          <form className="kc-panel kc-settings-card" onSubmit={saveProfile}><div className="kc-panel-heading"><div><h3>Edit profile</h3><p>Change the display name and email for your signed-in account.</p></div><Pencil size={19} className="kc-muted"/></div>
            <label className="kc-field">Full name<input value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Your name"/></label>
            <label className="kc-field">Email address<input type="email" value={profileEmail} onChange={e=>setProfileEmail(e.target.value)} required/></label>
            <button className="kc-btn" disabled={profileSaving}><Save size={16}/> {profileSaving ? "Saving…" : "Save profile"}</button>
          </form>
          <form className="kc-panel kc-settings-card" onSubmit={changePassword}><div className="kc-panel-heading"><div><h3>Change password</h3><p>Confirm your current password first. Passwords are never shown or stored here.</p></div><LockKeyhole size={19} className="kc-muted"/></div>
            <label className="kc-field">Current password<input type="password" autoComplete="current-password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)} required/></label>
            <label className="kc-field">New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label>
            <label className="kc-field">Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></label>
            <button className="kc-btn" disabled={passwordBusy}><LockKeyhole size={16}/> {passwordBusy ? "Updating…" : "Update password"}</button>
            <div className="kc-reset-link"><span>Forgot your password?</span><button type="button" className="kc-text-link" onClick={sendResetEmail}>Send reset email</button></div>
          </form>
        </section>}
      </div>
      <footer className="kc-footer">KidCare Match SG · Admin console <span>Use only for authorized administration.</span></footer>
    </main>
  </div>;
}

function Stat({icon: Icon,label,value,tint,detail}) {
  return <div className="kc-stat-card"><div className={`kc-stat-icon ${tint}`}><Icon size={20}/></div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>;
}
function StatusPill({status}) {
  const value = String(status || "UNKNOWN").toUpperCase();
  const cls = ["ACTIVE","APPROVED","SUCCESS","SUCCEEDED","HEALTHY","IDLE"].includes(value) ? "good" :
    ["PENDING","RUNNING","IN_PROGRESS"].includes(value) ? "warning" :
    ["SUSPENDED","BANNED","REJECTED","FAILED","ERROR","MISSING"].includes(value) ? "bad" : "neutral";
  return <span className={`kc-status ${cls}`}><span/>{value.replaceAll("_"," ")}</span>;
}
function Empty({text}) { return <div className="kc-empty"><div className="kc-empty-icon"><Database size={20}/></div><p>{text}</p></div>; }
function QuickAction({icon: Icon,title,description,onClick}) { return <button className="kc-quick-action" onClick={onClick}><span className="kc-quick-icon"><Icon size={18}/></span><span><b>{title}</b><small>{description}</small></span><ChevronDown className="kc-quick-chevron" size={16}/></button>; }
