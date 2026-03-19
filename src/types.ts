export type Role = 'ward_doctor' | 'consultant' | 'admin';

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
  bookedAt: string; // ISO date-time string
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
