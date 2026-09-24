import {
  LayoutDashboard, BookOpen, ShoppingCart, Receipt, Wallet, Landmark, Users, Truck,
  FolderKanban, Percent, Bot, FileBarChart, FileText, UserCog, Settings, ScrollText, CreditCard, FileUp,
} from "lucide-react";

// Main navigation per the product spec (section 19): Dashboard, Accounting,
// Sales, Purchases, Expenses, Banking, Customers, Suppliers, Projects,
// Taxes, AI Copilot, Reports, Documents, Users, Billing, Settings, Audit Log.
// Shared by the desktop sidebar and the mobile/tablet drawer so the two
// can never drift apart.
export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounting", label: "Accounting", icon: BookOpen },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/purchases", label: "Purchases", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/banking", label: "Banking", icon: Landmark },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/taxes", label: "Taxes", icon: Percent },
  { href: "/ai-copilot", label: "AI Copilot", icon: Bot },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/import", label: "Import data", icon: FileUp },
  { href: "/users", label: "Users", icon: UserCog },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
] as const;
