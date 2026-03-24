/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc,
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  Role, 
  UserProfile, 
  Booking, 
  ClinicType, 
  CLINIC_DAYS, 
  DAY_NAMES 
} from './types';
import { 
  LayoutDashboard, 
  LogOut, 
  UserCircle, 
  Calendar, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Printer, 
  Plus,
  Download,
  Search,
  ChevronRight,
  ChevronLeft,
  Stethoscope,
  ClipboardList,
  AlertCircle,
  FileDown
} from 'lucide-react';
import { format, startOfDay, addDays, isSameDay, parseISO, getDay } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Connection Test ---
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

// --- SMS Infrastructure (Placeholder) ---
const SMS_SERVICE = {
  apiKey: '', // To be added later
  senderId: '', // To be added later
  sendReminder: async (phone: string, patientName: string, date: string, clinic: string) => {
    console.log(`[SMS Infrastructure] Sending reminder to ${phone} for ${patientName} on ${date} at ${clinic} clinic.`);
    // Implementation will go here
    return true;
  },
  sendMarketing: async (phone: string, message: string) => {
    console.log(`[SMS Infrastructure] Sending marketing message to ${phone}: ${message}`);
    // Implementation will go here
    return true;
  }
};

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setErrorMessage(event.error?.message || 'An unexpected error occurred.');
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <XCircle className="w-8 h-8" />
            <h2 className="text-xl font-bold">System Error</h2>
          </div>
          <p className="text-gray-600 mb-6 font-mono text-sm bg-gray-50 p-4 rounded-lg break-all">
            {errorMessage}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const LoadingScreen = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
    <p className="text-slate-600 font-medium">Loading PCEA Tumutumu Clinic Manager...</p>
  </div>
);

