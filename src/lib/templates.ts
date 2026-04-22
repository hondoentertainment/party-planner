import type { ItemKind, Phase } from "./database.types";

export interface TemplateItem {
  kind: ItemKind;
  title: string;
  phase?: Phase;
  description?: string;
  meta?: Record<string, unknown>;
}

export interface EventTemplate {
  id: string;
  name: string;
  emoji: string;
  color: string;
  blurb: string;
  theme?: string;
  items: TemplateItem[];
}

const sharedPostTasks: TemplateItem[] = [
  { kind: "task", phase: "post", title: "Wash dishes & glassware" },
  { kind: "task", phase: "post", title: "Take out trash & recycling" },
  { kind: "task", phase: "post", title: "Return rentals" },
  { kind: "task", phase: "post", title: "Send thank-you messages" },
  { kind: "task", phase: "post", title: "Save photos to shared album" },
];

export const TEMPLATES: EventTemplate[] = [
  {
    id: "bbq",
    name: "Backyard BBQ",
    emoji: "🍔",
    color: "#f59e0b",
    blurb: "Grill out, cold drinks, lawn games. Great for 10–30 guests.",
    theme: "Casual outdoor",
    items: [
      // Pre-party tasks
      { kind: "task", phase: "pre", title: "Confirm guest list & RSVPs" },
      { kind: "task", phase: "pre", title: "Send Partiful invite" },
      { kind: "task", phase: "pre", title: "Check propane / charcoal supply" },
      { kind: "task", phase: "pre", title: "Mow lawn & set up yard" },
      { kind: "task", phase: "pre", title: "Buy groceries (3 days before)" },
      { kind: "task", phase: "pre", title: "Make playlist" },
      // Day-of
      { kind: "task", phase: "day_of", title: "Set up tables & chairs in yard" },
      { kind: "task", phase: "day_of", title: "Fill coolers with ice" },
      { kind: "task", phase: "day_of", title: "Pre-heat grill 30 min before" },
      { kind: "task", phase: "day_of", title: "Set out condiments & buns" },
      ...sharedPostTasks,

      // Food
      { kind: "food", title: "Burgers", meta: { course: "main", servings: 20 } },
      { kind: "food", title: "Hot dogs", meta: { course: "main", servings: 20 } },
      { kind: "food", title: "Grilled chicken", meta: { course: "main", servings: 12 } },
      { kind: "food", title: "Veggie skewers", meta: { course: "main", servings: 10, dietary: ["VG", "GF"] } },
      { kind: "food", title: "Potato salad", meta: { course: "side", servings: 15 } },
      { kind: "food", title: "Coleslaw", meta: { course: "side", servings: 15, dietary: ["GF"] } },
      { kind: "food", title: "Chips & salsa", meta: { course: "appetizer", servings: 20, dietary: ["VG"] } },
      { kind: "food", title: "Watermelon", meta: { course: "dessert", servings: 20, dietary: ["VG", "GF"] } },
      { kind: "food", title: "S'mores kit", meta: { course: "dessert", servings: 15 } },

      // Beverages
      { kind: "beverage", title: "IPA 12-pack", meta: { type: "beer", qty: 2, unit: "12pk", alcoholic: true } },
      { kind: "beverage", title: "Light beer 12-pack", meta: { type: "beer", qty: 2, unit: "12pk", alcoholic: true } },
      { kind: "beverage", title: "White wine", meta: { type: "wine", qty: 2, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Rosé", meta: { type: "wine", qty: 2, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Sparkling water", meta: { type: "non_alc", qty: 6, unit: "L" } },
      { kind: "beverage", title: "Lemonade", meta: { type: "non_alc", qty: 2, unit: "gal" } },

      // Shopping
      { kind: "shopping", title: "Burger patties", meta: { store: "Costco", qty: 24, unit: "ea", est_cost_cents: 4000 } },
      { kind: "shopping", title: "Hot dog buns", meta: { store: "Costco", qty: 2, unit: "pk", est_cost_cents: 800 } },
      { kind: "shopping", title: "Burger buns", meta: { store: "Costco", qty: 2, unit: "pk", est_cost_cents: 800 } },
      { kind: "shopping", title: "Charcoal", meta: { store: "Other", qty: 1, unit: "bag", est_cost_cents: 1500 } },
      { kind: "shopping", title: "Ice", meta: { store: "Local market", qty: 4, unit: "bag", est_cost_cents: 2000 } },
      { kind: "shopping", title: "Ketchup, mustard, mayo", meta: { store: "Trader Joe's", qty: 1, unit: "set", est_cost_cents: 1500 } },

      // Setup
      { kind: "setup", title: "Set up folding tables", meta: { duration_min: 20 } },
      { kind: "setup", title: "Set up speaker for music", meta: { duration_min: 10 } },
      { kind: "setup", title: "String lights along fence", meta: { duration_min: 30 } },
      { kind: "setup", title: "Bug citronella candles outside", meta: { duration_min: 5 } },

      // Games
      { kind: "game", title: "Cornhole", meta: { area: "Lawn", supplies: "2 boards, 8 bags" } },
      { kind: "game", title: "Spike ball", meta: { area: "Lawn", supplies: "Net, ball" } },

      // Decorations
      { kind: "decoration", title: "Picnic tablecloths", meta: { area: "Tables", qty: 3 } },
      { kind: "decoration", title: "String lights", meta: { area: "Fence/trees", qty: 50 } },

      // Music
      { kind: "music", title: "Sunny BBQ Vibes", meta: { is_playlist: true } },

      // Logistics
      { kind: "logistics", title: "Verify trash pickup day", description: "Don't pile bags out the wrong day" },
      { kind: "logistics", title: "Designate parking spots" },

      // Signs
      { kind: "sign", title: "Welcome / this way", meta: { content: "🎉 Welcome → backyard", location: "Front gate" } },
      { kind: "sign", title: "Drinks", meta: { content: "Drinks 🍻", location: "Cooler" } },

      // Restrooms
      { kind: "restroom", title: "Stock toilet paper", meta: { location: "Main bath", qty: "3 rolls" } },
      { kind: "restroom", title: "Hand soap & towels", meta: { location: "Main bath" } },
    ],
  },

  {
    id: "birthday",
    name: "Birthday Party",
    emoji: "🎂",
    color: "#ec4899",
    blurb: "Cake, candles, a playlist that bangs. 10–25 guests.",
    theme: "Celebration",
    items: [
      { kind: "task", phase: "pre", title: "Order birthday cake" },
      { kind: "task", phase: "pre", title: "Send Partiful invite" },
      { kind: "task", phase: "pre", title: "Buy candles & lighter" },
      { kind: "task", phase: "pre", title: "Prepare playlist" },
      { kind: "task", phase: "pre", title: "Wrap gift (if any)" },
      { kind: "task", phase: "day_of", title: "Pick up cake" },
      { kind: "task", phase: "day_of", title: "Hang banner & balloons" },
      { kind: "task", phase: "day_of", title: "Chill drinks" },
      { kind: "task", phase: "day_of", title: "Cue 'Happy Birthday' moment" },
      ...sharedPostTasks,

      { kind: "food", title: "Cheese & charcuterie board", meta: { course: "appetizer", servings: 15 } },
      { kind: "food", title: "Bruschetta", meta: { course: "appetizer", servings: 15, dietary: ["VG"] } },
      { kind: "food", title: "Pasta tray", meta: { course: "main", servings: 20 } },
      { kind: "food", title: "Caesar salad", meta: { course: "side", servings: 15 } },
      { kind: "food", title: "Birthday cake", meta: { course: "dessert", servings: 20 } },

      { kind: "beverage", title: "Champagne / Prosecco", meta: { type: "wine", qty: 3, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Red wine", meta: { type: "wine", qty: 2, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Signature cocktail", meta: { type: "cocktail", qty: 1, unit: "pitcher", alcoholic: true } },
      { kind: "beverage", title: "Sparkling water", meta: { type: "non_alc", qty: 6, unit: "L" } },

      { kind: "shopping", title: "Birthday candles", meta: { store: "Other", qty: 1, unit: "pk", est_cost_cents: 500 } },
      { kind: "shopping", title: "Balloons (helium)", meta: { store: "Other", qty: 12, unit: "ea", est_cost_cents: 1500 } },
      { kind: "shopping", title: "Birthday banner", meta: { store: "Other", qty: 1, unit: "ea", est_cost_cents: 800 } },
      { kind: "shopping", title: "Disposable plates & cutlery", meta: { store: "Costco", qty: 1, unit: "pk", est_cost_cents: 2000 } },
      { kind: "shopping", title: "Ice", meta: { store: "Local market", qty: 2, unit: "bag", est_cost_cents: 1000 } },

      { kind: "setup", title: "Hang birthday banner", meta: { duration_min: 15 } },
      { kind: "setup", title: "Inflate & tie balloons", meta: { duration_min: 30 } },
      { kind: "setup", title: "Set up cake table", meta: { duration_min: 10 } },

      { kind: "decoration", title: "Banner", meta: { area: "Entry / wall", qty: 1 } },
      { kind: "decoration", title: "Balloon bouquet", meta: { area: "Cake table", qty: 12 } },
      { kind: "decoration", title: "Tablecloth", meta: { area: "Dining table", qty: 1 } },

      { kind: "music", title: "Birthday Party Mix", meta: { is_playlist: true } },
      { kind: "music", title: "Happy Birthday (full version)", meta: { artist: "Stevie Wonder", set: "main" } },

      { kind: "game", title: "Photo booth corner", meta: { area: "Living room", supplies: "Props, ring light" } },

      { kind: "sign", title: "Welcome", meta: { content: "🎉 Happy Birthday!", location: "Front door" } },

      { kind: "restroom", title: "Stock toilet paper", meta: { location: "Main bath" } },
    ],
  },

  {
    id: "cocktail",
    name: "Cocktail Party",
    emoji: "🍸",
    color: "#8b5cf6",
    blurb: "Light bites, signature drinks, conversation. 8–20 guests.",
    theme: "Cocktail attire",
    items: [
      { kind: "task", phase: "pre", title: "Choose 2 signature cocktails" },
      { kind: "task", phase: "pre", title: "Buy bar tools (shaker, jigger, strainer)" },
      { kind: "task", phase: "pre", title: "Stock garnishes (citrus, herbs)" },
      { kind: "task", phase: "pre", title: "Curate jazz/lounge playlist" },
      { kind: "task", phase: "day_of", title: "Set up bar station" },
      { kind: "task", phase: "day_of", title: "Pre-batch one cocktail" },
      { kind: "task", phase: "day_of", title: "Prep garnishes (sliced citrus)" },
      { kind: "task", phase: "day_of", title: "Light candles 30 min before" },
      ...sharedPostTasks,

      { kind: "food", title: "Cheese board", meta: { course: "appetizer", servings: 12 } },
      { kind: "food", title: "Olives & nuts", meta: { course: "appetizer", servings: 12, dietary: ["VG", "GF"] } },
      { kind: "food", title: "Bruschetta", meta: { course: "appetizer", servings: 12, dietary: ["VG"] } },
      { kind: "food", title: "Shrimp cocktail", meta: { course: "appetizer", servings: 12, dietary: ["GF"] } },
      { kind: "food", title: "Mini quiches", meta: { course: "appetizer", servings: 15 } },
      { kind: "food", title: "Chocolate truffles", meta: { course: "dessert", servings: 12 } },

      { kind: "beverage", title: "Negroni (signature)", meta: { type: "cocktail", qty: 1, unit: "batch", alcoholic: true } },
      { kind: "beverage", title: "Paloma (signature)", meta: { type: "cocktail", qty: 1, unit: "batch", alcoholic: true } },
      { kind: "beverage", title: "Champagne", meta: { type: "wine", qty: 2, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Red wine", meta: { type: "wine", qty: 2, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "White wine", meta: { type: "wine", qty: 2, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Sparkling water", meta: { type: "non_alc", qty: 4, unit: "L" } },
      { kind: "beverage", title: "Mocktail option", meta: { type: "non_alc", qty: 1, unit: "pitcher" } },

      { kind: "shopping", title: "Gin", meta: { store: "Liquor store", qty: 1, unit: "bottle", est_cost_cents: 2500 } },
      { kind: "shopping", title: "Campari", meta: { store: "Liquor store", qty: 1, unit: "bottle", est_cost_cents: 2500 } },
      { kind: "shopping", title: "Sweet vermouth", meta: { store: "Liquor store", qty: 1, unit: "bottle", est_cost_cents: 1800 } },
      { kind: "shopping", title: "Tequila", meta: { store: "Liquor store", qty: 1, unit: "bottle", est_cost_cents: 3000 } },
      { kind: "shopping", title: "Grapefruit soda", meta: { store: "Local market", qty: 4, unit: "L", est_cost_cents: 1200 } },
      { kind: "shopping", title: "Limes & oranges", meta: { store: "Local market", qty: 1, unit: "bag", est_cost_cents: 800 } },
      { kind: "shopping", title: "Cocktail napkins", meta: { store: "Other", qty: 1, unit: "pk", est_cost_cents: 600 } },
      { kind: "shopping", title: "Ice", meta: { store: "Local market", qty: 3, unit: "bag", est_cost_cents: 1500 } },

      { kind: "setup", title: "Set up bar cart / station", meta: { duration_min: 20 } },
      { kind: "setup", title: "Polish glassware", meta: { duration_min: 15 } },
      { kind: "setup", title: "Light candles", meta: { duration_min: 5 } },
      { kind: "setup", title: "Dim lights & start playlist", meta: { duration_min: 5 } },

      { kind: "decoration", title: "Tealight candles", meta: { area: "All surfaces", qty: 20 } },
      { kind: "decoration", title: "Fresh flowers", meta: { area: "Bar + table", qty: 2 } },

      { kind: "music", title: "Lounge & Jazz", meta: { is_playlist: true, set: "main" } },

      { kind: "sign", title: "Tonight's cocktails", meta: { content: "Negroni · Paloma · Mocktail of the night", location: "Bar" } },

      { kind: "restroom", title: "Hand towels & soap", meta: { location: "Powder room" } },
    ],
  },

  {
    id: "holiday",
    name: "Holiday Dinner",
    emoji: "🎄",
    color: "#10b981",
    blurb: "Sit-down dinner, family vibes. 6–14 guests.",
    theme: "Holiday",
    items: [
      { kind: "task", phase: "pre", title: "Confirm RSVPs & dietary needs" },
      { kind: "task", phase: "pre", title: "Plan menu" },
      { kind: "task", phase: "pre", title: "Brine turkey (24h before)" },
      { kind: "task", phase: "pre", title: "Iron tablecloth & napkins" },
      { kind: "task", phase: "pre", title: "Polish silverware" },
      { kind: "task", phase: "day_of", title: "Roast turkey (start early!)" },
      { kind: "task", phase: "day_of", title: "Set the table" },
      { kind: "task", phase: "day_of", title: "Open red wine to breathe" },
      { kind: "task", phase: "day_of", title: "Light candles 30 min before guests" },
      ...sharedPostTasks,

      { kind: "food", title: "Roasted turkey", meta: { course: "main", servings: 10 } },
      { kind: "food", title: "Mashed potatoes", meta: { course: "side", servings: 10, dietary: ["VG", "GF"] } },
      { kind: "food", title: "Stuffing", meta: { course: "side", servings: 10 } },
      { kind: "food", title: "Green beans almondine", meta: { course: "side", servings: 10, dietary: ["VG", "GF"] } },
      { kind: "food", title: "Cranberry sauce", meta: { course: "side", servings: 10, dietary: ["VG", "GF"] } },
      { kind: "food", title: "Dinner rolls", meta: { course: "side", servings: 12 } },
      { kind: "food", title: "Pumpkin pie", meta: { course: "dessert", servings: 10 } },
      { kind: "food", title: "Pecan pie", meta: { course: "dessert", servings: 10 } },

      { kind: "beverage", title: "Red wine (Pinot Noir)", meta: { type: "wine", qty: 3, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "White wine (Chardonnay)", meta: { type: "wine", qty: 2, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Champagne (toast)", meta: { type: "wine", qty: 1, unit: "bottle", alcoholic: true } },
      { kind: "beverage", title: "Apple cider (kids/non-alc)", meta: { type: "non_alc", qty: 1, unit: "gal" } },
      { kind: "beverage", title: "Coffee (post-dinner)", meta: { type: "coffee", qty: 1, unit: "pot" } },

      { kind: "shopping", title: "Turkey (12-14 lb)", meta: { store: "Whole Foods", qty: 1, unit: "ea", est_cost_cents: 6000 } },
      { kind: "shopping", title: "Russet potatoes", meta: { store: "Trader Joe's", qty: 5, unit: "lb", est_cost_cents: 800 } },
      { kind: "shopping", title: "Green beans", meta: { store: "Trader Joe's", qty: 2, unit: "lb", est_cost_cents: 800 } },
      { kind: "shopping", title: "Cranberries", meta: { store: "Trader Joe's", qty: 2, unit: "bag", est_cost_cents: 600 } },
      { kind: "shopping", title: "Heavy cream", meta: { store: "Trader Joe's", qty: 1, unit: "qt", est_cost_cents: 500 } },
      { kind: "shopping", title: "Butter", meta: { store: "Trader Joe's", qty: 2, unit: "lb", est_cost_cents: 800 } },
      { kind: "shopping", title: "Dinner rolls", meta: { store: "Trader Joe's", qty: 12, unit: "ea", est_cost_cents: 800 } },
      { kind: "shopping", title: "Fresh herbs (sage, thyme)", meta: { store: "Local market", qty: 1, unit: "bunch", est_cost_cents: 600 } },

      { kind: "setup", title: "Set the table (silver, glassware)", meta: { duration_min: 20 } },
      { kind: "setup", title: "Set up serving stations", meta: { duration_min: 15 } },
      { kind: "setup", title: "Light fireplace / candles", meta: { duration_min: 5 } },

      { kind: "decoration", title: "Centerpiece (gourds + candles)", meta: { area: "Dining table", qty: 1 } },
      { kind: "decoration", title: "Cloth napkins", meta: { area: "Place settings", qty: 12 } },
      { kind: "decoration", title: "Wreath on door", meta: { area: "Front door", qty: 1 } },

      { kind: "music", title: "Holiday Dinner Jazz", meta: { is_playlist: true, set: "arrival" } },

      { kind: "logistics", title: "Determine seating arrangement" },
      { kind: "logistics", title: "Set up coat rack near entry" },

      { kind: "restroom", title: "Hand towels & nice soap", meta: { location: "Guest bath" } },
    ],
  },
];
