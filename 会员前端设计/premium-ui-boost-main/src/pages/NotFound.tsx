import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ShieldAlert, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center m-page-bg">
      <div className="text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-6 ring-1 ring-inset ring-gold/20">
          <ShieldAlert className="w-8 h-8 text-gold-soft" />
        </div>
        <h1 className="text-5xl font-extrabold mb-3 bg-gradient-to-r from-gold to-gold-soft bg-clip-text text-transparent">
          404
        </h1>
        <p className="text-sm text-[hsl(var(--m-text-dim))] font-medium mb-8">
          页面不存在或已被移除
        </p>
        <Link
          to="/member/dashboard"
          className="btn-glow inline-flex items-center gap-2 px-6 py-3 text-sm rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          返回首页
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
