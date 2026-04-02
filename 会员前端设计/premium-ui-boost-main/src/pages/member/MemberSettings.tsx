import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Camera, ChevronRight, ChevronDown, KeyRound, Bell, Clock, ShoppingCart, MessageCircle, Shield, LogOut, Fingerprint, X, Eye, EyeOff, Settings as SettingsIcon } from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import { toast } from "sonner";
import { ProfileSkeleton } from "@/components/member/MemberSkeleton";

const memberInit = {
  name: "霸气",
  phone: "11111111",
  code: "0WVN7PU",
  level: "A",
  status: "活跃",
};

const ledgerTabs = [
  { key: "all", label: "全部" },
  { key: "consumption", label: "消费" },
  { key: "referral", label: "推荐" },
  { key: "lottery", label: "抽奖" },
];

const ledgerData = [
  { id: "f1485b···09cc", type: "lottery", amount: 1, date: "2026/03/30 02:55", balanceBefore: 66, balanceAfter: 67 },
  { id: "8841bc···da06", type: "lottery", amount: 1, date: "2026/03/30 02:55", balanceBefore: 65, balanceAfter: 66 },
  { id: "fec5e1···174e", type: "lottery", amount: 1, date: "2026/03/30 02:55", balanceBefore: 64, balanceAfter: 65 },
  { id: "2696e0···064c", type: "lottery", amount: 10, date: "2026/03/30 02:55", balanceBefore: 54, balanceAfter: 64 },
  { id: "7266a8···d795", type: "lottery", amount: 1, date: "2026/03/30 02:55", balanceBefore: 53, balanceAfter: 54 },
  { id: "a3b21f···e8c2", type: "referral", amount: 200, date: "2026/03/29 18:30", balanceBefore: 3650, balanceAfter: 3850 },
  { id: "c9d4e7···1a3b", type: "consumption", amount: -500, date: "2026/03/28 14:20", balanceBefore: 4150, balanceAfter: 3650 },
];

const orderData = [
  { id: "#0330R4J5TH9L", item: "1111", date: "2026/03/30 02:03", amount: "180,500 NGN", faceValue: "100", status: "Paid" },
  { id: "#0329K8M2PL4Q", item: "2222", date: "2026/03/29 18:45", amount: "95,000 NGN", faceValue: "50", status: "Paid" },
  { id: "#0328W6X1NR7S", item: "3333", date: "2026/03/28 10:12", amount: "360,000 NGN", faceValue: "200", status: "Pending" },
];

