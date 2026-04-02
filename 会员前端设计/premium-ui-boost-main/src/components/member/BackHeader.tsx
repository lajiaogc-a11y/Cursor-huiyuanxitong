import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BackHeaderProps {
  title: string;
  rightAction?: React.ReactNode;
}

export default function BackHeader({ title, rightAction }: BackHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-5 pt-6 pb-3">
      <button
        onClick={() => navigate(-1)}
        className="w-9 h-9 rounded-xl flex items-center justify-center bg-[hsl(var(--m-surface)_/_0.5)] border border-[hsl(var(--m-surface-border)_/_0.25)] transition hover:bg-[hsl(var(--m-surface)_/_0.8)] active:scale-90"
      >
        <ArrowLeft className="w-4 h-4 text-[hsl(var(--m-text-dim))]" />
      </button>
      <h1 className="text-base font-extrabold">{title}</h1>
      <div className="w-9">{rightAction}</div>
    </div>
  );
}
