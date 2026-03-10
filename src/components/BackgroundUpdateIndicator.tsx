import { useIsFetching } from "@tanstack/react-query";

export function BackgroundUpdateIndicator() {
  const isFetching = useIsFetching();

  if (!isFetching) return null;

  return (
    <div className="fixed top-[2px] left-0 right-0 z-[99] h-[1.5px] overflow-hidden pointer-events-none">
      <div className="h-full w-full animate-shimmer-slide" />
    </div>
  );
}
