'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Calendar, FileText, LogOut, User, Bell, Shield, HelpCircle, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from './auth-provider';

const navigation = [
  { name: '', icon: Home, href: '/', label: 'Accueil' },
  { name: '', icon: FileText, href: '/consultations', label: 'Consultations' },
  { name: '', icon: Users, href: '/patients', label: 'Patients' },
  { name: '', icon: Calendar, href: '/schedule', label: 'Agenda' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  
  // Get user initials for avatar
  const initials = user?.email 
    ? user.email.substring(0, 2).toUpperCase() 
    : 'DR';

  return (
    <div className="flex h-screen w-16 flex-col items-center border-r bg-muted/50 py-4">
      {/* Main Navigation */}
      <div className="flex flex-col items-center space-y-2">
        {navigation.map((item) => {
          const isActive = item.href === '/' 
            ? pathname === '/' 
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={item.label}
            >
              <item.icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom Section */}
      <div className="flex flex-col items-center space-y-2">
        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:cursor-pointer">
              <Avatar className="h-8 w-8 border-2 border-[var(--medicai-green)]">
                <AvatarFallback className="bg-[var(--medicai-green-light)] text-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-semibold">{user?.email || 'User'}</span>
                <span className="text-xs text-muted-foreground font-normal">Connecté</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/account" className="cursor-pointer">
                <User className="h-4 w-4 mr-2" />
                Mon profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/notifications" className="cursor-pointer">
                <Bell className="h-4 w-4 mr-2" />
                Notifications
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/security" className="cursor-pointer">
                <Shield className="h-4 w-4 mr-2" />
                Sécurité
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" />
                Paramètres
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help" className="cursor-pointer">
                <HelpCircle className="h-4 w-4 mr-2" />
                Aide & Support
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={logout}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
