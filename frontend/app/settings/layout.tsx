'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const settingsNavigation = [
  {
    label: 'DÉMARRAGE',
    items: [
      { name: 'Mise en route', href: '/settings' },
    ],
  },
  {
    label: 'PARAMÈTRES PERSONNELS',
    items: [
      { name: 'Détails du compte', href: '/settings/account' },
      { name: 'Notifications', href: '/settings/notifications' },
      { name: 'Sécurité', href: '/settings/security' },
    ],
  },
  {
    label: 'PARAMÈTRES DU CABINET',
    items: [
      { name: 'Général', href: '/settings/clinic' },
      { name: 'Modèles', href: '/settings/templates' },
      { name: 'Intégrations', href: '/settings/integrations' },
      { name: 'Base de connaissances', href: '/settings/knowledge-base' },
      { name: 'Équipe', href: '/settings/team' },
    ],
  },
  {
    label: 'DONNÉES & CONFIDENTIALITÉ',
    items: [
      { name: 'Confidentialité', href: '/settings/privacy' },
      { name: 'Rapports', href: '/settings/reports' },
    ],
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full bg-white">
      {/* Settings Sidebar - Fernand style */}
      <div className="w-56 border-r border-[#EAEAEA] bg-white mt-6 flex-shrink-0">
        <ScrollArea className="h-full py-6">
          <div className="space-y-6 px-4">
            {settingsNavigation.map((section) => (
              <div key={section.label} className="space-y-1">
                <h3 className="px-3 py-1.5 text-[11px] font-semibold text-[#999] tracking-wide uppercase">
                  {section.label}
                </h3>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || 
                      (item.href !== '/settings' && pathname.startsWith(item.href));
                    const isGettingStarted = item.href === '/settings' && pathname === '/settings';
                    const active = isGettingStarted || isActive;
                    
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'block px-3 py-2 text-sm transition-colors rounded-md relative',
                          active
                            ? 'text-bg-[#F5F5F5] font-medium bg-[var(--medicai-green-light)]/40'
                            : 'text-[#555] hover:text-[#111] hover:bg-[#F5F5F5]'
                        )}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto bg-[#FAFAFA]">
        <div className="max-w-4xl px-8 py-8 mx-auto mt-15">
          {children}
        </div>
      </div>
    </div>
  );
}
