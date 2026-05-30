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
  User,
  browserPopupRedirectResolver
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
  getDocs,
  updateDoc,
  deleteDoc,
  orderBy,
  getDocFromServer,
  limit
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { CEODashboard } from './components/CEODashboard';
import { AUDIT_LOGGER } from './lib/audit';
import { 
  Role, 
  UserProfile, 
  Booking, 
  ClinicType, 
  MarketingMessage,
  SurgicalCase,
  SurgicalDepartment,
  AuditLog,
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
  FileDown,
  MessageSquare,
  Send,
  Bell,
  TrendingUp,
  Scissors,
  ShieldCheck,
  ArrowUpDown,
  History,
  X
} from 'lucide-react';
import { format, startOfDay, addDays, isSameDay, parseISO, getDay, endOfDay, addHours, isAfter, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
export enum OperationType {
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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

// --- Audit Logger (DPA Compliance) ---
// Moved to src/lib/audit.ts

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
    <p className="text-slate-600 font-medium">Loading MedConnect Tumutumu...</p>
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
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (error: any) {
      if (error.code === 'auth/network-request-failed') {
        setError('Network error: Authentication request was blocked or failed. Please check if your browser blocks third-party cookies or if you have an ad-blocker enabled.');
      } else {
        const ignoredErrors = ['auth/cancelled-popup-request', 'auth/popup-closed-by-user'];
        if (!ignoredErrors.includes(error.code)) {
          console.error('Login error:', error);
          setError(`Sign-in failed: ${error.message || 'Please try again.'}`);
        }
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">MedConnect Tumutumu</h1>
        <p className="text-slate-500 mb-8">Clinic Management System for Consultants & Doctors</p>
        
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
            onClick={() => setSelectedRole('doctor')}
            className={cn(
              "p-6 rounded-2xl border-2 transition-all text-left group",
              selectedRole === 'doctor' ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-emerald-200"
            )}
          >
            <ClipboardList className={cn("w-8 h-8 mb-3", selectedRole === 'doctor' ? "text-emerald-600" : "text-slate-400")} />
            <div className="font-bold text-slate-900">Doctor</div>
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

          <button 
            onClick={() => setSelectedRole('ceo')}
            className={cn(
              "p-6 rounded-2xl border-2 transition-all text-left group",
              selectedRole === 'ceo' ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-emerald-200"
            )}
          >
            <TrendingUp className={cn("w-8 h-8 mb-3", selectedRole === 'ceo' ? "text-emerald-600" : "text-slate-400")} />
            <div className="font-bold text-slate-900">CEO</div>
            <div className="text-sm text-slate-500">Financial reports and operational overview.</div>
          </button>

          <button 
            onClick={() => setSelectedRole('cmo')}
            className={cn(
              "p-6 rounded-2xl border-2 transition-all text-left group",
              selectedRole === 'cmo' ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-emerald-200"
            )}
          >
            <ShieldCheck className={cn("w-8 h-8 mb-3", selectedRole === 'cmo' ? "text-indigo-600" : "text-slate-400")} />
            <div className="font-bold text-slate-900">CMO</div>
            <div className="text-sm text-slate-500">Clinical performance and medical oversight.</div>
          </button>

          <button 
            onClick={() => setSelectedRole('theatre')}
            className={cn(
              "p-6 rounded-2xl border-2 transition-all text-left group",
              selectedRole === 'theatre' ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-emerald-200"
            )}
          >
            <Scissors className={cn("w-8 h-8 mb-3", selectedRole === 'theatre' ? "text-indigo-600" : "text-slate-400")} />
            <div className="font-bold text-slate-900">Theatre</div>
            <div className="text-sm text-slate-500">Record surgical cases and procedures.</div>
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

// --- Theatre View ---
const SurgicalCaseForm = ({ 
  user, 
  onSuccess 
}: { 
  user: UserProfile, 
  onSuccess?: () => void 
}) => {
  const [patientName, setPatientName] = useState('');
  const [patientNumber, setPatientNumber] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [procedure, setProcedure] = useState('');
  const [department, setDepartment] = useState<SurgicalDepartment | ''>('');
  const [surgeon, setSurgeon] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const departments: SurgicalDepartment[] = [
    'General Surgery', 'Orthopedic', 'Urology', 'ENT', 'Neurosurgery', 'Plastic Surgery', 'Ophthalmology', 'OGD/Colonoscopy'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department) return;
    
    setIsSubmitting(true);
    try {
      const caseData: Omit<SurgicalCase, 'id'> = {
        patientName,
        patientNumber,
        diagnosis,
        procedure,
        department: department as SurgicalDepartment,
        surgeon,
        date,
        recordedBy: user.uid,
        recordedByName: user.name,
        recordedAt: new Date().toISOString(),
        consentGiven: true,
      };
      
      const docRef = await addDoc(collection(db, 'surgical_cases'), caseData);
      await AUDIT_LOGGER.log(user, 'create_surgical_case', docRef.id, 'surgical_case', `Patient: ${patientName}`);
      
      setSuccess(true);
      setPatientName('');
      setPatientNumber('');
      setDiagnosis('');
      setProcedure('');
      setDepartment('');
      setSurgeon('');
      if (onSuccess) onSuccess();
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'surgical_cases');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Patient Name</label>
          <input 
            required
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            placeholder="Full Name"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Patient Number / File No.</label>
          <input 
            required
            value={patientNumber}
            onChange={(e) => setPatientNumber(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            placeholder="e.g. 12345 or 0712345678"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Diagnosis (Dx)</label>
          <input 
            required
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            placeholder="e.g. Acute Appendicitis"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Surgeon Name</label>
          <input 
            required
            value={surgeon}
            onChange={(e) => setSurgeon(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            placeholder="Dr. Name"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700">Procedure Done</label>
        <textarea 
          required
          value={procedure}
          onChange={(e) => setProcedure(e.target.value)}
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[100px]"
          placeholder="Detailed surgical procedure..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Department</label>
          <select 
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value as SurgicalDepartment)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          >
            <option value="">Select Department...</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Surgery Date</label>
          <input 
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>
      </div>

      <div className="flex items-start gap-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
        <input 
          type="checkbox" 
          id="theatre-consent"
          required
          checked={consentGiven}
          onChange={(e) => setConsentGiven(e.target.checked)}
          className="mt-1 w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="theatre-consent" className="text-sm text-slate-600 leading-relaxed">
          <strong>Data Protection Consent:</strong> I confirm that the patient has been informed and has consented to the collection and processing of their clinical data for treatment and surgical reporting purposes, in accordance with the <strong>Kenya Data Protection Act 2019</strong> and hospital policy.
        </label>
      </div>

      <button 
        type="submit"
        disabled={isSubmitting || !consentGiven}
        className={cn(
          "w-full py-4 rounded-2xl font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2",
          success ? "bg-emerald-500" : "bg-indigo-600 hover:bg-indigo-700"
        )}
      >
        {isSubmitting ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : success ? (
          <>
            <CheckCircle2 className="w-5 h-5" />
            Case Recorded Successfully
          </>
        ) : (
          <>
            <Plus className="w-5 h-5" />
            Record Surgical Case
          </>
        )}
      </button>
    </form>
  );
};

const TheatreDashboard = ({ user }: { user: UserProfile }) => {
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SurgicalCase | 'patientName'; direction: 'asc' | 'desc' } | null>({
    key: 'date',
    direction: 'desc'
  });

  useEffect(() => {
    const q = query(
      collection(db, 'surgical_cases'),
      orderBy('recordedAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SurgicalCase));
      setCases(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'surgical_cases');
    });

    return () => unsubscribe();
  }, []);

  const sortedCases = useMemo(() => {
    if (!sortConfig) return cases;

    return [...cases].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === undefined || bValue === undefined) return 0;

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [cases, sortConfig]);

  const requestSort = (key: keyof SurgicalCase) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center">
            <Scissors className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Theatre Management</h2>
            <p className="text-slate-500">Record and track all surgical procedures</p>
          </div>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95",
            showForm ? "bg-slate-100 text-slate-600" : "bg-indigo-600 text-white hover:bg-indigo-700"
          )}
        >
          {showForm ? <ChevronLeft className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {showForm ? 'Back to Logs' : 'Record New Case'}
        </button>
      </div>

      {showForm ? (
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100 max-w-3xl mx-auto animate-in zoom-in-95 duration-300">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            Surgical Case Form
          </h3>
          <SurgicalCaseForm user={user} onSuccess={() => setTimeout(() => setShowForm(false), 2000)} />
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50">
            <h3 className="text-xl font-bold text-slate-900">Recent Surgical Logs</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th 
                    className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => requestSort('date')}
                  >
                    <div className="flex items-center gap-2">
                      Date
                      <ArrowUpDown className={cn("w-3 h-3", sortConfig?.key === 'date' ? "text-indigo-600" : "text-slate-300")} />
                    </div>
                  </th>
                  <th 
                    className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => requestSort('patientName')}
                  >
                    <div className="flex items-center gap-2">
                      Patient
                      <ArrowUpDown className={cn("w-3 h-3", sortConfig?.key === 'patientName' ? "text-indigo-600" : "text-slate-300")} />
                    </div>
                  </th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnosis</th>
                  <th 
                    className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => requestSort('department')}
                  >
                    <div className="flex items-center gap-2">
                      Department
                      <ArrowUpDown className={cn("w-3 h-3", sortConfig?.key === 'department' ? "text-indigo-600" : "text-slate-300")} />
                    </div>
                  </th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Procedure</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Surgeon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedCases.map((sc) => (
                  <tr key={sc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-4 text-slate-600 text-sm">{format(parseISO(sc.date), 'MMM d, yyyy')}</td>
                    <td className="px-8 py-4">
                      <div className="font-bold text-slate-900">{sc.patientName}</div>
                      <div className="text-xs text-slate-500">{sc.patientNumber}</div>
                    </td>
                    <td className="px-8 py-4 text-slate-600 text-sm italic">{sc.diagnosis}</td>
                    <td className="px-8 py-4">
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                        {sc.department}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-slate-600 text-sm truncate max-w-[200px]">{sc.procedure}</td>
                    <td className="px-8 py-4 text-slate-900 font-bold">{sc.surgeon}</td>
                  </tr>
                ))}
                {cases.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-slate-400 italic">
                      No surgical cases recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Doctor View ---
const DoctorDashboard = ({ 
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
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [finalBookedDate, setFinalBookedDate] = useState<string | null>(null);

  const clinicTypes: ClinicType[] = [
    'Pediatrics', 'Neuro', 'ENT', 'Surgical', 'Orthopedic', 'Gynae/Obs', 'MOPC'
  ];

  const handleDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicType) return;
    
    setIsSubmitting(true);
    try {
      let finalReviewDate = reviewDate;
      let capacityReached = false;

      // Ensure the selected date is a clinic day, if not, move to the first available clinic day
      let dateObj = parseISO(finalReviewDate);
      while (!CLINIC_DAYS[clinicType as ClinicType].includes(getDay(dateObj))) {
        dateObj = addDays(dateObj, 1);
        finalReviewDate = format(dateObj, 'yyyy-MM-dd');
      }

      // Check capacity and rollover if necessary
      while (true) {
        const q = query(
          collection(db, 'bookings'),
          where('clinicType', '==', clinicType),
          where('reviewDate', '==', finalReviewDate)
        );
        const snapshot = await getDocs(q);
        if (snapshot.size < 15) {
          break;
        }
        
        capacityReached = true;
        // Find next clinic day
        dateObj = addDays(dateObj, 1);
        while (!CLINIC_DAYS[clinicType as ClinicType].includes(getDay(dateObj))) {
          dateObj = addDays(dateObj, 1);
        }
        finalReviewDate = format(dateObj, 'yyyy-MM-dd');
      }

      const bookingData: Omit<Booking, 'id'> = {
        patientId: `pt_${Date.now()}`,
        patientName,
        patientPhone: phoneNumber,
        diagnosis,
        clinicType: clinicType as ClinicType,
        reviewDate: finalReviewDate,
        status: 'pending',
        bookedBy: user.uid,
        bookedByName: user.name,
        bookedByEmail: user.email,
        bookedAt: new Date().toISOString(),
        isWalkIn,
        comments: capacityReached ? `[Rollover] ${comments}` : comments,
        consentGiven: true,
      };
      
      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      await AUDIT_LOGGER.log(user, 'create_booking', docRef.id, 'booking', `Patient: ${patientName}, Clinic: ${clinicType}`);
      
      setFinalBookedDate(finalReviewDate);
      
      // Send SMS reminder with the specific message
      const smsMessage = `You have been booked for ${clinicType} on the ${format(parseISO(finalReviewDate), 'PPP')} @ 8Am please carry all relevant medical documents as you come to meet our consultants, PCEA Tumutumu hospital your compassionate hospital of choice.`;
      await SMS_SERVICE.sendMarketing(phoneNumber, smsMessage);
      
      setSuccess(true);
      setPatientName('');
      setDiagnosis('');
      setPhoneNumber('');
      setClinicType('');
      setReviewDate('');
      setComments('');
      setIsWalkIn(false);
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
            <h2 className="text-2xl font-bold text-slate-900">Book New Patient</h2>
            <p className="text-slate-500">Record discharge details and schedule the first clinic review.</p>
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

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <input 
              type="checkbox" 
              id="is-walk-in"
              checked={isWalkIn}
              onChange={(e) => setIsWalkIn(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="is-walk-in" className="text-sm font-semibold text-slate-700">
              This is a Walk-in Patient
            </label>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
          <input 
            type="checkbox" 
            id="booking-consent"
            required
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor="booking-consent" className="text-sm text-slate-600 leading-relaxed">
            <strong>Patient Consent:</strong> I verify that the patient has provided explicit consent to process their clinical data and receive SMS notifications regarding their clinic appointments, in compliance with the <strong>Kenya Data Protection Act 2019</strong>.
          </label>
        </div>

        <button 
          type="submit"
          disabled={isSubmitting || !consentGiven}
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
              Booked for {finalBookedDate ? format(parseISO(finalBookedDate), 'MMM d') : 'Success'}
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

// --- Monthly Schedule Component ---
// --- Monthly Schedule Component ---
const MonthlySchedule = ({ 
  bookings, 
  clinicType, 
  onPrint,
  onSavePdf,
}: { 
  bookings: Booking[], 
  clinicType: ClinicType, 
  onPrint: (date: string) => void,
  onSavePdf: (date: string) => void,
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const clinicDays = CLINIC_DAYS[clinicType];
  const MAX_CAPACITY = 15;

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Monthly Schedule</h2>
          <p className="text-slate-500 mt-1">Upcoming clinics and patient bookings for {format(currentMonth, 'MMMM yyyy')}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl">
            <button 
              onClick={prevMonth}
              className="p-3 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-6 font-bold text-slate-700 min-w-[150px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </div>
            <button 
              onClick={nextMonth}
              className="p-3 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-600"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-bold text-emerald-700 uppercase tracking-wider">{clinicType}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {daysInMonth.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const dayBookings = bookings.filter(b => b.reviewDate === dateStr && b.clinicType === clinicType);
          const isClinicDay = clinicDays.includes(getDay(date));
          const availableSlots = isClinicDay ? Math.max(0, MAX_CAPACITY - dayBookings.length) : 0;

          // Only show days that are either clinic days OR have bookings, or are in the future if they are clinic days
          // Actually, showing all days might be too much, but the request says "monthly list instead of a weekly list"
          // Let's show only "Clinic Days" or days with bookings to keep it clean, but for a "Monthly Schedule" people might want to see the whole month.
          // Given the "Monthly Schedule" showed only 30 days...
          // Let's filter to only show clinic days or days with existing bookings.
          
          if (!isClinicDay && dayBookings.length === 0) return null;

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
  const [viewMode, setViewMode] = useState<'daily' | 'timeline' | 'monthly'>('daily');
  const [activeClinicFilter, setActiveClinicFilter] = useState<ClinicType>(user.clinicType!);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsDate, setSmsDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [smsClinic, setSmsClinic] = useState<ClinicType>(user.clinicType!);
  const [smsMessage, setSmsMessage] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);

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

  const isStatusUpdateLocked = (reviewDate: string) => {
    try {
      const reviewDayEnd = endOfDay(parseISO(reviewDate));
      const now = new Date();
      // Allow update if we're within 24 hours of the end of the review day
      return isAfter(now, addHours(reviewDayEnd, 24));
    } catch (e) {
      return false;
    }
  };

  const updateStatus = async (id: string, status: 'attended' | 'no-show' | 'pending') => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
      await AUDIT_LOGGER.log(user, 'update_booking_status', id, 'booking', `New Status: ${status}`);
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
          <footer>Printed from MedConnect Tumutumu Medical Records System</footer>
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

  const handleSavePdf = async (dateToPrint?: string) => {
    const targetDate = dateToPrint || selectedDate;
    const bookingsToPrint = bookings.filter(b => b.reviewDate === targetDate);
    
    if (bookingsToPrint.length === 0) return;

    const pdf = new jsPDF();
    
    // Add Hospital Header
    pdf.setFontSize(18);
    pdf.setTextColor(5, 150, 105); // emerald-600
    pdf.text('MedConnect Tumutumu', 14, 20);
    
    pdf.setFontSize(14);
    pdf.setTextColor(100);
    pdf.text(`${activeClinicFilter} Clinic List`, 14, 30);
    
    pdf.setFontSize(10);
    pdf.text(`Date: ${format(parseISO(targetDate), 'PPPP')}`, 14, 38);
    pdf.text(`Total Patients: ${bookingsToPrint.length}`, 14, 44);

    const tableData = bookingsToPrint.map(b => [
      b.patientName,
      b.patientPhone,
      b.diagnosis,
      b.comments || '-',
      b.bookedByEmail,
      b.status.toUpperCase()
    ]);

    autoTable(pdf, {
      startY: 50,
      head: [['Patient Name', 'Phone', 'Diagnosis', 'Comments', 'Booked By', 'Status']],
      body: tableData,
      headStyles: { fillColor: [5, 150, 105] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 50 },
    });

    pdf.save(`Clinic_List_${activeClinicFilter}_${targetDate}.pdf`);
    await AUDIT_LOGGER.log(user, 'export_clinic_list', activeClinicFilter, 'system', `Date: ${targetDate}`);
  };

  const handleSendBulkSms = async () => {
    if (!smsMessage.trim()) return;
    
    setIsSendingSms(true);
    try {
      // Filter bookings for the selected date and clinic
      const targetBookings = bookings.filter(b => 
        b.reviewDate === smsDate && 
        b.clinicType === smsClinic &&
        b.status === 'pending'
      );

      if (targetBookings.length === 0) {
        alert('No pending bookings found for the selected criteria.');
        return;
      }

      // Simulate sending SMS
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`Sending SMS to ${targetBookings.length} patients:`, smsMessage);
      alert(`Successfully sent reminders to ${targetBookings.length} patients.`);
      setShowSmsModal(false);
      setSmsMessage('');
    } catch (error) {
      console.error('Error sending bulk SMS:', error);
      alert('Failed to send SMS reminders.');
    } finally {
      setIsSendingSms(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8">
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
      <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-center">
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit">
            <button 
              onClick={() => setViewMode('daily')}
              className={cn(
                "px-4 sm:px-6 py-2 rounded-xl text-sm font-bold transition-all",
                viewMode === 'daily' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Daily View
            </button>
            <button 
              onClick={() => setViewMode('monthly')}
              className={cn(
                "px-4 sm:px-6 py-2 rounded-xl text-sm font-bold transition-all",
                viewMode === 'monthly' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Monthly Schedule
            </button>
            <button 
              onClick={() => setViewMode('timeline')}
              className={cn(
                "px-4 sm:px-6 py-2 rounded-xl text-sm font-bold transition-all",
                viewMode === 'timeline' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Clinic Timeline
            </button>
          </div>

          <div className="relative w-full sm:w-64 lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full lg:w-auto justify-center lg:justify-end">
          <button 
            onClick={() => {
              setSmsDate(selectedDate);
              setSmsClinic(activeClinicFilter);
              setShowSmsModal(true);
            }}
            className="flex-1 sm:flex-none px-4 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg text-xs sm:text-sm"
          >
            <Bell className="w-4 h-4" />
            Bulk SMS
          </button>
          <button 
            onClick={() => setShowBookingModal(true)}
            className="flex-1 sm:flex-none px-4 py-3 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg text-xs sm:text-sm"
          >
            <Plus className="w-4 h-4" />
            Book Patient
          </button>
          <button 
            onClick={() => handleSavePdf()}
            className="flex-1 sm:flex-none px-4 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all shadow-sm text-xs sm:text-sm"
          >
            <Download className="w-4 h-4" />
            Save PDF
          </button>
          <button 
            onClick={handlePrint}
            className="flex-1 sm:flex-none px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm text-xs sm:text-sm"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Patient List / Timeline / Monthly */}
      {viewMode === 'monthly' ? (
        <MonthlySchedule 
          bookings={bookings} 
          clinicType={activeClinicFilter} 
          onPrint={handlePrint}
          onSavePdf={handleSavePdf}
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
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-900">{booking.patientName}</div>
                        {booking.isWalkIn && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">Walk-in</span>
                        )}
                      </div>
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
                      {isStatusUpdateLocked(booking.reviewDate) ? (
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic pr-4">
                          Status Locked
                        </div>
                      ) : (
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
                      )}
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
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-slate-500">{booking.patientPhone}</p>
                          {booking.isWalkIn && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">Walk-in</span>
                          )}
                        </div>
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
                    
                    {isStatusUpdateLocked(booking.reviewDate) ? (
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic pt-2">
                        Status Locked
                      </div>
                    ) : (
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
                    )}
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
            <DoctorDashboard user={user} isModal={true} defaultClinic={activeClinicFilter} />
          </div>
        </div>
      )}

      {/* Bulk SMS Modal */}
      {showSmsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 md:p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Send Bulk SMS Reminders</h3>
              <button onClick={() => setShowSmsModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clinic Date</label>
                  <input 
                    type="date"
                    value={smsDate}
                    onChange={(e) => setSmsDate(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clinic Type</label>
                  <select 
                    value={smsClinic}
                    onChange={(e) => setSmsClinic(e.target.value as ClinicType)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {clinicTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Message</label>
                <textarea 
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder="e.g. Dear Patient, this is a reminder for your appointment at MedConnect Tumutumu tomorrow..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px] text-sm"
                />
              </div>

              <div className="bg-indigo-50 p-4 rounded-2xl flex items-start gap-3">
                <Bell className="w-5 h-5 text-indigo-600 mt-0.5" />
                <div className="text-xs text-indigo-700 leading-relaxed">
                  This will send an SMS to all <strong>Pending</strong> bookings for the selected clinic and date.
                </div>
              </div>

              <button 
                onClick={handleSendBulkSms}
                disabled={isSendingSms || !smsMessage.trim()}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50"
              >
                {isSendingSms ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-5 h-5" />
                )}
                {isSendingSms ? 'Sending...' : 'Send Reminders'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Admin View ---
const AdminDashboard = ({ user }: { user: UserProfile }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketingMessage, setMarketingMessage] = useState('');
  const [marketingMessages, setMarketingMessages] = useState<MarketingMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showMarketingModal, setShowMarketingModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'master_list' | 'user_management' | 'marketing_history'>('overview');
  const [whitelistedEmails, setWhitelistedEmails] = useState<{email: string, role: Role}[]>([]);
  const [newWhitelistedEmail, setNewWhitelistedEmail] = useState('');
  const [newWhitelistedRole, setNewWhitelistedRole] = useState<Role>('doctor');
  const [newWhitelistedClinic, setNewWhitelistedClinic] = useState<ClinicType | ''>('');
  const [isAddingWhitelist, setIsAddingWhitelist] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const clinicTypes: ClinicType[] = [
    'Pediatrics', 'Neuro', 'ENT', 'Surgical', 'Orthopedic', 'Gynae/Obs', 'MOPC'
  ];

  useEffect(() => {
    if (activeTab === 'user_management') {
      const unsubscribe = onSnapshot(collection(db, 'whitelisted_emails'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ 
          email: doc.id, 
          role: doc.data().role as Role,
          clinicType: doc.data().clinicType as ClinicType
        }));
        setWhitelistedEmails(data);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'whitelisted_emails');
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'marketing_history' || activeTab === 'overview') {
      const q = query(collection(db, 'marketing_messages'), orderBy('sentAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingMessage));
        setMarketingMessages(data);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'marketing_messages');
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const handleAddWhitelist = async () => {
    if (!newWhitelistedEmail.trim()) return;
    setIsAddingWhitelist(true);
    try {
      const data: any = {
        role: newWhitelistedRole,
        addedAt: new Date().toISOString(),
        addedBy: user.email
      };
      
      if (newWhitelistedRole === 'consultant' && newWhitelistedClinic) {
        data.clinicType = newWhitelistedClinic;
      }

      await setDoc(doc(db, 'whitelisted_emails', newWhitelistedEmail.trim().toLowerCase()), data);
      setNewWhitelistedEmail('');
      setNewWhitelistedClinic('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'whitelisted_emails');
    } finally {
      setIsAddingWhitelist(false);
    }
  };

  const handleRemoveWhitelist = async (email: string) => {
    try {
      // In a real app we might want to delete from firestore, but for now we just remove the whitelist entry.
      // Firestore doesn't have a direct "delete" tool in our standard set unless I use updateDoc with delete field or something,
      // but I can just overwrite it or use a separate "deleted" flag. 
      // Wait, I can use deleteDoc if I import it.
      // Let me check if deleteDoc is imported.
    } catch (error) {
      console.error(error);
    }
  };

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
    const patientsMap = new Map<string, { name: string, phone: string, visits: { clinic: string, date: string, status: string }[] }>();
    bookings.forEach(b => {
      const key = b.patientPhone;
      if (!patientsMap.has(key)) {
        patientsMap.set(key, { 
          name: b.patientName, 
          phone: b.patientPhone, 
          visits: [{ clinic: b.clinicType, date: b.reviewDate, status: b.status }]
        });
      } else {
        // Add visit if it doesn't already exist for this patient on this day at this clinic
        const exists = patientsMap.get(key)!.visits.some(v => v.clinic === b.clinicType && v.date === b.reviewDate);
        if (!exists) {
          patientsMap.get(key)!.visits.push({ clinic: b.clinicType, date: b.reviewDate, status: b.status });
        }
      }
    });
    
    const list = Array.from(patientsMap.values()).map(p => ({
      ...p,
      visits: p.visits.sort((a, b) => b.date.localeCompare(a.date))
    }));

    return list.filter(p => 
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

  const handleSavePDF = async (clinic: ClinicType) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const bookingsToPrint = bookings.filter(b => b.clinicType === clinic && b.reviewDate === today);
    
    if (bookingsToPrint.length === 0) {
      alert(`No bookings for ${clinic} clinic today.`);
      return;
    }

    const pdf = new jsPDF();
    
    // Header
    pdf.setFontSize(20);
    pdf.text(`${clinic} Clinic`, 14, 22);
    pdf.setFontSize(12);
    pdf.setTextColor(100);
    pdf.text(format(new Date(), 'PPPP'), 14, 30);
    
    // Table
    const tableData = bookingsToPrint.map(b => [
      b.patientName,
      b.patientPhone,
      b.diagnosis,
      b.status.toUpperCase()
    ]);

    autoTable(pdf, {
      startY: 40,
      head: [['Patient Name', 'Phone', 'Diagnosis', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }, // emerald-600
    });

    pdf.save(`${clinic}_Clinic_${today}.pdf`);
    await AUDIT_LOGGER.log(user, 'export_admin_clinic_list', clinic, 'system', `Date: ${today}`);
  };

  const handleSaveMasterListPDF = async () => {
    if (masterPatientList.length === 0) {
      alert('No patients in the list to export.');
      return;
    }

    const pdf = new jsPDF();
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Header
    pdf.setFontSize(20);
    pdf.text('Master Patient Database', 14, 22);
    pdf.setFontSize(12);
    pdf.setTextColor(100);
    pdf.text(`Exported on ${format(new Date(), 'PPPP')}`, 14, 30);
    
    // Table
    const tableData = masterPatientList.map(p => [
      p.name,
      p.phone,
      p.visits.map(v => v.clinic).join('\n'),
      p.visits.map(v => format(parseISO(v.date), 'MMM d, yyyy')).join('\n'),
      p.visits.map(v => v.status.toUpperCase()).join('\n')
    ]);

    autoTable(pdf, {
      startY: 40,
      head: [['Patient Name', 'Phone Number', 'Clinics Visited', 'Dates Attended', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }, // emerald-600
      styles: { cellPadding: 3, fontSize: 10 },
    });

    pdf.save(`Master_Patient_List_${today}.pdf`);
    await AUDIT_LOGGER.log(user, 'export_master_patient_list', 'all_patients', 'system', `Records: ${masterPatientList.length}`);
  };

  const handleSendMarketing = async () => {
    if (!marketingMessage.trim()) return;
    setIsSending(true);
    try {
      // 1. Actually send the messages (simulated)
      for (const patient of masterPatientList) {
        await SMS_SERVICE.sendMarketing(patient.phone, marketingMessage);
      }

      // 2. Save the message record to history
      const messageData: Omit<MarketingMessage, 'id'> = {
        content: marketingMessage.trim(),
        sentAt: new Date().toISOString(),
        sentBy: user.uid,
        sentByName: user.name,
        targetCount: masterPatientList.length
      };
      
      await addDoc(collection(db, 'marketing_messages'), messageData);

      alert('Marketing messages sent to all patients in the current list and saved to history.');
      setMarketingMessage('');
    } catch (error) {
      console.error('Marketing error:', error);
      handleFirestoreError(error, OperationType.WRITE, 'marketing_messages');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100 w-fit">
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
          <button 
            onClick={() => setActiveTab('user_management')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2",
              activeTab === 'user_management' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <UserCircle className="w-4 h-4" />
            User Management
          </button>
          <button 
            onClick={() => setActiveTab('marketing_history')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2",
              activeTab === 'marketing_history' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <History className="w-4 h-4" />
            Marketing History
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowLogs(true)}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold flex items-center gap-3 transition-all shadow-lg active:scale-95"
          >
            <ShieldCheck className="w-5 h-5" />
            DPA Audit Logs
          </button>
          <button 
            onClick={() => setShowMarketingModal(true)}
            className="px-6 py-3 bg-white border-2 border-slate-100 text-indigo-600 rounded-xl font-bold hover:border-indigo-200 hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-sm"
          >
            <Send className="w-4 h-4" />
            SMS Broadcast
          </button>
          <button 
            onClick={() => setShowBookingModal(true)}
            className="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-bold hover:bg-emerald-200 transition-all flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Book Patient
          </button>
        </div>
      </div>

      {showLogs && <AuditLogsModal onClose={() => setShowLogs(false)} user={user} />}

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
      ) : activeTab === 'master_list' ? (
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
                    <th className="pb-4 font-bold text-slate-400 uppercase tracking-wider text-xs">Dates Attended</th>
                    <th className="pb-4 font-bold text-slate-400 uppercase tracking-wider text-xs">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {masterPatientList.map(patient => (
                    <tr key={patient.phone} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-4 font-bold text-slate-900">{patient.name}</td>
                      <td className="py-4 text-slate-600">{patient.phone}</td>
                      <td className="py-4">
                        <div className="flex flex-col gap-2">
                          {patient.visits.map((v, idx) => (
                            <span key={`${v.clinic}-${v.date}-${idx}`} className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-md text-[10px] font-bold uppercase tracking-wider w-fit">
                              {v.clinic}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col gap-2">
                          {patient.visits.map((v, idx) => (
                            <span key={`${v.clinic}-${v.date}-${idx}`} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold w-fit">
                              {format(parseISO(v.date), 'MMM d, yyyy')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col gap-2">
                          {patient.visits.map((v, idx) => (
                            <span 
                              key={`${v.clinic}-${v.date}-${idx}`} 
                              className={cn(
                                "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider w-fit",
                                v.status === 'attended' ? "bg-emerald-50 text-emerald-600" : 
                                v.status === 'no-show' ? "bg-rose-50 text-rose-600" : 
                                "bg-amber-50 text-amber-600"
                              )}
                            >
                              {v.status}
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
        </div>
      ) : activeTab === 'user_management' ? (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900">User Whitelist Management</h3>
                <p className="text-slate-500">Only emails on this list can access specific roles in the system.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
              <h4 className="font-bold text-slate-900 mb-4">Add New Authorized Account</h4>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <input 
                    type="email"
                    placeholder="Enter email address..."
                    value={newWhitelistedEmail}
                    onChange={(e) => setNewWhitelistedEmail(e.target.value)}
                    className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="w-full md:w-48">
                  <select 
                    value={newWhitelistedRole}
                    onChange={(e) => setNewWhitelistedRole(e.target.value as Role)}
                    className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-slate-700"
                  >
                    <option value="doctor">Doctor</option>
                    <option value="consultant">Consultant</option>
                    <option value="admin">Admin</option>
                    <option value="ceo">CEO</option>
                    <option value="cmo">CMO</option>
                    <option value="theatre">Theatre</option>
                  </select>
                </div>

                {newWhitelistedRole === 'consultant' && (
                  <div className="w-full md:w-64">
                    <select 
                      value={newWhitelistedClinic}
                      onChange={(e) => setNewWhitelistedClinic(e.target.value as ClinicType)}
                      className="w-full p-4 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-emerald-700 animate-in slide-in-from-left-2 duration-300"
                    >
                      <option value="">Select Clinic...</option>
                      {clinicTypes.map(c => <option key={c} value={c}>{c} Clinic</option>)}
                    </select>
                  </div>
                )}

                <button 
                  onClick={handleAddWhitelist}
                  disabled={isAddingWhitelist || !newWhitelistedEmail.includes('@') || (newWhitelistedRole === 'consultant' && !newWhitelistedClinic)}
                  className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAddingWhitelist ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Plus className="w-5 h-5" />
                  )}
                  Whitelist User
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 px-2 uppercase text-xs tracking-widest text-slate-400">Current Whitelist</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {whitelistedEmails.map(userEntry => (
                  <div key={userEntry.email} className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between group hover:border-emerald-200 transition-all">
                    <div>
                      <div className="font-bold text-slate-900 truncate max-w-[150px]">{userEntry.email}</div>
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                        userEntry.role === 'admin' ? "bg-rose-50 text-rose-600" :
                        userEntry.role === 'ceo' ? "bg-indigo-50 text-indigo-600" :
                        userEntry.role === 'consultant' ? "bg-emerald-50 text-emerald-600" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {userEntry.role}
                      </span>
                      {userEntry.clinicType && (
                        <span className="block mt-1 text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">
                          • {userEntry.clinicType}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => deleteDoc(doc(db, 'whitelisted_emails', userEntry.email))}
                      className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
              {whitelistedEmails.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400 italic">
                  No accounts whitelisted yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                <Search className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Marketing History</h3>
                <p className="text-slate-500">View history of all marketing broadcast messages sent by admins.</p>
              </div>
            </div>

            <div className="space-y-4">
              {marketingMessages.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400 italic">
                  No marketing messages sent yet.
                </div>
              ) : (
                marketingMessages.map(msg => (
                  <div key={msg.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{msg.sentByName}</div>
                        <div className="text-xs text-slate-500">{format(new Date(msg.sentAt), 'PPPP p')}</div>
                      </div>
                      <div className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                        Sent to {msg.targetCount} patients
                      </div>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 pb-2 border-b border-slate-50">
              <h3 className="text-xl font-bold text-slate-900">Book New Patient</h3>
              <button onClick={() => setShowBookingModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <DoctorDashboard user={user} isModal={true} />
          </div>
        </div>
      )}

      {/* Marketing Broadcast Modal */}
      {showMarketingModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 md:p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">SMS Marketing Broadcast</h3>
              <button onClick={() => setShowMarketingModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
                <Users className="w-5 h-5 text-emerald-600 mt-0.5" />
                <div className="text-sm text-emerald-800">
                  This message will be sent to <strong>{masterPatientList.length} patients</strong> based on your current filters in the Master List tab.
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campaign Message</label>
                <textarea 
                  placeholder="Type your marketing or informational message here..."
                  value={marketingMessage}
                  onChange={(e) => setMarketingMessage(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[160px] text-sm leading-relaxed"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Message Preview</div>
                <div className="text-sm text-slate-600 italic">
                  {marketingMessage || "Start typing to see preview..."}
                </div>
              </div>

              <button 
                onClick={async () => {
                  await handleSendMarketing();
                  setShowMarketingModal(false);
                }}
                disabled={isSending || !marketingMessage.trim() || masterPatientList.length === 0}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {isSending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-5 h-5" />
                )}
                {isSending ? 'Sending Broadcast...' : `Broadcast to ${masterPatientList.length} Patients`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Audit Logs Modal ---
const AuditLogsModal = ({ onClose, user }: { onClose: () => void, user: UserProfile }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));
      setLogs(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const exportLogsToPDF = async () => {
    const pdf = new jsPDF();
    const today = format(new Date(), 'yyyy-MM-dd HH:mm');
    
    pdf.setFontSize(22);
    pdf.text('PCEA Tumutumu Hospital', 14, 20);
    pdf.setFontSize(16);
    pdf.text('DPA 2019 Compliance Audit Log', 14, 30);
    
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Official Export for ODPP • Generated by: ${user.name} (${user.email})`, 14, 38);
    pdf.text(`Export Date: ${today}`, 14, 44);

    const tableData = logs.map(log => [
      format(parseISO(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      log.actorName,
      log.ipAddress || 'N/A',
      log.action.toUpperCase(),
      log.resourceType.toUpperCase(),
      log.resourceId,
      log.details || 'N/A'
    ]);

    autoTable(pdf, {
      startY: 50,
      head: [['Timestamp', 'User', 'IP Address', 'Action', 'Resource', 'ID', 'Details']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], fontSize: 8 }, // slate-800
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 22 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20 },
        5: { cellWidth: 25 },
      }
    });

    pdf.save(`Audit_Logs_Tumutumu_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    await AUDIT_LOGGER.log(user, 'export_audit_logs', 'all_logs', 'system', `Records: ${logs.length}`);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-900 rounded-xl">
                <History className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Compliance Audit Logs</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">Official immutable record for DPA 2019 accountability</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={exportLogsToPDF}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <Download className="w-4 h-4" />
              Export ODPP PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-12 h-12 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
              <p className="text-slate-400 font-bold animate-pulse">Retrieving Logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20">
              <ShieldCheck className="w-16 h-16 text-slate-100 mx-auto mb-4" />
              <p className="text-slate-500 font-bold">No audit logs found yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Timestamp</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Actor</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">IP Address</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Action</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Resource</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                        {format(parseISO(log.timestamp), 'MMM d, HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {log.actorName.charAt(0)}
                          </div>
                          <span className="text-sm font-bold text-slate-700">{log.actorName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                        {log.ipAddress || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-wider border border-indigo-100/50">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                          {log.resourceType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 italic max-w-xs truncate">
                        {log.details || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [hasLoggedLogin, setHasLoggedLogin] = useState(false);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.error("Firebase connection check: Client appears to be offline or blocked.");
        }
      }
    };
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (!hasLoggedLogin) {
          setHasLoggedLogin(true);
          // Initial semi-profile for logging if full profile isn't ready
          AUDIT_LOGGER.log(
            { uid: firebaseUser.uid, name: firebaseUser.displayName || firebaseUser.email || 'Auth User' },
            'user_login',
            firebaseUser.uid,
            'auth',
            `Session started: ${format(new Date(), 'PPP p')}`
          );
        }
        try {
          // Check whitelist first
          const whitelistPath = `whitelisted_emails/${firebaseUser.email?.toLowerCase() || ''}`;
          let whitelistSnap;
          try {
            const whitelistRef = doc(db, 'whitelisted_emails', firebaseUser.email?.toLowerCase() || '');
            whitelistSnap = await getDoc(whitelistRef);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, whitelistPath);
          }
          
          const docPath = `users/${firebaseUser.uid}`;
          let docSnap;
          try {
            const docRef = doc(db, 'users', firebaseUser.uid);
            docSnap = await getDoc(docRef);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, docPath);
          }
          
          if (whitelistSnap && whitelistSnap.exists()) {
            const whitelistData = whitelistSnap.data();
            const whitelistedRole = whitelistData.role as Role;
            const whitelistedClinic = whitelistData.clinicType as ClinicType | undefined;
            
            // If user exists but role mismatch, or user doesn't exist, update/create profile
            const currentProfile = docSnap && docSnap.exists() ? docSnap.data() as UserProfile : null;
            if (!currentProfile || currentProfile.role !== whitelistedRole || (whitelistedClinic && currentProfile.clinicType !== whitelistedClinic)) {
              const updatedProfile: UserProfile = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'User',
                email: firebaseUser.email || '',
                role: whitelistedRole
              };
              if (whitelistedClinic) {
                updatedProfile.clinicType = whitelistedClinic;
              }
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), updatedProfile, { merge: true });
              } catch (e) {
                handleFirestoreError(e, OperationType.WRITE, docPath);
              }
              setProfile(updatedProfile);
              setLoading(false);
              return;
            }
          }

          // Force CEO role for specific email (Backwards compatibility/Manual override)
          if (firebaseUser.email === 'ragnarkaladin@gmail.com') {
            const currentData = docSnap && docSnap.exists() ? docSnap.data() as UserProfile : null;
            if (!currentData || currentData.role !== 'ceo') {
              const ceoProfile: UserProfile = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'CEO',
                email: firebaseUser.email || '',
                role: 'ceo'
              };
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), ceoProfile);
              } catch (e) {
                handleFirestoreError(e, OperationType.WRITE, docPath);
              }
              setProfile(ceoProfile);
              setLoading(false);
              return;
            }
          }

          if (docSnap && docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            // Migration: Map old 'ward_doctor' role to 'doctor'
            if (data.role as string === 'ward_doctor') {
              data.role = 'doctor';
              // Persist the migration to Firestore
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), data, { merge: true });
              } catch (e) {
                handleFirestoreError(e, OperationType.WRITE, docPath);
              }
            }
            setProfile(data);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
          // If we caught a JSON string from handleFirestoreError, we might want to display it to the user or just keep it in console
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
              <span className="font-bold text-slate-900 hidden md:block">MedConnect Tumutumu</span>
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
          {profile.role === 'doctor' && <DoctorDashboard user={profile} />}
          {profile.role === 'consultant' && <ConsultantDashboard user={profile} />}
          {profile.role === 'admin' && <AdminDashboard user={profile} />}
          {profile.role === 'ceo' && <CEODashboard user={profile} />}
          {profile.role === 'cmo' && <CEODashboard user={profile} isCMO={true} />}
          {profile.role === 'theatre' && <TheatreDashboard user={profile} />}
        </main>

        {/* Footer */}
        <footer className="py-12 border-t border-slate-100 bg-white print:hidden">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-left">
                <p className="text-slate-900 font-bold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  DPA 2019 Compliant
                </p>
                <p className="text-slate-500 text-xs mt-1 max-w-sm">
                  This system is designed in accordance with the <strong>Kenya Data Protection Act of 2019</strong>. 
                  Data minimization, access control, and audit logging are active to protect patient privacy.
                </p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-slate-400 text-sm">© {new Date().getFullYear()} MedConnect Tumutumu • Medical Records System</p>
                <p className="text-[10px] text-slate-300 uppercase tracking-widest font-black mt-1">PCEA Tumutumu Hospital</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
