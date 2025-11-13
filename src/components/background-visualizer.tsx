
"use client";

import { cn } from "@/lib/utils";

const BackgroundVisualizer = () => {
  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden -z-10">
      <div
        className={cn(
          "absolute inset-0 bg-background"
        )}
      />
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.15),_transparent_30%)]" />
      <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_bottom_right,_hsl(var(--primary)/0.15),_transparent_30%)]" />
    </div>
  );
};

export default BackgroundVisualizer;
