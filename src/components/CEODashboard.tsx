import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Booking, 
  ClinicType, 
  UserProfile,
  MarketingMessage
} from '../types';
import { 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  XCircle, 
  DollarSign, 
  Download,
  Calendar,
  Filter,
  ArrowUpRight,
  BarChart3,
  PieChart as PieChartIcon,
  LayoutGrid,
  Search,
  History
} from 'lucide-react';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfMonth, 
  endOfMonth, 
  startOfQuarter, 
  endOfQuarter, 
  startOfYear, 
  endOfYear,
  isWithinInterval,
  parseISO,
  subMonths,
  eachMonthOfInterval,
  eachDayOfInterval,
  isSameDay,
  isSameMonth
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { handleFirestoreError, OperationType } from '../App';

type TimeRange = 'daily' | 'monthly' | 'quarterly' | 'yearly';
type ViewMode = 'analytics' | 'marketing';

const CLINIC_PRICES: Record<ClinicType, number> = {
  'Pediatrics': 1500,
  'Neuro': 2500,
  'ENT': 2500,
  'Surgical': 1500,
  'Orthopedic': 1500,
  'Gynae/Obs': 1500,
  'MOPC': 1500,
};

const CLINIC_COLORS: Record<string, string> = {
  'Pediatrics': '#10b981', // emerald-500
  'Neuro': '#3b82f6', // blue-500
  'ENT': '#f59e0b', // amber-500
  'Surgical': '#ef4444', // red-500
  'Orthopedic': '#8b5cf6', // violet-500
  'Gynae/Obs': '#ec4899', // pink-500
  'MOPC': '#64748b', // slate-500
};

