
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getCorrectISOString } from '../services/timeService';
import { Complaint, ComplaintStatus, Customer, Booking, Group, UserProfile, ComplaintLog } from '../types';
import { 
  createComplaint, 
  getAllComplaints, 
  updateComplaint, 
  addComplaintLog, 
  addCustomerGeneralNote,
  getCustomerNotes
} from '../services/complaintService';
import { genericGet, genericGetDoc } from '../services/firestore';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

const Complaints: React.FC = () => {
  const { userProfile, hasPermission } = useAuth();
  const { t, lang } = useTheme();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  
  // Data for creation/selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerBookings, setCustomerBookings] = useState<(Booking & { productName?: string, groupLabel?: string })[]>([]);
  
  // Form State
  const [newSubject, setNewSubject] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newParties, setNewParties] = useState('');
  
  // Log State
  const [newLogText, setNewLogText] = useState('');
  const [newLogContactMethod, setNewLogContactMethod] = useState<'whatsapp' | 'mobile' | 'other'>('whatsapp');
  const [updateWhatsapp, setUpdateWhatsapp] = useState(false);
  const [customerGeneralNotes, setCustomerGeneralNotes] = useState<any[]>([]);

  useEffect(() => {
    fetchComplaints();
    fetchStaff();
    fetchCustomers();
  }, []);

  const fetchCustomerGeneralNotes = async (customerId: string) => {
    try {
      const notes = await getCustomerNotes(customerId);
      setCustomerGeneralNotes(notes);
    } catch (error) {
      console.error("Error fetching general notes:", error);
    }
  };

  useEffect(() => {
    if (selectedComplaint) {
      fetchCustomerGeneralNotes(selectedComplaint.customerId);
    }
  }, [selectedComplaint]);

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const data = await getAllComplaints();
      setComplaints(data);
    } catch (error) {
      console.error("Error fetching complaints:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const data = await genericGet<UserProfile>('users');
      // Deduplicate by uid to prevent React key errors
      const uniqueStaff = Array.from(new Map(data.map(item => [item.uid, item])).values());
      setStaff(uniqueStaff);
    } catch (error) {
      console.error("Error fetching staff:", error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await genericGet<Customer>('customers');
      setCustomers(data);
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  const handleCustomerSelect = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch('');
    
    // Fetch customer context (bookings)
    try {
      const q = query(collection(db, 'bookings'), where('customerId', '==', customer.id), where('isDeleted', '==', false));
      const snap = await getDocs(q);
      const bookings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      
      // Enrich with course/group info
      const enriched = await Promise.all(bookings.map(async b => {
        let productName = '';
        if (b.productType === 'course') {
          const c = await genericGetDoc<any>('catalog_courses', b.productId);
          productName = c?.name || '';
        } else if (b.productType === 'workshop') {
          const w = await genericGetDoc<any>('catalog_workshops', b.productId);
          productName = w?.name || '';
        } else {
          const d = await genericGetDoc<any>('catalog_diplomas', b.productId);
          productName = d?.name || '';
        }
        
        let groupLabel = '';
        if (b.groupId) {
          const g = await genericGetDoc<any>('groups', b.groupId);
          groupLabel = g?.scheduleLabel || '';
        }
        
        return { ...b, productName, groupLabel };
      }));
      
      setCustomerBookings(enriched);
    } catch (error) {
      console.error("Error fetching customer context:", error);
    }
  };

  const handleCreateComplaint = async () => {
    if (!selectedCustomer || !newSubject || !newDetails || !userProfile) return;
    
    const assignedStaff = staff.find(s => s.uid === newAssignedTo);
    
    const complaintData: Omit<Complaint, 'id' | 'createdAt' | 'history'> = {
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      status: 'pending',
      subject: newSubject,
      details: newDetails,
      assignedToId: newAssignedTo || undefined,
      assignedToName: assignedStaff?.displayName || undefined,
      parties: newParties || undefined,
      createdByUid: userProfile.uid,
      createdByName: userProfile.displayName,
    };
    
    try {
      await createComplaint(complaintData);
      setIsAddModalOpen(false);
      resetForm();
      fetchComplaints();
    } catch (error) {
      alert("Error creating complaint");
    }
  };

  const handleAddLog = async () => {
    if (!selectedComplaint || !newLogText || !userProfile) return;
    
    const log: ComplaintLog = {
      text: newLogText,
      uid: userProfile.uid,
      name: userProfile.displayName,
      timestamp: getCorrectISOString(),
      contactMethod: newLogContactMethod,
      updateSentToWhatsapp: updateWhatsapp
    };
    
    try {
      await addComplaintLog(selectedComplaint.id, log);
      setNewLogText('');
      setUpdateWhatsapp(false);
      // Update local state
      const updated = { ...selectedComplaint, history: [...selectedComplaint.history, log], lastUpdateSentToWhatsapp: updateWhatsapp };
      setSelectedComplaint(updated);
      setComplaints(complaints.map(c => c.id === updated.id ? updated : c));
    } catch (error) {
      alert("Error adding log");
    }
  };

  const handleUpdateStatus = async (status: ComplaintStatus) => {
    if (!selectedComplaint) return;
    try {
      await updateComplaint(selectedComplaint.id, { status });
      const updated = { ...selectedComplaint, status };
      setSelectedComplaint(updated);
      setComplaints(complaints.map(c => c.id === updated.id ? updated : c));
    } catch (error) {
      alert("Error updating status");
    }
  };

  const resetForm = () => {
    setSelectedCustomer(null);
    setNewSubject('');
    setNewDetails('');
    setNewAssignedTo('');
    setNewParties('');
    setCustomerBookings([]);
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter(c => {
      const matchesSearch = c.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            c.subject.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesAssignee = assigneeFilter === 'all' || c.assignedToId === assigneeFilter;
      return matchesSearch && matchesStatus && matchesAssignee;
    });
  }, [complaints, searchTerm, statusFilter, assigneeFilter]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
      c.whatsapp.includes(customerSearch)
    ).slice(0, 5);
  }, [customers, customerSearch]);

  const getStatusColor = (status: ComplaintStatus) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'active': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'closed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight dark:text-white uppercase">{t('complaints')}</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Manage and track customer feedback and issues</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center gap-2"
        >
          <i className="fas fa-plus"></i>
          {t('addComplaint')}
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm">
        <div className="relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input 
            type="text"
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-primary-500 dark:text-white"
          />
        </div>
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-primary-500 dark:text-white font-bold"
        >
          <option value="all">{t('all') || 'All Statuses'}</option>
          <option value="pending">{t('pending')}</option>
          <option value="active">{t('active')}</option>
          <option value="closed">{t('solved')}</option>
        </select>
        <select 
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl border-none focus:ring-2 focus:ring-primary-500 dark:text-white font-bold"
        >
          <option value="all">{t('allSales') || 'All Staff'}</option>
          {staff.map(s => (
            <option key={s.uid} value={s.uid}>{s.displayName}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredComplaints.map(complaint => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={complaint.id}
              onClick={() => setSelectedComplaint(complaint)}
              className="bg-white dark:bg-gray-800 p-5 rounded-3xl border dark:border-gray-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${getStatusColor(complaint.status)}`}>
                  {t(complaint.status as any) || complaint.status}
                </span>
                <span className="text-[10px] text-gray-400 font-bold">{new Date(complaint.createdAt).toLocaleDateString()}</span>
              </div>
              <h3 className="text-lg font-black dark:text-white mb-2 line-clamp-1">{complaint.subject}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2 mb-4">{complaint.details}</p>
              
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border dark:border-gray-700">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-600 font-bold text-xs">
                  {complaint.customerName[0]}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold dark:text-white">{complaint.customerName}</span>
                  <span className="text-[10px] text-gray-400">{complaint.customerPhone}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t dark:border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{t('assignedTo')}:</span>
                  <span className="text-[10px] font-bold dark:text-blue-400 text-blue-600">{complaint.assignedToName || 'Unassigned'}</span>
                </div>
                <div className="flex -space-x-2 rtl:space-x-reverse">
                   {complaint.history.slice(0, 3).map((log, i) => (
                     <div key={i} className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[8px] font-bold text-gray-500">
                       {log.name[0]}
                     </div>
                   ))}
                   {complaint.history.length > 3 && (
                     <div className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 bg-primary-500 flex items-center justify-center text-[8px] font-bold text-white">
                       +{complaint.history.length - 3}
                     </div>
                   )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Detail Modal */}
      {selectedComplaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20">
              <div className="flex items-center gap-4">
                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-tighter ${getStatusColor(selectedComplaint.status)}`}>
                  {t(selectedComplaint.status as any) || selectedComplaint.status}
                </span>
                <h2 className="text-xl font-black dark:text-white">{selectedComplaint.subject}</h2>
              </div>
              <button 
                onClick={() => setSelectedComplaint(null)}
                className="p-3 bg-white dark:bg-gray-700 rounded-2xl shadow-sm hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left: Info */}
                <div className="space-y-6">
                  <section>
                    <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">{t('customerInfo')}</h3>
                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border dark:border-gray-700">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-lg font-black dark:text-white">{selectedComplaint.customerName}</p>
                          <p className="text-sm font-bold text-gray-500">{selectedComplaint.customerPhone}</p>
                        </div>
                        <a 
                          href={`https://wa.me/${selectedComplaint.customerPhone.replace('+', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-green-500 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:scale-110 transition-transform"
                        >
                          <i className="fab fa-whatsapp text-xl"></i>
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 bg-white dark:bg-gray-800 rounded-lg text-[10px] font-bold border dark:border-gray-700">
                          {t('parties')}: {selectedComplaint.parties || 'N/A'}
                        </span>
                        <span className="px-2 py-1 bg-white dark:bg-gray-800 rounded-lg text-[10px] font-bold border dark:border-gray-700">
                          {t('assignedTo')}: {selectedComplaint.assignedToName || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">{t('complaintDetails')}</h3>
                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {selectedComplaint.details}
                      </p>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">{t('customerUpdates')}</h3>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto no-scrollbar">
                      {customerGeneralNotes.length === 0 ? (
                        <p className="text-[10px] text-gray-400 italic">No general updates for this customer.</p>
                      ) : (
                        customerGeneralNotes.map((note, i) => (
                          <div key={i} className="p-3 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[8px] font-black uppercase dark:text-gray-300">{note.name}</span>
                              <span className="text-[8px] text-gray-400 font-bold">
                                {note.timestamp?.toDate ? note.timestamp.toDate().toLocaleDateString() : 'Recent'}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-600 dark:text-gray-400 italic">"{note.text}"</p>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* Quick Actions */}
                  <section>
                    <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Actions</h3>
                    <div className="flex flex-wrap gap-2">
                       <button 
                         onClick={() => handleUpdateStatus('active')}
                         disabled={selectedComplaint.status === 'active'}
                         className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-blue-700 transition-colors"
                       >
                         {t('active')}
                       </button>
                       <button 
                         onClick={() => handleUpdateStatus('closed')}
                         disabled={selectedComplaint.status === 'closed'}
                         className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-green-700 transition-colors"
                       >
                         {t('solved')}
                       </button>
                    </div>
                  </section>
                </div>

                {/* Right: History */}
                <div className="space-y-6 flex flex-col h-full">
                  <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center justify-between">
                    {t('complaintHistory')}
                    <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 px-2 py-0.5 rounded-full text-[8px]">{selectedComplaint.history.length} posts</span>
                  </h3>
                  
                  <div className="flex-1 space-y-4 max-h-[400px] overflow-y-auto px-1 custom-scrollbar">
                    {selectedComplaint.history.length === 0 ? (
                      <div className="p-10 text-center text-gray-400 italic text-sm">No activity recorded yet.</div>
                    ) : (
                      selectedComplaint.history.map((log, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-500 uppercase">
                            {log.name[0]}
                          </div>
                          <div className="flex-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-2xl rounded-tl-none p-3 shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black dark:text-white uppercase">{log.name}</span>
                              <span className="text-[8px] text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                               <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center gap-1 font-bold">
                                 <i className={log.contactMethod === 'whatsapp' ? 'fab fa-whatsapp' : log.contactMethod === 'mobile' ? 'fas fa-phone' : 'fas fa-comment'}></i>
                                 {t(log.contactMethod as any) || log.contactMethod}
                               </span>
                               {log.updateSentToWhatsapp && (
                                 <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 flex items-center gap-1 font-bold">
                                   <i className="fas fa-check-circle"></i>
                                   WA Sent
                                 </span>
                               )}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{log.text}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-4 border-t dark:border-gray-700 space-y-3">
                    <textarea 
                      placeholder="Add a progress update, note, or resolution..."
                      value={newLogText}
                      onChange={(e) => setNewLogText(e.target.value)}
                      className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none focus:ring-2 focus:ring-primary-500 text-sm dark:text-white h-20 resize-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                       <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                         <button 
                           onClick={() => setNewLogContactMethod('whatsapp')}
                           className={`p-2 rounded-xl transition-all ${newLogContactMethod === 'whatsapp' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                         >
                           <i className="fab fa-whatsapp"></i>
                         </button>
                         <button 
                           onClick={() => setNewLogContactMethod('mobile')}
                           className={`p-2 rounded-xl transition-all ${newLogContactMethod === 'mobile' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                         >
                           <i className="fas fa-phone"></i>
                         </button>
                         <button 
                           onClick={() => setNewLogContactMethod('other')}
                           className={`p-2 rounded-xl transition-all ${newLogContactMethod === 'other' ? 'bg-purple-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                         >
                           <i className="fas fa-comment"></i>
                         </button>
                         <label className="flex items-center gap-2 cursor-pointer ml-2 min-w-max">
                           <input 
                             type="checkbox" 
                             checked={updateWhatsapp}
                             onChange={(e) => setUpdateWhatsapp(e.target.checked)}
                             className="w-3 h-3 rounded text-green-500" 
                           />
                           <span className="text-[10px] font-bold text-gray-500">{t('updateSentToWhatsapp')}</span>
                         </label>
                       </div>
                       <button 
                         onClick={handleAddLog}
                         disabled={!newLogText}
                         className="bg-primary-600 text-white px-6 py-2 rounded-xl font-bold text-xs shadow-md hover:bg-primary-700 transition-colors disabled:opacity-50"
                       >
                         {t('add')}
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-black dark:text-white uppercase tracking-tight">{t('addComplaint')}</h2>
              <button 
                onClick={() => { setIsAddModalOpen(false); resetForm(); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <i className="fas fa-times text-gray-400"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Customer Selector */}
              <div className="relative">
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">{t('selectCustomer')}</label>
                <div className="relative">
                  <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input 
                    type="text"
                    placeholder="Search by name or whatsapp..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl border-2 border-transparent focus:border-primary-500 focus:ring-0 dark:text-white font-medium"
                  />
                </div>
                {filteredCustomers.length > 0 && (
                  <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden">
                    {filteredCustomers.map(c => (
                      <button 
                        key={c.id}
                        onClick={() => handleCustomerSelect(c)}
                        className="w-full p-4 text-left hover:bg-primary-50 dark:hover:bg-primary-900/20 flex items-center justify-between border-b last:border-0 dark:border-gray-700 transition-colors"
                      >
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-xs">{c.name[0]}</div>
                           <div>
                             <p className="font-bold text-sm dark:text-white">{c.name}</p>
                             <p className="text-[10px] text-gray-400">{c.whatsapp}</p>
                           </div>
                         </div>
                         <i className="fas fa-chevron-right text-gray-300"></i>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedCustomer && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 bg-primary-50 dark:bg-primary-900/10 rounded-3xl border border-primary-100 dark:border-primary-900/30"
                >
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary-600 text-white flex items-center justify-center font-bold text-lg">
                        {selectedCustomer.name[0]}
                      </div>
                      <div>
                        <p className="font-black text-primary-900 dark:text-primary-100">{selectedCustomer.name}</p>
                        <p className="text-xs font-bold text-primary-600/70">{selectedCustomer.whatsapp}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedCustomer(null)} className="text-[10px] font-black text-red-500 uppercase hover:underline">Change</button>
                  </div>

                  {customerBookings.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase text-primary-400 tracking-widest">Active Links</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {customerBookings.map(b => (
                          <div key={b.id} className="p-3 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden">
                             <div className="flex items-center justify-between mb-1">
                               <p className="text-xs font-black dark:text-white truncate">{b.productName}</p>
                               <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${b.productType === 'diploma' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                 {b.productType}
                               </span>
                             </div>
                             <p className="text-[10px] text-gray-500 font-bold truncate">Group: {b.groupLabel || 'N/A'}</p>
                             <div className="mt-2 text-[9px] flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded-lg">
                               <span className="text-gray-400">{t('remaining')}</span>
                               <span className="font-black text-red-500">{b.paymentSummary.remaining} EGP</span>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="space-y-4">
                <input 
                  type="text"
                  placeholder={t('subject')}
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl border-none focus:ring-2 focus:ring-primary-500 dark:text-white font-bold"
                />
                <textarea 
                  placeholder={t('complaintDetails')}
                  value={newDetails}
                  onChange={(e) => setNewDetails(e.target.value)}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl border-none focus:ring-2 focus:ring-primary-500 dark:text-white font-medium h-32"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">{t('assignedTo')}</label>
                  <select 
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl border-none focus:ring-2 focus:ring-primary-500 dark:text-white font-bold"
                  >
                    <option value="">Unassigned</option>
                    {staff.map(s => (
                      <option key={s.uid} value={s.uid}>{s.displayName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">{t('parties')}</label>
                  <input 
                    type="text"
                    placeholder="e.g. Sales A, Trainer B"
                    value={newParties}
                    onChange={(e) => setNewParties(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl border-none focus:ring-2 focus:ring-primary-500 dark:text-white font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
              <button 
                onClick={() => { setIsAddModalOpen(false); resetForm(); }}
                className="px-6 py-3 rounded-2xl font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleCreateComplaint}
                disabled={!selectedCustomer || !newSubject || !newDetails}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-primary-500/30 transition-all"
              >
                {t('save')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Complaints;
