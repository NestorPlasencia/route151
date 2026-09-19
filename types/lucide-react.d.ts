// lucide-react 1.31 declara "typings" en su package.json pero no publica el
// archivo, asi que TypeScript no encuentra sus tipos. Se declaran aqui los
// iconos que usa la app.
declare module 'lucide-react' {
  import type { FC, SVGProps } from 'react';
  type Icon = FC<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;
  export const ArrowLeft: Icon;
  export const Backpack: Icon;
  export const BookOpen: Icon;
  export const Check: Icon;
  export const ChevronDown: Icon;
  export const DoorOpen: Icon;
  export const Gift: Icon;
  export const Info: Icon;
  export const Layers: Icon;
  export const ListChecks: Icon;
  export const Map: Icon;
  export const MapPin: Icon;
  export const Plus: Icon;
  export const Mountain: Icon;
  export const Search: Icon;
  export const Sparkles: Icon;
  export const Store: Icon;
  export const Swords: Icon;
  export const X: Icon;
}
