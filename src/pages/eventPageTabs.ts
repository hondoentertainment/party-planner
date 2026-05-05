import {
  CalendarClock,
  Archive,
  Building2,
  ClipboardList,
  Cookie,
  DollarSign,
  GlassWater,
  Home as HomeIcon,
  type LucideIcon,
  Music,
  Paintbrush,
  Settings,
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
  /** Short label for the mobile bottom bar (desktop group nav still uses {@link EventTabGroup.label}). */
  mobileShortLabel?: string;
}

export interface EventTabGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  tabs: EventTabDef[];
}

export const EVENT_PAGE_GROUPS: EventTabGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: HomeIcon,
    tabs: [{ to: "", label: "Overview", icon: HomeIcon }],
  },
  {
    id: "plan",
    label: "Plan",
    icon: CalendarClock,
    tabs: [
      { to: "timeline", label: "Timeline", icon: CalendarClock },
      { to: "wrap-up", label: "Post-party", icon: Archive },
    ],
  },
  {
    id: "guests",
    label: "Guests",
    icon: Users,
    tabs: [{ to: "guests", label: "Guests", icon: Users }],
  },
  {
    id: "food-drink",
    label: "Food & Drink",
    icon: Cookie,
    tabs: [
      { to: "food", label: "Menu", icon: Cookie },
      { to: "beverages", label: "Beverages", icon: GlassWater },
      { to: "shopping", label: "Shopping", icon: ShoppingCart },
      { to: "budget", label: "Budget", icon: DollarSign },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    icon: Sofa,
    tabs: [
      { to: "logistics", label: "Logistics", icon: Truck },
      { to: "signs", label: "Signs", icon: Signpost },
      { to: "decorations", label: "Decorations", icon: Paintbrush },
      { to: "restrooms", label: "Restrooms", icon: ClipboardList },
      { to: "setup", label: "Day-of setup", icon: Sofa },
    ],
  },
  {
    id: "atmosphere",
    label: "Atmosphere",
    icon: Music,
    tabs: [
      { to: "music", label: "Music", icon: Music },
      { to: "games", label: "Games", icon: ToyBrick },
    ],
  },
  {
    id: "vendors",
    label: "Vendors",
    icon: Building2,
    tabs: [{ to: "vendors", label: "Vendors", icon: Building2 }],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    tabs: [{ to: "settings", label: "Settings", icon: Settings }],
  },
];

export const EVENT_PAGE_TABS: EventTabDef[] = EVENT_PAGE_GROUPS.flatMap((g) => g.tabs);

export const EVENT_PAGE_PRIMARY_MOBILE_TABS: EventTabDef[] = [
  EVENT_PAGE_GROUPS[0].tabs[0],
  { ...EVENT_PAGE_GROUPS[1].tabs[0], mobileShortLabel: "Plan" },
  EVENT_PAGE_GROUPS[2].tabs[0],
  EVENT_PAGE_GROUPS[3].tabs[0],
  EVENT_PAGE_GROUPS[3].tabs[2],
];
