import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PlatformSettings from "@/pages/PlatformSettings";

/** 平台总账号 - 平台设置（独立页面，左侧导航直达，租户不可见） */
export default function PlatformSettingsPage() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = employee?.is_platform_super_admin === true;

  useEffect(() => {
    if (employee && !isSuperAdmin) {
      navigate("/", { replace: true });
    }
  }, [employee, isSuperAdmin, navigate]);

  if (!isSuperAdmin) return null;

  return (
    <div className="p-4 md:p-6">
      <PlatformSettings />
    </div>
  );
}
