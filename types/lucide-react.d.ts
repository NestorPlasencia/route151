// lucide-react 1.31 declara "typings" en su package.json pero no publica el
// archivo, asi que TypeScript no encuentra sus tipos. Se declaran aqui los
// iconos que usa la app.
declare module 'lucide-react' {
  import type { FC, SVGProps } from 'react';
  type Icon = FC<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;
  export const KeyRound: Icon;
  export const SkipForward: Icon;
  export const TriangleAlert: Icon;
  export const Undo2: Icon;
  export const List: Icon;
  export const Target: Icon;
  export const Footprints: Icon;
  export const Bird: Icon;
  export const Download: Icon;
  export const Upload: Icon;
  export const CircleHelp: Icon;
  export const LockOpen: Icon;
  export const Flag: Icon;
  export const RefreshCw: Icon;
  export const RotateCcw: Icon;
  export const ChevronUp: Icon;
  export const ArrowDown: Icon;
  export const ArrowLeft: Icon;
  export const ArrowUp: Icon;
  export const Backpack: Icon;
  export const BookOpen: Icon;
  export const Camera: Icon;
  export const Check: Icon;
  export const ChevronDown: Icon;
  export const DoorOpen: Icon;
  export const Gift: Icon;
  export const Gamepad: Icon;
  export const HeartCrack: Icon;
  export const Images: Icon;
  export const Info: Icon;
  export const Layers: Icon;
  export const ListChecks: Icon;
  export const Play: Icon;
  export const Save: Icon;
  export const LocateFixed: Icon;
  export const Lock: Icon;
  export const Map: Icon;
  export const MapPin: Icon;
  export const Plus: Icon;
  export const Mountain: Icon;
  export const ScanLine: Icon;
  export const Search: Icon;
  export const Sparkles: Icon;
  export const Store: Icon;
  export const Swords: Icon;
  export const X: Icon;
}
