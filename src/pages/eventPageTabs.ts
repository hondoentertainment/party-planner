import {
  CalendarClock,
  ClipboardList,
  Cookie,
  GlassWater,
  Home as HomeIcon,
  ListChecks,
  type LucideIcon,
  Music,
  Paintbrush,
  ShoppingCart,
  Signpost,
  Sofa,
  ToyBrick,
  Truck,
  Users,
} from "lucide-react";

export interface EventTabDef {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const EVENT_PAGE_TABS: EventTabDef[] = [
  { to: "", label: "Overview", icon: HomeIcon },
  { to: "timeline", label: "Timeline", icon: CalendarClock },
  { to: "guests", label: "Guests", icon: Users },
  { to: "food", label: "Food", icon: Cookie },
  { to: "beverages", label: "Beverages", icon: GlassWater },
  { to: "shopping", label: "Food Purchasing", icon: ShoppingCart },
  { to: "logistics", label: "Logistics", icon: Truck },
  { to: "signs", label: "Signs", icon: Signpost },
  { to: "games", label: "Games", icon: ToyBrick },
  { to: "music", label: "Music", icon: Music },
  { to: "restrooms", label: "Restrooms", icon: ClipboardList },
  { to: "decorations", label: "Decorations", icon: Paintbrush },
  { to: "setup", label: "Setup", icon: Sofa },
  { to: "settings", label: "Settings", icon: ListChecks },
];

export const EVENT_PAGE_PRIMARY_MOBILE_TABS: EventTabDef[] = EVENT_PAGE_TABS.filter((t) =>
  ["", "timeline", "guests", "food", "shopping"].includes(t.to)
);
