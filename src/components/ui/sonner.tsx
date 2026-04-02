import type { ComponentProps } from "react";
import "@/styles/member-sonner-toast.css";
import { useLocation } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { showMemberPortal } from "@/routes/siteMode";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

function isMemberToastSurface(pathname: string): boolean {
  if (pathname.startsWith("/member")) return true;
  if (pathname.startsWith("/invite")) return true;
  if (pathname === "/" && showMemberPortal) return true;
  return false;
}

/** 须放在 BrowserRouter / HashRouter 内，以便按路由切换会员端 Toast 皮肤 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  const { pathname } = useLocation();
  const memberSurface = isMemberToastSurface(pathname);

  return (
    <Sonner
      theme={memberSurface ? "dark" : (theme as ToasterProps["theme"])}
      className={cn("toaster group", memberSurface && "member-sonner-toaster")}
      position="top-center"
      duration={2200}
      toastOptions={{
        classNames: memberSurface
          ? {
              toast:
                "group toast border-0 bg-transparent text-[#F8FAFC] shadow-none backdrop-blur-0",
              title: "group-[.toast]:font-semibold group-[.toast]:text-[#F8FAFC]",
              description: "group-[.toast]:text-[hsl(var(--pu-m-text-dim)/0.88)]",
              actionButton:
                "group-[.toast]:rounded-lg group-[.toast]:bg-[hsl(var(--pu-gold))] group-[.toast]:text-[hsl(var(--pu-primary-foreground))] group-[.toast]:font-semibold",
              cancelButton:
                "group-[.toast]:rounded-lg group-[.toast]:border group-[.toast]:border-white/15 group-[.toast]:bg-white/5 group-[.toast]:text-[hsl(var(--pu-m-text-dim)/0.95)]",
            }
          : {
              toast:
                "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
              description: "group-[.toast]:text-muted-foreground",
              actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
              cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
            },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
