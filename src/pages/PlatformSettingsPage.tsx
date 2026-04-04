import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import PlatformSettings from "@/pages/PlatformSettings";

/** 平台总账号 - 平台设置（独立页面，左侧导航直达，租户不可见） */
export default function PlatformSettingsPage() {
  const { employee, loading } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = employee?.is_platform_super_admin === true;

  useEffect(() => {
    if (!loading && employee && !isSuperAdmin) {
      navigate("/", { replace: true });
    }
  }, [loading, employee, isSuperAdmin, navigate]);

  if (loading || !employee) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="p-4 md:p-6">
      <PlatformSettings />
    </div>
  );
}
