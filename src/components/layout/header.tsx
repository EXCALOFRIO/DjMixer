import { Waves, MoreVertical, Volume2, VolumeX } from 'lucide-react';
import type { FC } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type HeaderProps = {
  volume: number;
  onVolumeChange: (newVolume: number[]) => void;
};

const Header: FC<HeaderProps> = ({ volume, onVolumeChange }) => {
  return (
    <header className="absolute top-0 left-0 w-full p-4 md:p-6 z-30 flex justify-between items-center">
      <div className="flex items-center gap-2 text-primary">
        <Waves className="w-8 h-8" />
        <h1 className="text-2xl font-bold tracking-tighter font-headline"></h1>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 text-primary">
            <MoreVertical />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" side="bottom" align="end">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Volumen</h4>
              <p className="text-sm text-muted-foreground">
                Ajusta el volumen de la música.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {volume > 0 ? <Volume2 className="h-5 w-5 text-muted-foreground" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
              <Slider
                defaultValue={[volume]}
                max={1}
                step={0.01}
                onValueChange={onVolumeChange}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </header>
  );
};

export default Header;
