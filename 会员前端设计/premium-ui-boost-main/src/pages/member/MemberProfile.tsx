import { useState, useRef, useEffect } from "react";
import {
  User, Camera, Mail, Phone, MapPin, Calendar, Shield,
  ChevronRight, Edit3, X, CheckCircle, Star, ImagePlus,
} from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import { toast } from "sonner";
import { ProfileSkeleton } from "@/components/member/MemberSkeleton";

/* ── Mock Data ── */
const initialProfile = {
  name: "John Doe",
  nickname: "霸气",
  phone: "+60 12-345 6789",
  email: "john.doe@email.com",
  gender: "男",
  birthday: "1995-06-15",
  address: "Kuala Lumpur, Malaysia",
  memberCode: "0WVN7PU",
  level: "Gold",
  joinDate: "2024-01-15",
  verified: true,
};

const levelConfig: Record<string, { gradient: string; shadow: string }> = {
  Gold: {
    gradient: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--gold-soft)))",
    shadow: "0 4px 16px -4px hsl(var(--primary) / 0.4)",
  },
  Silver: {
    gradient: "linear-gradient(135deg, hsl(220 10% 60%), hsl(220 10% 45%))",
    shadow: "0 4px 16px -4px hsl(220 10% 50% / 0.3)",
  },
  Bronze: {
    gradient: "linear-gradient(135deg, hsl(25 60% 50%), hsl(25 50% 40%))",
    shadow: "0 4px 16px -4px hsl(25 60% 50% / 0.3)",
  },
};

function ModalOverlay({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-t-3xl p-6 pb-8 animate-[slideUp_0.3s_ease-out]"
        style={{
          background: "linear-gradient(180deg, hsl(var(--m-bg-2)), hsl(var(--m-bg-1)))",
          border: "1px solid hsl(var(--m-surface-border) / 0.3)",
          borderBottom: "none",
        }}
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[hsl(var(--m-surface)_/_0.5)] transition">
          <X className="w-4 h-4 text-[hsl(var(--m-text-dim))]" />
        </button>
        {children}
      </div>
    </div>
  );
}