/* ── Reusable Modal Shell ── */
function ModalOverlay({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Sheet */}
      <div
        className="relative w-full max-w-lg rounded-t-3xl p-6 pb-8 animate-[slideUp_0.3s_ease-out]"
        style={{
          background: "linear-gradient(180deg, hsl(var(--m-bg-2)), hsl(var(--m-bg-1)))",
          border: "1px solid hsl(var(--m-surface-border) / 0.3)",
          borderBottom: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[hsl(var(--m-surface)_/_0.5)] transition">
          <X className="w-4 h-4 text-[hsl(var(--m-text-dim))]" />
        </button>
        {children}
      </div>
    </div>
  );
}

export default function MemberSettings() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);
  const navigate = useNavigate();
  const [member, setMember] = useState(memberInit);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newNickname, setNewNickname] = useState(member.name);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerTab, setLedgerTab] = useState("all");
  const [ordersOpen, setOrdersOpen] = useState(false);

  const handleNicknameSave = () => {
    if (!newNickname.trim()) {
      toast.error("昵称不能为空");
      return;
    }
    setMember((prev) => ({ ...prev, name: newNickname.trim() }));
    setNicknameOpen(false);
    toast.success("昵称修改成功");
  };

  const handlePasswordSave = () => {
    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm) {
      toast.error("请填写所有密码字段");
      return;
    }
    if (pwForm.newPw.length < 6) {
      toast.error("新密码至少 6 个字符");
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setPasswordOpen(false);
    setPwForm({ current: "", newPw: "", confirm: "" });
    toast.success("密码修改成功");
  };

  const inputStyle = {
    background: "hsl(var(--m-surface) / 0.5)",
    border: "1px solid hsl(var(--m-surface-border) / 0.3)",
    color: "hsl(var(--m-text))",
  };

  const accountItems = [
    { icon: User, label: "修改昵称", desc: member.name, color: "--gold", onClick: () => { setNewNickname(member.name); setNicknameOpen(true); } },
    { icon: KeyRound, label: "修改密码", desc: "定期更新保障安全", color: "--emerald", onClick: () => { setPwForm({ current: "", newPw: "", confirm: "" }); setPasswordOpen(true); } },
    { icon: Fingerprint, label: "安全验证", desc: "邮箱 / 电话号码", color: "--rose", onClick: () => toast.info("安全验证设置即将上线") },
    { icon: Bell, label: "通知设置", desc: "推送与消息提醒", color: "--silver", onClick: () => toast.info("通知设置即将上线") },
  ];

  if (loading) return <MemberLayout><ProfileSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg">
        {/* ── Profile Hero ── */}
        <div className="relative overflow-hidden">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-gold/[0.08] blur-[100px]" />

          <div className="relative px-5 pt-8 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--m-text-dim))] mb-5">个人中心</p>

            <div className="flex items-start gap-4 mb-6 cursor-pointer" onClick={() => navigate("/member/profile")}>
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold to-gold-deep flex items-center justify-center text-2xl font-extrabold text-white"
                  style={{ boxShadow: "0 0 28px -6px hsl(var(--gold) / 0.5)" }}>
                  {member.name[0]}
                </div>
                <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-[hsl(var(--m-surface))] border border-[hsl(var(--m-surface-border)_/_0.5)] flex items-center justify-center">
                  <Camera className="w-3 h-3 text-[hsl(var(--m-text-dim))]" />
                </button>
              </div>
              <div className="flex-1 pt-1">
                <h2 className="text-lg font-extrabold">{member.name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
                  <span className="text-xs text-emerald-soft font-semibold">{member.status}</span>
                </div>
              </div>
              {/* VIP Level Badge */}
              <div className="pt-1.5">
                <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--gold-soft) / 0.06))",
                    border: "1px solid hsl(var(--primary) / 0.2)",
                    boxShadow: "0 2px 12px -4px hsl(var(--primary) / 0.3)",
                  }}>
                  <span className="text-[10px] font-bold text-[hsl(var(--m-text-dim))]">LV</span>
                  <span className="text-sm font-extrabold text-primary">{member.level}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl bg-[hsl(var(--m-surface)_/_0.4)] border border-[hsl(var(--m-surface-border)_/_0.2)] px-4 py-3.5 text-center">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--m-text-dim))] mb-1.5">手机号</div>
                <div className="text-sm font-extrabold font-mono tracking-wide">{member.phone}</div>
              </div>
              <div className="rounded-xl bg-[hsl(var(--m-surface)_/_0.4)] border border-[hsl(var(--m-surface-border)_/_0.2)] px-4 py-3.5 text-center">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--m-text-dim))] mb-1.5">会员码</div>
                <div className="text-sm font-extrabold font-mono tracking-wide">{member.code}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Account Section ── */}
        <div className="px-5 mb-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--m-text-dim))] mb-3">账号管理</h3>
          <div className="m-glass overflow-hidden">
            {accountItems.map((item, i) => (
              <button key={item.label}
                onClick={item.onClick}
                className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[hsl(var(--m-surface)_/_0.4)] ${
                  i > 0 ? "border-t border-[hsl(var(--m-surface-border)_/_0.2)]" : ""
                }`}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `hsl(var(${item.color}) / 0.1)` }}>
                  <item.icon className="w-4 h-4" style={{ color: `hsl(var(${item.color}-soft))` }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-[10px] mt-0.5 text-[hsl(var(--m-text-dim))]">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.4)]" />
              </button>
            ))}
          </div>
        </div>

        {/* ── Records Section ── */}
        <div className="px-5 mb-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--m-text-dim))] mb-3">数据与记录</h3>
          <div className="space-y-2.5">
            {/* Points Ledger - Expandable */}
            <div className="m-glass overflow-hidden">
              <button
                onClick={() => setLedgerOpen(!ledgerOpen)}
                className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[hsl(var(--m-surface)_/_0.4)]"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "hsl(var(--gold) / 0.1)" }}>
                  <SettingsIcon className="w-4 h-4" style={{ color: "hsl(var(--gold-soft))" }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">积分明细</p>
                  <p className="text-[10px] mt-0.5 text-[hsl(var(--m-text-dim))]">消费、推荐 & 抽奖积分记录</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.4)] transition-transform duration-300 ${ledgerOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded Ledger */}
              <div
                className="transition-all duration-400 ease-out overflow-hidden"
                style={{ maxHeight: ledgerOpen ? 600 : 0, opacity: ledgerOpen ? 1 : 0 }}
              >
                {/* Filter tabs */}
                <div className="flex gap-2 px-4 py-3 border-t border-[hsl(var(--m-surface-border)_/_0.15)]">
                  {ledgerTabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setLedgerTab(tab.key)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                        ledgerTab === tab.key
                          ? "bg-gold/15 text-gold-soft ring-1 ring-inset ring-gold/25"
                          : "text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Ledger entries */}
                <div className="px-4 pb-4 space-y-2">
                  {ledgerData
                    .filter((e) => ledgerTab === "all" || e.type === ledgerTab)
                    .map((entry) => (
                    <div key={entry.id} className="rounded-xl px-3.5 py-3 bg-[hsl(var(--m-surface)_/_0.3)] border border-[hsl(var(--m-surface-border)_/_0.15)]">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--m-text-dim)_/_0.5)]">ORDER ID</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            entry.type === "lottery" ? "bg-emerald/15 text-emerald" :
                            entry.type === "referral" ? "bg-gold/15 text-gold-soft" :
                            "bg-rose/15 text-rose-soft"
                          }`}>
                            {entry.type === "lottery" ? "Lottery" : entry.type === "referral" ? "Referral" : "Consumption"}
                          </span>
                        </div>
                        <span className={`text-sm font-extrabold tabular-nums ${entry.amount > 0 ? "text-emerald" : "text-rose-soft"}`}>
                          {entry.amount > 0 ? "+" : ""}{entry.amount}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[hsl(var(--m-text)_/_0.8)] mb-1">{entry.id}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.5)] font-medium">{entry.date}</span>
                        <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.4)] tabular-nums">{entry.balanceBefore} → {entry.balanceAfter}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Orders - Expandable */}
            <div className="m-glass overflow-hidden">
              <button
                onClick={() => setOrdersOpen(!ordersOpen)}
                className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[hsl(var(--m-surface)_/_0.4)]"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "hsl(var(--emerald) / 0.1)" }}>
                  <ShoppingCart className="w-4 h-4" style={{ color: "hsl(var(--emerald-soft))" }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">我的订单</p>
                  <p className="text-[10px] mt-0.5 text-[hsl(var(--m-text-dim))]">{orderData.length} records</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.4)] transition-transform duration-300 ${ordersOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded Orders */}
              <div
                className="transition-all duration-400 ease-out overflow-hidden"
                style={{ maxHeight: ordersOpen ? 600 : 0, opacity: ordersOpen ? 1 : 0 }}
              >
                <div className="px-4 pb-4 space-y-2 border-t border-[hsl(var(--m-surface-border)_/_0.15)] pt-3">
                  {orderData.map((order) => (
                    <div key={order.id} className="rounded-xl px-3.5 py-3 bg-[hsl(var(--m-surface)_/_0.3)] border border-[hsl(var(--m-surface-border)_/_0.15)]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.5)] font-medium">{order.date}</span>
                        <span className="text-[10px] font-mono text-[hsl(var(--m-text-dim)_/_0.5)]">{order.id}</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-extrabold">{order.item}</span>
                        <span className="text-sm font-extrabold text-gold-soft">{order.amount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[hsl(var(--m-text-dim))]">Face value: {order.faceValue}</span>
                        <span className={`text-[10px] font-bold ${order.status === "Paid" ? "text-emerald" : "text-rose-soft"}`}>{order.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Support Section ── */}
        <div className="px-5 mb-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--m-text-dim))] mb-3">帮助与支持</h3>
          <div className="m-glass overflow-hidden">
            {[
              { name: "王朝", avatar: "王" },
              { name: "luna", avatar: "L" },
              { name: "jiela", avatar: "J" },
            ].map((c, i) => (
              <button key={c.name}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[hsl(var(--m-surface)_/_0.4)] ${
                  i > 0 ? "border-t border-[hsl(var(--m-surface-border)_/_0.2)]" : ""
                }`}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose/20 to-rose-soft/10 flex items-center justify-center text-xs font-bold text-rose-soft">
                  {c.avatar}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-[10px] mt-0.5 text-[hsl(var(--m-text-dim))]">
                    <MessageCircle className="w-3 h-3 inline mr-1" />WhatsApp 在线客服
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.4)]" />
              </button>
            ))}
          </div>
        </div>


        {/* ── Security Footer ── */}
        <div className="px-5 mb-5">
          <div className="flex items-center justify-center gap-1.5 py-3">
            <Shield className="w-3.5 h-3.5 text-emerald/40" />
            <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.5)] font-medium">账号数据已加密 · 安全保护中</span>
          </div>
        </div>

        {/* ── Sign Out ── */}
        <div className="px-5 mb-8">
          <button onClick={() => setLogoutOpen(true)} className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 border border-destructive/20 text-destructive/80 hover:bg-destructive/[0.06]">
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>

        <div className="h-8" />
      </div>

      {/* ══════ Nickname Modal ══════ */}
      <ModalOverlay open={nicknameOpen} onClose={() => setNicknameOpen(false)}>
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-extrabold mb-1">修改昵称</h3>
            <p className="text-xs text-[hsl(var(--m-text-dim))]">设置一个专属昵称</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--m-text-dim))] mb-2 block">新昵称</label>
            <input
              type="text"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="请输入新昵称"
              maxLength={20}
              className="w-full rounded-xl px-4 py-3.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-gold/30"
              style={inputStyle}
            />
            <p className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.5)] mt-1.5 text-right">{newNickname.length}/20</p>
          </div>
          <button onClick={handleNicknameSave}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
              color: "hsl(220 22% 5%)",
              boxShadow: "0 4px 20px -6px hsl(var(--gold) / 0.5)",
            }}>
            保存修改
          </button>
        </div>
      </ModalOverlay>

      {/* ══════ Password Modal ══════ */}
      <ModalOverlay open={passwordOpen} onClose={() => setPasswordOpen(false)}>
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-extrabold mb-1">修改密码</h3>
            <p className="text-xs text-[hsl(var(--m-text-dim))]">定期更新密码保障账号安全</p>
          </div>

          {([
            { key: "current" as const, label: "当前密码", placeholder: "请输入当前密码" },
            { key: "newPw" as const, label: "新密码", placeholder: "请输入新密码（至少6位）" },
            { key: "confirm" as const, label: "确认新密码", placeholder: "再次输入新密码" },
          ]).map((field) => (
            <div key={field.key}>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--m-text-dim))] mb-2 block">{field.label}</label>
              <div className="relative">
                <input
                  type={showPw[field.key] ? "text" : "password"}
                  value={pwForm[field.key]}
                  onChange={(e) => setPwForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full rounded-xl px-4 py-3.5 pr-12 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-emerald/30"
                  style={inputStyle}
                />
                <button type="button"
                  onClick={() => setShowPw((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[hsl(var(--m-text-dim))]">
                  {showPw[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}

          <button onClick={handlePasswordSave}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, hsl(var(--emerald)), hsl(var(--emerald-soft)))",
              color: "hsl(var(--m-bg-1))",
              boxShadow: "0 4px 20px -6px hsl(var(--emerald) / 0.5)",
            }}>
            确认修改
          </button>
        </div>
      </ModalOverlay>

      {/* ══════ Sign Out Modal ══════ */}
      <ModalOverlay open={logoutOpen} onClose={() => setLogoutOpen(false)}>
        <div className="space-y-6">
          <div className="text-center pt-2">
            <h3 className="text-lg font-extrabold mb-2">退出登录</h3>
            <p className="text-sm text-[hsl(var(--m-text-dim))]">确定要退出当前账号吗？</p>
          </div>
          <div className="border-t border-[hsl(var(--m-surface-border)_/_0.2)]" />
          <div className="flex gap-3">
            <button
              onClick={() => setLogoutOpen(false)}
              className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{
                background: "hsl(var(--m-surface) / 0.5)",
                border: "1px solid hsl(var(--m-surface-border) / 0.3)",
              }}>
              取消
            </button>
            <button
              onClick={() => {
                setLogoutOpen(false);
                toast.success("已退出登录");
                navigate("/login");
              }}
              className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
              style={{
                background: "hsl(var(--destructive))",
                boxShadow: "0 4px 20px -6px hsl(var(--destructive) / 0.5)",
              }}>
              确认退出
            </button>
          </div>
        </div>
      </ModalOverlay>
    </MemberLayout>
  );
}
