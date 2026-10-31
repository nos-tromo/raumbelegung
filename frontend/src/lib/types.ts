import type { Rec } from './recurrence';

export type Role = 'owner' | 'editor' | 'viewer';
export type InviteRole = Exclude<Role, 'owner'>;

export interface User {
  id: string;
  email: string;
  display_name: string;
  is_verified: boolean;
}

export interface Calendar {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  role: Role;
  member_count: number;
  created_at: string;
}

export interface Member {
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
}

export interface Invitation {
  id: string;
  email: string;
  role: InviteRole;
  expires_at: string;
  created_at: string;
}

export interface InvitationDetails {
  calendar_name: string;
  role: InviteRole;
  email: string;
  invited_by_name: string | null;
}

export interface BookingIn {
  title: string;
  date: string;
  start: string;
  end: string;
  rec: Rec;
  until?: string | null;
}

export interface Booking {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  rec: Rec;
  until: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface Conflict {
  booking: Booking;
  dates: string[];
}

export interface CalendarRef {
  id: string;
  name: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Verwalten',
  editor: 'Bearbeiten',
  viewer: 'Nur ansehen',
};

export const ROLE_HINT: Record<Role, string> = {
  owner: 'Darf alles, auch Mitglieder einladen und den Kalender löschen',
  editor: 'Darf Buchungen anlegen und eigene löschen',
  viewer: 'Sieht alle Buchungen, ändert nichts',
};