export default function MemberProfile() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);
  const [profile, setProfile] = useState(initialProfile);
  const [editOpen, setEditOpen] = useState(false);
  const [editField, setEditField] = useState<{ key: string; label: string; value: string }>({ key: "", label: "", value: "" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarUrl(ev.target?.result as string);
      toast.success("头像更新成功");
    };
    reader.readAsDataURL(file);
  };

  const openEdit = (key: string, label: string, value: string) => {
    setEditField({ key, label, value });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editField.value.trim()) {
      toast.error("内容不能为空");
      return;
    }
    setProfile((prev) => ({ ...prev, [editField.key]: editField.value.trim() }));
    setEditOpen(false);
    toast.success(`${editField.label}修改成功`);
  };

  const inputStyle = {
    background: "hsl(var(--m-surface) / 0.5)",
    border: "1px solid hsl(var(--m-surface-border) / 0.3)",
    color: "hsl(var(--m-text))",
  };

  const lc = levelConfig[profile.level] || levelConfig.Gold;

  const infoItems = [
    { key: "nickname", icon: User, label: "昵称", value: profile.nickname, editable: true, color: "--gold" },
    { key: "phone", icon: Phone, label: "手机号", value: profile.phone, editable: true, color: "--emerald" },
    { key: "email", icon: Mail, label: "邮箱", value: profile.email, editable: true, color: "--rose" },
    { key: "gender", icon: User, label: "性别", value: profile.gender, editable: true, color: "--gold" },
    { key: "birthday", icon: Calendar, label: "生日", value: profile.birthday, editable: true, color: "--emerald" },
    { key: "address", icon: MapPin, label: "地址", value: profile.address, editable: true, color: "--rose" },
  ];

  if (loading) return <MemberLayout><ProfileSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg pb-24">
        {/* Hero / Avatar Section */}
        <div className="relative overflow-hidden">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-gold/[0.08] blur-[100px]" />
          <div className="absolute top-20 -right-16 w-48 h-48 rounded-full bg-emerald/[0.05] blur-[80px]" />

          <div className="relative px-5 pt-8 pb-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--m-text-dim))] mb-6">个人资料</p>

            {/* Avatar + Name Card */}
            <div className="m-glass p-6 relative overflow-hidden" style={{ borderColor: 'hsl(var(--m-glow-gold) / 0.15)' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.05] to-emerald/[0.03] pointer-events-none rounded-[inherit]" />
              <div className="relative flex flex-col items-center">
                {/* Avatar */}
                <div className="relative mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="头像"
                      className="w-20 h-20 rounded-2xl object-cover"
                      style={{ boxShadow: lc.shadow }}
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-extrabold text-white"
                      style={{ background: lc.gradient, boxShadow: lc.shadow }}>
                      {profile.nickname[0]}
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-[hsl(var(--m-surface))] border border-[hsl(var(--m-surface-border)_/_0.5)] flex items-center justify-center hover:bg-[hsl(var(--m-surface)_/_0.8)] transition">
                    <Camera className="w-3.5 h-3.5 text-[hsl(var(--m-text-dim))]" />
                  </button>
                </div>

                {/* Name & Level */}
                <h2 className="text-lg font-extrabold mb-1">{profile.nickname}</h2>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="px-3 py-1 rounded-full text-[11px] font-extrabold"
                    style={{ background: lc.gradient, color: "hsl(var(--m-bg-1))", boxShadow: lc.shadow }}>
                    <Star className="w-3 h-3 inline mr-1" />
                    {profile.level}
                  </span>
                  {profile.verified && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald/10 text-emerald-soft ring-1 ring-inset ring-emerald/20">
                      <CheckCircle className="w-3 h-3" />
                      已认证
                    </span>
                  )}
                </div>

                {/* Quick Info */}
                <div className="flex gap-3 w-full mt-2">
                  <div className="flex-1 rounded-xl bg-[hsl(var(--m-surface)_/_0.5)] border border-[hsl(var(--m-surface-border)_/_0.2)] px-3 py-2.5 text-center">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--m-text-dim))] mb-0.5">会员码</div>
                    <div className="text-xs font-bold font-mono">{profile.memberCode}</div>
                  </div>
                  <div className="flex-1 rounded-xl bg-[hsl(var(--m-surface)_/_0.5)] border border-[hsl(var(--m-surface-border)_/_0.2)] px-3 py-2.5 text-center">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--m-text-dim))] mb-0.5">注册日期</div>
                    <div className="text-xs font-bold">{profile.joinDate}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Info Section */}
        <div className="px-5 mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--m-text-dim))] mb-3">基本信息</h3>
          <div className="m-glass overflow-hidden">
            {infoItems.map((item, i) => (
              <button
                key={item.key}
                onClick={() => item.editable && openEdit(item.key, item.label, item.value)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[hsl(var(--m-surface)_/_0.4)] ${
                  i > 0 ? "border-t border-[hsl(var(--m-surface-border)_/_0.2)]" : ""
                }`}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `hsl(var(${item.color}) / 0.1)` }}>
                  <item.icon className="w-4 h-4" style={{ color: `hsl(var(${item.color}-soft))` }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[10px] text-[hsl(var(--m-text-dim))] font-bold mb-0.5">{item.label}</p>
                  <p className="text-sm font-semibold">{item.value}</p>
                </div>
                {item.editable && (
                  <Edit3 className="w-3.5 h-3.5 text-[hsl(var(--m-text-dim)_/_0.4)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Security Section */}
        <div className="px-5 mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--m-text-dim))] mb-3">安全信息</h3>
          <div className="m-glass overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald/10">
                <Shield className="w-4 h-4 text-emerald-soft" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-[10px] text-[hsl(var(--m-text-dim))] font-bold mb-0.5">实名认证</p>
                <p className="text-sm font-semibold">{profile.verified ? "已认证" : "未认证"}</p>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                profile.verified
                  ? "bg-emerald/10 text-emerald-soft ring-1 ring-inset ring-emerald/20"
                  : "bg-rose/10 text-rose-soft ring-1 ring-inset ring-rose/20"
              }`}>
                {profile.verified ? "✓ 已完成" : "待验证"}
              </span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5 border-t border-[hsl(var(--m-surface-border)_/_0.2)]">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gold/10">
                <Calendar className="w-4 h-4 text-gold-soft" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-[10px] text-[hsl(var(--m-text-dim))] font-bold mb-0.5">会员时长</p>
                <p className="text-sm font-semibold">
                  {Math.floor((Date.now() - new Date(profile.joinDate).getTime()) / (1000 * 60 * 60 * 24))} 天
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="h-8" />
      </div>

      {/* Edit Modal */}
      <ModalOverlay open={editOpen} onClose={() => setEditOpen(false)}>
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-extrabold mb-1">修改{editField.label}</h3>
            <p className="text-xs text-[hsl(var(--m-text-dim))]">更新您的{editField.label}信息</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--m-text-dim))] mb-2 block">
              新{editField.label}
            </label>
            <input
              type="text"
              value={editField.value}
              onChange={(e) => setEditField((prev) => ({ ...prev, value: e.target.value }))}
              placeholder={`请输入${editField.label}`}
              className="w-full rounded-xl px-4 py-3.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-gold/30"
              style={inputStyle}
            />
          </div>
          <button
            onClick={saveEdit}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
              color: "white",
              boxShadow: "0 4px 20px -6px hsl(var(--gold) / 0.5)",
            }}>
            保存修改
          </button>
        </div>
      </ModalOverlay>
    </MemberLayout>
  );
}
