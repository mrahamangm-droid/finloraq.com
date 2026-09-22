import Link from "next/link";
import {
  LayoutDashboard, BookOpen, ShoppingCart, Receipt, Wallet, Landmark, Users, Truck,
  FolderKanban, Percent, Bot, FileBarChart, FileText, UserCog, Settings, ScrollText, CreditCard,
} from "lucide-react";

// Main navigation per the product spec (section 19): Dashboard, Accounting,
// Sales, Purchases, Expenses, Banking, Customers, Suppliers, Projects,
// Taxes, AI Copilot, Reports, Documents, Users, Billing, Settings, Audit Log.
const NAV = [
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
  { href: "/users", label: "Users", icon: UserCog },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
];

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-base font-semibold text-card-foreground">Finloraq</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