export const CEODashboard = ({ user }: { user: UserProfile }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [marketingMessages, setMarketingMessages] = useState<MarketingMessage[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [viewMode, setViewMode] = useState<ViewMode>('analytics');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qBookings = query(collection(db, 'bookings'), orderBy('reviewDate', 'desc'));
    const unsubBookings = onSnapshot(qBookings, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    const qMarketing = query(collection(db, 'marketing_messages'), orderBy('sentAt', 'desc'));
    const unsubMarketing = onSnapshot(qMarketing, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingMessage));
      setMarketingMessages(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'marketing_messages');
    });

    return () => {
      unsubBookings();
      unsubMarketing();
    };
  }, []);

  const dateRangeRange = useMemo(() => {
    let start: Date;
    let end: Date;

    switch (timeRange) {
      case 'daily':
        start = startOfDay(selectedDate);
        end = endOfDay(selectedDate);
        break;
      case 'monthly':
        start = startOfMonth(selectedDate);
        end = endOfMonth(selectedDate);
        break;
      case 'quarterly':
        start = startOfQuarter(selectedDate);
        end = endOfQuarter(selectedDate);
        break;
      case 'yearly':
        start = startOfYear(selectedDate);
        end = endOfYear(selectedDate);
        break;
    }
    return { start, end };
  }, [timeRange, selectedDate]);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const date = parseISO(b.reviewDate);
      return isWithinInterval(date, { start: dateRangeRange.start, end: dateRangeRange.end });
    });
  }, [bookings, dateRangeRange]);

  const stats = useMemo(() => {
    const clinicStats: Record<ClinicType, { attended: number, noShow: number, pending: number, revenue: number }> = {
      'Pediatrics': { attended: 0, noShow: 0, pending: 0, revenue: 0 },
      'Neuro': { attended: 0, noShow: 0, pending: 0, revenue: 0 },
      'ENT': { attended: 0, noShow: 0, pending: 0, revenue: 0 },
      'Surgical': { attended: 0, noShow: 0, pending: 0, revenue: 0 },
      'Orthopedic': { attended: 0, noShow: 0, pending: 0, revenue: 0 },
      'Gynae/Obs': { attended: 0, noShow: 0, pending: 0, revenue: 0 },
      'MOPC': { attended: 0, noShow: 0, pending: 0, revenue: 0 },
    };

    let totalAttended = 0;
    let totalNoShow = 0;
    let totalRevenue = 0;

    filteredBookings.forEach(b => {
      if (b.status === 'attended') {
        clinicStats[b.clinicType].attended++;
        clinicStats[b.clinicType].revenue += CLINIC_PRICES[b.clinicType];
        totalAttended++;
        totalRevenue += CLINIC_PRICES[b.clinicType];
      } else if (b.status === 'no-show') {
        clinicStats[b.clinicType].noShow++;
        totalNoShow++;
      } else {
        clinicStats[b.clinicType].pending++;
      }
    });

    return { clinicStats, totalAttended, totalNoShow, totalRevenue };
  }, [filteredBookings]);

  const chartData = useMemo(() => {
    return (Object.entries(stats.clinicStats) as [ClinicType, typeof stats.clinicStats[ClinicType]][]).map(([name, data]) => ({
      name,
      revenue: data.revenue,
      attended: data.attended,
      noShow: data.noShow,
      fill: CLINIC_COLORS[name]
    })).filter(d => d.revenue > 0 || d.attended > 0 || d.noShow > 0);
  }, [stats]);

  const timeSeriesData = useMemo(() => {
    if (timeRange === 'daily') return [];

    let intervals: Date[] = [];
    if (timeRange === 'monthly') {
      intervals = eachDayOfInterval({ start: dateRangeRange.start, end: dateRangeRange.end });
    } else if (timeRange === 'quarterly' || timeRange === 'yearly') {
      intervals = eachMonthOfInterval({ start: dateRangeRange.start, end: dateRangeRange.end });
    }

    return intervals.map(date => {
      const periodBookings = bookings.filter(b => {
        const bDate = parseISO(b.reviewDate);
        if (timeRange === 'monthly') return isSameDay(bDate, date);
        return isSameMonth(bDate, date);
      });

      const revenue = periodBookings.reduce((acc, b) => {
        if (b.status === 'attended') return acc + CLINIC_PRICES[b.clinicType];
        return acc;
      }, 0);

      return {
        name: timeRange === 'monthly' ? format(date, 'MMM d') : format(date, 'MMM'),
        revenue
      };
    });
  }, [timeRange, dateRangeRange, bookings]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const rangeText = format(dateRangeRange.start, 'PPP') + ' - ' + format(dateRangeRange.end, 'PPP');
    
    doc.setFontSize(20);
    doc.text('MedConnect Tumutumu - Financial Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 30);
    doc.text(`Report Period: ${rangeText}`, 14, 35);

    doc.setFontSize(14);
    doc.text('Performance Summary', 14, 50);

    const summaryData = [
      ['Total Patients Attended', stats.totalAttended.toString()],
      ['Total No-shows', stats.totalNoShow.toString()],
      ['Total Revenue', `KSh ${stats.totalRevenue.toLocaleString()}`]
    ];

    autoTable(doc, {
      startY: 55,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
    });

    doc.text('Revenue by Clinic', 14, (doc as any).lastAutoTable.finalY + 15);

    const tableData = (Object.entries(stats.clinicStats) as [ClinicType, typeof stats.clinicStats[ClinicType]][]).map(([name, data]) => [
      name,
      data.attended,
      data.noShow,
      `KSh ${CLINIC_PRICES[name]}`,
      `KSh ${data.revenue.toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Clinic', 'Attended', 'No-show', 'Rate/Visit', 'Total Revenue']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`Financial_Report_${timeRange}_${format(selectedDate, 'yyyy-MM-dd')}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-500">
      {/* View Mode Selector */}
      <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setViewMode('analytics')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            viewMode === 'analytics' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Financial & Operational
        </button>
        <button
          onClick={() => setViewMode('marketing')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            viewMode === 'marketing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="w-4 h-4" />
          Marketing History
        </button>
      </div>

      {viewMode === 'analytics' ? (
        <>
          {/* Header & Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CEO Financial & Operational Dashboard</h1>
              <p className="text-slate-500 mt-1">Comprehensive view of hospital metrics and revenue performance</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex p-1 bg-slate-100 rounded-xl">
                {(['daily', 'monthly', 'quarterly', 'yearly'] as TimeRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                      timeRange === range 
                      ? 'bg-white text-slate-900 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type={timeRange === 'daily' ? 'date' : timeRange === 'monthly' ? 'month' : 'date'}
                  value={format(selectedDate, timeRange === 'monthly' ? 'yyyy-MM' : 'yyyy-MM-dd')}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                {timeRange === 'quarterly' && (
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                    {[1, 2, 3, 4].map(q => (
                      <button
                        key={q}
                        onClick={() => {
                          const newDate = new Date(selectedDate.getFullYear(), (q - 1) * 3, 1);
                          setSelectedDate(newDate);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                          Math.floor(selectedDate.getMonth() / 3) + 1 === q
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-400'
                        }`}
                      >
                        Q{q}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg active:scale-95"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 hover:border-emerald-200 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-50 rounded-2xl">
                  <DollarSign className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex items-center gap-1 text-emerald-600 font-bold text-sm bg-emerald-50 px-2 py-1 rounded-lg">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>Revenue</span>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Revenue</p>
              <p className="text-3xl font-black text-slate-900 mt-1">KSh {stats.totalRevenue.toLocaleString()}</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 hover:border-emerald-200 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-2xl">
                  <CheckCircle2 className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Patients Attended</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{stats.totalAttended}</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 hover:border-red-200 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-red-50 rounded-2xl">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No-shows</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{stats.totalNoShow}</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 hover:border-amber-200 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-50 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-amber-600" />
                </div>
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Avg Growth Rate</p>
              <p className="text-3xl font-black text-slate-900 mt-1">
                {stats.totalAttended > 0 ? ((stats.totalAttended / (stats.totalAttended + stats.totalNoShow)) * 100).toFixed(1) : 0}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Revenue Chart */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <BarChart3 className="w-5 h-5 text-slate-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Revenue Contribution</h2>
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">By Clinic Type</div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} tickFormatter={(val) => `KSh ${val / 1000}k`} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    />
                    <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={40}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Operational Split */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <PieChartIcon className="w-5 h-5 text-slate-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Attendance Distribution</h2>
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operational Health</div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Attended', value: stats.totalAttended, fill: '#10b981' },
                        { name: 'No-show', value: stats.totalNoShow, fill: '#ef4444' }
                      ]}
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Time Series Summary */}
          {timeRange !== 'daily' && (
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <TrendingUp className="w-5 h-5 text-slate-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Revenue Trend</h2>
                </div>
              </div>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} tickFormatter={(val) => `KSh ${val / 1000}k`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={4} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Detailed Table */}
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-xl">
                  <LayoutGrid className="w-5 h-5 text-slate-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Clinic Performance Breakdown</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Clinic Type</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Attended</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">No-show</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate (KSh)</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(Object.entries(stats.clinicStats) as [ClinicType, typeof stats.clinicStats[ClinicType]][]).map(([clinic, data]) => (
                    <tr key={clinic} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CLINIC_COLORS[clinic] }}></div>
                          <span className="font-bold text-slate-700">{clinic}</span>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-slate-600 font-medium">{data.attended}</td>
                      <td className="px-8 py-4 text-slate-600 font-medium">{data.noShow}</td>
                      <td className="px-8 py-4 text-slate-400 text-sm">KSh {CLINIC_PRICES[clinic].toLocaleString()}</td>
                      <td className="px-8 py-4 text-right">
                        <span className="font-black text-slate-900">KSh {data.revenue.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50/30">
                    <td className="px-8 py-6 font-black text-slate-900">TOTAL SUMMARY</td>
                    <td className="px-8 py-6 font-black text-emerald-700 underline decoration-emerald-200 underline-offset-4">{stats.totalAttended}</td>
                    <td className="px-8 py-6 font-black text-red-700">{stats.totalNoShow}</td>
                    <td className="px-8 py-6 text-slate-400">-</td>
                    <td className="px-8 py-6 text-right font-black text-emerald-800 text-xl">KSh {stats.totalRevenue.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                <History className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Marketing Message History</h3>
                <p className="text-slate-500">History of all broadcast communications sent to patients</p>
              </div>
            </div>

            <div className="space-y-6">
              {marketingMessages.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200 text-slate-400 flex flex-col items-center justify-center gap-4">
                  <Search className="w-12 h-12 opacity-20" />
                  <p className="italic">No marketing messages have been broadcast yet.</p>
                </div>
              ) : (
                marketingMessages.map(msg => (
                  <div key={msg.id} className="p-8 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold uppercase">
                          {msg.sentByName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{msg.sentByName}</div>
                          <div className="text-xs text-slate-500">{format(parseISO(msg.sentAt), 'PPPP p')}</div>
                        </div>
                      </div>
                      <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-2xl text-xs font-bold w-fit">
                        Broadcast to {msg.targetCount} Patients
                      </div>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-2xl text-slate-700 leading-relaxed italic border border-slate-100">
                      "{msg.content}"
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
