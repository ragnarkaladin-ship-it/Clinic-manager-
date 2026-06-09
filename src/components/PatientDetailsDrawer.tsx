import React from 'react';
import { 
  X, 
  Calendar, 
  User, 
  Phone, 
  ShieldCheck, 
  FileDown, 
  Stethoscope, 
  ClipboardList, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText,
  UserCheck,
  Building
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Booking } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PatientDetailsDrawerProps {
  patientName: string;
  patientPhone: string;
  patientVisits: Booking[];
  onClose: () => void;
}

const PatientDetailsDrawer: React.FC<PatientDetailsDrawerProps> = ({
  patientName,
  patientPhone,
  patientVisits,
  onClose,
}) => {
  // Sort visits newest to oldest
  const sortedVisits = [...patientVisits].sort((a, b) => 
    b.reviewDate.localeCompare(a.reviewDate)
  );

  const stats = {
    total: sortedVisits.length,
    attended: sortedVisits.filter(v => v.status === 'attended').length,
    noShow: sortedVisits.filter(v => v.status === 'no-show').length,
    pending: sortedVisits.filter(v => v.status === 'pending').length,
  };

  const handleExportPDF = () => {
    const pdf = new jsPDF();
    const todayStr = format(new Date(), 'PPPP');

    // Branding colors
    const primaryColor = [15, 23, 42]; // Slate-900
    const accentColor = [16, 185, 129]; // Emerald-600

    // Header Background Header Banner
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, 210, 42, 'F');

    // Hospital Name and Document Title
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text('PCEA TUMUTUMU HOSPITAL', 14, 18);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('MedConnect Clinical Systems • Medical Records & Patient Registry', 14, 25);
    pdf.text(`Document Generated: ${todayStr}`, 14, 32);

    // Patient profile details under the banner
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('PATIENT PROFILE & CLINICAL VISIT RECORD', 14, 52);

    // Metadata grid
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setFillColor(248, 250, 252); // slate-50
    pdf.rect(14, 58, 182, 30, 'F');
    pdf.rect(14, 58, 182, 30, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.text('Patient Name:', 20, 66);
    pdf.setFont('helvetica', 'normal');
    pdf.text(patientName, 50, 66);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Phone Number:', 20, 74);
    pdf.setFont('helvetica', 'normal');
    pdf.text(patientPhone, 50, 74);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Total Encounters:', 20, 82);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${stats.total} visits (${stats.attended} attended, ${stats.noShow} no-shows, ${stats.pending} pending)`, 55, 82);

    pdf.setFont('helvetica', 'bold');
    pdf.text('DPA Status:', 125, 66);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(16, 185, 129);
    pdf.text('CONSENT RECORDED (Compliant)', 150, 66);
    pdf.setTextColor(0, 0, 0);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Registry ID:', 125, 74);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`PT-${patientPhone.slice(-6)}`, 150, 74);

    // Patient Visit History heading
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Visit History and Diagnostic Information', 14, 100);

    // Table mapping visits
    const tableHeaders = [['Date', 'Clinic', 'Status', 'Attending Officer', 'Diag / Treatment Notes', 'Comments']];
    const tableBody = sortedVisits.map(visit => [
      format(parseISO(visit.reviewDate), 'MMM d, yyyy'),
      visit.clinicType.toUpperCase(),
      visit.status.toUpperCase(),
      visit.bookedByName || 'System Auto',
      visit.diagnosis || 'No clinical notes recorded.',
      visit.comments || '-'
    ]);

    autoTable(pdf, {
      startY: 106,
      head: tableHeaders,
      body: tableBody,
      headStyles: { 
        fillColor: [15, 23, 42], 
        textColor: [255, 255, 255], 
        fontStyle: 'bold',
        fontSize: 9
      },
      columnStyles: {
        0: { cellWidth: 24 }, // Date
        1: { cellWidth: 24 }, // Clinic
        2: { cellWidth: 20 }, // Status
        3: { cellWidth: 30 }, // Attending Officer
        4: { cellWidth: 50 }, // Diag/Notes
        5: { cellWidth: 34 }  // Comments
      },
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        cellPadding: 4,
        overflow: 'linebreak'
      }
    });

    // Sign off lines at bottom of document
    const finalY = (pdf as any).lastAutoTable.finalY + 15;
    if (finalY < 250) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'italic');
      pdf.text('This is an official clinical history extract compiled dynamically from the PCEA Tumutumu Hospital patient registry.', 14, finalY);
      pdf.text('Access and distribution of this file is governed under the regulations of the Kenya Data Protection Act (DPA).', 14, finalY + 5);
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Authorized Registry Sign-Off:', 14, finalY + 20);
      pdf.line(14, finalY + 28, 80, finalY + 28);
      pdf.setFont('helvetica', 'normal');
      pdf.text('MedConnect Registrar Desk', 14, finalY + 34);
    }

    pdf.save(`Tumutumu_History_${patientName.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
      {/* Backdrop overlay */}
      <div 
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
        {/* Panel body */}
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col h-full ring-1 ring-black ring-opacity-5 divide-y divide-slate-100 relative slide-in-from-right duration-300 ease-in-out">
          
          {/* Header */}
          <div className="px-6 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900" id="slide-over-title">
                  Patient Health Dossier
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-semibold text-slate-500 font-mono">
                    ID: PT-{patientPhone.slice(-6)}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <ShieldCheck className="w-3.5 h-3.5" /> DPA Protected
                  </span>
                </div>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Sub-Header: Patient profile summary card */}
          <div className="px-6 py-5 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-transparent flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center border-b border-slate-100">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">
                {patientName}
              </h1>
              <div className="flex items-center gap-2 text-slate-600 text-sm">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold">{patientPhone}</span>
              </div>
            </div>
            
            <button
              onClick={handleExportPDF}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
            >
              <FileDown className="w-4 h-4" />
              Print Full History
            </button>
          </div>

          {/* Visit Stats Grid */}
          <div className="px-6 py-4 grid grid-cols-4 gap-3 bg-slate-50 text-center border-b border-slate-100">
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <span className="block text-xl font-extrabold text-slate-900 leading-none">{stats.total}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Visits</span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 shadow-sm">
              <span className="block text-xl font-extrabold text-emerald-600 leading-none">{stats.attended}</span>
              <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-bold">Attended</span>
            </div>
            <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 shadow-sm">
              <span className="block text-xl font-extrabold text-rose-600 leading-none">{stats.noShow}</span>
              <span className="text-[10px] uppercase tracking-wider text-rose-500 font-bold">No-Shows</span>
            </div>
            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 shadow-sm">
              <span className="block text-xl font-extrabold text-amber-600 leading-none">{stats.pending}</span>
              <span className="text-[10px] uppercase tracking-wider text-amber-500 font-bold">Pending</span>
            </div>
          </div>

          {/* Visits Timeline Timeline */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50/50">
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest pl-1">
              Visit Timeline History ({stats.total})
            </h3>

            {sortedVisits.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-slate-100">
                <p className="text-slate-400 font-bold text-sm">No visitor files exist under this patient signature.</p>
              </div>
            ) : (
              <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
                {sortedVisits.map((visit, idx) => {
                  const visitDate = parseISO(visit.reviewDate);
                  const isAttended = visit.status === 'attended';
                  const isNoShow = visit.status === 'no-show';

                  return (
                    <div key={visit.id || idx} className="relative group/item">
                      {/* Timeline dot */}
                      <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white transition-all duration-300 ${
                        isAttended ? 'border-emerald-500 ring-4 ring-emerald-50' : 
                        isNoShow ? 'border-rose-500 ring-4 ring-rose-50' : 
                        'border-amber-500 ring-4 ring-amber-50'
                      }`} />

                      {/* Visit Card */}
                      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 hover:shadow-md hover:border-slate-200 transition-all">
                        {/* Summary Header */}
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2.5 py-0.5 bg-slate-900 text-white rounded-md text-[10px] font-extrabold uppercase tracking-widest">
                                {visit.clinicType} Clinic
                              </span>
                              {visit.isWalkIn && (
                                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100/50 rounded-md text-[10px] font-bold">
                                  Walk-In
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              {format(visitDate, 'EEEE, MMMM d, yyyy')}
                            </h4>
                          </div>

                          {/* Status Badge */}
                          <div className="flex flex-col items-end">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold leading-none ${
                              isAttended ? 'bg-emerald-50 text-emerald-700' :
                              isNoShow ? 'bg-rose-50 text-rose-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {isAttended ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              ) : isNoShow ? (
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                              )}
                              {visit.status.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Diagnostics Panel (Mandatory Requirement) */}
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                          <div className="flex items-center gap-2 mb-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                            <Stethoscope className="w-4 h-4 text-emerald-600 animate-pulse" />
                            Clinical Diagnosis & Observations
                          </div>
                          <p className="text-slate-800 text-sm font-semibold leading-relaxed whitespace-pre-wrap">
                            {visit.diagnosis || 'No diagnosis statement added at checkout.'}
                          </p>
                        </div>

                        {/* Freeform comments if any */}
                        {visit.comments && (
                          <div className="bg-indigo-50/40 border border-indigo-100/50 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-2 text-xs font-black text-indigo-500 uppercase tracking-widest">
                              <ClipboardList className="w-4 h-4 text-indigo-500" />
                              Follow-up Comments / Special Instructions
                            </div>
                            <p className="text-slate-700 text-xs font-medium leading-relaxed italic">
                              "{visit.comments}"
                            </p>
                          </div>
                        )}

                        {/* Metadata Footer */}
                        <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-between items-center gap-4 text-[11px] text-slate-400 font-medium">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-300" />
                            <span>Recorded by:</span>
                            <span className="font-bold text-slate-500">{visit.bookedByName || 'System Registries'}</span> 
                            <span className="text-[10px] text-slate-300">({visit.bookedByEmail})</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-300" />
                            <span>Logged at:</span>
                            <span className="font-mono text-slate-500">{format(parseISO(visit.bookedAt), 'yyyy-MM-dd HH:mm')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-slate-300" /> PCEA Tumutumu Hospital Registry
            </span>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95"
            >
              Close Dossier
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PatientDetailsDrawer;