const Login = () => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsultantLogin, setShowConsultantLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      const ignoredErrors = ['auth/cancelled-popup-request', 'auth/popup-closed-by-user'];
      if (!ignoredErrors.includes(error.code)) {
        console.error('Login error:', error);
        setError(`Sign-in failed: ${error.message || 'Please try again.'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConsultantLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Tumutumu' && username.toLowerCase().includes('clinic')) {
      handleGoogleLogin();
    } else {
      setError('Invalid clinic name or password. Use "Clinic Name" and "Tumutumu".');
    }
  };

  if (showConsultantLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-100">
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Consultant Login</h1>
          <p className="text-slate-500 mb-8 text-center">Enter your clinic credentials to proceed</p>
          
          <form onSubmit={handleConsultantLogin} className="space-y-4">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100 mb-4 animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Clinic Name (Username)</label>
              <input 
                type="text" 
                placeholder="e.g. MOPC Clinic"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <input 
                type="password" 
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                required
              />
            </div>

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              {isLoggingIn ? 'Verifying...' : 'Login to Dashboard'}
            </button>

            <button 
              type="button"
              onClick={() => setShowConsultantLogin(false)}
              className="w-full py-2 text-slate-500 text-sm font-medium hover:text-slate-700 transition-colors"
            >
              Back to main login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-100 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Stethoscope className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Tumutumu Hospital</h1>
        <p className="text-slate-500 mb-8">Clinic Management System for Consultants & Ward Doctors</p>
        
        <div className="space-y-4">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100 mb-4 animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}
          
          <button 
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
          >
            {isLoggingIn ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            )}
            {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">Consultant Access</span></div>
          </div>

          <button 
            onClick={() => setShowConsultantLogin(true)}
            className="w-full py-4 bg-white border-2 border-slate-100 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-3 hover:border-emerald-200 hover:bg-emerald-50 transition-all active:scale-[0.98]"
          >
            <Users className="w-5 h-5 text-emerald-600" />
            Clinic Login
          </button>
        </div>
      </div>
    </div>
  );
};

const RoleSelection = ({ onSelect }: { onSelect: (role: Role, clinicType?: ClinicType) => void }) => {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<ClinicType | ''>('');

  const clinicTypes: ClinicType[] = [
    'Pediatrics', 'Neuro', 'ENT', 'Surgical', 'Orthopedic', 'Gynae/Obs', 'MOPC'
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 overflow-y-auto">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-slate-100 my-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">Complete Your Profile</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button 
            onClick={() => setSelectedRole('ward_doctor')}
            className={cn(
              "p-6 rounded-2xl border-2 transition-all text-left group",
              selectedRole === 'ward_doctor' ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-emerald-200"
            )}
          >
            <ClipboardList className={cn("w-8 h-8 mb-3", selectedRole === 'ward_doctor' ? "text-emerald-600" : "text-slate-400")} />
            <div className="font-bold text-slate-900">Ward Doctor</div>
            <div className="text-sm text-slate-500">Record reviews and book clinics.</div>
          </button>
          
          <button 
            onClick={() => setSelectedRole('consultant')}
            className={cn(
              "p-6 rounded-2xl border-2 transition-all text-left group",
              selectedRole === 'consultant' ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-emerald-200"
            )}
          >
            <Users className={cn("w-8 h-8 mb-3", selectedRole === 'consultant' ? "text-emerald-600" : "text-slate-400")} />
            <div className="font-bold text-slate-900">Consultant</div>
            <div className="text-sm text-slate-500">Manage your clinics and track attendance.</div>
          </button>

          <button 
            onClick={() => setSelectedRole('admin')}
            className={cn(
              "p-6 rounded-2xl border-2 transition-all text-left group",
              selectedRole === 'admin' ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-emerald-200"
            )}
          >
            <LayoutDashboard className={cn("w-8 h-8 mb-3", selectedRole === 'admin' ? "text-emerald-600" : "text-slate-400")} />
            <div className="font-bold text-slate-900">Admin</div>
            <div className="text-sm text-slate-500">Full access to all clinics and patient data.</div>
          </button>
        </div>

        {selectedRole === 'consultant' && (
          <div className="mb-8 animate-in fade-in slide-in-from-top-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Your Clinic Specialization</label>
            <select 
              value={selectedClinic}
              onChange={(e) => setSelectedClinic(e.target.value as ClinicType)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              <option value="">Choose a clinic...</option>
              {clinicTypes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <button 
          disabled={!selectedRole || (selectedRole === 'consultant' && !selectedClinic)}
          onClick={() => selectedRole && onSelect(selectedRole, selectedClinic || undefined)}
          className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Get Started
        </button>
      </div>
    </div>
  );
};

// --- Ward Doctor View ---
const WardDoctorDashboard = ({ 
  user, 
  isModal = false, 
  defaultClinic 
}: { 
  user: UserProfile, 
  isModal?: boolean,
  defaultClinic?: ClinicType
}) => {
  const [patientName, setPatientName] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [clinicType, setClinicType] = useState<ClinicType | ''>(defaultClinic || '');
  const [reviewDate, setReviewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const clinicTypes: ClinicType[] = [
    'Pediatrics', 'Neuro', 'ENT', 'Surgical', 'Orthopedic', 'Gynae/Obs', 'MOPC'
  ];

  const handleDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicType) return;
    
    setIsSubmitting(true);
    try {
      const bookingData: Omit<Booking, 'id'> = {
        patientId: `pt_${Date.now()}`,
        patientName,
        patientPhone: phoneNumber,
        diagnosis,
        clinicType: clinicType as ClinicType,
        reviewDate,
        status: 'pending',
        bookedBy: user.uid,
        bookedByName: user.name,
        bookedByEmail: user.email,
        bookedAt: new Date().toISOString(),
        comments,
      };
      
      await addDoc(collection(db, 'bookings'), bookingData);
      
      // Send SMS reminder
      await SMS_SERVICE.sendReminder(phoneNumber, patientName, reviewDate, clinicType);
      
      setSuccess(true);
      setPatientName('');
      setDiagnosis('');
      setPhoneNumber('');
      setClinicType('');
      setReviewDate('');
      setComments('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <>
      {!isModal && (
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Discharge Review</h2>
            <p className="text-slate-500">Record patient details and schedule their first clinic review.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleDischarge} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Patient Name</label>
            <input 
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="Full Name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Phone Number</label>
            <input 
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="Phone Number"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Diagnosis</label>
          <textarea 
            required
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[100px]"
            placeholder="Primary diagnosis and discharge notes..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Clinic Type</label>
            <select 
              required
              value={clinicType}
              onChange={(e) => setClinicType(e.target.value as ClinicType)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              <option value="">Select Clinic...</option>
              {clinicTypes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Review Date</label>
            <input 
              required
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Comments / Special Instructions</label>
          <textarea 
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[80px]"
            placeholder="Any extra notes for the consultant..."
          />
        </div>

        <button 
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "w-full py-4 rounded-2xl font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2",
            success ? "bg-emerald-500" : "bg-slate-900 hover:bg-slate-800"
          )}
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : success ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Discharge Recorded
            </>
          ) : (
            "Record Discharge & Book Clinic"
          )}
        </button>
      </form>
    </>
  );

  if (isModal) return content;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        {content}
      </div>
    </div>
  );
};

// --- Weekly Schedule Component ---
// --- Weekly Schedule Component ---
const WeeklySchedule = ({ 
  bookings, 
  clinicType, 
  onPrint,
  onSavePdf,
  onClinicChange,
  clinicTypes
}: { 
  bookings: Booking[], 
  clinicType: ClinicType, 
  onPrint: (date: string) => void,
  onSavePdf: (date: string) => void,
  onClinicChange: (type: ClinicType) => void,
  clinicTypes: ClinicType[]
}) => {
  const next7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));
  }, []);

  const clinicDays = CLINIC_DAYS[clinicType];
  const MAX_CAPACITY = 20;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Weekly Schedule</h2>
          <p className="text-slate-500 mt-1">Upcoming clinics and patient bookings for the next 7 days</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-full sm:w-auto">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Filter Clinic</label>
            <select 
              value={clinicType}
              onChange={(e) => onClinicChange(e.target.value as ClinicType)}
              className="w-full sm:w-64 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
            >
              {clinicTypes.map(type => (
                <option key={type} value={type}>{type} Clinic</option>
              ))}
            </select>
          </div>
          
          <div className="hidden sm:block h-10 w-[1px] bg-slate-100"></div>
          
          <div className="flex items-center gap-3 bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-bold text-emerald-700 uppercase tracking-wider">{clinicType}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {next7Days.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const dayBookings = bookings.filter(b => b.reviewDate === dateStr && b.clinicType === clinicType);
          const isClinicDay = clinicDays.includes(getDay(date));
          const availableSlots = isClinicDay ? Math.max(0, MAX_CAPACITY - dayBookings.length) : 0;

          return (
            <div 
              key={dateStr}
              className={cn(
                "group relative bg-white rounded-[2.5rem] overflow-hidden border transition-all duration-300",
                isClinicDay 
                  ? "border-slate-100 shadow-lg hover:shadow-2xl hover:-translate-y-1" 
                  : "border-slate-50 opacity-50 grayscale-[0.5]"
              )}
            >
              {isClinicDay && (
                <div className="absolute top-0 left-0 w-2 h-full bg-emerald-600"></div>
              )}
              
              <div className="p-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div className="flex items-center gap-8">
                    <div className={cn(
                      "w-20 h-20 rounded-3xl flex flex-col items-center justify-center transition-transform group-hover:scale-105",
                      isClinicDay ? "bg-emerald-600 text-white shadow-xl shadow-emerald-100" : "bg-slate-100 text-slate-400"
                    )}>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">{format(date, 'EEE')}</span>
                      <span className="text-3xl font-black leading-none">{format(date, 'd')}</span>
                    </div>
                    
                    <div>
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">{format(date, 'MMMM do, yyyy')}</div>
                      <div className="flex items-center gap-3 mt-2">
                        {isClinicDay ? (
                          <span className="flex items-center gap-2 text-emerald-600 font-black bg-emerald-50 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border border-emerald-100">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active Clinic
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-slate-400 font-black bg-slate-50 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border border-slate-100">
                            <XCircle className="w-3.5 h-3.5" /> No Clinic Scheduled
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-400">•</span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                          {dayBookings.length} Patients Booked
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-8">
                    {isClinicDay && (
                      <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="text-right">
                          <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Capacity</div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full transition-all duration-1000",
                                  (dayBookings.length / MAX_CAPACITY) > 0.8 ? "bg-red-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(100, (dayBookings.length / MAX_CAPACITY) * 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-black text-slate-700">{dayBookings.length}/{MAX_CAPACITY}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      {dayBookings.length > 0 && (
                        <>
                          <button 
                            onClick={() => onSavePdf(dateStr)}
                            className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all shadow-sm active:scale-95 text-xs uppercase tracking-widest"
                            title="Save as PDF"
                          >
                            <Download className="w-4 h-4" />
                            PDF
                          </button>
                          <button 
                            onClick={() => onPrint(dateStr)}
                            className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-95 text-xs uppercase tracking-widest"
                          >
                            <Printer className="w-4 h-4" />
                            Print List
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {isClinicDay && dayBookings.length > 0 ? (
                  <div className="mt-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
                    {dayBookings.map((b, idx) => (
                      <div 
                        key={b.id} 
                        className="flex items-start gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100 hover:border-emerald-300 hover:bg-white transition-all duration-300 group/item"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-lg font-black text-emerald-600 border border-emerald-100 group-hover/item:bg-emerald-600 group-hover/item:text-white transition-all shadow-sm">
                          {b.patientName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-base font-bold text-slate-900 truncate">{b.patientName}</div>
                            <span className={cn(
                              "text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter",
                              b.status === 'attended' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                            )}>
                              {b.status}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-2">
                            {b.patientPhone}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest line-clamp-1 bg-white/50 px-2 py-1 rounded-lg border border-slate-100">
                            {b.diagnosis}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : isClinicDay ? (
                  <div className="mt-10 p-12 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <Users className="w-8 h-8 text-slate-200" />
                    </div>
                    <div className="text-slate-400 font-bold">No patients booked for this clinic day yet.</div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Consultant View ---
const ConsultantDashboard = ({ user }: { user: UserProfile }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [viewMode, setViewMode] = useState<'daily' | 'timeline' | 'weekly'>('daily');
  const [activeClinicFilter, setActiveClinicFilter] = useState<ClinicType>(user.clinicType!);

  const clinicTypes: ClinicType[] = [
    'Pediatrics', 'Neuro', 'ENT', 'Surgical', 'Orthopedic', 'Gynae/Obs', 'MOPC'
  ];

  useEffect(() => {
    // We fetch all bookings for the selected clinic filter
    const q = query(
      collection(db, 'bookings'),
      where('clinicType', '==', activeClinicFilter),
      orderBy('reviewDate', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    return () => unsubscribe();
  }, [activeClinicFilter]);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const matchesSearch = b.patientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            b.diagnosis.toLowerCase().includes(searchQuery.toLowerCase());
      if (viewMode === 'daily') {
        return b.reviewDate === selectedDate && matchesSearch;
      }
      return matchesSearch;
    });
  }, [bookings, selectedDate, searchQuery, viewMode]);

  const groupedBookings = useMemo(() => {
    if (viewMode !== 'timeline') return [];
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const groups: { date: string, bookings: Booking[] }[] = [];
    
    // Sort logic: Today first, then future (asc), then past (desc)
    const sorted = [...filteredBookings].sort((a, b) => {
      if (a.reviewDate === today && b.reviewDate === today) return 0;
      if (a.reviewDate === today) return -1;
      if (b.reviewDate === today) return 1;
      
      const isAFuture = a.reviewDate > today;
      const isBFuture = b.reviewDate > today;
      
      if (isAFuture && !isBFuture) return -1;
      if (!isAFuture && isBFuture) return 1;
      
      if (isAFuture && isBFuture) {
        return a.reviewDate.localeCompare(b.reviewDate);
      }
      
      // Both are past
      return b.reviewDate.localeCompare(a.reviewDate);
    });
    
    sorted.forEach(booking => {
      const existing = groups.find(g => g.date === booking.reviewDate);
      if (existing) {
        existing.bookings.push(booking);
      } else {
        groups.push({ date: booking.reviewDate, bookings: [booking] });
      }
    });
    
    return groups;
  }, [filteredBookings, viewMode]);

  const dailyBookings = useMemo(() => {
    return bookings.filter(b => b.reviewDate === selectedDate);
  }, [bookings, selectedDate]);

  const stats = useMemo(() => {
    const today = bookings.filter(b => b.reviewDate === format(new Date(), 'yyyy-MM-dd'));
    return {
      total: today.length,
      attended: today.filter(b => b.status === 'attended').length,
      noShow: today.filter(b => b.status === 'no-show').length,
      pending: today.filter(b => b.status === 'pending').length,
    };
  }, [bookings]);

  const updateStatus = async (id: string, status: 'attended' | 'no-show' | 'pending') => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${id}`);
    }
  };

  const handlePrint = (dateToPrint?: string) => {
    const targetDate = dateToPrint || selectedDate;
    const bookingsToPrint = bookings.filter(b => b.reviewDate === targetDate);
    
    if (bookingsToPrint.length === 0) return;

    let html = `
      <html>
        <head>
          <title>${activeClinicFilter} Clinic - ${targetDate}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; }
            h1 { margin-bottom: 5px; }
            h2 { color: #666; margin-top: 0; }
            p { font-size: 14px; color: #888; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { border: 1px solid #ddd; padding: 12px; text-align: left; background: #f4f4f4; font-weight: bold; text-transform: uppercase; font-size: 12px; }
            td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            footer { margin-top: 40px; border-top: 1px solid #eee; padding-top: 10px; font-size: 10px; color: #aaa; text-align: center; }
            @media print {
              footer { position: fixed; bottom: 0; width: 100%; }
            }
          </style>
        </head>
        <body>
          <h1>${activeClinicFilter} Clinic</h1>
          <h2>${format(parseISO(targetDate), 'PPPP')}</h2>
          <p>Total Patients: ${bookingsToPrint.length}</p>
          <table>
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>Phone</th>
                <th>Diagnosis</th>
                <th>Comments</th>
                <th>Booked By (Email)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
    `;

    bookingsToPrint.forEach(b => {
      html += `
        <tr>
          <td><strong>${b.patientName}</strong></td>
          <td>${b.patientPhone}</td>
          <td>${b.diagnosis}</td>
          <td>${b.comments || '-'}</td>
          <td>${b.bookedByEmail}</td>
          <td>${b.status.toUpperCase()}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          <footer>Printed from PCEA Tumutumu Hospital Medical Records System</footer>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const handleSavePdf = (dateToPrint?: string) => {
    const targetDate = dateToPrint || selectedDate;
    const bookingsToPrint = bookings.filter(b => b.reviewDate === targetDate);
    
    if (bookingsToPrint.length === 0) return;

    const doc = new jsPDF();
    
    // Add Hospital Header
    doc.setFontSize(18);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text('PCEA Tumutumu Hospital', 14, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text(`${activeClinicFilter} Clinic List`, 14, 30);
    
    doc.setFontSize(10);
    doc.text(`Date: ${format(parseISO(targetDate), 'PPPP')}`, 14, 38);
    doc.text(`Total Patients: ${bookingsToPrint.length}`, 14, 44);

    const tableData = bookingsToPrint.map(b => [
      b.patientName,
      b.patientPhone,
      b.diagnosis,
      b.comments || '-',
      b.bookedByEmail,
      b.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Patient Name', 'Phone', 'Diagnosis', 'Comments', 'Booked By', 'Status']],
      body: tableData,
      headStyles: { fillColor: [5, 150, 105] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 50 },
    });

    doc.save(`Clinic_List_${activeClinicFilter}_${targetDate}.pdf`);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex flex-col justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-1">{activeClinicFilter} Clinic</h2>
            <p className="text-slate-500 mb-6">Managing patients for {format(parseISO(selectedDate), 'PPPP')}</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), -1), 'yyyy-MM-dd'))}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button 
              onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="bg-emerald-600 rounded-3xl p-6 text-white shadow-xl flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <Users className="w-8 h-8 opacity-50" />
            <span className="text-sm font-bold bg-emerald-500 px-2 py-1 rounded-lg">Today</span>
          </div>
          <div>
            <div className="text-4xl font-bold mb-1">{stats.total}</div>
            <div className="text-emerald-100 text-sm font-medium uppercase tracking-wider">Total Booked</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold text-slate-400 uppercase tracking-wider">Status</div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-bold text-slate-600">{stats.attended}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-xs font-bold text-slate-600">{stats.noShow}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${(stats.attended / (stats.total || 1)) * 100}%` }}></div>
              <div className="h-full bg-red-500" style={{ width: `${(stats.noShow / (stats.total || 1)) * 100}%` }}></div>
            </div>
            <div className="text-xs text-slate-400 font-medium">Attendance Rate: {Math.round((stats.attended / (stats.total || 1)) * 100)}%</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          <button 
            onClick={() => setViewMode('daily')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              viewMode === 'daily' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Daily View
          </button>
          <button 
            onClick={() => setViewMode('weekly')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              viewMode === 'weekly' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Weekly Schedule
          </button>
          <button 
            onClick={() => setViewMode('timeline')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              viewMode === 'timeline' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Clinic Timeline
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patients..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
          />
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={() => setShowBookingModal(true)}
            className="flex-1 md:flex-none px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg text-sm"
          >
            <Plus className="w-4 h-4" />
            Book Patient
          </button>
          <button 
            onClick={() => handleSavePdf()}
            className="flex-1 md:flex-none px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all shadow-sm text-sm"
          >
            <Download className="w-4 h-4" />
            Save PDF
          </button>
          <button 
            onClick={handlePrint}
            className="flex-1 md:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm text-sm"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Patient List / Timeline / Weekly */}
      {viewMode === 'weekly' ? (
        <WeeklySchedule 
          bookings={bookings} 
          clinicType={activeClinicFilter} 
          onPrint={handlePrint}
          onSavePdf={handleSavePdf}
          onClinicChange={setActiveClinicFilter}
          clinicTypes={clinicTypes}
        />
      ) : viewMode === 'daily' ? (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-bottom border-slate-100">
                  <th className="p-6 text-sm font-bold text-slate-500 uppercase tracking-wider">Patient Details</th>
                  <th className="p-6 text-sm font-bold text-slate-500 uppercase tracking-wider">Diagnosis & Comments</th>
                  <th className="p-6 text-sm font-bold text-slate-500 uppercase tracking-wider">Booked By</th>
                  <th className="p-6 text-sm font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="p-6 text-sm font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBookings.length > 0 ? filteredBookings.map(booking => (
                  <tr key={booking.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-6">
                      <div className="font-bold text-slate-900">{booking.patientName}</div>
                      <div className="text-sm text-slate-500">{booking.patientPhone}</div>
                    </td>
                    <td className="p-6">
                      <div className="text-sm text-slate-700 max-w-xs line-clamp-1 font-semibold">{booking.diagnosis}</div>
                      {booking.comments && (
                        <div className="text-xs text-slate-500 mt-1 italic line-clamp-1">"{booking.comments}"</div>
                      )}
                    </td>
                    <td className="p-6">
                      <div className="text-xs font-bold text-slate-600">{booking.bookedByEmail}</div>
                      <div className="text-[10px] text-slate-400">{format(parseISO(booking.bookedAt), 'MMM d, HH:mm')}</div>
                    </td>
                    <td className="p-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                        booking.status === 'attended' ? "bg-emerald-100 text-emerald-700" :
                        booking.status === 'no-show' ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      )}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => updateStatus(booking.id, 'attended')}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            booking.status === 'attended' ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600"
                          )}
                          title="Mark Attended"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => updateStatus(booking.id, 'no-show')}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            booking.status === 'no-show' ? "bg-red-500 text-white" : "bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600"
                          )}
                          title="Mark No-Show"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => updateStatus(booking.id, 'pending')}
                          className="p-2 bg-slate-100 text-slate-400 rounded-lg hover:bg-amber-100 hover:text-amber-600 transition-all"
                          title="Reset to Pending"
                        >
                          <Calendar className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Calendar className="w-12 h-12 opacity-20" />
                        <p className="font-medium">No patients booked for this date.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedBookings.length > 0 ? groupedBookings.map((group, idx) => (
            <div key={group.date} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${idx * 50}ms` }}>
              <div className="flex items-center gap-4 mb-4">
                <div className="h-px flex-1 bg-slate-200"></div>
                <div className="flex items-center gap-3">
                  <div className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {format(parseISO(group.date), 'EEEE, MMM do yyyy')}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleSavePdf(group.date)}
                      className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 rounded-lg transition-all shadow-sm"
                      title="Save as PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handlePrint(group.date)}
                      className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 rounded-lg transition-all shadow-sm"
                      title="Print this day's list"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="h-px flex-1 bg-slate-200"></div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.bookings.map(booking => (
                  <div key={booking.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden">
                    <div className={cn(
                      "absolute top-0 right-0 w-1 h-full",
                      booking.status === 'attended' ? "bg-emerald-500" :
                      booking.status === 'no-show' ? "bg-red-500" :
                      "bg-amber-500"
                    )}></div>
                    
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-slate-900">{booking.patientName}</h4>
                        <p className="text-xs text-slate-500">{booking.patientPhone}</p>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-tighter",
                        booking.status === 'attended' ? "bg-emerald-50 text-emerald-600" :
                        booking.status === 'no-show' ? "bg-red-50 text-red-600" :
                        "bg-amber-50 text-amber-600"
                      )}>
                        {booking.status}
                      </span>
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-2 line-clamp-2 italic">"{booking.diagnosis}"</p>
                    {booking.comments && (
                      <p className="text-[10px] text-emerald-600 font-bold mb-4 bg-emerald-50 p-2 rounded-lg line-clamp-2">
                        Note: {booking.comments}
                      </p>
                    )}
                    <div className="text-[10px] text-slate-400 mb-4 flex justify-between">
                      <span className="truncate flex-1 mr-2">By: {booking.bookedByEmail}</span>
                      <span>{format(parseISO(booking.bookedAt), 'MMM d')}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateStatus(booking.id, 'attended')}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-xs font-bold transition-all",
                          booking.status === 'attended' ? "bg-emerald-500 text-white" : "bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                        )}
                      >
                        Attended
                      </button>
                      <button 
                        onClick={() => updateStatus(booking.id, 'no-show')}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-xs font-bold transition-all",
                          booking.status === 'no-show' ? "bg-red-500 text-white" : "bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        )}
                      >
                        No-Show
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )) : (
            <div className="bg-white rounded-3xl p-20 text-center border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">No upcoming clinics</h3>
              <p className="text-slate-500">There are no patients booked for any future dates yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Manual Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 pb-2 border-b border-slate-50">
              <h3 className="text-xl font-bold text-slate-900">Book New Patient</h3>
              <button onClick={() => setShowBookingModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <WardDoctorDashboard user={user} isModal={true} defaultClinic={activeClinicFilter} />
          </div>
        </div>
      )}
    </div>
  );
};

// --- Admin View ---
const AdminDashboard = ({ user }: { user: UserProfile }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'master_list'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [marketingMessage, setMarketingMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const clinicTypes: ClinicType[] = [
    'Pediatrics', 'Neuro', 'ENT', 'Surgical', 'Orthopedic', 'Gynae/Obs', 'MOPC'
  ];

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('reviewDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });
    return () => unsubscribe();
  }, []);

  const clinicStats = useMemo(() => {
    return clinicTypes.map(clinic => {
      const clinicBookings = bookings.filter(b => b.clinicType === clinic);
      const today = format(new Date(), 'yyyy-MM-dd');
      const todayCount = clinicBookings.filter(b => b.reviewDate === today).length;
      const totalCount = clinicBookings.length;
      return { clinic, todayCount, totalCount };
    });
  }, [bookings]);

  const masterPatientList = useMemo(() => {
    const patientsMap = new Map<string, { name: string, phone: string, clinics: Set<string> }>();
    bookings.forEach(b => {
      const key = b.patientPhone;
      if (!patientsMap.has(key)) {
        patientsMap.set(key, { name: b.patientName, phone: b.patientPhone, clinics: new Set([b.clinicType]) });
      } else {
        patientsMap.get(key)!.clinics.add(b.clinicType);
      }
    });
    return Array.from(patientsMap.values()).filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.phone.includes(searchQuery)
    );
  }, [bookings, searchQuery]);

  const handlePrintClinic = (clinic: ClinicType) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const bookingsToPrint = bookings.filter(b => b.clinicType === clinic && b.reviewDate === today);
    
    if (bookingsToPrint.length === 0) {
      alert(`No bookings for ${clinic} clinic today.`);
      return;
    }

    let html = `
      <html>
        <head>
          <title>${clinic} Clinic - ${today}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; }
            h1 { margin-bottom: 5px; }
            h2 { color: #666; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { border: 1px solid #ddd; padding: 12px; text-align: left; background: #f4f4f4; }
            td { border: 1px solid #ddd; padding: 12px; }
          </style>
        </head>
        <body>
          <h1>${clinic} Clinic</h1>
          <h2>${format(new Date(), 'PPPP')}</h2>
          <table>
            <thead>
              <tr><th>Patient Name</th><th>Phone</th><th>Diagnosis</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${bookingsToPrint.map(b => `
                <tr>
                  <td>${b.patientName}</td>
                  <td>${b.patientPhone}</td>
                  <td>${b.diagnosis}</td>
                  <td>${b.status.toUpperCase()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const handleSavePDF = (clinic: ClinicType) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const bookingsToPrint = bookings.filter(b => b.clinicType === clinic && b.reviewDate === today);
    
    if (bookingsToPrint.length === 0) {
      alert(`No bookings for ${clinic} clinic today.`);
      return;
    }

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text(`${clinic} Clinic`, 14, 22);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(format(new Date(), 'PPPP'), 14, 30);
    
    // Table
    const tableData = bookingsToPrint.map(b => [
      b.patientName,
      b.patientPhone,
      b.diagnosis,
      b.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Patient Name', 'Phone', 'Diagnosis', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }, // emerald-600
    });

    doc.save(`${clinic}_Clinic_${today}.pdf`);
  };

  const handleSaveMasterListPDF = () => {
    if (masterPatientList.length === 0) {
      alert('No patients in the list to export.');
      return;
    }

    const doc = new jsPDF();
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Header
    doc.setFontSize(20);
    doc.text('Master Patient Database', 14, 22);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Exported on ${format(new Date(), 'PPPP')}`, 14, 30);
    
    // Table
    const tableData = masterPatientList.map(p => [
      p.name,
      p.phone,
      Array.from(p.clinics).join(', ')
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Patient Name', 'Phone Number', 'Clinics Visited']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }, // emerald-600
    });

    doc.save(`Master_Patient_List_${today}.pdf`);
  };

  const handleSendMarketing = async () => {
    if (!marketingMessage.trim()) return;
    setIsSending(true);
    try {
      for (const patient of masterPatientList) {
        await SMS_SERVICE.sendMarketing(patient.phone, marketingMessage);
      }
      alert('Marketing messages sent to all patients in the current list.');
      setMarketingMessage('');
    } catch (error) {
      console.error('Marketing error:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-4 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-slate-100 w-fit">
        <button 
          onClick={() => setActiveTab('overview')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2",
            activeTab === 'overview' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <LayoutDashboard className="w-4 h-4" />
          Clinics Overview
        </button>
        <button 
          onClick={() => setActiveTab('master_list')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2",
            activeTab === 'master_list' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <Users className="w-4 h-4" />
          Master Patient List
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clinicStats.map(stat => (
            <div key={stat.clinic} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{stat.clinic} Clinic</h3>
                  <p className="text-sm text-slate-500">Daily Statistics</p>
                </div>
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-slate-400" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-emerald-50 p-4 rounded-2xl">
                  <div className="text-2xl font-bold text-emerald-600">{stat.todayCount}</div>
                  <div className="text-xs font-bold text-emerald-600/70 uppercase tracking-wider">Today</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <div className="text-2xl font-bold text-slate-600">{stat.totalCount}</div>
                  <div className="text-xs font-bold text-slate-600/70 uppercase tracking-wider">Total</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => handlePrintClinic(stat.clinic)}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
                <button 
                  onClick={() => handleSavePDF(stat.clinic)}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all"
                >
                  <FileDown className="w-4 h-4" />
                  Save PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-slate-900">Master Patient Database</h3>
                <button 
                  onClick={handleSaveMasterListPDF}
                  className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all flex items-center gap-2 text-xs font-bold"
                  title="Export to PDF"
                >
                  <FileDown className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
              <div className="relative w-full md:w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="pb-4 font-bold text-slate-400 uppercase tracking-wider text-xs">Patient Name</th>
                    <th className="pb-4 font-bold text-slate-400 uppercase tracking-wider text-xs">Phone Number</th>
                    <th className="pb-4 font-bold text-slate-400 uppercase tracking-wider text-xs">Clinics Visited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {masterPatientList.map(patient => (
                    <tr key={patient.phone} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-4 font-bold text-slate-900">{patient.name}</td>
                      <td className="py-4 text-slate-600">{patient.phone}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          {Array.from(patient.clinics).map(c => (
                            <span key={c} className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-md text-[10px] font-bold uppercase tracking-wider">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Marketing Campaign</h3>
            <p className="text-sm text-slate-500 mb-6">Send a bulk SMS message to all patients in the filtered list above.</p>
            
            <div className="space-y-4">
              <textarea 
                placeholder="Type your marketing message here..."
                value={marketingMessage}
                onChange={(e) => setMarketingMessage(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[120px]"
              />
              <button 
                onClick={handleSendMarketing}
                disabled={isSending || !marketingMessage.trim() || masterPatientList.length === 0}
                className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {isSending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                {isSending ? 'Sending Messages...' : `Send to ${masterPatientList.length} Patients`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const docRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleRoleSelect = async (role: Role, clinicType?: ClinicType) => {
    if (!user) return;
    const newProfile: UserProfile = {
      uid: user.uid,
      name: user.displayName || 'Anonymous',
      email: user.email || '',
      role,
    };
    
    if (clinicType) {
      newProfile.clinicType = clinicType;
    }

    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!user) return <Login />;
  if (!profile) return <RoleSelection onSelect={handleRoleSelect} />;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50">
        {/* Navigation */}
        <nav className="bg-white border-b border-slate-100 sticky top-0 z-40 print:hidden">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <span className="font-bold text-slate-900 hidden md:block">PCEA Tumutumu Clinic</span>
            </div>

            <div className="flex items-center gap-4 md:gap-6">
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm">
                  {profile.name[0]}
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-900">{profile.name}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                    {profile.role.replace('_', ' ')} {profile.clinicType ? `• ${profile.clinicType}` : ''}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => signOut(auth)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="Sign Out"
              >
                <LogOut className="w-6 h-6" />
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="py-8 print:hidden">
          {profile.role === 'ward_doctor' && <WardDoctorDashboard user={profile} />}
          {profile.role === 'consultant' && <ConsultantDashboard user={profile} />}
          {profile.role === 'admin' && <AdminDashboard user={profile} />}
        </main>

        {/* Footer */}
        <footer className="py-12 text-center text-slate-400 text-sm print:hidden">
          <p>© {new Date().getFullYear()} PCEA Tumutumu Hospital • Medical Records System</p>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
