export type Role = 'doctor' | 'consultant' | 'admin' | 'ceo' | 'theatre' | 'cmo';

export type SurgicalDepartment = 
  | 'General Surgery' 
  | 'Orthopedic' 
  | 'Urology' 
  | 'ENT' 
  | 'Neurosurgery' 
  | 'Plastic Surgery' 
  | 'Ophthalmology' 
  | 'OGD/Colonoscopy';

export interface SurgicalCase {
  id: string;
  patientName: string;
  patientNumber: string; // Phone or File Number
  diagnosis: string;
  procedure: string;
  department: SurgicalDepartment;
  surgeon: string;
  date: string; // ISO date string
  recordedBy: string; // uid
  recordedByName: string;
  recordedAt: string; // ISO date-time string
  consentGiven: boolean; // DPA compliance
}

export type ClinicType = 
  | 'Pediatrics' 
  | 'Neuro' 
  | 'ENT' 
  | 'Surgical' 
  | 'Orthopedic' 
  | 'Gynae/Obs' 
  | 'MOPC';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: Role;
  clinicType?: ClinicType;
}

export interface Patient {
  id: string;
  name: string;
  phoneNumber: string;
  diagnosis: string;
}

export interface Booking {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  diagnosis: string;
  clinicType: ClinicType;
  reviewDate: string; // ISO date string
  status: 'pending' | 'attended' | 'no-show';
  bookedBy: string; // uid
  bookedByName: string; // name of the person who booked
  bookedByEmail: string; // email of the person who booked
  bookedAt: string; // ISO date-time string
  comments?: string;
  consentGiven: boolean; // DPA compliance
}

export interface MarketingMessage {
  id: string;
  content: string;
  sentAt: string;
  sentBy: string;
  sentByName: string;
  targetCount: number;
}

export interface WhitelistedEmail {
  email: string;
  role: Role;
  clinicType?: ClinicType;
}

export const CLINIC_DAYS: Record<ClinicType, number[]> = {
  'Pediatrics': [1, 3], // Mon, Wed
  'Neuro': [1], // Mon
  'ENT': [2], // Tue
  'Surgical': [1], // Mon
  'Orthopedic': [3], // Wed
  'Gynae/Obs': [2, 3], // Tue, Wed
  'MOPC': [3, 5], // Wed, Fri
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  resourceId: string;
  resourceType: 'booking' | 'surgical_case' | 'user' | 'marketing' | 'auth' | 'system';
  timestamp: string;
  details?: string;
}
